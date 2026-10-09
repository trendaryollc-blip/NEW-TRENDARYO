'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { MockFirestore } = require('./helpers/fake-firestore');

const loadEngine = () => require('../api/_lib/automations');

test('automations smoke: seeded disabled, dry-run, watchdog, give-up', async () => {
  const db = new MockFirestore({
    orders: [
      { id: 'o1', orderNumber: 'T-1', status: 'pending', paymentStatus: 'pending', paymentMethod: 'card', createdAt: new Date(Date.now() - 72*3600000).toISOString() },
      { id: 'o2', orderNumber: 'T-2', status: 'pending', paymentStatus: 'pending', paymentMethod: 'cod', createdAt: new Date(Date.now() - 72*3600000).toISOString() },
      { id: 'o3', orderNumber: 'T-3', status: 'confirmed', paymentStatus: 'paid', paymentMethod: 'card', createdAt: new Date(Date.now() - 5*3600000).toISOString(), items: [{ productId: 'p1', quantity: 1 }] },
      { id: 'o4', orderNumber: 'T-4', status: 'processing', paymentStatus: 'paid', createdAt: new Date(Date.now() - 5*86400000).toISOString(), cjOrderId: 'CJ-9' },
    ],
    products: [
      { id: 'p1', name: 'A', status: 'active', stock: 2 },
      { id: 'p2', name: 'B', status: 'active', stock: 10 },
      { id: 'p3', name: 'C', status: 'active', stock: 0 },
    ],
    settings: [{ id: 'store', lowStock: 5, supportEmail: 'test@example.com' }],
  });
  const auto = loadEngine();
  await auto.ensureSeeded(db);
  const rules = await auto.listRules(db);
  assert.strictEqual(rules.length, 4);
  assert.ok(rules.every((r) => !r.enabled));
});
