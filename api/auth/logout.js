const { handleCors } = require('../_lib/cors');
const { requireAuth } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 30)) return res.status(429).json({ error: { message: 'Too many requests' } });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  try {
    const user = await requireAuth(req, res);
    if (!user) return;

    res.status(200).json({
      data: {
        userId: user.uid,
        email: user.email,
        message: 'Logged out successfully',
      },
    });
  } catch (error) {
    res.status(200).json({ data: { message: 'Logged out' } });
  }
};
