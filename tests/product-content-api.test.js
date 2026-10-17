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

stubModule('api/_lib/firebase.js', { initFirebase: () => ({ db: global.__CONTENT_DB }) });
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
stubModule('api/_lib/audit.js', { log: async (db, entry) => { auditLog.push(entry); } });

const contentApi = require('../api/products/[id]/content');

const product = {
    id: 'p1',
    name: 'Aurora ANC Headphones',
    category: 'tech',
    brand: 'Aurora',
    price: 149,
    oldPrice: 199,
    rating: 4.6,
    reviews: 128,
    stock: 12,
    sku: 'AUR-1',
    description: 'Hybrid noise cancelling over-ear headphones.',
    image: 'https://cdn.test/a.jpg',
    images: ['https://cdn.test/a.jpg'],
    specs: [['Bluetooth', '5.3'], ['Battery', '40h']],
    status: 'active'
};

const sections = {
    title: 'Aurora ANC Headphones - quiet that lasts | Trendaryo',
    shortDescription: 'Hybrid noise cancelling headphones with a 40-hour battery.',
    longDescription: 'First paragraph.\n\nSecond paragraph.',
    features: ['Hybrid ANC', '40-hour battery'],
    benefits: ['Drops the commute noise'],
    useCases: ['Open-plan offices'],
    whyChoose: 'It beat its alternatives on rating and review volume.',
    specifications: [{ label: 'Bluetooth', value: '5.3' }],
    shipping: 'Packed within 24 hours, free over $50.',
    returns: '30 days, unused.',
    summary: 'The vetted quiet pick.'
};

function makeRes() {
    const res = { statusCode: 0, body: null, headers: {} };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    res.setHeader = (k, v) => { res.headers[k] = v; };
    res.end = () => res;
    return res;
}

function makeReq(method, { id = 'p1', body = {} } = {}) {
    return { method, query: { id }, body, headers: {} };
}

function freshDb() {
    global.__CONTENT_DB = new MockFirestore({
        products: [product]
    });
    auditLog.length = 0;
    return global.__CONTENT_DB;
}

async function saveDraft(overrides = {}) {
    const res = makeRes();
    await contentApi(makeReq('POST', {
        body: {
            sections: Object.assign({}, sections, overrides.sections || {}),
            faqs: overrides.faqs || [{ q: 'How loud is the ANC?', a: 'It removes most low-frequency noise.' }],
            images: overrides.images || [{ url: 'https://cdn.test/a.jpg', alt: 'Front view', seoAlt: 'Aurora front view', caption: 'As it ships', description: 'Primary image.' }],
            seo: overrides.seo
        }
    }), res);
    return res;
}

/* ---------- guards ---------- */

test('content: GET with no draft is 404', async () => {
    freshDb();
    const res = makeRes();
    await contentApi(makeReq('GET'), res);
    assert.strictEqual(res.statusCode, 404);
});

test('content: writes are admin-only', async () => {
    freshDb();
    adminAllowed = false;
    try {
        const post = makeRes();
        await contentApi(makeReq('POST', { body: { sections, faqs: [] } }), post);
        assert.strictEqual(post.statusCode, 403);

        adminAllowed = true;
        const db = freshDb();
        const get = makeRes();
        await contentApi(makeReq('POST', { body: { sections, faqs: [] } }), get);
        assert.strictEqual(get.statusCode, 200);
        adminAllowed = false;
        const draftGet = makeRes();
        await contentApi(makeReq('GET'), draftGet);
        assert.strictEqual(draftGet.statusCode, 403, 'the world cannot read a draft');
        assert.ok(db.raw('product_content', 'p1'), 'the draft still saved');
    } finally {
        adminAllowed = true;
    }
});

test('content: a draft needs a title', async () => {
    freshDb();
    const res = await saveDraft({ sections: { title: '   ' } });
    assert.strictEqual(res.statusCode, 400);
});

test('content: save sanitises - oversized text trimmed, images must be http(s), FAQ halves required', async () => {
    freshDb();
    const res = await saveDraft({
        sections: { title: 'x'.repeat(300) },
        faqs: [{ q: 'valid', a: 'answer' }, { q: 'no answer' }, { q: '', a: 'orphan' }, 'garbage'],
        images: [
            { url: 'https://cdn.test/ok.jpg', alt: 'a'.repeat(500) },
            { url: 'javascript:alert(1)', alt: 'dropped' },
            { url: 'not-a-url' }
        ]
    });
    assert.strictEqual(res.statusCode, 200);
    const db = global.__CONTENT_DB;
    const stored = db.raw('product_content', 'p1');
    assert.strictEqual(stored.sections.title.length, 200, 'title clamped to 200');
    const faqs = db.raw('product_faqs', 'p1').items;
    assert.strictEqual(faqs.length, 1, 'only complete FAQ rows survive');
    const imgs = db.raw('product_images', 'p1').items;
    assert.strictEqual(imgs.length, 1, 'only https images survive');
    assert.strictEqual(imgs[0].alt.length, 300, 'alt clamped to 300');
});

test('content: save splits FAQs and images into their own collections', async () => {
    freshDb();
    const res = await saveDraft({
        images: [{ url: 'https://cdn.test/a.jpg', alt: 'Front view', seoAlt: 'Aurora front view', caption: 'As it ships', description: 'Primary image.' }]
    });
    assert.strictEqual(res.statusCode, 200);
    const db = global.__CONTENT_DB;
    assert.ok(db.raw('product_content', 'p1').sections.title.includes('Aurora'));
    assert.ok(!db.raw('product_content', 'p1').sections.faqs, 'faqs are not duplicated inside sections');
    assert.strictEqual(db.raw('product_faqs', 'p1').items.length, 1);
    assert.strictEqual(db.raw('product_images', 'p1').items.length, 1);
    assert.strictEqual(db.raw('product_images', 'p1').items[0].seoAlt, 'Aurora front view');
});

/* ---------- workflow (Phase 9) ---------- */

test('content: the workflow only allows legal moves', async () => {
    freshDb();
    const db = global.__CONTENT_DB;
    await saveDraft();

    /* publish straight from draft is refused - approval comes first */
    let res = makeRes();
    await contentApi(makeReq('PUT', { body: { action: 'publish' } }), res);
    assert.strictEqual(res.statusCode, 409);

    res = makeRes();
    await contentApi(makeReq('PUT', { body: { action: 'fly' } }), res);
    assert.strictEqual(res.statusCode, 400);

    res = makeRes();
    await contentApi(makeReq('PUT', { body: { action: 'submit' } }), res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(db.raw('product_content', 'p1').status, 'review_pending');

    /* cannot re-submit while pending */
    res = makeRes();
    await contentApi(makeReq('PUT', { body: { action: 'submit' } }), res);
    assert.strictEqual(res.statusCode, 409);

    res = makeRes();
    await contentApi(makeReq('PUT', { body: { action: 'approve' } }), res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(db.raw('product_content', 'p1').status, 'ready_to_publish');
});

test('content: publish freezes the snapshot, generates schema from the stored product, and opens the public read', async () => {
    freshDb();
    const db = global.__CONTENT_DB;
    await saveDraft();
    await contentApi(makeReq('PUT', { body: { action: 'submit' } }), makeRes());
    await contentApi(makeReq('PUT', { body: { action: 'approve' } }), makeRes());
    const res = makeRes();
    await contentApi(makeReq('PUT', { body: { action: 'publish' } }), res);
    assert.strictEqual(res.statusCode, 200);

    const content = db.raw('product_content', 'p1');
    assert.strictEqual(content.status, 'published');
    assert.ok(content.published, 'the live snapshot is frozen');
    assert.strictEqual(content.published.sections.title, sections.title);
    assert.strictEqual(content.published.faqs.length, 1);
    assert.ok(content.approvedAt, 'approvedAt stamped');
    assert.ok(content.publishedAt, 'publishedAt stamped');

    const seo = db.raw('product_seo', 'p1');
    assert.ok(seo.schema, 'schema generated at publish');
    assert.strictEqual(seo.schema['@graph'][0]['@type'], 'Product');
    assert.strictEqual(seo.schema['@graph'][0].offers.price, '149.00', 'price from the product row, not the request');

    adminAllowed = false;
    try {
        const pub = makeRes();
        await contentApi(makeReq('GET'), pub);
        assert.strictEqual(pub.statusCode, 200);
        const data = pub.body.data;
        assert.strictEqual(data.status, 'published');
        assert.strictEqual(data.sections.title, sections.title);
        assert.strictEqual(data.faqs.length, 1);
        assert.ok(data.seo.schema, 'the storefront receives the schema');
    } finally {
        adminAllowed = true;
    }

    const publishAudit = auditLog.find((a) => a.action === 'product.content.publish');
    assert.ok(publishAudit, 'publish is audited');
});

test('content: editing a published product leaves the live snapshot alone', async () => {
    freshDb();
    const db = global.__CONTENT_DB;
    await saveDraft();
    await contentApi(makeReq('PUT', { body: { action: 'submit' } }), makeRes());
    await contentApi(makeReq('PUT', { body: { action: 'approve' } }), makeRes());
    await contentApi(makeReq('PUT', { body: { action: 'publish' } }), makeRes());

    /* admin edits the copy after publishing */
    const edit = await saveDraft({ sections: { title: 'Edited title v2' } });
    assert.strictEqual(edit.statusCode, 200);
    const content = db.raw('product_content', 'p1');
    assert.strictEqual(content.status, 'draft', 'edits drop back to a draft');
    assert.strictEqual(content.published.sections.title, sections.title, 'the live copy is untouched');

    adminAllowed = false;
    try {
        const pub = makeRes();
        await contentApi(makeReq('GET'), pub);
        assert.strictEqual(pub.body.data.sections.title, sections.title, 'the storefront still serves the approved copy');
    } finally {
        adminAllowed = true;
    }
});

test('content: unpublish takes the snapshot down', async () => {
    freshDb();
    const db = global.__CONTENT_DB;
    await saveDraft();
    await contentApi(makeReq('PUT', { body: { action: 'submit' } }), makeRes());
    await contentApi(makeReq('PUT', { body: { action: 'approve' } }), makeRes());
    await contentApi(makeReq('PUT', { body: { action: 'publish' } }), makeRes());

    const res = makeRes();
    await contentApi(makeReq('PUT', { body: { action: 'unpublish' } }), res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(db.raw('product_content', 'p1').published, null);

    adminAllowed = false;
    try {
        const pub = makeRes();
        await contentApi(makeReq('GET'), pub);
        assert.strictEqual(pub.statusCode, 403, 'the storefront no longer sees it');
    } finally {
        adminAllowed = true;
    }
});

test('content: publish requires the product to exist in the catalog', async () => {
    global.__CONTENT_DB = new MockFirestore();
    auditLog.length = 0;
    await saveDraft();
    await contentApi(makeReq('PUT', { body: { action: 'submit' } }), makeRes());
    await contentApi(makeReq('PUT', { body: { action: 'approve' } }), makeRes());
    const res = makeRes();
    await contentApi(makeReq('PUT', { body: { action: 'publish' } }), res);
    assert.strictEqual(res.statusCode, 409);
});

test('content: canonical URLs are normalised to absolute', async () => {
    freshDb();
    const res = await saveDraft({ seo: { canonicalUrl: '/product.html?id=p1', metaTitle: 'Aurora ANC Headphones | Trendaryo' } });
    assert.strictEqual(res.statusCode, 200);
    const seo = global.__CONTENT_DB.raw('product_seo', 'p1');
    assert.strictEqual(seo.canonicalUrl, 'https://trendaryo.com/product.html?id=p1');
    assert.strictEqual(seo.metaTitle, 'Aurora ANC Headphones | Trendaryo');
});

test('content: publishing auto-creates the blog brief (Phase 12)', async () => {
    freshDb();
    const db = global.__CONTENT_DB;
    await saveDraft({ seo: { keywords: ['anc headphones', 'noise cancelling', 'bluetooth headphones'], metaTitle: 'Aurora ANC | Trendaryo', metaDescription: 'Quiet that lasts.' } });
    await contentApi(makeReq('PUT', { body: { action: 'submit' } }), makeRes());
    await contentApi(makeReq('PUT', { body: { action: 'approve' } }), makeRes());
    const res = makeRes();
    await contentApi(makeReq('PUT', { body: { action: 'publish' } }), res);
    assert.strictEqual(res.statusCode, 200);

    const brief = db.raw('blog_briefs', 'brief-p1');
    assert.ok(brief, 'the brief is created automatically at publish');
    assert.strictEqual(brief.status, 'READY_FOR_GENERATION');
    assert.strictEqual(brief.primaryKeyword, 'anc headphones', 'primary keyword from the SEO package');
    assert.deepStrictEqual(brief.secondaryKeywords, ['noise cancelling', 'bluetooth headphones']);
    assert.strictEqual(brief.faqs.length, 1, 'approved FAQs flow into the brief');
    assert.strictEqual(brief.source.contentTitle, sections.title);
    assert.strictEqual(brief.source.price, 149, 'product facts come from the stored row');
    assert.strictEqual(brief.source.category, 'tech');
});

test('content: publishing a second time never overwrites an enriched brief', async () => {
    freshDb();
    const db = global.__CONTENT_DB;
    await saveDraft();
    await contentApi(makeReq('PUT', { body: { action: 'submit' } }), makeRes());
    await contentApi(makeReq('PUT', { body: { action: 'approve' } }), makeRes());
    await contentApi(makeReq('PUT', { body: { action: 'publish' } }), makeRes());

    /* an admin (or the AI) enriched the brief */
    await db.collection('blog_briefs').doc('brief-p1').update({
        status: 'BRIEF_READY',
        primaryKeyword: 'best anc headphones 2026',
        h2Suggestions: [{ text: 'Planned section', note: '' }]
    });

    /* edit + republish */
    await saveDraft({ sections: { title: 'Edited title v3' } });
    await contentApi(makeReq('PUT', { body: { action: 'submit' } }), makeRes());
    await contentApi(makeReq('PUT', { body: { action: 'approve' } }), makeRes());
    const res = makeRes();
    await contentApi(makeReq('PUT', { body: { action: 'publish' } }), res);
    assert.strictEqual(res.statusCode, 200);

    const brief = db.raw('blog_briefs', 'brief-p1');
    assert.strictEqual(brief.status, 'BRIEF_READY', 'enriched work survives');
    assert.strictEqual(brief.primaryKeyword, 'best anc headphones 2026');
    assert.strictEqual(brief.h2Suggestions.length, 1, 'the AI plan is untouched');
    assert.strictEqual(brief.source.contentTitle, 'Edited title v3', 'only the source snapshot refreshes');
    assert.strictEqual(db.rawAll('blog_briefs').length, 1, 'still one brief');
});

test('content: DELETE removes every generated asset', async () => {
    freshDb();
    const db = global.__CONTENT_DB;
    await saveDraft();
    assert.ok(db.raw('product_content', 'p1'));
    const res = makeRes();
    await contentApi(makeReq('DELETE'), res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(db.raw('product_content', 'p1'), undefined);
    assert.strictEqual(db.raw('product_faqs', 'p1'), undefined);
    assert.strictEqual(db.raw('product_images', 'p1'), undefined);
    assert.strictEqual(db.raw('product_seo', 'p1'), undefined);
});
