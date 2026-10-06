const { initFirebase } = require('../_lib/firebase');
const { getStripe } = require('../_lib/stripe');
const { handleCors } = require('../_lib/cors');
const { requireAuth } = require('../_lib/auth');
const { applyRateLimit, sanitizeError } = require('../_lib/security');
const { priceOrder, PricingError, toCents } = require('../_lib/pricing');
const { createHash } = require('crypto');

function addressFingerprint(address) {
  const fields = ['fullName', 'email', 'phone', 'street', 'city', 'state', 'zipCode', 'country'];
  const normalized = fields.map((field) => String((address && address[field]) || '').trim().toLowerCase());
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 20)) return res.status(429).json({ error: { message: 'Too many requests' } });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  try {
    const user = await requireAuth(req, res);
    if (!user) return;

    const { items, couponCode = null, checkoutRequestId, shippingAddress = null } = req.body || {};
    if (typeof checkoutRequestId !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(checkoutRequestId)) {
      return res.status(400).json({ error: { message: 'A valid checkout request ID is required' } });
    }
    if (!shippingAddress || typeof shippingAddress !== 'object' ||
        ['fullName', 'email', 'phone', 'street', 'city', 'country'].some((key) => !String(shippingAddress[key] || '').trim())) {
      return res.status(400).json({ error: { message: 'Complete shipping details are required before payment' } });
    }
    const { db } = initFirebase();
    const shippingAddressHash = addressFingerprint(shippingAddress);
    const checkoutFingerprint = createHash('sha256').update(JSON.stringify({
      items: Array.isArray(items) ? items.map((item) => ({ productId: String(item && item.productId || ''), quantity: Number(item && item.quantity) })).sort((a, b) => a.productId.localeCompare(b.productId)) : items,
      couponCode: couponCode ? String(couponCode).trim().toUpperCase() : null,
      shippingAddressHash,
    })).digest('hex');
    const previousPaymentSnapshot = await db.collection('payments')
      .where('userId', '==', user.uid)
      .where('checkoutRequestId', '==', checkoutRequestId)
      .limit(1)
      .get();
    const previousPayment = previousPaymentSnapshot.empty ? null : previousPaymentSnapshot.docs[0].data();
    if (previousPayment && ['refunded', 'refund_pending'].includes(previousPayment.status)) {
      return res.status(409).json({ error: { message: 'A refund for the previous payment has been initiated. Start a new checkout attempt.', code: 'payment_refunded', refunded: true } });
    }
    if (previousPayment && previousPayment.checkoutFingerprint !== checkoutFingerprint) {
      return res.status(409).json({ error: { message: 'Checkout details changed after payment setup. Restore the original details or start a new checkout.', code: 'checkout_request_mismatch' } });
    }

    // Amount is always derived from Firestore prices, never from the client.
    let pricing;
    if (previousPayment && previousPayment.pricing) {
      pricing = previousPayment.pricing;
    } else {
      try {
        pricing = await priceOrder(db, items, couponCode, shippingAddress);
      } catch (err) {
        if (err instanceof PricingError) {
          return res.status(err.statusCode).json({ error: { message: err.message, code: err.code } });
        }
        throw err;
      }
    }

    if (pricing.total <= 0) {
      return res.status(400).json({ error: { message: 'Order total must be greater than zero' } });
    }

    const stripe = getStripe();
    const paymentIntent = previousPayment
      ? await stripe.paymentIntents.retrieve(previousPayment.paymentIntentId)
      : await stripe.paymentIntents.create({
      amount: toCents(pricing.total),
      currency: pricing.currency,
      receipt_email: user.email || undefined,
      metadata: {
        userId: user.uid,
        couponCode: pricing.coupon ? pricing.coupon.code : '',
        checkoutRequestId,
        shippingCountry: String((shippingAddress && shippingAddress.country) || 'US').trim().toUpperCase(),
        shippingRegion: String((shippingAddress && shippingAddress.state) || '').trim().toUpperCase(),
        shippingAddressHash,
        checkoutFingerprint,
        itemCount: String(pricing.lineItems.reduce((n, i) => n + i.quantity, 0)),
      },
      automatic_payment_methods: { enabled: true },
    }, {
      idempotencyKey: `trendaryo:${user.uid}:${checkoutRequestId}`,
    });

    if (paymentIntent.status === 'canceled') {
      return res.status(409).json({ error: { message: 'This payment attempt expired. Start checkout again.', code: 'payment_intent_canceled' } });
    }

    await db.collection('payments').doc(paymentIntent.id).set({
      userId: user.uid,
      orderId: null,
      amount: pricing.total,
      currency: pricing.currency,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status === 'succeeded' ? 'succeeded' : 'pending',
      checkoutRequestId,
      checkoutFingerprint,
      shippingCountry: String((shippingAddress && shippingAddress.country) || 'US').trim().toUpperCase(),
      shippingRegion: String((shippingAddress && shippingAddress.state) || '').trim().toUpperCase(),
      shippingAddressHash,
      pricing: {
        lineItems: pricing.lineItems,
        subtotal: pricing.subtotal,
        discount: pricing.discount,
        shipping: pricing.shipping,
        tax: pricing.tax,
        total: pricing.total,
        currency: pricing.currency,
        coupon: pricing.coupon,
        codEnabled: pricing.codEnabled,
      },
      createdAt: new Date().toISOString(),
    }, { merge: true });

    return res.status(200).json({
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        lineItems: pricing.lineItems,
        amount: pricing.total,
        breakdown: {
          subtotal: pricing.subtotal,
          discount: pricing.discount,
          shipping: pricing.shipping,
          tax: pricing.tax,
          total: pricing.total,
          currency: pricing.currency,
        },
      },
    });
  } catch (error) {
    console.error('Payment error:', error);
    const message = sanitizeError(error);
    res.status(500).json({ error: { message } });
  }
};
