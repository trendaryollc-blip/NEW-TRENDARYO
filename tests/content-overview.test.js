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

stubModule('api/_lib/firebase.js', { initFirebase: () => ({ db: global.__CMD_DB }) });
stubModule('api/_lib/cors.js', { handleCors: () => false });
stubModule('api/_lib/auth.js', {
    requireAuth: async () => ({ uid: 'admin-1', email: 'admin@trendaryo.com' }),
    requireAdmin: async (req, res) => {
        if (!adminAllowed) {
            res.status(403).json({ error: { message: 'Admin only' } });
            return null;
        }
        return { uid: 'admin-1', email: 'admin@trendaryo.com' };
    },
});
stubModule('api/_lib/security.js', { applyRateLimit: () => true });
stubModule('api/_lib/audit.js', {
    log: async (db, entry) => {},
    logAudit: async (db, action, meta, user) => {}
});

const overview = require('../api/admin/content-overview');
const blogById = require('../api/blog/[id]');

function makeRes() {
    const res = { statusCode: 0, body: null, headers: {} };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    res.setHeader = (k, v) => { res.headers[k] = v; };
    res.end = () => res;
    return res;
}

function freshDb() {
    const stale = new Date(Date.now() - 10 * 86400000).toISOString();
    const now = new Date().toISOString();
    global.__CMD_DB = new MockFirestore({
        product_content: [
            { id: 'p1', status: 'published', version: 2, sections: { title: 'Live one' }, updatedAt: now, published: { sections: { title: 'Live one' } } },
            { id: 'p2', status: 'review_pending', version: 1, sections: { title: 'Waiting' }, updatedAt: stale },
            { id: 'p3', status: 'draft', version: 1, sections: {}, updatedAt: now }
        ],
        blog_briefs: [
            { id: 'brief-p1', productId: 'p1', status: 'USED' }
        ],
        blog: [
            { id: 'a1', slug: 'a1', title: 'Review', status: 'published', relatedProductIds: ['p1'], seo: { blogType: 'product-review' }, tags: [], createdAt: now },
            { id: 'a2', slug: 'a2', title: 'Guide', status: 'draft', relatedProductIds: ['p1'], seo: { blogType: 'buying-guide' }, tags: [], createdAt: now }
        ]
    });
    return global.__CMD_DB;
}

/* ---------- the command center feed ---------- */

test('overview: admin-only, joins content + brief + articles server-side', async () => {
    freshDb();
    const res = makeRes();
    await overview({ method: 'GET', query: {}, body: {}, headers: {} }, res);
    assert.strictEqual(res.statusCode, 200);
    const { items, totals } = res.body.data;
    assert.strictEqual(items.length, 3);
    assert.strictEqual(totals.published, 1);
    assert.strictEqual(totals.review, 1);
    assert.strictEqual(totals.drafts, 1);
    assert.strictEqual(totals.briefs, 1);
    assert.strictEqual(totals.articles, 2);
    assert.strictEqual(totals.stalled, 1, 'the stale review row flags as stalled');

    const p1 = items.find((i) => i.productId === 'p1');
    assert.strictEqual(p1.briefStatus, 'USED');
    assert.strictEqual(p1.articleCount, 2);
    assert.deepStrictEqual(p1.blogTypes.sort(), ['buying-guide', 'product-review']);
    assert.strictEqual(p1.stalled, false, 'published rows never stall');

    const p2 = items.find((i) => i.productId === 'p2');
    assert.strictEqual(p2.stalled, true);
    assert.strictEqual(p2.briefStatus, null, 'no brief row yet');

    const p3 = items.find((i) => i.productId === 'p3');
    assert.strictEqual(p3.articleCount, 0);
});

test('overview: the public cannot read the pipeline', async () => {
    freshDb();
    adminAllowed = false;
    try {
        const res = makeRes();
        await overview({ method: 'GET', query: {}, body: {}, headers: {} }, res);
        assert.strictEqual(res.statusCode, 403);
    } finally {
        adminAllowed = true;
    }
});

/* ---------- Phase 20: the blog review workflow persists ---------- */

test('blogs: review states persist and stay off the public shelf', async () => {
    freshDb();
    const put = makeRes();
    await blogById({ method: 'PUT', query: { id: 'a2' }, body: { status: 'review_pending' }, headers: {} }, put);
    assert.strictEqual(put.statusCode, 200);
    assert.strictEqual(put.body.data.status, 'review_pending');

    adminAllowed = false;
    try {
        const get = makeRes();
        await blogById({ method: 'GET', query: { id: 'a2' }, body: {}, headers: {} }, get);
        assert.strictEqual(get.statusCode, 404, 'review work never leaks to shoppers');
    } finally {
        adminAllowed = true;
    }

    const approve = makeRes();
    await blogById({ method: 'PUT', query: { id: 'a2' }, body: { status: 'ready_to_publish' }, headers: {} }, approve);
    assert.strictEqual(approve.statusCode, 200);

    const publish = makeRes();
    await blogById({ method: 'PUT', query: { id: 'a2' }, body: { status: 'published' }, headers: {} }, publish);
    assert.strictEqual(publish.statusCode, 200);
    assert.ok(publish.body.data.publishedAt, 'publish stamps the date');
});
