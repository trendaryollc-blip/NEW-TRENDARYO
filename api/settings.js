const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAdmin } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');
const { getSettings, round2 } = require('../_lib/pricing');

const WRITABLE = [
  'storeName',
  'currency',
  'taxRate',
  'shippingFlat',
  'freeShippingThreshold',
  'announcement',
  'lowStock',
  'codEnabled',
  'supportEmail',
  'supportPhone',
];

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 60)) return res.status(429).json({ error: { message: 'Too many requests' } });

  try {
    const { db } = initFirebase();

    if (req.method === 'GET') {
      const settings = await getSettings(db);
      return res.status(200).json({ data: settings });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const adminUser = await requireAdmin(req, res);
      if (!adminUser) return;

      const body = req.body || {};
      const update = { updatedAt: new Date().toISOString(), updatedBy: adminUser.uid };
      for (const key of WRITABLE) {
        if (body[key] !== undefined) update[key] = body[key];
      }
      if (update.taxRate !== undefined) update.taxRate = Math.max(0, Number(update.taxRate) || 0);
      if (update.shippingFlat !== undefined) update.shippingFlat = round2(update.shippingFlat);
      if (update.freeShippingThreshold !== undefined) {
        update.freeShippingThreshold = round2(update.freeShippingThreshold);
      }
      if (update.lowStock !== undefined) update.lowStock = Math.max(0, parseInt(update.lowStock) || 0);

      await db.collection('settings').doc('store').set(update, { merge: true });
      const settings = await getSettings(db);
      return res.status(200).json({ data: settings });
    }

    return res.status(405).json({ error: { message: 'Method not allowed' } });
  } catch (error) {
    console.error('Settings error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
