/**
 * Server-side pricing.
 *
 * Every amount a customer is charged is computed HERE from Firestore product
 * prices - never from values supplied by the browser. `create-intent` (card)
 * and `orders` (all methods) both use this module so the amount stored on the
 * order always matches the amount authorised by Stripe.
 */
const { initFirebase } = require('./firebase');

const DEFAULT_SETTINGS = {
  currency: 'usd',
  taxRate: 0.08,
  shippingFlat: 9.99,
  freeShippingThreshold: 50,
};

const MAX_QTY_PER_ITEM = 99;

class PricingError extends Error {
  constructor(message, statusCode = 400, code = 'invalid_order') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function toCents(n) {
  return Math.round(Number(n) * 100);
}

async function getSettings(db) {
  const doc = await db.collection('settings').doc('store').get();
  const data = doc.exists ? doc.data() : {};
  return {
    ...DEFAULT_SETTINGS,
    ...data,
    taxRate: Number(data.taxRate != null ? data.taxRate : DEFAULT_SETTINGS.taxRate),
    shippingFlat: Number(data.shippingFlat != null ? data.shippingFlat : DEFAULT_SETTINGS.shippingFlat),
    freeShippingThreshold: Number(
      data.freeShippingThreshold != null ? data.freeShippingThreshold : DEFAULT_SETTINGS.freeShippingThreshold
    ),
    currency: String(data.currency || DEFAULT_SETTINGS.currency).toLowerCase(),
  };
}

function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new PricingError('Your cart is empty');
  }
  if (rawItems.length > 100) {
    throw new PricingError('Too many distinct items in one order');
  }

  const merged = new Map();
  for (const raw of rawItems) {
    const productId = raw && raw.productId != null ? String(raw.productId) : '';
    const quantity = Math.floor(Number(raw && raw.quantity));
    if (!productId) throw new PricingError('Each item must include a productId');
    if (!Number.isFinite(quantity) || quantity < 1) {
      throw new PricingError('Invalid quantity for item ' + productId);
    }
    if (quantity > MAX_QTY_PER_ITEM) {
      throw new PricingError('Maximum quantity is ' + MAX_QTY_PER_ITEM + ' per item');
    }
    merged.set(productId, (merged.get(productId) || 0) + quantity);
  }

  return Array.from(merged, ([productId, quantity]) => ({ productId, quantity }));
}

async function resolveCoupon(db, code, subtotal) {
  if (!code) return { discount: 0, coupon: null };
  const normalized = String(code).trim().toUpperCase();
  if (!normalized) return { discount: 0, coupon: null };

  const doc = await db.collection('coupons').doc(normalized).get();
  if (!doc.exists) throw new PricingError('That promo code is not valid', 400, 'coupon_invalid');

  const c = doc.data();
  if (c.active === false) throw new PricingError('That promo code is no longer active', 400, 'coupon_inactive');
  if (c.expiresAt && new Date(c.expiresAt).getTime() < Date.now()) {
    throw new PricingError('That promo code has expired', 400, 'coupon_expired');
  }
  if (c.usageLimit && (c.usedCount || 0) >= c.usageLimit) {
    throw new PricingError('That promo code has reached its usage limit', 400, 'coupon_exhausted');
  }
  if (c.minSubtotal && subtotal < Number(c.minSubtotal)) {
    throw new PricingError(
      'Spend at least $' + round2(c.minSubtotal) + ' to use this code',
      400,
      'coupon_minimum'
    );
  }

  let discount = 0;
  if (c.type === 'percent') discount = subtotal * (Number(c.value) || 0) / 100;
  else if (c.type === 'fixed') discount = Number(c.value) || 0;
  discount = round2(Math.min(discount, subtotal));

  return {
    discount,
    coupon: {
      code: normalized,
      type: c.type,
      value: Number(c.value) || 0,
      description: c.description || '',
    },
  };
}

/**
 * @param {object} db  Firestore admin instance
 * @param {Array<{productId:string, quantity:number}>} rawItems
 * @param {string} [couponCode]
 * @returns {Promise<object>} pricing breakdown
 */
async function priceOrder(db, rawItems, couponCode) {
  const settings = await getSettings(db);
  const normalized = normalizeItems(rawItems);

  const refs = normalized.map((i) => db.collection('products').doc(i.productId));
  const docs = await db.getAll(...refs);

  const lineItems = [];
  let subtotal = 0;

  for (let i = 0; i < docs.length; i++) {
    const snap = docs[i];
    const requested = normalized[i];

    if (!snap.exists) {
      throw new PricingError('A product in your cart is no longer available', 409, 'product_missing');
    }
    const product = snap.data();
    if (product.status && product.status !== 'active') {
      throw new PricingError(
        (product.name || 'A product') + ' is no longer available',
        409,
        'product_unavailable'
      );
    }

    const price = Number(product.price);
    if (!Number.isFinite(price) || price < 0) {
      throw new PricingError('A product in your cart has an invalid price', 409, 'product_price');
    }

    if (product.stock != null) {
      const stock = Number(product.stock);
      if (Number.isFinite(stock) && requested.quantity > stock) {
        if (stock <= 0) {
          throw new PricingError(
            (product.name || 'A product') + ' is out of stock',
            409,
            'out_of_stock'
          );
        }
        throw new PricingError(
          'Only ' + stock + ' left of ' + (product.name || 'a product'),
          409,
          'insufficient_stock'
        );
      }
    }

    const lineTotal = round2(price * requested.quantity);
    subtotal = round2(subtotal + lineTotal);

    lineItems.push({
      productId: snap.id,
      name: product.name || 'Product',
      price: round2(price),
      quantity: requested.quantity,
      image: product.image || (Array.isArray(product.images) && product.images[0]) || '',
      emoji: product.emoji || '',
      lineTotal,
    });
  }

  const { discount, coupon } = await resolveCoupon(db, couponCode, subtotal);

  const taxable = round2(subtotal - discount);
  const shipping = taxable >= settings.freeShippingThreshold ? 0 : round2(settings.shippingFlat);
  const tax = round2(taxable * settings.taxRate);
  const total = round2(taxable + shipping + tax);

  return {
    lineItems,
    subtotal,
    discount,
    shipping,
    tax,
    total,
    currency: settings.currency,
    coupon,
    settings,
  };
}

module.exports = {
  priceOrder,
  getSettings,
  PricingError,
  round2,
  toCents,
  DEFAULT_SETTINGS,
};
