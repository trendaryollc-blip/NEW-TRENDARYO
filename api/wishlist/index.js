const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAuth } = require('../_lib/auth');
const { FieldValue } = require('firebase-admin/firestore');
const { applyRateLimit } = require('../_lib/security');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 30)) return res.status(429).json({ error: { message: 'Too many requests' } });

  try {
    const user = await requireAuth(req, res);
    if (!user) return;

    const { db } = initFirebase();
    const wishlistRef = db.collection('wishlists').doc(user.uid);

    if (req.method === 'GET') {
      const doc = await wishlistRef.get();
      const data = doc.exists ? doc.data() : { items: [] };
      return res.status(200).json({ data });
    }

    if (req.method === 'POST') {
      const { productId } = req.body;
      if (!productId) {
        return res.status(400).json({ error: { message: 'Product ID is required' } });
      }

      await wishlistRef.set({
        items: FieldValue.arrayUnion(productId),
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      return res.status(200).json({ data: { message: 'Added to wishlist', productId } });
    }

    if (req.method === 'DELETE') {
      const { productId } = req.query;
      if (!productId) {
        return res.status(400).json({ error: { message: 'Product ID is required' } });
      }

      await wishlistRef.update({
        items: FieldValue.arrayRemove(productId),
        updatedAt: new Date().toISOString(),
      });

      return res.status(200).json({ data: { message: 'Removed from wishlist', productId } });
    }

    return res.status(405).json({ error: { message: 'Method not allowed' } });
  } catch (error) {
    console.error('Wishlist error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
