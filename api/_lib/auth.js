const { initFirebase } = require('./firebase');

async function verifyAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.split('Bearer ')[1];
  try {
    const { auth } = initFirebase();
    const decodedToken = await auth.verifyIdToken(token);
    return decodedToken;
  } catch (error) {
    return null;
  }
}

async function requireAuth(req, res) {
  const user = await verifyAuth(req);
  if (!user) {
    res.status(401).json({ error: { message: 'Unauthorized', code: 'unauthorized' } });
    return null;
  }
  return user;
}

async function requireAdmin(req, res) {
  const user = await requireAuth(req, res);
  if (!user) return null;

  const { db } = initFirebase();
  const userDoc = await db.collection('users').doc(user.uid).get();
  const userData = userDoc.data();

  if (!userData || userData.role !== 'admin') {
    res.status(403).json({ error: { message: 'Forbidden: Admin access required', code: 'forbidden' } });
    return null;
  }
  return { ...user, ...userData };
}

module.exports = { verifyAuth, requireAuth, requireAdmin };
