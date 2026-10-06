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

    const { items, couponCode = null } = req.body || {};
    const { db } = initFirebase();

    let pricing;
    try {
      pricing = await priceOrder(db, items, couponCode);
    } catch (error) {
      if (error instanceof PricingError) {
        return res.status(error.statusCode).json({
          error: { message: error.message, code: error.code },
        });
      }
      throw error;
    }

    return res.status(200).json({
      data: {
        lineItems: pricing.lineItems,
        coupon: pricing.coupon,
        breakdown: {
          subtotal: pricing.subtotal,
          discount: pricing.discount,
          shipping: pricing.shipping,
          tax: pricing.tax,
          total: pricing.total,
          currency: pricing.currency,
        },
        codEnabled: pricing.settings.codEnabled !== false,
      },
    });
  } catch (error) {
    console.error('Checkout quote error:', error);
    return res.status(500).json({ error: { message: 'Unable to calculate checkout total' } });
  }
};
