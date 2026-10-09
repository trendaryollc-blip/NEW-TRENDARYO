'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { MockFirestore } = require('./helpers/fake-firestore');
const { assertStoreOpen } = require('../api/_lib/store-gate');

test('store open by default (no settings doc)', async () => {
  const db = new MockFirestore({});
  await assertStoreOpen(db, {});
});

test('checkout disabled blocks with 403', async () => {
  const db = new MockFirestore({ settings: [{ id: 'store', checkoutEnabled: false }] });
  await assert.rejects(() => assertStoreOpen(db, {}), (e) => e.statusCode === 403 && e.code === 'checkout_disabled');
});

test('maintenance mode blocks with 503', async () => {
  const db = new MockFirestore({ settings: [{ id: 'store', maintenanceMode: true, maintenanceMessage: 'brb' }] });
  await assert.rejects(() => assertStoreOpen(db, {}), (e) => e.statusCode === 503 && e.code === 'maintenance');
});

test('blocked country case-insensitive', async () => {
  const db = new MockFirestore({ settings: [{ id: 'store', blockedCountries: ['us', 'GB'] }] });
  await assert.rejects(() => assertStoreOpen(db, { country: 'US' }), (e) => e.statusCode === 403);
  await assert.rejects(() => assertStoreOpen(db, { country: 'gb' }), (e) => e.statusCode === 403);
  await assertStoreOpen(db, { country: 'FR' });
});
