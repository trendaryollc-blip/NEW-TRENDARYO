const { initFirebase } = require('../../_lib/firebase');
const { handleCors } = require('../../_lib/cors');
const { requireAuth, requireAdmin } = require('../../_lib/auth');
const { applyRateLimit } = require('../../_lib/security');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 60)) return res.status(429).json({ error: { message: 'Too many requests' } });

  const { id } = req.query;

  try {
    const { db } = initFirebase();

    if (req.method === 'GET') {
      const doc = await db.collection('products').doc(id).get();
      if (!doc.exists) {
        return res.status(404).json({ error: { message: 'Product not found' } });
      }
      return res.status(200).json({ data: { id: doc.id, ...doc.data() } });
    }

    if (req.method === 'PUT') {
      const adminUser = await requireAdmin(req, res);
      if (!adminUser) return;

      const updateData = { ...req.body, updatedAt: new Date().toISOString() };
      delete updateData.id;

      await db.collection('products').doc(id).update(updateData);
      const updatedDoc = await db.collection('products').doc(id).get();
      return res.status(200).json({ data: { id: updatedDoc.id, ...updatedDoc.data() } });
    }

    if (req.method === 'DELETE') {
      const adminUser = await requireAdmin(req, res);
      if (!adminUser) return;

      await db.collection('products').doc(id).delete();
      return res.status(200).json({ data: { message: 'Product deleted' } });
    }

    return res.status(405).json({ error: { message: 'Method not allowed' } });
  } catch (error) {
    console.error('Product detail error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
