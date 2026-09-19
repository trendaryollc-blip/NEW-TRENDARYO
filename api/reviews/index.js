const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAuth } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 30)) return res.status(429).json({ error: { message: 'Too many requests' } });

  try {
    const { db } = initFirebase();

    if (req.method === 'GET') {
      const { productId, page = 1, limit = 20 } = req.query;

      // Admin can list every review; customers list per-product (public).
      let query = db.collection('reviews').orderBy('createdAt', 'desc');
      if (productId) {
        query = query.where('productId', '==', productId);
      } else {
        const admin = await requireAuth(req, res).catch(() => null);
        if (admin) {
          const roleDoc = await db.collection('users').doc(admin.uid).get();
          if (!roleDoc.exists || roleDoc.data().role !== 'admin') {
            return res.status(400).json({ error: { message: 'Product ID is required' } });
          }
        } else {
          return res.status(400).json({ error: { message: 'Product ID is required' } });
        }
      }

      const snapshot = await query.get();

      let reviews = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const total = reviews.length;
      const p = parseInt(page);
      const l = parseInt(limit);
      reviews = reviews.slice((p - 1) * l, p * l);

      return res.status(200).json({
        data: reviews,
        pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) },
      });
    }

    if (req.method === 'POST') {
      const user = await requireAuth(req, res);
      if (!user) return;

      const { productId, rating, title, comment } = req.body;

      if (!productId || !rating) {
        return res.status(400).json({ error: { message: 'Product ID and rating are required' } });
      }

      if (rating < 1 || rating > 5) {
        return res.status(400).json({ error: { message: 'Rating must be between 1 and 5' } });
      }

      const reviewData = {
        userId: user.uid,
        productId,
        rating: parseInt(rating),
        title: title || '',
        comment: comment || '',
        helpful: 0,
        createdAt: new Date().toISOString(),
      };

      const docRef = await db.collection('reviews').add(reviewData);

      const reviewsSnapshot = await db.collection('reviews')
        .where('productId', '==', productId)
        .get();
      const allReviews = reviewsSnapshot.docs.map(d => d.data());
      const avgRating = allReviews.reduce((sum, r) => sum + (r.rating || 0), 0) / allReviews.length;

      await db.collection('products').doc(productId).update({
        rating: Math.round(avgRating * 10) / 10,
        reviewCount: allReviews.length,
        updatedAt: new Date().toISOString(),
      });

      return res.status(201).json({
        data: { id: docRef.id, ...reviewData },
      });
    }

    return res.status(405).json({ error: { message: 'Method not allowed' } });
  } catch (error) {
    console.error('Reviews error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
