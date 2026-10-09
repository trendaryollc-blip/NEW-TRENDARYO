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

  const data = {
    stripePublishableKey: publishableKey,
    stripeMode: mode,
    currency: process.env.STORE_CURRENCY || 'usd',
    storeName: process.env.STORE_NAME || 'Trendaryo',
    checkoutEnabled: true,
    maintenanceMode: false,
    maintenanceMessage: '',
  };

  /* Store-state flags so the storefront can disable checkout without a deploy.
     Failures must never take the config endpoint down. */
  try {
    const { initFirebase } = require('../_lib/firebase');
    const { db } = initFirebase();
    const st = await db.collection('settings').doc('store').get();
    const s = st.exists ? st.data() : {};
    data.checkoutEnabled = s.checkoutEnabled !== false;
    data.maintenanceMode = s.maintenanceMode === true;
    data.maintenanceMessage = typeof s.maintenanceMessage === 'string' ? s.maintenanceMessage : '';
    data.storeName = s.storeName || data.storeName;
    data.currency = s.currency || data.currency;
  } catch (e) {
    console.error('[config:public] settings read failed:', e.message);
  }

  return res.status(200).json({ data });
};