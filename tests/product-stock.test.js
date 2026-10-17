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

/* Everything the products/[id] route touches, stubbed before first require. */
const auditLog = [];
const emitted = [];
stubModule('api/_lib/firebase.js', { initFirebase: () => ({ db: global.__PS_DB }) });
stubModule('api/_lib/cors.js', { handleCors: () => false });
stubModule('api/_lib/auth.js', {
  requireAuth: async () => ({ uid: 'admin-1', email: 'admin@trendaryo.com' }),
  requireAdmin: async () => ({ uid: 'admin-1', email: 'admin@trendaryo.com' }),
});
stubModule('api/_lib/security.js', { applyRateLimit: () => true });
stubModule('api/_lib/audit.js', { log: async (db, entry) => { auditLog.push(entry); } });
stubModule('api/_lib/automations.js', {
  emitEvent: async (db, type, payload) => { emitted.push({ type, payload }); },
});

const productRoute = require('../api/products/[id]');

function makeRes() {
  const res = { statusCode: 0, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.end = () => res;
  return res;
}

async function put(id, body) {
  const res = makeRes();
  await productRoute(
    { method: 'PUT', body, query: { id }, headers: { 'x-forwarded-for': 'test' }, url: '/api/products/' + id },
    res
  );
  return res;
}

function seed() {
  auditLog.length = 0;
  emitted.length = 0;
  const db = new MockFirestore({
    products: [{ id: 'p1', name: 'Keyboard', status: 'active', stock: 24, price: 50 }],
  });
  global.__PS_DB = db;
  return db;
}

test('admin stock edit routes through stock.move and fires product.restocked', async () => {
  const db = seed();

  const res = await put('p1', { stock: 36 });
  assert.equal(res.statusCode, 200);
  assert.equal(db.raw('products', 'p1').stock, 36, 'stock written');

  const moves = db.rawAll('inventory_movements');
  assert.equal(moves.length, 1, 'one movement recorded');
  assert.equal(moves[0].delta, 12, 'delta is the difference, not the absolute');
  assert.equal(moves[0].actorUid, 'admin-1');
  assert.match(moves[0].reason, /^admin_edit:/);

  assert.equal(emitted.length, 1, 'restock event fired once');
  assert.equal(emitted[0].type, 'product.restocked');
  assert.deepEqual(emitted[0].payload, { productId: 'p1', stock: 36 });

  assert.equal(auditLog.length, 1);
  assert.equal(auditLog[0].action, 'product.updated');
});

test('edit without a stock field leaves inventory alone', async () => {
  const db = seed();

  const res = await put('p1', { name: 'Keyboard Pro', price: 60 });
  assert.equal(res.statusCode, 200);
  assert.equal(db.raw('products', 'p1').name, 'Keyboard Pro');
  assert.equal(db.raw('products', 'p1').stock, 24, 'stock untouched');
  assert.equal(db.rawAll('inventory_movements').length, 0, 'no movement');
  assert.equal(emitted.length, 0, 'no restock event');
});

test('reducing stock records a negative movement and never emits restock', async () => {
  const db = seed();

  const res = await put('p1', { stock: 0 });
  assert.equal(res.statusCode, 200);
  assert.equal(db.raw('products', 'p1').stock, 0);

  const moves = db.rawAll('inventory_movements');
  assert.equal(moves.length, 1);
  assert.equal(moves[0].delta, -24);
  assert.equal(emitted.length, 0, 'draining stock is not a restock');
});

test('setting the same stock value is a no-op for inventory', async () => {
  const db = seed();

  const res = await put('p1', { stock: 24 });
  assert.equal(res.statusCode, 200);
  assert.equal(db.rawAll('inventory_movements').length, 0, 'no movement when unchanged');
  assert.equal(emitted.length, 0);
});
