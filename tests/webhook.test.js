'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { MockFirestore } = require('./helpers/fake-firestore');

const ROOT = path.join(__dirname, '..');

function stubModule(relPath, exports) {
  const abs = path.join(ROOT, relPath);
  require.cache[abs] = {
    id: abs,
    filename: abs,
    loaded: true,
    exports,
  };
}

function stubResolved(request, exports) {
  const abs = require.resolve(request, { paths: [ROOT] });
  require.cache[abs] = { id: abs, filename: abs, loaded: true, exports };
  return abs;
}

/* Pre-stub every dependency of the webhook before it is first required. */
stubModule('api/_lib/firebase.js', { initFirebase: () => ({ db: global.__WH_DB }) });
stubModule('api/_lib/stripe.js', { verify: () => global.__WH_EVENT });
stubResolved('firebase-admin/firestore', {
  FieldValue: {
    increment: (n) => ({ _fv: 'increment', n }),
    delete: () => ({ _fv: 'delete' }),
    arrayUnion: (...v) => ({ _fv: 'arrayUnion', vals: v }),
  },
});
/* The webhook pulls automations + stock + mail: stub automations to capture emits. */
stubModule('api/_lib/automations.js', { emitEvent: async (db, name) => { global.__WH_EMITS.push(name); } });

const handler = require('../api/payments/webhook');

function makeRes() {
  const res = { statusCode: 0, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.end = () => res;
  return res;
}

function makeReq() {
  return { method: 'POST', headers: { 'stripe-signature': 't=1,v1=abc' }, socket: { remoteAddress: '127.0.0.1' } };
}

function dbWith(orders) {
  return new MockFirestore({ orders, payments: [], stripe_events: [], automation_alerts: [] });
}

test('webhook: payment_intent.succeeded confirms order once, replay is duplicate', async () => {
  const db = dbWith([{ id: 'w1', orderNumber: 'W-1', status: 'pending', paymentStatus: 'pending', paymentIntentId: 'pi_1', createdAt: new Date().toISOString() }]);
  global.__WH_DB = db;
  global.__WH_EMITS = [];
  global.__WH_EVENT = { id: 'evt_1', type: 'payment_intent.succeeded', data: { object: { id: 'pi_1' } } };

  const r1 = await handler(makeReq(), makeRes());
  assert.strictEqual(r1.statusCode, 200);
  assert.deepStrictEqual(r1.body, { received: true });
  assert.strictEqual(db.raw('orders', 'w1').status, 'confirmed');
  assert.strictEqual(db.raw('orders', 'w1').paymentStatus, 'paid');
  assert.ok(global.__WH_EMITS.includes('order.paid'), 'order.paid must be emitted');
  assert.strictEqual(db.raw('stripe_events', 'evt_1').status, 'processed');
  assert.strictEqual(db.raw('stripe_events', 'evt_1').attempts, 1);

  const r2 = await handler(makeReq(), makeRes());
  assert.strictEqual(r2.statusCode, 200);
  assert.strictEqual(r2.body.duplicate, true, 'replay must be short-circuited');
  assert.strictEqual(db.raw('stripe_events', 'evt_1').attempts, 1, 'replay must not increment attempts');
});

test('webhook: duplicate event ids do not double-process cancellation restock', async () => {
  const db = dbWith([{ id: 'w2', orderNumber: 'W-2', status: 'pending', paymentStatus: 'pending', paymentIntentId: 'pi_2', items: [{ productId: 'pX', quantity: 2 }], createdAt: new Date().toISOString() }]);
  db._data.products = [{ id: 'pX', data: { id: 'pX', stock: 0 } }];
  global.__WH_DB = db;
  global.__WH_EMITS = [];
  global.__WH_EVENT = { id: 'evt_2', type: 'payment_intent.canceled', data: { object: { id: 'pi_2' } } };

  const r1 = await handler(makeReq(), makeRes());
  assert.strictEqual(r1.statusCode, 200);
  assert.strictEqual(db.raw('orders', 'w2').status, 'cancelled');
  const movesAfterFirst = (db.rawAll('inventory_movements') || []).length;
  assert.ok(movesAfterFirst >= 1, 'cancellation must restock');

  const r2 = await handler(makeReq(), makeRes());
  assert.strictEqual(r2.body.duplicate, true);
  const movesAfterSecond = (db.rawAll('inventory_movements') || []).length;
  assert.strictEqual(movesAfterSecond, movesAfterFirst, 'replay must not restock twice');
  assert.strictEqual(db.raw('products', 'pX').stock, 2, 'stock restored exactly once');
});

test('webhook: dispute holds order and blocks fulfilment', async () => {
  const db = dbWith([{ id: 'w3', orderNumber: 'W-3', status: 'shipped', paymentStatus: 'paid', paymentIntentId: 'pi_3', createdAt: new Date().toISOString() }]);
  global.__WH_DB = db;
  global.__WH_EMITS = [];
  global.__WH_EVENT = { id: 'evt_3', type: 'charge.dispute.created', data: { object: { id: 'dp_1', payment_intent: 'pi_3', amount: 5000, reason: 'fraudulent' } } };

  const r1 = await handler(makeReq(), makeRes());
  assert.strictEqual(r1.statusCode, 200);
  const order = db.raw('orders', 'w3');
  assert.strictEqual(order.riskLevel, 'disputed');
  assert.strictEqual(order.autoFulfillOptOut, true, 'fulfilment must be blocked');
  assert.ok(db.raw('automation_alerts', 'dispute-dp_1'), 'dispute alert must exist');
  assert.strictEqual(db.raw('automation_alerts', 'dispute-dp_1').resolved, false);

  global.__WH_EVENT = { id: 'evt_4', type: 'charge.dispute.closed', data: { object: { id: 'dp_1', payment_intent: 'pi_3', status: 'won' } } };
  const r2 = await handler(makeReq(), makeRes());
  assert.strictEqual(r2.statusCode, 200);
  const after = db.raw('orders', 'w3');
  assert.strictEqual(after.riskLevel, 'cleared', 'winning the dispute must lift the hold');
  assert.strictEqual(after.autoFulfillOptOut, false);
  assert.strictEqual(db.raw('automation_alerts', 'dispute-dp_1').resolved, true);
});

test('webhook: refund respects state machine and restocks', async () => {
  const db = dbWith([{ id: 'w4', orderNumber: 'W-4', status: 'delivered', paymentStatus: 'paid', paymentIntentId: 'pi_4', items: [{ productId: 'pY', quantity: 3 }], createdAt: new Date().toISOString() }]);
  global.__WH_DB = db;
  global.__WH_EMITS = [];
  db.raw('products', 'pY');
  db._data.products = [{ id: 'pY', data: { id: 'pY', stock: 7 } }];
  global.__WH_EVENT = { id: 'evt_5', type: 'charge.refunded', data: { object: { id: 'ch_1', payment_intent: 'pi_4', amount: 5000, amount_refunded: 5000 } } };

  const r1 = await handler(makeReq(), makeRes());
  assert.strictEqual(r1.statusCode, 200);
  assert.strictEqual(db.raw('orders', 'w4').status, 'refunded');
  assert.strictEqual(db.raw('products', 'pY').stock, 10, 'refund must restock');
});

test('webhook: unknown/bad signature rejected', async () => {
  const db = dbWith([]);
  global.__WH_DB = db;
  const original = require('../api/_lib/stripe');
  const badReq = makeReq();
  const res = makeRes();
  // Simulate a verify() failure by throwing from the stub temporarily.
  const abs = path.join(ROOT, 'api/_lib/stripe.js');
  const real = require.cache[abs].exports;
  require.cache[abs].exports = { verify: () => { throw new Error('bad sig'); } };
  delete require.cache[path.join(ROOT, 'api/payments/webhook.js')];
  const handler2 = require('../api/payments/webhook');
  const r = await handler2(badReq, res);
  require.cache[abs].exports = real;
  delete require.cache[path.join(ROOT, 'api/payments/webhook.js')];
  assert.strictEqual(r.statusCode, 400, 'invalid signature must be 400');
});
