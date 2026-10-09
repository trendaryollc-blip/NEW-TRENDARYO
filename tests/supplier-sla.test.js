'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { MockFirestore } = require('./helpers/fake-firestore');

const sla = require('../api/_lib/supplier-sla');
const automations = require('../api/_lib/automations');

const DAY = 86400000;
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString();

/* ------------------------------------------------------- pure SLA math -- */

test('resolveDefaultLead: rule beats store beats 7 days', () => {
  assert.strictEqual(sla.resolveDefaultLead(3, 10), 3, 'rule config wins');
  assert.strictEqual(sla.resolveDefaultLead(0, 10), 10, 'store applies when rule is 0');
  assert.strictEqual(sla.resolveDefaultLead(0, 0), 7, 'fallback default');
  assert.strictEqual(sla.resolveDefaultLead(undefined, undefined), 7);
  assert.strictEqual(sla.resolveDefaultLead('x', 'y'), 7, 'garbage falls back');
});

test('deadlineFor: slowest item wins and product lead beats defaults', () => {
  const order = { supplierSubmittedAt: daysAgo(0), items: [{ productId: 'fast' }, { productId: 'slow' }] };
  const leads = { fast: 2, slow: 9 };
  const deadline = new Date(sla.deadlineFor(order, leads, 7)).getTime();
  assert.strictEqual(Math.round((deadline - Date.now()) / DAY), 9, 'slowest line sets the clock');

  const noProductLead = sla.deadlineFor({ supplierSubmittedAt: daysAgo(0), items: [{ productId: 'x' }] }, {}, 5);
  assert.strictEqual(Math.round((new Date(noProductLead).getTime() - Date.now()) / DAY), 5, 'default used per item');
});

test('deadlineFor falls back to confirmation, then creation', () => {
  const withConfirm = { confirmedAt: daysAgo(1), items: [] };
  assert.strictEqual(Math.round((new Date(sla.deadlineFor(withConfirm, {}, 3)).getTime() - Date.now()) / DAY), 2);

  const withCreate = { createdAt: daysAgo(1), items: [] };
  assert.strictEqual(Math.round((new Date(sla.deadlineFor(withCreate, {}, 3)).getTime() - Date.now()) / DAY), 2);

  assert.strictEqual(sla.deadlineFor({ items: [] }, {}, 3), null, 'no timestamps -> no deadline');
});

test('isBreached only fires for open orders past their deadline', () => {
  const late = { status: 'processing', supplierSubmittedAt: daysAgo(10), items: [] };
  assert.strictEqual(sla.isBreached(late, {}, 7), true);
  assert.strictEqual(sla.isBreached({ ...late, status: 'shipped' }, {}, 7), false, 'shipped is not a breach');
  assert.strictEqual(sla.isBreached({ ...late, status: 'cancelled' }, {}, 7), false);
  assert.strictEqual(sla.isBreached({ status: 'processing', supplierSubmittedAt: daysAgo(1), items: [] }, {}, 7), false, 'within lead time');
  assert.strictEqual(sla.isBreached({ status: 'processing', items: [] }, {}, 7), false, 'no timestamps -> no breach');
});

test('shipDays and daysOver', () => {
  const shipped = { supplierSubmittedAt: daysAgo(4), supplierShippedAt: daysAgo(1), items: [] };
  assert.strictEqual(sla.shipDays(shipped), 3);
  assert.strictEqual(sla.shipDays({ supplierSubmittedAt: daysAgo(4), items: [] }), null, 'not shipped yet');
  assert.strictEqual(sla.daysOver({ status: 'processing', supplierSubmittedAt: daysAgo(10), items: [] }, {}, 7), 3);
  assert.strictEqual(sla.daysOver({ status: 'processing', supplierSubmittedAt: daysAgo(2), items: [] }, {}, 7), 0);
});

test('aggregate computes on-time percentage and open breaches', () => {
  const rows = sla.aggregate([
    { supplierId: 'cj', shipDays: 2, deadline: daysAgo(5), shippedAt: daysAgo(7) },
    { supplierId: 'cj', shipDays: 9, deadline: daysAgo(5), shippedAt: daysAgo(1) },
    { supplierId: 'cj', shipDays: null, breach: true },
    { supplierId: 'alt', shipDays: null, breach: false },
    { supplierId: null, shipDays: 1, deadline: daysAgo(2), shippedAt: daysAgo(1) },
  ]);
  const cj = rows.find((r) => r.supplierId === 'cj');
  assert.strictEqual(cj.submitted, 3);
  assert.strictEqual(cj.shipped, 2);
  assert.strictEqual(cj.late, 1, 'shipped after deadline counts late');
  assert.strictEqual(cj.onTimePct, 50);
  assert.strictEqual(cj.avgShipDays, 5.5);
  assert.strictEqual(cj.openBreaches, 1);

  const alt = rows.find((r) => r.supplierId === 'alt');
  assert.strictEqual(alt.onTimePct, null, 'no scored shipments -> null, not 0');
  const anon = rows.find((r) => r.supplierId === 'unassigned');
  assert.strictEqual(anon.shipped, 1);
});

/* ------------------------------------------------------------ the rule -- */

test('supplier-sla-watch ships disabled with its schema', async () => {
  const db = new MockFirestore();
  const rules = await automations.listRules(db);
  const rule = rules.find((r) => r.key === 'supplier-sla-watch');
  assert.ok(rule, 'rule exists');
  assert.equal(rule.enabled, false, 'ships paused');
  assert.ok(rule.fields.some((f) => f.key === 'leadTimeDays'));
  assert.ok(rule.fields.some((f) => f.key === 'maxPerRun'));
});

test('watch scans only overdue, unflagged supplier orders', async () => {
  const db = new MockFirestore({
    orders: [
      { id: 'overdue', status: 'processing', fulfillment: 'cj', supplierSubmittedAt: daysAgo(10), items: [], orderNumber: 'T-1' },
      { id: 'ontime', status: 'processing', fulfillment: 'cj', supplierSubmittedAt: daysAgo(1), items: [], orderNumber: 'T-2' },
      { id: 'shipped', status: 'shipped', fulfillment: 'cj', supplierSubmittedAt: daysAgo(10), items: [], orderNumber: 'T-3' },
      { id: 'manual', status: 'processing', supplierSubmittedAt: daysAgo(10), items: [], orderNumber: 'T-4' },
      { id: 'flagged', status: 'processing', fulfillment: 'cj', supplierSubmittedAt: daysAgo(10), slaBreached: true, items: [], orderNumber: 'T-5' },
    ],
  });
  await automations.ensureSeeded(db);
  await automations.updateRule(db, 'supplier-sla-watch', { enabled: true });
  const record = await automations.runRule(db, 'supplier-sla-watch', { trigger: 'manual', dryRun: true });
  assert.strictEqual(record.matched, 1, 'only the overdue supplier order');
  assert.strictEqual(record.results[0].entity, 'overdue');
});

test('product leadTimeDays overrides the rule default', async () => {
  const db = new MockFirestore({
    products: [{ id: 'p-slow', name: 'Slow', status: 'active', leadTimeDays: 30, stock: 5 }],
    orders: [
      { id: 'a', status: 'processing', fulfillment: 'cj', supplierSubmittedAt: daysAgo(10), items: [{ productId: 'p-slow' }], orderNumber: 'T-A' },
      { id: 'b', status: 'processing', fulfillment: 'cj', supplierSubmittedAt: daysAgo(10), items: [{ productId: 'p-other' }], orderNumber: 'T-B' },
    ],
  });
  await automations.ensureSeeded(db);
  await automations.updateRule(db, 'supplier-sla-watch', { enabled: true, config: { leadTimeDays: 7 } });
  const record = await automations.runRule(db, 'supplier-sla-watch', { trigger: 'manual', dryRun: true });
  assert.strictEqual(record.matched, 1, 'only the default-lead order breaches; 30d product is still inside');
  assert.strictEqual(record.results[0].entity, 'b');
});

test('breach flags the order, raises an alert and marks attention', async () => {
  const db = new MockFirestore({
    orders: [
      { id: 'overdue', status: 'processing', fulfillment: 'cj', supplierSubmittedAt: daysAgo(10), items: [], orderNumber: 'T-1' },
    ],
  });
  await automations.ensureSeeded(db);
  await automations.updateRule(db, 'supplier-sla-watch', { enabled: true });
  const record = await automations.runRule(db, 'supplier-sla-watch', { trigger: 'manual' });

  assert.strictEqual(record.status, 'ok', JSON.stringify(record.errors));
  assert.strictEqual(record.acted, 1);
  const order = db.raw('orders', 'overdue');
  assert.strictEqual(order.slaBreached, true);
  assert.strictEqual(order.needsAttention, true);
  assert.match(order.attentionReason, /supplier SLA breached/);
  const alert = db.raw('automation_alerts', 'sla-overdue');
  assert.strictEqual(alert.resolved, false);
  assert.strictEqual(alert.type, 'supplier-sla');

  /* Second run must not raise it again. */
  const again = await automations.runRule(db, 'supplier-sla-watch', { trigger: 'manual' });
  assert.strictEqual(again.matched, 0, 'already flagged orders are skipped');
});

test('sync resolves the alert and clears attention once the order ships', async () => {
  const db = new MockFirestore({
    orders: [
      { id: 'o1', status: 'processing', fulfillment: 'cj', supplierSubmittedAt: daysAgo(10), items: [], orderNumber: 'T-1' },
    ],
  });
  await automations.ensureSeeded(db);
  await automations.updateRule(db, 'supplier-sla-watch', { enabled: true });
  await automations.runRule(db, 'supplier-sla-watch', { trigger: 'manual' });
  assert.strictEqual(db.raw('automation_alerts', 'sla-o1').resolved, false);

  await db.collection('orders').doc('o1').set({
    status: 'shipped',
    supplierShippedAt: new Date().toISOString(),
  }, { merge: true });
  const record = await automations.runRule(db, 'supplier-sla-watch', { trigger: 'manual' });
  assert.ok(record, 'run completed');
  assert.strictEqual(db.raw('automation_alerts', 'sla-o1').resolved, true, 'alert cleared on ship');
  assert.strictEqual(db.raw('orders', 'o1').needsAttention, false, 'attention cleared');
  assert.strictEqual(db.raw('orders', 'o1').slaBreached, true, 'breach history kept for reporting');
});
