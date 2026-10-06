const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAuth } = require('../_lib/auth');
const { FieldValue } = require('firebase-admin/firestore');
const { applyRateLimit } = require('../_lib/security');
const { priceOrder, PricingError, toCents, getSettings } = require('../_lib/pricing');
const { getStripe } = require('../_lib/stripe');

function makeOrderNumber() {
  return (
    'TRD-' +
    Date.now().toString(36).toUpperCase() +
    '-' +
    Math.random().toString(36).slice(2, 6).toUpperCase()
  );
}

function validateShippingAddress(addr) {
  if (!addr || typeof addr !== 'object') return 'Shipping address is required';
  const required = ['fullName', 'email', 'street', 'city', 'country'];
  for (const field of required) {
    if (!addr[field] || String(addr[field]).trim().length < 1) {
      return 'Shipping address is missing: ' + field;
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(addr.email))) {
    return 'A valid email is required';
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 30)) return res.status(429).json({ error: { message: 'Too many requests' } });

  try {
    const user = await requireAuth(req, res);
    if (!user) return;

    const { db } = initFirebase();

    /* ---------------------------- list orders ---------------------------- */
    if (req.method === 'GET') {
      const { page = 1, limit = 20 } = req.query;
      const snapshot = await db
        .collection('orders')
        .where('userId', '==', user.uid)
        .orderBy('createdAt', 'desc')
        .get();

      let orders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const total = orders.length;
      const p = Math.max(1, parseInt(page) || 1);
      const l = Math.min(100, Math.max(1, parseInt(limit) || 20));
      orders = orders.slice((p - 1) * l, p * l);

      return res.status(200).json({
        data: orders,
        pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) },
      });
    }

    /* --------------------------- create order ---------------------------- */
    if (req.method === 'POST') {
      const { items, shippingAddress, paymentMethod = 'card', couponCode, paymentIntentId, notes } = req.body || {};

      const addressError = validateShippingAddress(shippingAddress);
      if (addressError) {
        return res.status(400).json({ error: { message: addressError } });
      }

      const normalizedPaymentMethod = String(paymentMethod).toLowerCase();
      if (!['card', 'cod'].includes(normalizedPaymentMethod)) {
        return res.status(400).json({ error: { message: 'Unsupported payment method' } });
      }
      const isCod = normalizedPaymentMethod === 'cod';
      const settings = await getSettings(db);

      if (isCod && settings.codEnabled === false) {
        return res.status(400).json({ error: { message: 'Cash on delivery is not available' } });
      }
      if (!isCod && !paymentIntentId) {
        return res.status(400).json({ error: { message: 'A completed payment is required' } });
      }

      // Return the existing order before rechecking stock or coupon limits.
      // This keeps retries safe after a successful checkout consumes either.
      if (paymentIntentId) {
        const dup = await db
          .collection('orders')
          .where('userId', '==', user.uid)
          .where('paymentIntentId', '==', paymentIntentId)
          .limit(1)
          .get();
        if (!dup.empty) {
          const existing = dup.docs[0];
          return res.status(200).json({ data: { id: existing.id, ...existing.data() } });
        }
      }

      // Server-side pricing - client amounts are ignored entirely.
      let pricing;
      try {
        pricing = await priceOrder(db, items, couponCode);
      } catch (err) {
        if (err instanceof PricingError) {
          return res.status(err.statusCode).json({ error: { message: err.message, code: err.code } });
        }
        throw err;
      }

      // Verify the card payment really happened, for this user, for this amount.
      if (!isCod) {
        const stripe = getStripe();
        let intent;
        try {
          intent = await stripe.paymentIntents.retrieve(String(paymentIntentId));
        } catch (e) {
          return res.status(400).json({ error: { message: 'Payment could not be verified' } });
        }

        if (!intent) {
          return res.status(400).json({ error: { message: 'Payment could not be verified' } });
        }
        if (intent.status !== 'succeeded') {
          return res.status(402).json({ error: { message: 'Payment was not completed', code: 'payment_incomplete' } });
        }
        if (!intent.metadata || intent.metadata.userId !== user.uid) {
          return res.status(403).json({ error: { message: 'Payment does not belong to this account' } });
        }
        const receivedAmount = Number(intent.amount_received ?? intent.amount ?? 0);
        const expectedAmount = toCents(pricing.total);
        if (receivedAmount !== expectedAmount || String(intent.currency).toLowerCase() !== pricing.currency) {
          return res.status(400).json({
            error: { message: 'Payment amount does not match the order total', code: 'amount_mismatch' },
          });
        }
      }

      const nowIso = new Date().toISOString();
      const orderNumber = makeOrderNumber();

      const statusHistory = [
        { status: 'pending', timestamp: nowIso, note: 'Order placed' },
      ];
      if (!isCod) {
        statusHistory.push({ status: 'confirmed', timestamp: nowIso, note: 'Payment received' });
      }

      const orderData = {
        userId: user.uid,
        orderNumber,
        items: pricing.lineItems,
        shippingAddress,
        notes: notes || '',
        paymentMethod: isCod ? 'cod' : 'card',
        paymentIntentId: paymentIntentId || null,
        subtotal: pricing.subtotal,
        discount: pricing.discount,
        shipping: pricing.shipping,
        tax: pricing.tax,
        total: pricing.total,
        currency: pricing.currency,
        coupon: pricing.coupon,
        status: isCod ? 'pending' : 'confirmed',
        paymentStatus: isCod ? 'pending' : 'paid',
        statusHistory,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const orderRef = db.collection('orders').doc();
      let transactionResult;
      try {
        transactionResult = await db.runTransaction(async (transaction) => {
          if (paymentIntentId) {
            const duplicate = await transaction.get(
              db.collection('orders')
                .where('userId', '==', user.uid)
                .where('paymentIntentId', '==', paymentIntentId)
                .limit(1)
            );
            if (!duplicate.empty) {
              const existing = duplicate.docs[0];
              return { created: false, data: { id: existing.id, ...existing.data() } };
            }
          }

          const productRefs = pricing.lineItems.map((line) =>
            db.collection('products').doc(line.productId)
          );
          const productSnapshots = await transaction.getAll(...productRefs);
          let couponRef = null;
          let couponSnapshot = null;
          if (pricing.coupon && pricing.coupon.code) {
            couponRef = db.collection('coupons').doc(pricing.coupon.code);
            couponSnapshot = await transaction.get(couponRef);
            if (!couponSnapshot.exists) {
              throw new PricingError('That promo code is not valid', 409, 'coupon_invalid');
            }
            const coupon = couponSnapshot.data();
            if (coupon.active === false ||
                (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now())) {
              throw new PricingError('That promo code is no longer available', 409, 'coupon_unavailable');
            }
            if (coupon.usageLimit && (coupon.usedCount || 0) >= coupon.usageLimit) {
              throw new PricingError('That promo code has reached its usage limit', 409, 'coupon_exhausted');
            }
          }

          for (let i = 0; i < pricing.lineItems.length; i++) {
            const line = pricing.lineItems[i];
            const productSnapshot = productSnapshots[i];
            if (!productSnapshot.exists) {
              throw new PricingError('A product in your cart is no longer available', 409, 'product_missing');
            }
            const product = productSnapshot.data();
            if (product.status && product.status !== 'active') {
              throw new PricingError(
                (product.name || 'A product') + ' is no longer available',
                409,
                'product_unavailable'
              );
            }
            if (Number(product.price) !== Number(line.price)) {
              throw new PricingError(
                'A product price changed. Review your updated order total.',
                409,
                'product_price_changed'
              );
            }
            if (product.stock != null) {
              const stock = Number(product.stock);
              if (!Number.isFinite(stock) || stock < line.quantity) {
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
          }

          transaction.set(orderRef, orderData);
          if (!isCod) {
            const paymentRef = db.collection('payments').doc();
            transaction.set(paymentRef, {
              userId: user.uid,
              orderId: orderRef.id,
              orderNumber,
              amount: pricing.total,
              currency: pricing.currency,
              paymentIntentId,
              status: 'succeeded',
              createdAt: nowIso,
            });
          }
          for (let i = 0; i < pricing.lineItems.length; i++) {
            const product = productSnapshots[i].data();
            if (product.stock != null) {
              transaction.update(productRefs[i], {
                stock: Number(product.stock) - pricing.lineItems[i].quantity,
                updatedAt: nowIso,
              });
            }
          }
          if (couponRef) {
            transaction.set(couponRef, {
              usedCount: FieldValue.increment(1),
              updatedAt: nowIso,
            }, { merge: true });
          }
          transaction.set(db.collection('carts').doc(user.uid), {
            items: [],
            updatedAt: nowIso,
          });

          return { created: true, data: { id: orderRef.id, ...orderData } };
        });
      } catch (error) {
        if (error instanceof PricingError) {
          return res.status(error.statusCode).json({
            error: { message: error.message, code: error.code },
          });
        }
        throw error;
      }

      return res.status(transactionResult.created ? 201 : 200).json({
        data: transactionResult.data,
      });
    }

    return res.status(405).json({ error: { message: 'Method not allowed' } });
  } catch (error) {
    console.error('Orders error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
