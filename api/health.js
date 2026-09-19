module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    environment: process.env.VERCEL_ENV || 'development',
    services: {
      firebase: !!process.env.FIREBASE_PROJECT_ID,
      stripe: !!process.env.STRIPE_SECRET_KEY,
      cloudinary: !!process.env.CLOUDINARY_CLOUD_NAME,
    },
  };

  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.status(200).json({ data: health });
};
