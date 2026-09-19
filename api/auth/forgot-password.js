const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { applyRateLimit, sanitizeError } = require('../_lib/security');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 5)) return res.status(429).json({ error: { message: 'Too many requests' } });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: { message: 'Email is required' } });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: { message: 'Invalid email format' } });
    }

    const { auth } = initFirebase();
    await auth.sendPasswordResetEmail(email);

    res.status(200).json({
      data: { message: 'If an account exists with this email, a reset link has been sent' },
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(200).json({
      data: { message: 'If an account exists with this email, a reset link has been sent' },
    });
  }
};
