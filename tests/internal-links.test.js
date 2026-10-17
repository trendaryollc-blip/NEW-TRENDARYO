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

stubModule('api/_lib/firebase.js', { initFirebase: () => ({ db: global.__LINKS_DB }) });
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

const { syncLinks, clearLinks, normalizeLinks, targetTypeOf } = require('../api/_lib/internal-links');
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

const LINKS = [
    { anchor: 'Aurora product page', path: 'product.html?id=17', why: 'verdict links to the listing' },
    { anchor: 'The buying guide', path: 'blog.html', why: 'broader context' }
];

test('internal links: normalize drops incomplete rows and caps at 12', () => {
    const rows = normalizeLinks([
        { anchor: 'Good', path: 'product.html?id=1', why: 'reason' },
        { anchor: '', path: 'blog.html' },
        { anchor: 'No path', path: '' },
        'garbage',
        null
    ]);
    assert.strictEqual(rows.length, 1);
    assert.deepStrictEqual(rows[0], { anchor: 'Good', path: 'product.html?id=1', why: 'reason' });
});

test('internal links: target types classify the common paths', () => {
    assert.strictEqual(targetTypeOf('product.html?id=17'), 'product');
    assert.strictEqual(targetTypeOf('blog-post.html?slug=x'), 'article');
    assert.strictEqual(targetTypeOf('blog.html'), 'blog-index');
    assert.strictEqual(targetTypeOf('shop.html'), 'shop');
    assert.strictEqual(targetTypeOf('contact.html'), 'page');
});

test('internal links: syncLinks rewrites the rows for a blog', async () => {
    const db = new MockFirestore({
        internal_links: [{ id: 'slug-0', fromBlog: 'slug', anchor: 'Old', path: 'old.html', why: '', targetType: 'page', createdAt: 'x' }]
    });
    const n = await syncLinks(db, 'slug', LINKS);
    assert.strictEqual(n, 2);
    assert.strictEqual(db.raw('internal_links', 'slug-0').anchor, 'Aurora product page', 'stale row replaced');
    assert.strictEqual(db.raw('internal_links', 'slug-1').targetType, 'blog-index');
    assert.strictEqual(db.rawAll('internal_links').length, 2, 'no orphaned rows');
});

test('internal links: clearLinks removes every row for a blog', async () => {
    const db = new MockFirestore({
        internal_links: [
            { id: 'a-0', fromBlog: 'a', anchor: 'x', path: 'y', why: '', targetType: 'page', createdAt: 'x' },
            { id: 'b-0', fromBlog: 'b', anchor: 'x', path: 'y', why: '', targetType: 'page', createdAt: 'x' }
        ]
    });
    await clearLinks(db, 'a');
    assert.strictEqual(db.raw('internal_links', 'a-0'), undefined);
    assert.ok(db.raw('internal_links', 'b-0'), 'other blogs untouched');
});

test('internal links: article create materializes the seo.internalLinks rows', async () => {
    global.__LINKS_DB = new MockFirestore();
    auditLog.length = 0;
    const res = makeRes();
    await blogIndex(makeReq('POST', {
        body: {
            title: 'Aurora Link Post',
            status: 'draft',
            relatedProductIds: ['17'],
            seo: { metaTitle: 'T', internalLinks: LINKS }
        }
    }), res);
    assert.strictEqual(res.statusCode, 201);
    const slug = res.body.data.slug;
    const db = global.__LINKS_DB;
    assert.ok(db.raw('internal_links', slug + '-0'), 'first link row');
    assert.strictEqual(db.raw('internal_links', slug + '-0').targetType, 'product');
    assert.ok(db.raw('internal_links', slug + '-1'));
});

test('internal links: article update replaces the rows, delete clears them', async () => {
    global.__LINKS_DB = new MockFirestore();
    const created = makeRes();
    await blogIndex(makeReq('POST', {
        body: { title: 'Link Post Two', status: 'draft', seo: { internalLinks: LINKS } }
    }), created);
    const slug = created.body.data.slug;
    const db = global.__LINKS_DB;
    assert.strictEqual(db.rawAll('internal_links').length, 2);

    const updated = makeRes();
    await blogById(makeReq('PUT', {
        query: { id: slug },
        body: { seo: { internalLinks: [{ anchor: 'Only one', path: 'shop.html', why: '' }] } }
    }), updated);
    assert.strictEqual(updated.statusCode, 200);
    assert.strictEqual(db.rawAll('internal_links').length, 1, 'old rows replaced');
    assert.strictEqual(db.raw('internal_links', slug + '-0').anchor, 'Only one');

    const deleted = makeRes();
    await blogById(makeReq('DELETE', { query: { id: slug } }), deleted);
    assert.strictEqual(deleted.statusCode, 200);
    assert.strictEqual(db.rawAll('internal_links').length, 0, 'rows leave with the article');
});
