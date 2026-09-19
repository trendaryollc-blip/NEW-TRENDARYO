const { handleCors } = require('../_lib/cors');
const { applyRateLimit } = require('../_lib/security');

/** Public, non-secret configuration values exposed to the storefront. */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 60)) return res.status(429).json({ error: { message: 'Too many requests' } });

  if ((req.method || '').toUpperCase() !== 'GET') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || '';
  const mode = publishableKey.indexOf('pk_test') === 0 ? 'test' : (publishableKey ? 'live' : 'unset');

  return res.status(200).json({
    data: {
      stripePublishableKey: publishableKey,
      stripeMode: mode,
      currency: process.env.STORE_CURRENCY || 'usd',
      storeName: process.env.STORE_NAME || 'Trendaryo',
    },
  });
};