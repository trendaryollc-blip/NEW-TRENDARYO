'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { MockFirestore } = require('./helpers/fake-firestore');

const ROOT = path.join(__dirname, '..');

function stubModule(relPath, exports) {
    const abs = path.join(ROOT, relPath);
    require.cache[abs] = { id: abs, filename: abs, loaded: true, exports };
}

let adminAllowed = true;

stubModule('api/_lib/firebase.js', { initFirebase: () => ({ db: global.__CREATE_DB }) });
stubModule('api/_lib/cors.js', { handleCors: () => false });
stubModule('api/_lib/auth.js', {
    requireAuth: async () => ({ uid: 'user-1', email: 'user@trendaryo.com' }),
    requireAdmin: async (req, res) => {
        if (!adminAllowed) {
            res.status(403).json({ error: { message: 'Admin only' } });
            return null;
        }
        return { uid: 'admin-1', email: 'admin@trendaryo.com' };
    },
});
stubModule('api/_lib/security.js', { applyRateLimit: () => true });

const productsIndex = require('../api/products/index');

function makeRes() {
    const res = { statusCode: 0, body: null, headers: {} };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    res.setHeader = (k, v) => { res.headers[k] = v; };
    res.end = () => res;
    return res;
}

function freshDb() {
    global.__CREATE_DB = new MockFirestore({
        products: [{ id: 'taken', name: 'Taken', price: 10, status: 'active' }]
    });
    return global.__CREATE_DB;
}

/* ---------- clientId: one identity from dashboard to catalog ---------- */

test('products: create honors a valid clientId as the document id', async () => {
    freshDb();
    const res = makeRes();
    await productsIndex({ method: 'POST', query: {}, body: { name: 'New Thing', price: 25, clientId: '101' }, headers: {} }, res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.data.id, '101');
    const db = global.__CREATE_DB;
    assert.ok(db.raw('products', '101'), 'stored under the client id');
    assert.strictEqual(db.raw('products', '101').name, 'New Thing');
});

test('products: create without clientId still auto-assigns an id', async () => {
    freshDb();
    const res = makeRes();
    await productsIndex({ method: 'POST', query: {}, body: { name: 'Auto Thing', price: 5 }, headers: {} }, res);
    assert.strictEqual(res.statusCode, 201);
    assert.ok(res.body.data.id, 'an id was assigned');
});

test('products: a colliding clientId is refused, never overwritten', async () => {
    freshDb();
    const res = makeRes();
    await productsIndex({ method: 'POST', query: {}, body: { name: 'Clash', price: 5, clientId: 'taken' }, headers: {} }, res);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(global.__CREATE_DB.raw('products', 'taken').name, 'Taken', 'the existing row is untouched');
});

test('products: a malformed clientId is rejected', async () => {
    freshDb();
    for (const bad of ['a b', 'x/y', '../escape', '']) {
        const res = makeRes();
        await productsIndex({ method: 'POST', query: {}, body: { name: 'Bad', price: 5, clientId: bad }, headers: {} }, res);
        /* empty string falls back to auto-id; anything else malformed is a 400 */
        if (bad === '') assert.strictEqual(res.statusCode, 201);
        else assert.strictEqual(res.statusCode, 400, 'rejected: ' + bad);
    }
});

test('products: create stays admin-only', async () => {
    freshDb();
    adminAllowed = false;
    try {
        const res = makeRes();
        await productsIndex({ method: 'POST', query: {}, body: { name: 'Nope', price: 5 }, headers: {} }, res);
        assert.strictEqual(res.statusCode, 403);
    } finally {
        adminAllowed = true;
    }
});

/* ---------- uploads bill the store account: admin-only ---------- */

const upload = require('../api/upload');

test('upload: signed-in non-admins are refused before touching storage', async () => {
    adminAllowed = false;
    try {
        const res = makeRes();
        await upload({ method: 'POST', query: {}, body: { file: 'data:image/png;base64,AAA' }, headers: {} }, res);
        assert.strictEqual(res.statusCode, 403);
    } finally {
        adminAllowed = true;
    }
});

test('upload: admins still get the file validation', async () => {
    const res = makeRes();
    await upload({ method: 'POST', query: {}, body: {}, headers: {} }, res);
    assert.strictEqual(res.statusCode, 400, 'the gate passed and validation ran');
});
