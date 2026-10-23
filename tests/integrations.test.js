'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const integrations = require('../api/_lib/integrations');

function makeReq(headers) {
    return { headers: headers || {} };
}

/* Minimal fake of the Firestore surface that authenticate() touches. */
function makeDb(rows, onUsage) {
    const updates = [];
    return {
        updates,
        collection(name) {
            assert.strictEqual(name, 'integrations');
            return {
                where(field, op, value) {
                    assert.strictEqual(field, 'keyHash');
                    assert.strictEqual(op, '==');
                    return {
                        limit() {
                            return {
                                async get() {
                                    const matched = rows.filter(r => r.keyHash === value);
                                    return {
                                        empty: !matched.length,
                                        docs: matched.map(row => ({ id: row.id, data: () => row })),
                                    };
                                },
                            };
                        },
                    };
                },
                doc(id) {
                    return {
                        update(patch) {
                            updates.push({ id, patch });
                            if (onUsage) onUsage(id, patch);
                            return Promise.resolve();
                        },
                    };
                },
            };
        },
    };
}

test('generateKey: trd_ prefix, hex-only, high entropy, unique', () => {
    const seen = new Set();
    for (let i = 0; i < 100; i++) {
        const key = integrations.generateKey();
        assert.ok(key.startsWith('trd_'), 'prefix');
        const body = key.slice(4);
        assert.match(body, /^[0-9a-f]{40}$/, '40 hex chars (160 bit entropy)');
        assert.ok(!seen.has(key), 'unique');
        seen.add(key);
    }
});

test('hashKey: deterministic sha256 hex, distinct keys hash differently', () => {
    const a = integrations.hashKey('trd_abc');
    const b = integrations.hashKey('trd_abc');
    const c = integrations.hashKey('trd_abd');
    assert.strictEqual(a, b);
    assert.notStrictEqual(a, c);
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.notStrictEqual(a, 'trd_abc', 'hash never contains the raw key');
});

test('extractKey: Bearer header, x-trendaryo-key header, or nothing', () => {
    assert.strictEqual(integrations.extractKey(makeReq({ authorization: 'Bearer trd_abc123' })), 'trd_abc123');
    assert.strictEqual(integrations.extractKey(makeReq({ 'x-trendaryo-key': ' trd_xyz ' })), 'trd_xyz');
    assert.strictEqual(integrations.extractKey(makeReq({})), null);
    assert.strictEqual(integrations.extractKey(makeReq({ authorization: 'Basic abc' })), null);
    assert.strictEqual(integrations.extractKey(makeReq({ authorization: 'Bearer   ' })), null);
    assert.strictEqual(integrations.extractKey(null), null);
});

test('keyPreview: shortened with tail, leaves short values intact', () => {
    const long = 'trd_' + 'ab'.repeat(20);
    const preview = integrations.keyPreview(long);
    assert.ok(preview.length < long.length);
    assert.ok(preview.startsWith('trd_'));
    assert.ok(preview.endsWith(long.slice(-4)));
    assert.strictEqual(integrations.keyPreview('short'), 'short');
});

test('normalizeScopes: keeps only known scopes, deduped, in order', () => {
    assert.deepStrictEqual(
        integrations.normalizeScopes(['products.read', 'products.write', 'nonsense', 'products.read', 'orders.read', '']),
        ['products.read', 'products.write', 'orders.read']
    );
    assert.deepStrictEqual(integrations.normalizeScopes([]), []);
    assert.deepStrictEqual(integrations.normalizeScopes('products.read'), [], 'non-array rejected');
    assert.deepStrictEqual(integrations.normalizeScopes([null, 42]), []);
});

test('hasScope: only granted scopes authorize', () => {
    const it = { scopes: ['products.read'] };
    assert.ok(integrations.hasScope(it, 'products.read'));
    assert.ok(!integrations.hasScope(it, 'products.write'));
    assert.ok(!integrations.hasScope(null, 'products.read'));
    assert.ok(!integrations.hasScope({ scopes: 'products.read' }, 'products.read'));
});

test('publicView: never leaks keyHash and never reveals the full code', () => {
    const view = integrations.publicView({
        id: 'it1', appName: 'Product Hunter', appId: 'product-hunter', note: 'n',
        scopes: ['products.write'], status: 'active',
        keyHash: 'sha256-hash-value', keyPreview: 'trd_ab12cd34...', createdAt: '2026-01-01', callCount: 3,
    });
    assert.strictEqual(Object.keys(view).includes('keyHash'), false);
    assert.strictEqual(JSON.stringify(view).includes('sha256-hash-value'), false);
    assert.strictEqual(view.keyPreview, 'trd_ab12cd34...');
    assert.strictEqual(view.appName, 'Product Hunter');
    assert.strictEqual(view.callCount, 3);
});

test('authenticate: valid active key passes and records usage', async () => {
    const db = makeDb([{
        id: 'it1',
        appName: 'PH', scopes: ['products.write'],
        status: 'active',
        keyHash: integrations.hashKey('trd_good'),
    }]);
    const ok = await integrations.authenticate(db, makeReq({ authorization: 'Bearer trd_good' }));
    assert.ok(ok);
    assert.strictEqual(ok.id, 'it1');
    assert.strictEqual(ok.appName, 'PH');
    await new Promise(r => setTimeout(r, 10));
    assert.strictEqual(db.updates.length, 1);
    assert.strictEqual(db.updates[0].id, 'it1');
    assert.ok(db.updates[0].patch.lastUsedAt, 'lastUsedAt recorded');
});

test('authenticate: wrong/no key, wrong prefix, missing row -> null', async () => {
    const db = makeDb([{ id: 'it1', status: 'active', keyHash: integrations.hashKey('trd_good') }]);
    assert.strictEqual(await integrations.authenticate(db, makeReq({ authorization: 'Bearer trd_wrong' })), null);
    assert.strictEqual(await integrations.authenticate(db, makeReq({})), null);
    assert.strictEqual(await integrations.authenticate(db, makeReq({ authorization: 'Bearer badformat' })), null);

    const empty = makeDb([]);
    assert.strictEqual(await integrations.authenticate(empty, makeReq({ authorization: 'Bearer trd_good' })), null);
});

test('authenticate: revoked connections count as invalid and record no usage', async () => {
    let usageAttempted = false;
    const db = makeDb(
        [{ id: 'it2', status: 'revoked', keyHash: integrations.hashKey('trd_good') }],
        () => { usageAttempted = true; }
    );
    assert.strictEqual(await integrations.authenticate(db, makeReq({ authorization: 'Bearer trd_good' })), null);
    assert.strictEqual(usageAttempted, false);
});

test('signWebhook: t=<unix>,v1=<hmac> format, deterministic, secret-bound', () => {
    const body = JSON.stringify({ event: 'order.created' });
    const a = integrations.signWebhook('whsec_abc', body, 1700000000);
    const b = integrations.signWebhook('whsec_abc', body, 1700000000);
    const c = integrations.signWebhook('whsec_other', body, 1700000000);
    assert.strictEqual(a, b);
    assert.notStrictEqual(a, c);
    assert.match(a, /^t=1700000000,v1=[0-9a-f]{64}$/);
});

test('notifyStoreEvent: posts signed order.created only to subscribed+active webhook, records delivery', async () => {
    const calls = [];
    const originalFetch = global.fetch;
    global.fetch = async (url, opts) => {
        calls.push({ url, opts });
        return { ok: true };
    };
    try {
        const posts = [];
        const updates = [];
        const db = {
            collection(name) {
                assert.strictEqual(name, 'integrations');
                return {
                    where() {
                        return {
                            async get() {
                                const active = [
                                    { id: 'wants', data: () => ({ status: 'active', webhookUrl: 'https://ph.test/hook', webhookSecret: 'whsec_1' }) },
                                    { id: 'novurl', data: () => ({ status: 'active', webhookUrl: '' }) },
                                    { id: 'revoked', data: () => ({ status: 'revoked', webhookUrl: 'https://ph.test/hook', webhookSecret: 'whsec_1' }) },
                                ].filter(d => d.data().status === 'active');
                                return { empty: !active.length, docs: active };
                            },
                        };
                    },
                    doc(id) { return { update(patch) { posts.push({ id, patch }); return Promise.resolve(); } }; },
                };
                },
        };

        const order = { id: 'o1', number: '2001', status: 'confirmed', paymentStatus: 'paid', email: 'x@y.z', total: 42, items: [{ productId: 'p1', name: 'N', qty: 2 }] };
        await integrations.notifyStoreEvent(db, order, 'order.created', null, null);

        assert.strictEqual(calls.length, 1, 'only the one subscribed+active integration is notified');
        assert.strictEqual(calls[0].url, 'https://ph.test/hook');
        assert.strictEqual(calls[0].opts.headers['X-Trendaryo-Event'], 'order.created');
        const sig = calls[0].opts.headers['X-Trendaryo-Signature'];
        const body = calls[0].opts.body;
        const payload = JSON.parse(body);
        assert.strictEqual(payload.event, 'order.created');
        assert.strictEqual(payload.order.id, 'o1');
        assert.strictEqual(payload.order.items[0].qty, 2);
        assert.ok(/^t=\d+,v1=[0-9a-f]{64}$/.test(sig), 'signature header format');
        await new Promise(r => setTimeout(r, 10));
        const delivered = posts.find(p => p.id === 'wants');
        assert.ok(delivered, 'delivery status recorded');
        assert.strictEqual(delivered.patch.webhookStatus, 'delivered');
    } finally {
        global.fetch = originalFetch;
    }
});

test('notifyStoreEvent: an event outside webhookEvents is not delivered', async () => {
    const originalFetch = global.fetch;
    let called = 0;
    global.fetch = async () => { called++; return { ok: true }; };
    try {
        const db = {
            collection() {
                return {
                    where() {
                        return {
                            async get() {
                                return { empty: false, docs: [
                                    { id: 'w1', data: () => ({ status: 'active', webhookUrl: 'https://x.test/h', webhookSecret: 's', webhookEvents: ['order.created'] }) },
                                ] };
                            },
                        };
                    },
                    doc() { return { update: () => Promise.resolve() }; },
                };
            },
        };
        await integrations.notifyStoreEvent(db, { id: 'o2' }, 'inventory.changed');
        assert.strictEqual(called, 0, 'unsubscribed event suppressed');
    } finally {
        global.fetch = originalFetch;
    }
});
