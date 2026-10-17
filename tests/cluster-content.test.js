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

const auditLog = [];
let adminAllowed = true;

stubModule('api/_lib/firebase.js', { initFirebase: () => ({ db: global.__CLUSTER_DB }) });
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
    log: async (db, entry) => { auditLog.push(entry); },
    logAudit: async (db, action, meta, user) => { auditLog.push({ action, meta }); }
});

const blogIndex = require('../api/blog/index');
const blogById = require('../api/blog/[id]');

function makeRes() {
    const res = { statusCode: 0, body: null, headers: {} };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    res.setHeader = (k, v) => { res.headers[k] = v; };
    res.end = () => res;
    return res;
}

function makeReq(method, { query = {}, body = {} } = {}) {
    return { method, query, body, headers: {} };
}

function freshDb() {
    global.__CLUSTER_DB = new MockFirestore({
        blog: [
            { id: 'review-live', slug: 'review-live', title: 'Review', status: 'published', category: 'tech', relatedProductIds: ['p1'], seo: { blogType: 'product-review' }, tags: [], createdAt: '2026-01-02' },
            { id: 'guide-live', slug: 'guide-live', title: 'Guide', status: 'published', category: 'guides', relatedProductIds: ['p1'], seo: { blogType: 'buying-guide' }, tags: [], createdAt: '2026-01-01' },
            { id: 'draft-hidden', slug: 'draft-hidden', title: 'Draft', status: 'draft', category: 'tech', relatedProductIds: ['p1'], seo: {}, tags: [], createdAt: '2026-01-03' },
            { id: 'other-product', slug: 'other-product', title: 'Other', status: 'published', category: 'tech', relatedProductIds: ['p2'], seo: {}, tags: [], createdAt: '2026-01-04' }
        ]
    });
    auditLog.length = 0;
    return global.__CLUSTER_DB;
}

/* ---------- Phase 23: the storefront pulls related articles ---------- */

test('articles: productId filter only ever returns published posts, publicly', async () => {
    freshDb();
    adminAllowed = false;
    try {
        const res = makeRes();
        await blogIndex(makeReq('GET', { query: { productId: 'p1' } }), res);
        assert.strictEqual(res.statusCode, 200);
        const slugs = res.body.data.map((p) => p.slug).sort();
        assert.deepStrictEqual(slugs, ['guide-live', 'review-live'], 'drafts stay hidden from shoppers');
    } finally {
        adminAllowed = true;
    }
});

test('articles: admins see drafts in the product filter with status=all', async () => {
    freshDb();
    const res = makeRes();
    await blogIndex(makeReq('GET', { query: { productId: 'p1', status: 'all' } }), res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.data.length, 3, 'draft included for the review pass');
});

test('articles: an empty shelf returns an empty list, not an error', async () => {
    freshDb();
    const res = makeRes();
    await blogIndex(makeReq('GET', { query: { productId: 'nope' } }), res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body.data, []);
});

/* ---------- Phase 24: blogType travels with the post for clustering ---------- */

test('articles: seo.blogType persists through create for cluster grouping', async () => {
    freshDb();
    const db = global.__CLUSTER_DB;
    const res = makeRes();
    await blogIndex(makeReq('POST', {
        body: {
            title: 'Aurora Comparison Piece',
            status: 'draft',
            relatedProductIds: ['p1'],
            seo: { metaTitle: 'Compare', blogType: 'comparison', faqs: [] }
        }
    }), res);
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(db.raw('blog', res.body.data.slug).seo.blogType, 'comparison');
    assert.ok(db.raw('product_blog_relations', res.body.data.slug + '-p1'), 'relation written for the cluster post');
});

/* ---------- Phase 22: relation sync on update ---------- */

test('articles: PUT keeps relation rows in sync with the post', async () => {
    freshDb();
    const db = global.__CLUSTER_DB;

    const add = makeRes();
    await blogById(makeReq('PUT', { query: { id: 'review-live' }, body: { relatedProductIds: ['p1', 'p2'] } }), add);
    assert.strictEqual(add.statusCode, 200);
    assert.ok(db.raw('product_blog_relations', 'review-live-p1'));
    assert.ok(db.raw('product_blog_relations', 'review-live-p2'), 'new product row created');

    const del = makeRes();
    await blogById(makeReq('PUT', { query: { id: 'review-live' }, body: { relatedProductIds: ['p2'] } }), del);
    assert.strictEqual(del.statusCode, 200);
    assert.strictEqual(db.raw('product_blog_relations', 'review-live-p1'), undefined, 'unlinked row removed');
    assert.ok(db.raw('product_blog_relations', 'review-live-p2'), 'kept row survives');
});

test('articles: publishing generates the article schema from the stored post', async () => {
    freshDb();
    const db = global.__CLUSTER_DB;
    const res = makeRes();
    await blogById(makeReq('PUT', {
        query: { id: 'draft-hidden' },
        body: { status: 'published', seo: { metaTitle: 'Draft Live', faqs: [{ q: 'How loud?', a: 'Very.' }] } }
    }), res);
    assert.strictEqual(res.statusCode, 200);
    const post = db.raw('blog', 'draft-hidden');
    assert.ok(post.publishedAt, 'publish stamps the date');
    assert.strictEqual(post.seo.schema['@graph'][0]['@type'], 'Article');
    assert.strictEqual(post.seo.schema['@graph'][2]['@type'], 'FAQPage', 'approved FAQs become FAQPage');
});
