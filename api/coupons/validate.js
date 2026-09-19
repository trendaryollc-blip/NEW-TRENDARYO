const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAuth } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');
const { priceOrder, PricingError } = require('../_lib/pricing');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 30)) return res.status(429).json({ error: { message: 'Too many requests' } });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  try {
    const user = await requireAuth(req, res);
    if (!user) return;

    const { code, items } = req.body || {};
    if (!code) {
      return res.status(400).json({ error: { message: 'Promo code is required' } });
    }

    const { db } = initFirebase();

    let pricing;
    try {
      pricing = await priceOrder(db, items, code);
    } catch (err) {
      if (err instanceof PricingError) {
        return res.status(200).json({
          data: { valid: false, reason: err.message, code: err.code },
        });
      }
      throw err;
    }

    if (!pricing.coupon) {
      return res.status(200).json({ data: { valid: false, reason: 'That promo code is not valid' } });
    }

    return res.status(200).json({
      data: {
        valid: true,
        coupon: pricing.coupon,
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
    console.error('Coupon validate error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
