'use strict';

/* Tests the integrations/v1/tracking endpoint handler. */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const integrations = require('../api/_lib/integrations');

function stubModule(relPath, exports) {
    const abs = path.join(ROOT, relPath);
    require.cache[abs] = { id: abs, filename: abs, loaded: true, exports };
}

const auditCalls = [];
stubModule('api/_lib/firebase.js', { initFirebase: () => ({ db: global.__TRACK_DB }) });
stubModule('api/_lib/cors.js', { handleCors: () => false });
stubModule('api/_lib/security.js', { applyRateLimit: () => true });
stubModule('api/_lib/audit.js', { log: (db, entry) => { auditCalls.push(entry.action); return Promise.resolve(); } });

const handler = require('../api/integrations/v1/tracking');

/* Order doc shipped from 'packed' (allowed for actor 'system'). */
let orderData = { status: 'packed', total: 55, items: [], email: 'buyer@test.dev', number: '2007' };
const updates = [];
const ref = { set(patch) { updates.push(patch); return Promise.resolve(); } };

function makeDb() {
    updates.length = 0;
    auditCalls.length = 0;
    const conn = {
        id: 'it-ph', appName: 'Product Hunter', scopes: ['fulfillments.write'],
        status: 'active', keyHash: integrations.hashKey('trd_track'),
    };
    return {
        collection(name) {
            if (name === 'integrations') {
                return {
                    where(field, op, value) {
                        return {
                            limit() {
                                return {
                                    async get() {
                                        const hit = conn && String(conn.keyHash) === String(value);
                                        return { empty: !hit, docs: hit ? [{ id: conn.id, data: () => conn }] : [] };
                                    },
                                };
                            },
                        };
                    },
                    doc() { return { update() { return Promise.resolve(); } }; },
                };
            }
            if (name === 'orders') {
                return {
                    doc() {
                        return {
                            async get() { return { exists: !!orderData, id: 'ord1', ref, data: () => orderData }; },
                        };
                    },
                    where(field, op, value) {
                        return {
                            limit() {
                                return {
                                    async get() {
                                        const hit = orderData && (field === 'number' ? String(orderData.number) === String(value) : true);
                                        return { empty: !hit, docs: hit ? [{ id: 'ord1', ref, data: () => orderData }] : [] };
                                    },
                                };
                            },
                        };
                    },
                };
            }
            throw new Error('unexpected collection ' + name);
        },
    };
}

function makeRes() {
    const res = { statusCode: 0, body: null, headers: {} };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    res.setHeader = (k, v) => { res.headers[k] = v; };
    res.end = () => res;
    return res;
}

async function call(req) {
    const res = makeRes();
    global.__TRACK_DB = makeDb();
    await handler(req, res);
    return res;
}

test('tracking: happy path ships the order with carrier + tracking number', async () => {
    orderData = { status: 'packed', total: 55, items: [], email: 'buyer@test.dev', number: '2007' };
    const res = await call({
        method: 'POST',
        headers: { authorization: 'Bearer trd_track' },
        body: { orderId: 'ord1', carrier: 'UPS', trackingNumber: '1Z-TEST', trackingUrl: 'https://tups.test/x' },
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.ok, true);
    assert.strictEqual(res.body.data.status, 'shipped');
    const patch = updates[updates.length - 1];
    assert.strictEqual(patch.carrier, 'UPS');
    assert.strictEqual(patch.trackingNumber, '1Z-TEST');
    assert.strictEqual(patch.trackingSource, 'Product Hunter');
    assert.strictEqual(auditCalls[0], 'tracking.pushed');
});

test('tracking: by orderNumber', async () => {
    orderData = { status: 'processing', total: 55, items: [], number: '2007' };
    const res = await call({
        method: 'POST',
        headers: { 'x-trendaryo-key': 'trd_track' },
        body: { orderNumber: '2007', carrier: 'CJ Packet', trackingNumber: 'CJ123' },
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.orderId, 'ord1');
    assert.strictEqual(res.body.data.status, 'shipped', 'processing -> shipped allowed for system');
});

test('tracking: validation and scope guards', async () => {
    orderData = { status: 'packed', number: '2007' };

    let res = await call({ method: 'GET', headers: { authorization: 'Bearer trd_track' } });
    assert.strictEqual(res.statusCode, 405);

    res = await call({ method: 'POST', headers: { authorization: 'Bearer trd_track' }, body: {} });
    assert.strictEqual(res.statusCode, 400, 'carrier + trackingNumber required');

    res = await call({ method: 'POST', headers: { authorization: 'Bearer trd_track' }, body: { orderNumber: '999', carrier: 'UPS', trackingNumber: '1Z' } });
    assert.strictEqual(res.statusCode, 404, 'unknown order');

    res = await call({ method: 'POST', headers: { authorization: 'Bearer trd_bad' }, body: { carrier: 'UPS', trackingNumber: '1Z', orderId: '1' } });
    assert.strictEqual(res.statusCode, 401, 'invalid key');
});

test('tracking: never invalidates cancelled/refunded orders', async () => {
    orderData = { status: 'cancelled', number: '2007' };
    const res = await call({
        method: 'POST',
        headers: { authorization: 'Bearer trd_track' },
        body: { orderId: 'ord1', carrier: 'UPS', trackingNumber: '1Z-2' },
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.status, 'cancelled', 'status untouched');
    const patch = updates[updates.length - 1];
    assert.strictEqual(patch.carrier, 'UPS', 'tracking still recorded for the record');
    assert.strictEqual(patch.status, undefined, 'no state machine write');
});
