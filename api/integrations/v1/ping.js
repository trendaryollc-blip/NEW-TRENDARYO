const { initFirebase } = require('../../_lib/firebase');
const { applyRateLimit } = require('../../_lib/security');
const { authenticate } = require('../../_lib/integrations');

/**
 * External service endpoint: linking-code health check.
 *   GET /api/integrations/v1/ping
 *   Auth: Authorization: Bearer trd_... | x-trendaryo-key: trd_...
 */
module.exports = async function handler(req, res) {
  if (!applyRateLimit(req, res, 120)) return res.status(429).json({ error: { message: 'Too many requests' } });

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  try {
    const { db } = initFirebase();
    const integration = await authenticate(db, req);
    if (!integration) return res.status(401).json({ error: { message: 'Invalid or revoked linking code' } });

    return res.status(200).json({
      data: {
        ok: true,
        service: integration.appName,
        scopes: integration.scopes || [],
        store: 'Trendaryo',
      },
    });
  } catch (error) {
    console.error('Integration ping error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
