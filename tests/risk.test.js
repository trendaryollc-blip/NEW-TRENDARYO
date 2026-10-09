'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { MockFirestore } = require('./helpers/fake-firestore');
const { scoreOrder } = require('../api/_lib/risk');

const HOUR = 3600000;

function dbWith(settings, orders) {
  return new MockFirestore({
    settings: [{ id: 'store', ...settings }],
    orders,
  });
}

test('risk disabled -> score 0 regardless of velocity', async () => {
  const db = dbWith({ riskEnabled: false }, [
    { id: 'a', userId: 'u1', createdAt: new Date(Date.now() - 1 * HOUR).toISOString() },
    { id: 'b', userId: 'u1', createdAt: new Date(Date.now() - 2 * HOUR).toISOString() },
    { id: 'c', userId: 'u1', createdAt: new Date(Date.now() - 3 * HOUR).toISOString() },
  ]);
  const r = await scoreOrder(db, { userId: 'u1', total: 5000 });
  assert.strictEqual(r.score, 0);
  assert.strictEqual(r.enabled, false);
});

test('risk enabled: velocity + high value flags', async () => {
  const db = dbWith({ riskEnabled: true, riskReviewThreshold: 50, riskMaxOrderValue: 1000 }, [
    { id: 'a', userId: 'u1', addressFingerprint: 'fp', createdAt: new Date(Date.now() - 1 * HOUR).toISOString() },
    { id: 'b', userId: 'u1', addressFingerprint: 'fp', createdAt: new Date(Date.now() - 2 * HOUR).toISOString() },
    { id: 'c', userId: 'u1', addressFingerprint: 'fp', createdAt: new Date(Date.now() - 3 * HOUR).toISOString() },
  ]);
  const r = await scoreOrder(db, { userId: 'u1', addressFingerprint: 'fp', total: 2500 });
  assert.ok(r.score >= 50, 'expected score >= 50 got ' + r.score);
  assert.ok(r.flags.some((f) => f.startsWith('user_orders_24h')));
  assert.ok(r.flags.some((f) => f.startsWith('address_orders_24h')));
  assert.ok(r.flags.some((f) => f.startsWith('high_value')));
  assert.strictEqual(r.review, true);
});

test('risk enabled: below thresholds -> no review', async () => {
  const db = dbWith({ riskEnabled: true, riskReviewThreshold: 50, riskMaxOrderValue: 1000 }, []);
  const r = await scoreOrder(db, { userId: 'u2', total: 100 });
  assert.strictEqual(r.score, 0);
  assert.strictEqual(r.review, false);
});

test('cod high value flag', async () => {
  const db = dbWith({ riskEnabled: true, riskReviewThreshold: 100, riskMaxOrderValue: 1000 }, []);
  const r = await scoreOrder(db, { total: 900, isCod: true });
  assert.ok(r.flags.some((f) => f.startsWith('cod_high_value')));
  assert.strictEqual(r.review, false);
});
