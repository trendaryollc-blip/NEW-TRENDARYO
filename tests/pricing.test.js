const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DEFAULT_SETTINGS,
  PricingError,
  getSettings,
  priceOrder,
  round2,
  toCents,
} = require('../api/_lib/pricing');

function createDb({ products = {}, coupons = {}, settings = null } = {}) {
  return {
    collection(name) {
      return {
        doc(id) {
          if (name === 'settings' && id === 'store') {
            return {
              get: async () => settings
                ? { exists: true, data: () => settings }
                : { exists: false, data: () => ({}) },
            };
          }
          const collection = name === 'products' ? products : coupons;
          const value = collection[id];
          return {
            id,
            get: async () => value
              ? { id, exists: true, data: () => value }
              : { id, exists: false, data: () => ({}) },
          };
        },
      };
    },
    async getAll(...refs) {
      return Promise.all(refs.map((ref) => ref.get()));
    },
  };
}

const catalog = {
  product1: { name: 'Coat', price: 40, stock: 5, status: 'active', image: '/coat.jpg' },
  product2: { name: 'Scarf', price: 20, stock: 10, status: 'active', images: ['/scarf.jpg'] },
};

test('money helpers round to two decimal places and convert to cents', () => {
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2('2.345'), 2.35);
  assert.equal(toCents(12.34), 1234);
});

test('normalizes item IDs and merges duplicate product lines', async () => {
  const result = await priceOrder(createDb({ products: { '1': catalog.product1 } }), [
    { productId: 1, quantity: 1.9 },
    { productId: '1', quantity: 2 },
  ]);
  assert.equal(result.lineItems.length, 1);
  assert.equal(result.lineItems[0].productId, '1');
  assert.equal(result.lineItems[0].quantity, 3);
  assert.equal(result.subtotal, 120);
});

test('rejects empty, oversized, missing-ID, and invalid-quantity carts', async () => {
  const cases = [
    [[], 'Your cart is empty'],
    [Array.from({ length: 101 }, (_, i) => ({ productId: String(i), quantity: 1 })), 'Too many distinct items in one order'],
    [[{ quantity: 1 }], 'Each item must include a productId'],
    [[{ productId: 'x', quantity: 0 }], 'Invalid quantity for item x'],
    [[{ productId: 'x', quantity: 100 }], 'Maximum quantity is 99 per item'],
  ];
  for (const [items, message] of cases) {
    await assert.rejects(priceOrder(createDb({ products: catalog }), items), (error) => {
      assert.ok(error instanceof PricingError);
      assert.equal(error.message, message);
      return true;
    });
  }
});

test('loads store settings with defaults and normalizes configured values', async () => {
  assert.deepEqual(await getSettings(createDb()), DEFAULT_SETTINGS);
  assert.deepEqual(await getSettings(createDb({
    settings: { currency: 'CAD', taxRate: '0.1', shippingFlat: '4.5', freeShippingThreshold: '75' },
  })), {
    currency: 'cad',
    taxRate: 0.1,
    shippingFlat: 4.5,
    freeShippingThreshold: 75,
  });
});

test('prices from catalog, computes tax and shipping, and uses server-side item details', async () => {
  const result = await priceOrder(createDb({ products: catalog }), [
    { productId: 'product1', quantity: 1 },
    { productId: 'product2', quantity: 1 },
  ]);
  assert.equal(result.subtotal, 60);
  assert.equal(result.discount, 0);
  assert.equal(result.shipping, 0);
  assert.equal(result.tax, 4.8);
  assert.equal(result.total, 64.8);
  assert.equal(result.lineItems[0].image, '/coat.jpg');
  assert.equal(result.lineItems[1].image, '/scarf.jpg');
  assert.equal(result.currency, 'usd');
});

test('applies percent and fixed coupons without discounting beyond subtotal', async () => {
  const db = createDb({
    products: catalog,
    coupons: {
      SAVE10: { type: 'percent', value: 10, active: true },
      BIG: { type: 'fixed', value: 999, active: true },
    },
  });
  const percent = await priceOrder(db, [{ productId: 'product1', quantity: 1 }], ' save10 ');
  assert.equal(percent.discount, 4);
  assert.equal(percent.coupon.code, 'SAVE10');
  assert.equal(percent.shipping, 9.99);
  assert.equal(percent.tax, 2.88);
  assert.equal(percent.total, 48.87);

  const fixed = await priceOrder(db, [{ productId: 'product1', quantity: 1 }], 'BIG');
  assert.equal(fixed.discount, 40);
  assert.equal(fixed.total, 9.99);
});

test('rejects invalid, inactive, expired, exhausted, and below-minimum coupons', async () => {
  const db = createDb({
    products: catalog,
    coupons: {
      INACTIVE: { type: 'fixed', value: 1, active: false },
      EXPIRED: { type: 'fixed', value: 1, expiresAt: '2000-01-01' },
      USED: { type: 'fixed', value: 1, usageLimit: 1, usedCount: 1 },
      MINIMUM: { type: 'fixed', value: 1, minSubtotal: 100 },
    },
  });
  const cases = [
    ['MISSING', 'coupon_invalid'],
    ['INACTIVE', 'coupon_inactive'],
    ['EXPIRED', 'coupon_expired'],
    ['USED', 'coupon_exhausted'],
    ['MINIMUM', 'coupon_minimum'],
  ];
  for (const [couponCode, code] of cases) {
    await assert.rejects(
      priceOrder(db, [{ productId: 'product1', quantity: 1 }], couponCode),
      (error) => error.code === code,
    );
  }
});

test('rejects missing, unavailable, invalid-price, and out-of-stock products', async () => {
  const cases = [
    ['missing', {}, 'product_missing'],
    ['inactive', { inactive: { name: 'Draft', price: 5, status: 'draft' } }, 'product_unavailable'],
    ['invalid', { invalid: { name: 'Bad price', price: -1 } }, 'product_price'],
    ['empty', { empty: { name: 'Empty', price: 5, stock: 0 } }, 'out_of_stock'],
    ['limited', { limited: { name: 'Limited', price: 5, stock: 1 } }, 'insufficient_stock'],
  ];
  for (const [productId, products, code] of cases) {
    await assert.rejects(
      priceOrder(createDb({ products }), [{ productId, quantity: code === 'insufficient_stock' ? 2 : 1 }]),
      (error) => error.code === code && error.statusCode === 409,
    );
  }
});
