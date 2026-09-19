const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAdmin } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 30)) return res.status(429).json({ error: { message: 'Too many requests' } });

  try {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;

    const { db } = initFirebase();

    const { page = 1, limit = 50, status, search } = req.query;

    let query = db.collection('orders').orderBy('createdAt', 'desc');
    const snapshot = await query.get();
    let orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (status) orders = orders.filter(o => o.status === status);
    if (search) {
      const q = search.toLowerCase();
      orders = orders.filter(o =>
        (o.orderNumber && o.orderNumber.toLowerCase().includes(q)) ||
        (o.shippingAddress?.email && o.shippingAddress.email.toLowerCase().includes(q)) ||
        (o.shippingAddress?.fullName && o.shippingAddress.fullName.toLowerCase().includes(q))
      );
    }

    const total = orders.length;
    const p = parseInt(page);
    const l = parseInt(limit);
    const paginated = orders.slice((p - 1) * l, p * l);

    res.status(200).json({
      data: paginated,
      pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) },
    });
  } catch (error) {
    console.error('Admin orders error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
