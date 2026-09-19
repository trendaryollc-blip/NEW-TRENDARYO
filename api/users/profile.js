const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAuth } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 30)) return res.status(429).json({ error: { message: 'Too many requests' } });

  try {
    const user = await requireAuth(req, res);
    if (!user) return;

    const { db } = initFirebase();

    if (req.method === 'GET') {
      const userDoc = await db.collection('users').doc(user.uid).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: { message: 'User not found' } });
      }
      return res.status(200).json({
        data: { id: user.uid, ...userDoc.data() },
      });
    }

    if (req.method === 'PUT') {
      const { firstName, lastName, phone } = req.body;
      const updateData = { updatedAt: new Date().toISOString() };
      if (firstName) updateData.firstName = firstName;
      if (lastName) updateData.lastName = lastName;
      if (phone) updateData.phone = phone;

      await db.collection('users').doc(user.uid).update(updateData);

      const updatedDoc = await db.collection('users').doc(user.uid).get();
      return res.status(200).json({
        data: { id: user.uid, ...updatedDoc.data() },
      });
    }

    return res.status(405).json({ error: { message: 'Method not allowed' } });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
