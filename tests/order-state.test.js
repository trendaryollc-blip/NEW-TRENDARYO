'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { canTransition, assertTransition } = require('../api/_lib/order-state');

test('basic transitions', () => {
  assert.ok(canTransition('pending', 'confirmed', 'webhook'));
  assert.ok(canTransition('pending', 'cancelled', 'customer'));
  assert.ok(canTransition('pending', 'confirmed', 'admin'));
  assert.ok(!canTransition('pending', 'delivered', 'admin'));
  assert.ok(canTransition('shipped', 'delivered', 'admin'));
  assert.ok(canTransition('delivered', 'refunded', 'admin'));
  assert.throws(() => assertTransition('pending', 'delivered', 'customer'), /invalid_transition/);
});
