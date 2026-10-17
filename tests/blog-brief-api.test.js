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

stubModule('api/_lib/firebase.js', { initFirebase: () => ({ db: global.__BRIEF_DB }) });
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

const briefsIndex = require('../api/blog/briefs/index');
const briefById = require('../api/blog/briefs/[id]');
const blogIndex = require('../api/blog/index');

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
    global.__BRIEF_DB = new MockFirestore();
    auditLog.length = 0;
    return global.__BRIEF_DB;
}

const richBrief = {
    productId: 'p1',
    productName: 'Aurora ANC Headphones',
    primaryKeyword: 'anc headphones',
    secondaryKeywords: ['noise cancelling headphones', 'bluetooth headphones'],
    longTailKeywords: ['best anc headphones for travel'],
    searchIntent: 'commercial',
    seoOpportunities: ['No honest comparison on competing pages'],
    competitorTopics: ['Spec roundups', 'Cheapest lists'],
    suggestedTitles: ['Aurora ANC Headphones Review: The Honest Verdict'],
    metaDescription: 'Specs that matter, the verified rating, and whether it earns the price.',
    recommendedSlug: 'aurora-anc-headphones-review',
    h1Suggestions: [{ text: 'The review the spec sheet will not give you', note: 'Leads with the promise' }],
    h2Suggestions: [{ text: 'Why buyers choose wrong', note: 'Problem' }, { text: 'The criteria that decide', note: 'Criteria' }],
    faqs: [{ q: 'How loud is the ANC?', a: 'Most low-frequency noise, gone.' }],
    internalLinkingIdeas: ['Link to the product page from the verdict'],
    contentOpportunities: ['Setup guide'],
    blogType: 'product-review'
};

/* ---------- brief CRUD ---------- */

test('briefs: POST creates a brief and upserts by product', async () => {
    freshDb();
    const db = global.__BRIEF_DB;

    const res = makeRes();
    await briefsIndex(makeReq('POST', { body: richBrief }), res);
    assert.strictEqual(res.statusCode, 201);
    const stored = db.raw('blog_briefs', 'brief-p1');
    assert.strictEqual(stored.status, 'READY_FOR_GENERATION', 'a new brief waits for AI enrichment');
    assert.strictEqual(stored.primaryKeyword, 'anc headphones');
    assert.strictEqual(stored.h2Suggestions.length, 2);

    /* second save updates the same doc, never duplicates */
    const again = makeRes();
    await briefsIndex(makeReq('POST', { body: Object.assign({}, richBrief, { status: 'BRIEF_READY', primaryKeyword: 'best anc headphones' }) }), again);
    assert.strictEqual(again.statusCode, 200);
    assert.strictEqual(db.rawAll('blog_briefs').length, 1, 'one brief per product');
    assert.strictEqual(db.raw('blog_briefs', 'brief-p1').primaryKeyword, 'best anc headphones');
    assert.strictEqual(db.raw('blog_briefs', 'brief-p1').status, 'BRIEF_READY');
});

test('briefs: briefs are admin-only', async () => {
    freshDb();
    adminAllowed = false;
    try {
        const res = makeRes();
        await briefsIndex(makeReq('POST', { body: richBrief }), res);
        assert.strictEqual(res.statusCode, 403);

        const list = makeRes();
        await briefsIndex(makeReq('GET'), list);
        assert.strictEqual(list.statusCode, 403);
    } finally {
        adminAllowed = true;
    }
});

test('briefs: POST requires a productId', async () => {
    freshDb();
    const res = makeRes();
    await briefsIndex(makeReq('POST', { body: { primaryKeyword: 'x' } }), res);
    assert.strictEqual(res.statusCode, 400);
});

test('briefs: list filters by product and PUT/DELETE round-trip', async () => {
    freshDb();
    const db = global.__BRIEF_DB;
    await briefsIndex(makeReq('POST', { body: richBrief }), makeRes());

    const filtered = makeRes();
    await briefsIndex(makeReq('GET', { query: { productId: 'p1' } }), filtered);
    assert.strictEqual(filtered.body.data.length, 1);

    const miss = makeRes();
    await briefsIndex(makeReq('GET', { query: { productId: 'other' } }), miss);
    assert.strictEqual(miss.body.data.length, 0);

    const getOne = makeRes();
    await briefById(makeReq('GET', { query: { id: 'brief-p1' } }), getOne);
    assert.strictEqual(getOne.statusCode, 200);
    assert.strictEqual(getOne.body.data.primaryKeyword, 'anc headphones');

    const put = makeRes();
    await briefById(makeReq('PUT', { query: { id: 'brief-p1' }, body: { status: 'USED', suggestedTitles: ['A new title'] } }), put);
    assert.strictEqual(put.statusCode, 200);
    assert.strictEqual(db.raw('blog_briefs', 'brief-p1').status, 'USED');
    assert.deepStrictEqual(db.raw('blog_briefs', 'brief-p1').suggestedTitles, ['A new title']);

    const del = makeRes();
    await briefById(makeReq('DELETE', { query: { id: 'brief-p1' } }), del);
    assert.strictEqual(del.statusCode, 200);
    assert.strictEqual(db.raw('blog_briefs', 'brief-p1'), undefined);
});

test('briefs: PUT on a missing brief is 404', async () => {
    freshDb();
    const res = makeRes();
    await briefById(makeReq('PUT', { query: { id: 'nope' }, body: { status: 'USED' } }), res);
    assert.strictEqual(res.statusCode, 404);
});

test('briefs: unknown status values are ignored', async () => {
    freshDb();
    await briefsIndex(makeReq('POST', { body: richBrief }), makeRes());
    const res = makeRes();
    await briefById(makeReq('PUT', { query: { id: 'brief-p1' }, body: { status: 'whatever' } }), res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(global.__BRIEF_DB.raw('blog_briefs', 'brief-p1').status, 'READY_FOR_GENERATION');
});

/* ---------- relations (Phase 22) ---------- */

test('relations: creating an article with products writes relation rows', async () => {
    freshDb();
    const db = global.__BRIEF_DB;
    const res = makeRes();
    await blogIndex(makeReq('POST', {
        body: {
            title: 'Aurora ANC Headphones Review: The Honest Verdict',
            status: 'draft',
            relatedProductIds: ['p1', 'p2']
        }
    }), res);
    assert.strictEqual(res.statusCode, 201);
    const slug = res.body.data.slug;
    assert.ok(db.raw('product_blog_relations', slug + '-p1'), 'relation row per product');
    assert.strictEqual(db.raw('product_blog_relations', slug + '-p1').relationshipType, 'generated');
    assert.ok(db.raw('product_blog_relations', slug + '-p2'));
});
