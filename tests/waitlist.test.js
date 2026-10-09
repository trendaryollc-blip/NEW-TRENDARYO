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

/* Mail stub BEFORE the engine loads so rule emails are captured. */
const sentMail = [];
stubModule('api/_lib/mail.js', {
  send: async (opts) => {
    if (global.__WL_MAIL_FAIL) return { ok: false };
    sentMail.push(opts);
    return { ok: true, via: 'stub' };
  },
  sendToAdmin: async (db, opts) => { sentMail.push(opts); return { ok: true }; },
  sendOrderConfirmation: async () => ({ ok: true }),
  sendShippingUpdate: async () => ({ ok: true }),
  orderConfirmationEmail: () => ({ subject: '', html: '', text: '' }),
  shippingUpdateEmail: () => ({ subject: '', html: '', text: '' }),
});
stubModule('api/_lib/firebase.js', { initFirebase: () => ({ db: global.__WL_DB }) });

const waitlist = require('../api/waitlist/index');
const automations = require('../api/_lib/automations');
const { move } = require('../api/_lib/stock');

function makeRes() {
  const res = { statusCode: 0, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.end = () => res;
  return res;
}

function makeReq(method, body, query = {}) {
  return {
    method,
    body: body || {},
    query,
    headers: { 'x-forwarded-for': 'wl-' + Math.random().toString(36).slice(2, 8) },
    url: '/api/waitlist',
    socket: { remoteAddress: '127.0.0.1' },
  };
}

async function call(method, body, query) {
  const res = makeRes();
  await waitlist(makeReq(method, body, query), res);
  return res;
}

/* ------------------------------------------------------------ endpoint -- */

test('waitlist: join is idempotent and stores a pending row', async () => {
  const db = new MockFirestore({ products: [{ id: 'p1', name: 'Keyboard', status: 'active', stock: 0 }] });
  global.__WL_DB = db;

  const first = await call('POST', { productId: 'p1', email: 'Fan@Example.COM' });
  assert.equal(first.statusCode, 200);
  assert.deepEqual(first.body.data, { productId: 'p1', joined: true, already: false });

  const second = await call('POST', { productId: 'p1', email: 'fan@example.com' });
  assert.equal(second.statusCode, 200);
  assert.equal(second.body.data.already, true, 'same email (cased) joins only once');

  const rows = db.rawAll('stock_waitlist');
  assert.equal(rows.length, 1, 'one row for both attempts');
  assert.equal(rows[0].status, 'pending');
  assert.equal(rows[0].email, 'fan@example.com');
  assert.equal(rows[0].productName, 'Keyboard');
});

test('waitlist: validation rejects bad input', async () => {
  const db = new MockFirestore({ products: [{ id: 'p1', name: 'Keyboard', status: 'active', stock: 0 }] });
  global.__WL_DB = db;

  assert.equal((await call('POST', { productId: '', email: 'a@b.co' })).statusCode, 400);
  assert.equal((await call('POST', { productId: 'p1', email: 'not-an-email' })).statusCode, 400);
  assert.equal((await call('POST', { productId: 'ghost', email: 'a@b.co' })).statusCode, 404);
  assert.equal(db.rawAll('stock_waitlist').length, 0, 'nothing stored for rejects');
});

test('waitlist: inactive product cannot be joined', async () => {
  const db = new MockFirestore({ products: [{ id: 'p1', name: 'Keyboard', status: 'draft', stock: 5 }] });
  global.__WL_DB = db;
  const res = await call('POST', { productId: 'p1', email: 'a@b.co' });
  assert.equal(res.statusCode, 409);
  assert.equal(db.rawAll('stock_waitlist').length, 0);
});

test('waitlist: count endpoint exposes size, never emails', async () => {
  const db = new MockFirestore({ products: [{ id: 'p1', name: 'K', status: 'active', stock: 0 }] });
  global.__WL_DB = db;
  await call('POST', { productId: 'p1', email: 'one@example.com' });
  await call('POST', { productId: 'p1', email: 'two@example.com' });
  await call('POST', { productId: 'p1', email: 'three@example.com' });

  const res = await call('GET', null, { productId: 'p1' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data, { productId: 'p1', waiting: 3 });
  assert.ok(!JSON.stringify(res.body).includes('example.com'), 'no email leaks in the payload');
});

/* --------------------------------------------------------------- rule -- */

test('restock-notify ships disabled with a config schema', async () => {
  const db = new MockFirestore();
  const rules = await automations.listRules(db);
  const rule = rules.find((r) => r.key === 'restock-notify');
  assert.ok(rule, 'rule exists');
  assert.equal(rule.enabled, false, 'ships paused');
  assert.ok(rule.fields.some((f) => f.key === 'maxPerRun'));
  assert.ok(rule.fields.some((f) => f.key === 'expiryDays'));
});

test('restock-notify only scans rows whose product is active and stocked', async () => {
  const db = new MockFirestore({
    products: [
      { id: 'ready', name: 'Ready', status: 'active', stock: 7 },
      { id: 'out', name: 'Out', status: 'active', stock: 0 },
      { id: 'gone', name: 'Gone', status: 'archived', stock: 9 },
    ],
    stock_waitlist: [
      { id: 'w1', productId: 'ready', email: 'a@x.co', status: 'pending', createdAt: new Date().toISOString() },
      { id: 'w2', productId: 'out', email: 'b@x.co', status: 'pending', createdAt: new Date().toISOString() },
      { id: 'w3', productId: 'gone', email: 'c@x.co', status: 'pending', createdAt: new Date().toISOString() },
      { id: 'w4', productId: 'ready', email: 'd@x.co', status: 'notified', createdAt: new Date().toISOString() },
    ],
  });
  await automations.ensureSeeded(db);
  await automations.updateRule(db, 'restock-notify', { enabled: true });
  const record = await automations.runRule(db, 'restock-notify', { trigger: 'manual', dryRun: true });
  assert.strictEqual(record.matched, 1, 'only the ready+pending row matches');
  assert.strictEqual(record.results[0].entity, 'w1');
});

test('restock-notify emails the waiter and marks the row notified', async () => {
  const db = new MockFirestore({
    products: [{ id: 'ready', name: 'Mechanical Keyboard', status: 'active', stock: 7 }],
    stock_waitlist: [
      { id: 'w1', productId: 'ready', email: 'fan@x.co', status: 'pending', createdAt: new Date().toISOString() },
    ],
  });
  sentMail.length = 0;
  await automations.ensureSeeded(db);
  await automations.updateRule(db, 'restock-notify', { enabled: true });
  const record = await automations.runRule(db, 'restock-notify', { trigger: 'manual' });

  assert.strictEqual(record.status, 'ok', JSON.stringify(record.errors));
  assert.strictEqual(record.acted, 1);
  assert.equal(sentMail.length, 1);
  assert.equal(sentMail[0].to, 'fan@x.co');
  assert.match(sentMail[0].subject, /back in stock/);
  assert.match(sentMail[0].text, /product\.html\?id=ready/);
  assert.equal(db.raw('stock_waitlist', 'w1').status, 'notified');
});

test('restock-notify keeps the row pending when the mail provider fails', async () => {
  const db = new MockFirestore({
    products: [{ id: 'ready', name: 'Ready', status: 'active', stock: 3 }],
    stock_waitlist: [
      { id: 'w1', productId: 'ready', email: 'fan@x.co', status: 'pending', createdAt: new Date().toISOString() },
    ],
  });
  await automations.ensureSeeded(db);
  await automations.updateRule(db, 'restock-notify', { enabled: true });

  global.__WL_MAIL_FAIL = true;
  const record = await automations.runRule(db, 'restock-notify', { trigger: 'manual' });
  global.__WL_MAIL_FAIL = false;

  assert.strictEqual(record.status, 'ok');
  assert.strictEqual(record.acted, 0, 'nothing marked as sent');
  assert.strictEqual(db.raw('stock_waitlist', 'w1').status, 'pending', 'retries next run');
});

test('restock-notify sync expires aged rows and rows for removed products', async () => {
  const old = new Date(Date.now() - 120 * 86400000).toISOString();
  const db = new MockFirestore({
    products: [{ id: 'alive', name: 'Alive', status: 'active', stock: 0 }],
    stock_waitlist: [
      { id: 'old', productId: 'alive', email: 'a@x.co', status: 'pending', createdAt: old },
      { id: 'fresh', productId: 'alive', email: 'b@x.co', status: 'pending', createdAt: new Date().toISOString() },
      { id: 'orphan', productId: 'deleted', email: 'c@x.co', status: 'pending', createdAt: new Date().toISOString() },
    ],
  });
  await automations.ensureSeeded(db);
  await automations.updateRule(db, 'restock-notify', { enabled: true, config: { expiryDays: 60 } });
  const record = await automations.runRule(db, 'restock-notify', { trigger: 'manual' });

  assert.strictEqual(db.raw('stock_waitlist', 'old').status, 'expired');
  assert.strictEqual(db.raw('stock_waitlist', 'old').expiredReason, 'age');
  assert.strictEqual(db.raw('stock_waitlist', 'orphan').status, 'expired');
  assert.strictEqual(db.raw('stock_waitlist', 'orphan').expiredReason, 'product');
  assert.strictEqual(db.raw('stock_waitlist', 'fresh').status, 'pending', 'fresh rows survive');
  assert.ok(record, 'run completed');
});

/* -------------------------------------------------- end-to-end restock -- */

test('stock.move on a refill fires product.restocked and notifies the waiter', async () => {
  const db = new MockFirestore({
    products: [{ id: 'kb', name: 'Keyboard', status: 'active', stock: 0 }],
    stock_waitlist: [
      { id: 'w1', productId: 'kb', email: 'first@x.co', status: 'pending', createdAt: new Date().toISOString() },
    ],
  });
  sentMail.length = 0;
  await automations.ensureSeeded(db);
  await automations.updateRule(db, 'restock-notify', { enabled: true });

  await move(db, { productId: 'kb', delta: 25, reason: 'restock', actorUid: 'admin-1' });

  assert.equal(db.raw('products', 'kb').stock, 25, 'stock moved');
  assert.equal(sentMail.length, 1, 'event drove exactly one email');
  assert.equal(sentMail[0].to, 'first@x.co');
  assert.equal(db.raw('stock_waitlist', 'w1').status, 'notified');

  /* A decrement must not notify anyone. */
  const before = sentMail.length;
  await move(db, { productId: 'kb', delta: -5, reason: 'sale', orderId: 'o1' });
  assert.equal(sentMail.length, before, 'no email on stock decrease');
});
