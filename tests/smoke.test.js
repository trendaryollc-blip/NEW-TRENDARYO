'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { MockFirestore } = require('./helpers/fake-firestore');

const loadEngine = () => require('../api/_lib/automations');

function seedDb() {
  return new MockFirestore({
    orders: [
      { id: 'o1', orderNumber: 'T-1001', status: 'pending', paymentStatus: 'pending', paymentMethod: 'card', createdAt: new Date(Date.now() - 72 * 3600000).toISOString(), items: [{ productId: 'p1', quantity: 1 }] },
      { id: 'o2', orderNumber: 'T-1002', status: 'pending', paymentStatus: 'pending', paymentMethod: 'cod', createdAt: new Date(Date.now() - 72 * 3600000).toISOString(), items: [{ productId: 'p1', quantity: 1 }] },
      { id: 'o3', orderNumber: 'T-1003', status: 'confirmed', paymentStatus: 'paid', paymentMethod: 'card', createdAt: new Date(Date.now() - 5 * 3600000).toISOString(), items: [{ productId: 'p1', quantity: 2 }] },
      { id: 'o4', orderNumber: 'T-1004', status: 'processing', paymentStatus: 'paid', createdAt: new Date(Date.now() - 5 * 86400000).toISOString(), cjOrderId: 'CJ-9' },
      { id: 'o5', orderNumber: 'T-1005', status: 'confirmed', paymentStatus: 'paid', riskLevel: 'review', createdAt: new Date(Date.now() - 2 * 3600000).toISOString() },
    ],
    products: [
      { id: 'p1', name: 'Aurora Buds', status: 'active', stock: 2 },
      { id: 'p2', name: 'Nova Charger', status: 'active', stock: 41 },
      { id: 'p3', name: 'Halo Lamp', status: 'active', stock: 0 },
    ],
    settings: [{ id: 'store', lowStock: 5, supportEmail: 'test@example.com' }],
  });
}

test('automations: seeded disabled', async () => {
  const db = seedDb();
  const auto = loadEngine();
  await auto.ensureSeeded(db);
  const rules = await auto.listRules(db);
  assert.strictEqual(rules.length, Object.keys(auto.DEFINITIONS).length);
  assert.ok(rules.every((r) => !r.enabled), 'every rule must ship paused');
});

test('watchdog: dry-run writes nothing, then cancels card order only', async () => {
  const db = seedDb();
  const auto = loadEngine();
  await auto.ensureSeeded(db);

  let rec = await auto.runRule(db, 'unpaid-order-watchdog', { trigger: 'dry', dryRun: true });
  assert.strictEqual(rec.matched, 1, 'only the card order matches');
  assert.strictEqual(rec.acted, 0, 'dry run must not act');
  assert.strictEqual(db.raw('orders', 'o1').status, 'pending', 'dry run must not cancel');

  await auto.updateRule(db, 'unpaid-order-watchdog', { enabled: true });
  rec = await auto.runRule(db, 'unpaid-order-watchdog', { trigger: 'manual' });
  assert.strictEqual(rec.acted, 1);
  assert.strictEqual(db.raw('orders', 'o1').status, 'cancelled');
  assert.strictEqual(db.raw('orders', 'o2').status, 'pending', 'COD must stay pending');
});

test('auto-fulfillment: skips held orders, give-up on unfulfillable', async () => {
  const db = seedDb();
  const auto = loadEngine();
  await auto.ensureSeeded(db);
  await auto.updateRule(db, 'supplier-auto-fulfillment', { enabled: true });

  const rec = await auto.runRule(db, 'supplier-auto-fulfillment', { trigger: 'manual' });
  assert.strictEqual(rec.status, 'partial', 'CJ failure must be reported, not crash');
  assert.strictEqual(db.raw('orders', 'o5').autoFulfillSkipped, undefined);
  assert.ok(rec.results.every((r) => r.entity !== 'o5'), 'held order must not be attempted');

  const rec2 = await auto.runRule(db, 'supplier-auto-fulfillment', { trigger: 'manual' });
  assert.strictEqual(rec2.matched, 0, 'un-fulfillable order must not retry forever');
});

test('risk-review-queue: flags held order and resolves when cleared', async () => {
  const db = seedDb();
  const auto = loadEngine();
  await auto.ensureSeeded(db);
  await auto.updateRule(db, 'risk-review-queue', { enabled: true });

  const rec = await auto.runRule(db, 'risk-review-queue', { trigger: 'manual' });
  assert.strictEqual(rec.acted, 1);
  assert.strictEqual(db.raw('orders', 'o5').needsAttention, true);
  assert.ok(db.raw('automation_alerts', 'risk-o5'), 'alert doc must exist');

  db.raw('orders', 'o5').riskLevel = 'cleared';
  await auto.DEFINITIONS['risk-review-queue'].sync(db, {});
  assert.strictEqual(db.raw('automation_alerts', 'risk-o5').resolved, true, 'release must resolve alert');
});

test('low-stock: alert once, cooldown suppresses, restock resolves', async () => {
  const db = seedDb();
  const auto = loadEngine();
  await auto.ensureSeeded(db);
  await auto.updateRule(db, 'low-stock-alerts', { enabled: true });

  const rec = await auto.runRule(db, 'low-stock-alerts', { trigger: 'manual' });
  assert.strictEqual(rec.acted, 2, 'p1 and p3 are low');

  const rec2 = await auto.runRule(db, 'low-stock-alerts', { trigger: 'manual' });
  assert.strictEqual(rec2.acted, 0, 'cooldown must suppress re-alerts');
  assert.strictEqual(rec2.skipped, 2);

  db.raw('products', 'p1').stock = 30;
  await auto.DEFINITIONS['low-stock-alerts'].sync(db, { threshold: 0 });
  assert.strictEqual(db.raw('automation_alerts', 'low-stock-p1').resolved, true, 'restock must resolve');
});

test('paused rule refuses to run; runAll skips disabled rules', async () => {
  const db = seedDb();
  const auto = loadEngine();
  await auto.ensureSeeded(db);

  await assert.rejects(() => auto.runRule(db, 'unpaid-order-watchdog', { trigger: 'manual' }), /paused/);

  await auto.updateRule(db, 'low-stock-alerts', { enabled: true });
  const all = await auto.runAll(db, { trigger: 'cron' });
  assert.ok(all.every((r) => r.ruleKey !== 'unpaid-order-watchdog'), 'disabled rules must not run');
  assert.ok(all.some((r) => r.ruleKey === 'low-stock-alerts'));
});

test('config PATCH merges without dropping other keys', async () => {
  const db = seedDb();
  const auto = loadEngine();
  await auto.ensureSeeded(db);

  await auto.updateRule(db, 'low-stock-alerts', { config: { emailAdmin: false } });
  await auto.updateRule(db, 'low-stock-alerts', { config: { threshold: 999 } });
  const rule = db.raw('automations', 'low-stock-alerts');
  assert.strictEqual(rule.config.threshold, 999);
  assert.strictEqual(rule.config.emailAdmin, false, 'earlier config must survive later PATCH');
  assert.ok(rule.config.cooldownHours !== undefined, 'defaults must remain');
  assert.strictEqual(rule.enabled, false, 'config PATCH must not flip enabled');
});

test('emitEvent only triggers rules that subscribe and are enabled', async () => {
  const db = seedDb();
  const auto = loadEngine();
  await auto.ensureSeeded(db);

  await auto.emitEvent(db, 'order.paid', { orderId: 'o3' });
  let runs = db.rawAll('automation_runs');
  assert.strictEqual(runs.length, 0, 'disabled subscriber must not run');

  await auto.updateRule(db, 'supplier-auto-fulfillment', { enabled: true });
  await auto.emitEvent(db, 'order.paid', { orderId: 'o3' });
  runs = db.rawAll('automation_runs');
  assert.ok(runs.some((r) => r.trigger && r.trigger.includes('order.paid')), 'event trigger must be recorded');
});
