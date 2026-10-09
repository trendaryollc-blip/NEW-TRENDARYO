const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAdmin } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');
const cj = require('../_lib/cj');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 30)) return res.status(429).json({ error: { message: 'Too many requests' } });

  try {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;
    const { db } = initFirebase();

    if (req.method === 'GET') {
      const s = await cj.getSettings(db);
      return res.status(200).json({
        data: { configured: !!(s && s.email && s.apiKey), email: s && s.email ? s.email : null, markup: s && s.markup ? s.markup : 2, autoFulfill: !!(s && s.autoFulfill) },
      });
    }

    if (req.method === 'PUT') {
      const { email, apiKey, markup, autoFulfill } = req.body || {};
      const update = {};
      if (email !== undefined) update.email = String(email).trim();
      if (autoFulfill !== undefined) update.autoFulfill = !!autoFulfill;
      if (apiKey !== undefined && apiKey !== '********') { update.apiKey = String(apiKey).trim(); update.accessToken = null; update.tokenExpiry = null; }
      if (markup !== undefined) update.markup = Math.max(1, parseFloat(markup) || 2);
      if (update.email || update.apiKey) {
        const s = { ...update };
        await cj.saveSettings(db, s);
        try { await cj.getToken(db); } catch (e) {
          return res.status(400).json({ error: { message: 'Saved, but CJ login failed: ' + e.message } });
        }
      } else {
        await cj.saveSettings(db, update);
      }
      return res.status(200).json({ data: { ok: true } });
    }

    if (req.method === 'DELETE') {
      await db.collection('settings').doc('cj').delete();
      return res.status(200).json({ data: { ok: true } });
    }

    res.status(405).json({ error: { message: 'Method not allowed' } });
  } catch (error) {
    console.error('Supplier settings error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
