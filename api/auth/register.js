const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { applyRateLimit, sanitizeError } = require('../_lib/security');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 10)) return res.status(429).json({ error: { message: 'Too many requests' } });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  try {
    const { email, password, firstName, lastName } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: { message: 'All fields are required' } });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: { message: 'Password must be at least 8 characters' } });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: { message: 'Invalid email format' } });
    }

    const { auth, db } = initFirebase();

    const userRecord = await auth.createUser({
      email,
      password,
      displayName: `${firstName} ${lastName}`,
    });

    await db.collection('users').doc(userRecord.uid).set({
      firstName,
      lastName,
      email,
      role: 'user',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const customToken = await auth.createCustomToken(userRecord.uid);

    res.status(201).json({
      data: {
        userId: userRecord.uid,
        email: userRecord.email,
        name: `${firstName} ${lastName}`,
        customToken,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    const message = sanitizeError(error);
    res.status(400).json({ error: { message } });
  }
};
