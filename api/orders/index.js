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

      const isCod = String(paymentMethod).toLowerCase() === 'cod';
      const settings = await getSettings(db);

      if (isCod && settings.codEnabled === false) {
        return res.status(400).json({ error: { message: 'Cash on delivery is not available' } });
      }
      if (!isCod && !paymentIntentId) {
        return res.status(400).json({ error: { message: 'A completed payment is required' } });
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

      // Idempotency: never create a second order for the same PaymentIntent.
      if (paymentIntentId) {
        const dup = await db
          .collection('orders')
          .where('paymentIntentId', '==', paymentIntentId)
          .limit(1)
          .get();
        if (!dup.empty) {
          const existing = dup.docs[0];
          return res.status(200).json({ data: { id: existing.id, ...existing.data() } });
        }
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
        if (intent.metadata && intent.metadata.userId && intent.metadata.userId !== user.uid) {
          return res.status(403).json({ error: { message: 'Payment does not belong to this account' } });
        }
        if (toCents(intent.amount_received || intent.amount) !== toCents(pricing.total)) {
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

      const orderRef = await db.collection('orders').add(orderData);

      // Record the payment + decrement stock in one batch.
      const batch = db.batch();

      if (!isCod) {
        const paymentRef = db.collection('payments').doc();
        batch.set(paymentRef, {
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

      for (const line of pricing.lineItems) {
        batch.set(
          db.collection('products').doc(line.productId),
          { stock: FieldValue.increment(-line.quantity), updatedAt: nowIso },
          { merge: true }
        );
      }

      if (pricing.coupon && pricing.coupon.code) {
        batch.set(
          db.collection('coupons').doc(pricing.coupon.code),
          { usedCount: FieldValue.increment(1), updatedAt: nowIso },
          { merge: true }
        );
      }

      // Empty the customer's server cart.
      batch.set(db.collection('carts').doc(user.uid), { items: [], updatedAt: nowIso });

      await batch.commit();

      return res.status(201).json({ data: { id: orderRef.id, ...orderData } });
    }

    return res.status(405).json({ error: { message: 'Method not allowed' } });
  } catch (error) {
    console.error('Orders error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
