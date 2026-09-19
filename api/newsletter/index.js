const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAdmin } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 20)) return res.status(429).json({ error: { message: 'Too many requests' } });

  try {
    const { db } = initFirebase();

    if (req.method === 'POST') {
      const { email } = req.body || {};
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
        return res.status(400).json({ error: { message: 'A valid email is required' } });
      }

      const normalized = String(email).trim().toLowerCase();
      const existing = await db.collection('newsletter').where('email', '==', normalized).limit(1).get();
      if (!existing.empty) {
        return res.status(200).json({ data: { message: 'You are already subscribed' } });
      }

      await db.collection('newsletter').add({
        email: normalized,
        source: 'storefront',
        createdAt: new Date().toISOString(),
      });

      return res.status(201).json({ data: { message: 'Subscribed successfully' } });
    }

    if (req.method === 'GET') {
      const adminUser = await requireAdmin(req, res);
      if (!adminUser) return;

      const snapshot = await db.collection('newsletter').orderBy('createdAt', 'desc').limit(1000).get();
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      return res.status(200).json({ data });
    }

    if (req.method === 'DELETE') {
      const adminUser = await requireAdmin(req, res);
      if (!adminUser) return;

      const { email } = req.query;
      if (!email) return res.status(400).json({ error: { message: 'Email is required' } });

      const normalized = String(email).trim().toLowerCase();
      const snapshot = await db.collection('newsletter').where('email', '==', normalized).limit(50).get();
      const batch = db.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();

      return res.status(200).json({ data: { message: 'Removed', removed: snapshot.size } });
    }

    return res.status(405).json({ error: { message: 'Method not allowed' } });
  } catch (error) {
    console.error('Newsletter error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
