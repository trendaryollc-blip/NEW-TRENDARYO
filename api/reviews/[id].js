const { initFirebase } = require('../../_lib/firebase');
const { handleCors } = require('../../_lib/cors');
const { requireAuth } = require('../../_lib/auth');
const { applyRateLimit } = require('../../_lib/security');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 30)) return res.status(429).json({ error: { message: 'Too many requests' } });

  const { id } = req.query;

  try {
    const { db } = initFirebase();

    if (req.method === 'PUT') {
      const user = await requireAuth(req, res);
      if (!user) return;

      const reviewDoc = await db.collection('reviews').doc(id).get();
      if (!reviewDoc.exists) {
        return res.status(404).json({ error: { message: 'Review not found' } });
      }

      const review = reviewDoc.data();
      const userDoc = await db.collection('users').doc(user.uid).get();
      const isAdmin = userDoc.exists && userDoc.data().role === 'admin';

      if (review.userId !== user.uid && !isAdmin) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }

      const { rating, title, comment } = req.body;
      const updateData = { updatedAt: new Date().toISOString() };
      if (rating) updateData.rating = parseInt(rating);
      if (title !== undefined) updateData.title = title;
      if (comment !== undefined) updateData.comment = comment;

      await db.collection('reviews').doc(id).update(updateData);

      const updatedDoc = await db.collection('reviews').doc(id).get();
      return res.status(200).json({ data: { id: updatedDoc.id, ...updatedDoc.data() } });
    }

    if (req.method === 'DELETE') {
      const user = await requireAuth(req, res);
      if (!user) return;

      const reviewDoc = await db.collection('reviews').doc(id).get();
      if (!reviewDoc.exists) {
        return res.status(404).json({ error: { message: 'Review not found' } });
      }

      const review = reviewDoc.data();
      const userDoc = await db.collection('users').doc(user.uid).get();
      const isAdmin = userDoc.exists && userDoc.data().role === 'admin';

      if (review.userId !== user.uid && !isAdmin) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }

      await db.collection('reviews').doc(id).delete();
      return res.status(200).json({ data: { message: 'Review deleted' } });
    }

    return res.status(405).json({ error: { message: 'Method not allowed' } });
  } catch (error) {
    console.error('Review detail error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
