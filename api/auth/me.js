const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAuth } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 60)) return res.status(429).json({ error: { message: 'Too many requests' } });

  if ((req.method || '').toUpperCase() !== 'GET') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  try {
    const user = await requireAuth(req, res);
    if (!user) return;

    const { db } = initFirebase();
    const doc = await db.collection('users').doc(user.uid).get();
    const profile = doc.exists ? doc.data() : {};

    return res.status(200).json({
      data: {
        uid: user.uid,
        email: user.email || profile.email || '',
        displayName: user.displayName || profile.firstName + ' ' + (profile.lastName || ''),
        role: profile.role || 'user',
        status: profile.status || 'active',
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
      },
    });
  } catch (error) {
    console.error('Auth me error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};