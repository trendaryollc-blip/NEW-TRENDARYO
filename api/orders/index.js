const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAuth } = require('../_lib/auth');
const { FieldValue, FieldPath } = require('firebase-admin/firestore');
const { applyRateLimit } = require('../_lib/security');
const { priceOrder, PricingError, toCents } = require('../_lib/pricing');
const { getStripe } = require('../_lib/stripe');
const { sendOrderConfirmation } = require('../_lib/mail');
const { createHash, randomUUID } = require('crypto');

function addressFingerprint(address) {
  const fields = ['fullName', 'email', 'phone', 'street', 'city', 'state', 'zipCode', 'country'];
  const normalized = fields.map((field) => String((address && address[field]) || '').trim().toLowerCase());
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

function checkoutFingerprint(items, couponCode, shippingAddressHash) {
  const normalizedItems = Array.isArray(items)
    ? items.map((item) => ({ productId: String(item && item.productId || ''), quantity: Number(item && item.quantity) }))
      .sort((a, b) => a.productId.localeCompare(b.productId))
    : items;
  return createHash('sha256').update(JSON.stringify({
    items: normalizedItems,
    couponCode: couponCode ? String(couponCode).trim().toUpperCase() : null,
    shippingAddressHash,
  })).digest('hex');
}

async function refundPayment(db, stripe, intent, reason) {
  const refund = await stripe.refunds.create({ payment_intent: intent.id, reason: 'requested_by_customer' }, {
    idempotencyKey: `trendaryo-refund:${intent.id}`,
  });
  if (refund.status === 'failed') throw new Error('Stripe could not refund the payment');
  await db.collection('payments').doc(intent.id).set({
    status: refund.status === 'succeeded' ? 'refunded' : 'refund_pending',
    refundId: refund.id,
    refundReason: reason,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

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
      const { limit = 20, cursor } = req.query;
      const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      let query = db
        .collection('orders')
        .where('userId', '==', user.uid)
        .orderBy('createdAt', 'desc')
        .orderBy(FieldPath.documentId(), 'desc');
      if (cursor) {
        let decoded;
        try {
          decoded = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
        } catch (error) {
          return res.status(400).json({ error: { message: 'Invalid order cursor' } });
        }
        if (!decoded || typeof decoded.createdAt !== 'string' || typeof decoded.id !== 'string') {
          return res.status(400).json({ error: { message: 'Invalid order cursor' } });
        }
        query = query.startAfter(decoded.createdAt, decoded.id);
      }
      const snapshot = await query.limit(l + 1).get();
      const hasMore = snapshot.docs.length > l;
      const pageDocs = snapshot.docs.slice(0, l);
      const orders = pageDocs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const last = pageDocs[pageDocs.length - 1];
      const nextCursor = hasMore && last
        ? Buffer.from(JSON.stringify({ createdAt: last.data().createdAt, id: last.id })).toString('base64url')
        : null;

      return res.status(200).json({
        data: orders,
        pagination: { limit: l, nextCursor, hasMore },
      });
    }

    /* --------------------------- create order ---------------------------- */
    if (req.method === 'POST') {
      const { items, shippingAddress, paymentMethod = 'card', couponCode, paymentIntentId, notes } = req.body || {};
      let { checkoutRequestId } = req.body || {};

      const addressError = validateShippingAddress(shippingAddress);
      if (addressError) {
        return res.status(400).json({ error: { message: addressError } });
      }

      const normalizedPaymentMethod = String(paymentMethod).toLowerCase();
      if (!['card', 'cod'].includes(normalizedPaymentMethod)) {
        return res.status(400).json({ error: { message: 'Unsupported payment method' } });
      }
      const isCod = normalizedPaymentMethod === 'cod';
      if (typeof checkoutRequestId !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(checkoutRequestId)) {
        // Allow an already-open pre-idempotency checkout to finish safely.
        checkoutRequestId = paymentIntentId
          ? 'legacy_' + createHash('sha256').update(`${user.uid}:${paymentIntentId}`).digest('hex')
          : 'legacy_' + randomUUID();
      }
      const requestDocId = createHash('sha256').update(`${user.uid}:${checkoutRequestId}`).digest('hex');
      const orderRef = db.collection('orders').doc(requestDocId);

      const previousOrder = await orderRef.get();
      if (previousOrder.exists) {
        return res.status(200).json({ data: { id: previousOrder.id, ...previousOrder.data() } });
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

      // Confirm ownership first. If current stock, coupon eligibility, or price
      // changed after the card was charged, refund the succeeded intent.
      let stripe = null;
      let intent = null;
      let paymentRecord = null;
      if (!isCod) {
        stripe = getStripe();
        try {
          intent = await stripe.paymentIntents.retrieve(String(paymentIntentId));
        } catch (e) {
          return res.status(400).json({ error: { message: 'Payment could not be verified' } });
        }
        if (!intent || intent.status !== 'succeeded') {
          return res.status(402).json({ error: { message: 'Payment was not completed', code: 'payment_incomplete' } });
        }
        if (!intent.metadata || intent.metadata.userId !== user.uid ||
            (intent.metadata.checkoutRequestId && intent.metadata.checkoutRequestId !== checkoutRequestId)) {
          return res.status(403).json({ error: { message: 'Payment does not belong to this checkout' } });
        }
        const requestedCountry = String(shippingAddress.country || 'US').trim().toUpperCase();
        const requestedRegion = String(shippingAddress.state || '').trim().toUpperCase();
        const requestedAddressHash = addressFingerprint(shippingAddress);
        const requestedFingerprint = checkoutFingerprint(items, couponCode, requestedAddressHash);
        if ((intent.metadata.shippingCountry && intent.metadata.shippingCountry !== requestedCountry) ||
            (intent.metadata.shippingRegion != null && intent.metadata.shippingRegion !== requestedRegion) ||
            (intent.metadata.shippingAddressHash && intent.metadata.shippingAddressHash !== requestedAddressHash) ||
            (intent.metadata.checkoutFingerprint && intent.metadata.checkoutFingerprint !== requestedFingerprint)) {
          await refundPayment(db, stripe, intent, 'shipping_destination_changed');
          return res.status(409).json({ error: { message: 'Checkout details changed after payment. A card refund has been initiated.', code: 'checkout_details_changed', refunded: true } });
        }
        const paymentSnapshot = await db.collection('payments').doc(intent.id).get();
        if (paymentSnapshot.exists) {
          const savedPayment = paymentSnapshot.data();
          if (savedPayment.userId !== user.uid ||
              (savedPayment.checkoutRequestId && savedPayment.checkoutRequestId !== checkoutRequestId)) {
            return res.status(403).json({ error: { message: 'Payment does not belong to this checkout' } });
          }
          if (['refunded', 'refund_pending'].includes(savedPayment.status)) {
            return res.status(409).json({ error: { message: 'This payment has already been refunded or is being refunded. Start a new checkout attempt.', code: 'payment_refunded', refunded: true } });
          }
          if ((savedPayment.shippingCountry && savedPayment.shippingCountry !== requestedCountry) ||
              (savedPayment.shippingRegion != null && savedPayment.shippingRegion !== requestedRegion) ||
              (savedPayment.shippingAddressHash && savedPayment.shippingAddressHash !== requestedAddressHash) ||
              (savedPayment.checkoutFingerprint && savedPayment.checkoutFingerprint !== requestedFingerprint)) {
            await refundPayment(db, stripe, intent, 'checkout_details_changed');
            return res.status(409).json({ error: { message: 'Checkout details changed after payment. A card refund has been initiated.', code: 'checkout_details_changed', refunded: true } });
          }
          paymentRecord = savedPayment;
        }
      }

      // Server-side pricing - client amounts are ignored entirely.
      let pricing;
      try {
        pricing = !isCod && paymentRecord && paymentRecord.pricing
          ? paymentRecord.pricing
          : await priceOrder(db, items, couponCode, shippingAddress);
      } catch (err) {
        if (err instanceof PricingError) {
          if (!isCod && intent) {
            await refundPayment(db, stripe, intent, err.code || 'order_no_longer_available');
            return res.status(err.statusCode).json({
              error: { message: `${err.message}. A card refund has been initiated.`, code: err.code, refunded: true },
            });
          }
          return res.status(err.statusCode).json({ error: { message: err.message, code: err.code } });
        }
        throw err;
      }

      if (isCod && !pricing.codEnabled) {
        return res.status(400).json({ error: { message: 'Cash on delivery is not available for this destination' } });
      }

      // Verify that the succeeded card intent still matches server pricing.
      if (!isCod) {
        const receivedAmount = Number(intent.amount_received ?? intent.amount ?? 0);
        const expectedAmount = toCents(pricing.total);
        if (receivedAmount !== expectedAmount || String(intent.currency).toLowerCase() !== pricing.currency) {
          await refundPayment(db, stripe, intent, 'order_total_changed');
          return res.status(400).json({
            error: { message: 'Payment amount no longer matches the order total. A card refund has been initiated.', code: 'amount_mismatch', refunded: true },
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

      let transactionResult;
      try {
        transactionResult = await db.runTransaction(async (transaction) => {
          const previousOrderSnapshot = await transaction.get(orderRef);
          if (previousOrderSnapshot.exists) {
            return { created: false, data: { id: previousOrderSnapshot.id, ...previousOrderSnapshot.data() } };
          }
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
            const paymentRef = db.collection('payments').doc(paymentIntentId);
            transaction.set(paymentRef, {
              userId: user.uid,
              orderId: orderRef.id,
              orderNumber,
              amount: pricing.total,
              currency: pricing.currency,
              paymentIntentId,
              checkoutRequestId,
              status: 'succeeded',
              createdAt: nowIso,
            }, { merge: true });
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
          if (!isCod && intent) {
            await refundPayment(db, stripe, intent, error.code || 'order_no_longer_available');
            return res.status(error.statusCode).json({
              error: { message: `${error.message}. A card refund has been initiated.`, code: error.code, refunded: true },
            });
          }
          return res.status(error.statusCode).json({
            error: { message: error.message, code: error.code },
          });
        }
        throw error;
      }

      // Best-effort confirmation email. Never fails the order if email is
      // not configured (mail.js skips and logs when no provider is set).
      if (transactionResult.created) {
        try {
          await sendOrderConfirmation(transactionResult.data);
        } catch (mailError) {
          console.error('[orders] Confirmation email failed:', mailError.message);
        }
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
