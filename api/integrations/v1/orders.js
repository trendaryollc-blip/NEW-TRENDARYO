const { initFirebase } = require('../../_lib/firebase');
const { applyRateLimit } = require('../../_lib/security');
const integrations = require('../../_lib/integrations');

/**
 * External service endpoint: recent orders read-only.
 *   GET /api/integrations/v1/orders   (scope orders.read)
 *   ?status=processing&limit=50
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

    if (!integrations.hasScope(integration, 'orders.read')) {
      return res.status(403).json({ error: { message: 'Missing scope: orders.read' } });
    }

    let query = db.collection('orders').orderBy('createdAt', 'desc');
    if (req.query.status) query = query.where('status', '==', String(req.query.status).slice(0, 20));
    const snapshot = await query.limit(Math.min(parseInt(req.query.limit) || 50, 100)).get();
    const rows = snapshot.docs.map(d => {
      const o = { id: d.id, ...d.data() };
      return {
        id: o.id, number: o.number || o.orderNumber || '', status: o.status || '',
        email: o.email || '', total: o.total || 0, paymentStatus: o.paymentStatus || '',
        items: (o.items || []).map(it => ({ productId: it.productId || it.id || '', name: it.name || '', qty: it.qty || it.quantity || 0 })),
        createdAt: o.createdAt || null, updatedAt: o.updatedAt || null,
      };
    });
    return res.status(200).json({ data: rows });
  } catch (error) {
    console.error('Integration orders error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
