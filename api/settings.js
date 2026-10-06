const { initFirebase } = require('./_lib/firebase');
const { handleCors } = require('./_lib/cors');
const { requireAdmin } = require('./_lib/auth');
const { applyRateLimit } = require('./_lib/security');
const { getSettings, round2 } = require('./_lib/pricing');

const WRITABLE = [
  'storeName',
  'currency',
  'taxRate',
  'shippingFlat',
  'freeShippingThreshold',
  'announcement',
  'lowStock',
  'codEnabled',
  'taxRatesByCountry',
  'taxRatesByRegion',
  'shippingByCountry',
  'codCountries',
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
      for (const key of ['taxRatesByCountry', 'taxRatesByRegion']) {
        if (update[key] !== undefined) {
          if (!update[key] || typeof update[key] !== 'object' || Array.isArray(update[key])) {
            return res.status(400).json({ error: { message: `${key} must be a JSON object` } });
          }
          const normalized = {};
          for (const [region, rate] of Object.entries(update[key])) {
            const value = Number(rate);
            if (!Number.isFinite(value) || value < 0 || value > 1) {
              return res.status(400).json({ error: { message: `${key} rates must be between 0 and 1` } });
            }
            normalized[String(region).trim().toUpperCase()] = value;
          }
          update[key] = normalized;
        }
      }
      if (update.shippingByCountry !== undefined) {
        if (!update.shippingByCountry || typeof update.shippingByCountry !== 'object' || Array.isArray(update.shippingByCountry)) {
          return res.status(400).json({ error: { message: 'shippingByCountry must be a JSON object' } });
        }
        const normalized = {};
        for (const [country, shipping] of Object.entries(update.shippingByCountry)) {
          const value = Number(shipping);
          if (!Number.isFinite(value) || value < 0) {
            return res.status(400).json({ error: { message: 'Shipping rates must be zero or greater' } });
          }
          normalized[String(country).trim().toUpperCase()] = round2(value);
        }
        update.shippingByCountry = normalized;
      }
      if (update.codCountries !== undefined) {
        if (update.codCountries !== null && !Array.isArray(update.codCountries)) {
          return res.status(400).json({ error: { message: 'codCountries must be a JSON array' } });
        }
        if (Array.isArray(update.codCountries)) {
          update.codCountries = update.codCountries.map((country) => String(country).trim().toUpperCase());
        }
      }

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
