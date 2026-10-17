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

stubModule('api/_lib/firebase.js', { initFirebase: () => ({ db: global.__BLOG_DB }) });
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
stubModule('api/_lib/audit.js', { logAudit: async (db, action, meta, user) => { auditLog.push({ action, meta }); } });

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

async function createPost(overrides = {}) {
  const res = makeRes();
  await blogIndex(makeReq('POST', {
    body: {
      title: 'How to Choose Wireless Headphones',
      excerpt: 'A short hook.',
      category: 'guides',
      status: 'draft',
      blocks: [
        { type: 'h2', text: 'Fit beats specs' },
        { type: 'p', text: 'Demo a pair for fifteen minutes.' },
      ],
      ...overrides,
    },
  }), res);
  assert.strictEqual(res.statusCode, 201);
  return res.body.data;
}

test('blog: create slugifies the title and the slug is the document id', async () => {
  global.__BLOG_DB = new MockFirestore();
  auditLog.length = 0;

  const post = await createPost();
  assert.strictEqual(post.id, 'how-to-choose-wireless-headphones');
  assert.strictEqual(post.slug, 'how-to-choose-wireless-headphones');
  assert.strictEqual(post.views, 0);
  assert.strictEqual(post.status, 'draft');
  assert.strictEqual(post.publishedAt, null);
  assert.ok(global.__BLOG_DB.raw('blog', post.slug), 'doc stored under the slug');
  assert.strictEqual(auditLog[0].action, 'blog.create');
});

test('blog: slug collisions get a numeric suffix instead of overwriting', async () => {
  global.__BLOG_DB = new MockFirestore();
  const a = await createPost();
  const b = await createPost();
  assert.notStrictEqual(a.slug, b.slug);
  assert.ok(b.slug.startsWith(a.slug));
});

test('blog: public list only ever sees published posts', async () => {
  global.__BLOG_DB = new MockFirestore();
  await createPost({ status: 'draft' });
  await createPost({ title: 'Published one', status: 'published' });

  const res = makeRes();
  await blogIndex(makeReq('GET', { query: {} }), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.data.length, 1);
  assert.strictEqual(res.body.data[0].title, 'Published one');
});

test('blog: asking for drafts as a non-admin is refused', async () => {
  global.__BLOG_DB = new MockFirestore();
  await createPost({ status: 'draft' });

  adminAllowed = false;
  const res = makeRes();
  await blogIndex(makeReq('GET', { query: { status: 'all' } }), res);
  adminAllowed = true;

  assert.strictEqual(res.statusCode, 403);
});

test('blog: publishing stamps publishedAt and the public GET then works', async () => {
  global.__BLOG_DB = new MockFirestore();
  const post = await createPost({ title: 'Scheduled guide' });

  const before = makeRes();
  adminAllowed = false;
  await blogById(makeReq('GET', { query: { id: post.slug } }), before);
  adminAllowed = true;
  assert.strictEqual(before.statusCode, 404, 'drafts 404 for the public');

  const put = makeRes();
  await blogById(makeReq('PUT', { query: { id: post.slug }, body: { status: 'published' } }), put);
  assert.strictEqual(put.statusCode, 200);
  assert.ok(put.body.data.publishedAt, 'publishedAt stamped on the transition');

  const after = makeRes();
  await blogById(makeReq('GET', { query: { id: post.slug } }), after);
  assert.strictEqual(after.statusCode, 200);
});

test('blog: view counting is public, increments once, and never touches drafts', async () => {
  global.__BLOG_DB = new MockFirestore();
  const live = await createPost({ title: 'Live post', status: 'published' });
  const draft = await createPost({ title: 'Draft post' });

  const v1 = makeRes();
  await blogById(makeReq('POST', { query: { id: live.slug }, body: { action: 'view' } }), v1);
  assert.strictEqual(v1.statusCode, 200);
  assert.strictEqual(v1.body.data.views, 1);

  const v2 = makeRes();
  await blogById(makeReq('POST', { query: { id: live.slug }, body: { action: 'view' } }), v2);
  assert.strictEqual(v2.body.data.views, 2);
  assert.strictEqual(global.__BLOG_DB.raw('blog', live.slug).views, 2);

  const vDraft = makeRes();
  adminAllowed = false;
  await blogById(makeReq('POST', { query: { id: draft.slug }, body: { action: 'view' } }), vDraft);
  adminAllowed = true;
  assert.strictEqual(vDraft.statusCode, 404, 'draft views are invisible to the public');
  assert.strictEqual(global.__BLOG_DB.raw('blog', draft.slug).views, 0);
});

test('blog: duplicate produces a draft copy without clobbering the original', async () => {
  global.__BLOG_DB = new MockFirestore();
  const post = await createPost({ title: 'Original article', status: 'published' });

  const res = makeRes();
  await blogById(makeReq('POST', { query: { id: post.slug }, body: { action: 'duplicate' } }), res);
  assert.strictEqual(res.statusCode, 201);
  assert.strictEqual(res.body.data.status, 'draft');
  assert.strictEqual(res.body.data.views, 0);
  assert.match(res.body.data.title, /\(Copy\)$/);
  assert.strictEqual(global.__BLOG_DB.raw('blog', post.slug).status, 'published', 'original untouched');
});

test('blog: SEO metadata round-trips through update', async () => {
  global.__BLOG_DB = new MockFirestore();
  const post = await createPost({ title: 'SEO post' });

  const res = makeRes();
  await blogById(makeReq('PUT', {
    query: { id: post.slug },
    body: {
      seo: { metaTitle: 'Headphone Guide | Trendaryo', metaDescription: 'How to pick ANC headphones.', keywords: ['headphones', 'anc'] },
      tags: ['audio', 'guides'],
    },
  }), res);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.data.seo.metaTitle, 'Headphone Guide | Trendaryo');
  assert.deepStrictEqual(res.body.data.tags, ['audio', 'guides']);
});

test('blog: unpublished fields cannot be set by a crafted payload', async () => {
  global.__BLOG_DB = new MockFirestore();
  const post = await createPost({ title: 'Guarded post' });

  const res = makeRes();
  await blogById(makeReq('PUT', {
    query: { id: post.slug },
    body: { views: 99999, createdBy: 'someone-else', status: 'published' },
  }), res);

  assert.strictEqual(res.body.data.views, 0, 'views is not in the writable allowlist');
  assert.strictEqual(res.body.data.createdBy, 'admin-1', 'createdBy is not re-writable');
  assert.strictEqual(res.body.data.status, 'published', 'status itself is writable');
});
