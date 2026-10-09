'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { MockFirestore } = require('./helpers/fake-firestore');

const { normalizeOpsFields, effectiveThreshold, marginPct } = require('../api/_lib/product-ops');

/* ------------------------------------------------------ normalisation -- */

test('normalizeOpsFields coerces, clamps and ignores unrelated keys', () => {
  const out = normalizeOpsFields({
    costPrice: '12.5',
    reorderPoint: -4,
    leadTimeDays: 0,
    name: 'Hacked',
    stock: 999,
  });
  assert.deepStrictEqual(out, { costPrice: 12.5, reorderPoint: null, leadTimeDays: 0 });
  assert.ok(!('name' in out), 'non-ops keys never pass through');
  assert.ok(!('stock' in out), 'stock never passes through');
});

test('normalizeOpsFields treats empty and garbage as clear-to-null', () => {
  assert.deepStrictEqual(normalizeOpsFields({ costPrice: '', leadTimeDays: 'soon' }), {
    costPrice: null,
    leadTimeDays: null,
  });
  assert.deepStrictEqual(normalizeOpsFields({ costPrice: null }), { costPrice: null });
  assert.deepStrictEqual(normalizeOpsFields(null), {});
  assert.deepStrictEqual(normalizeOpsFields({}), {}, 'absent keys are not invented');
});

/* ------------------------------------------------------------ precedence -- */

test('effectiveThreshold: rule override beats reorder point beats store default', () => {
  const product = { reorderPoint: 12 };
  assert.strictEqual(effectiveThreshold(product, 3, 8), 3, 'rule override wins');
  assert.strictEqual(effectiveThreshold(product, 0, 8), 12, 'product reorder point beats store');
  assert.strictEqual(effectiveThreshold({ stock: 5 }, 0, 8), 8, 'store default applies');
  assert.strictEqual(effectiveThreshold({ stock: 5 }, 0, 0), 0, 'store 0 means only at zero');
  assert.strictEqual(effectiveThreshold({ reorderPoint: -1 }, 0, 8), 8, 'bad reorder point ignored');
  assert.strictEqual(effectiveThreshold({}, 0, undefined), 0, 'nothing configured -> 0');
});

/* ---------------------------------------------------------------- margin -- */

test('marginPct computes gross margin and stays null without a cost', () => {
  assert.strictEqual(marginPct({ price: 100, costPrice: 60 }), 40);
  assert.strictEqual(marginPct({ price: 100, costPrice: 33.35 }), 66.7);
  assert.strictEqual(marginPct({ price: 100 }), null, 'no cost -> unknown margin');
  assert.strictEqual(marginPct({ price: 0, costPrice: 5 }), null, 'no price -> unknown margin');
  assert.strictEqual(marginPct({ price: 50, costPrice: -1 }), null, 'negative cost rejected');
});

/* ------------------------------------------------- low-stock integration -- */

test('low-stock scan honours each product reorder point', async () => {
  /* Load a fresh engine so the mail stub in health.test.js cannot leak here. */
  const automations = require('../api/_lib/automations');
  const db = new MockFirestore({
    products: [
      { id: 'high', name: 'High reorder', status: 'active', stock: 5, reorderPoint: 10, createdAt: '2026-01-03' },
      { id: 'low', name: 'Low reorder', status: 'active', stock: 5, reorderPoint: 2, createdAt: '2026-01-02' },
      { id: 'none', name: 'No reorder point', status: 'active', stock: 5, createdAt: '2026-01-01' },
      { id: 'soldout', name: 'Sold out', status: 'active', stock: 0, reorderPoint: 2, createdAt: '2026-01-04' },
      { id: 'hidden', name: 'Draft', status: 'draft', stock: 0, reorderPoint: 50, createdAt: '2026-01-05' },
    ],
    settings: [{ id: 'store', lowStock: 8 }],
  });

  await automations.ensureSeeded(db);
  await automations.updateRule(db, 'low-stock-alerts', { enabled: true });
  const record = await automations.runRule(db, 'low-stock-alerts', { trigger: 'manual', dryRun: true });

  /* high (5<=10), none (5<=8), soldout (0<=2) match; low (5>2) and hidden (draft) do not. */
  assert.strictEqual(record.matched, 3, JSON.stringify(record.results || record.errors));
  const matchedIds = record.results.map((r) => r.entity).sort();
  assert.deepStrictEqual(matchedIds, ['high', 'none', 'soldout']);
});

test('rule threshold override beats every product reorder point', async () => {
  const automations = require('../api/_lib/automations');
  const db = new MockFirestore({
    products: [
      { id: 'a', name: 'A', status: 'active', stock: 5, reorderPoint: 10, createdAt: '2026-01-01' },
      { id: 'b', name: 'B', status: 'active', stock: 5, reorderPoint: 1, createdAt: '2026-01-02' },
    ],
    settings: [{ id: 'store', lowStock: 8 }],
  });

  await automations.ensureSeeded(db);
  await automations.updateRule(db, 'low-stock-alerts', { enabled: true, config: { threshold: 4 } });
  const record = await automations.runRule(db, 'low-stock-alerts', { trigger: 'manual', dryRun: true });
  assert.strictEqual(record.matched, 0, 'override of 4 excludes stock of 5 everywhere');

  await automations.updateRule(db, 'low-stock-alerts', { config: { threshold: 6 } });
  const again = await automations.runRule(db, 'low-stock-alerts', { trigger: 'manual', dryRun: true });
  assert.strictEqual(again.matched, 2, 'override of 6 catches both');
});
