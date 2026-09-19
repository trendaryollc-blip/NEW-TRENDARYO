const { initFirebase } = require('../_lib/firebase');
const { getStripe } = require('../_lib/stripe');
const { handleCors } = require('../_lib/cors');
const { requireAuth } = require('../_lib/auth');
const { applyRateLimit, sanitizeError } = require('../_lib/security');
const { priceOrder, PricingError, toCents } = require('../_lib/pricing');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 20)) return res.status(429).json({ error: { message: 'Too many requests' } });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  try {
    const user = await requireAuth(req, res);
    if (!user) return;

    const { items, couponCode = null } = req.body || {};
    const { db } = initFirebase();

    // Amount is always derived from Firestore prices, never from the client.
    let pricing;
    try {
      pricing = await priceOrder(db, items, couponCode);
    } catch (err) {
      if (err instanceof PricingError) {
        return res.status(err.statusCode).json({ error: { message: err.message, code: err.code } });
      }
      throw err;
    }

    if (pricing.total <= 0) {
      return res.status(400).json({ error: { message: 'Order total must be greater than zero' } });
    }

    const stripe = getStripe();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: toCents(pricing.total),
      currency: pricing.currency,
      receipt_email: user.email || undefined,
      metadata: {
        userId: user.uid,
        couponCode: pricing.coupon ? pricing.coupon.code : '',
        itemCount: String(pricing.lineItems.reduce((n, i) => n + i.quantity, 0)),
      },
      automatic_payment_methods: { enabled: true },
    });

    await db.collection('payments').add({
      userId: user.uid,
      orderId: null,
      amount: pricing.total,
      currency: pricing.currency,
      paymentIntentId: paymentIntent.id,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    return res.status(200).json({
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
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
