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

    const { page = 1, limit = 50, search, status } = req.query;

    let query = db.collection('products').orderBy('createdAt', 'desc');
    const snapshot = await query.get();
    let products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (status) products = products.filter(p => p.status === status);
    if (search) {
      const q = search.toLowerCase();
      products = products.filter(p =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.brand && p.brand.toLowerCase().includes(q))
      );
    }

    const total = products.length;
    const p = parseInt(page);
    const l = parseInt(limit);
    const paginated = products.slice((p - 1) * l, p * l);

    res.status(200).json({
      data: paginated,
      pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) },
    });
  } catch (error) {
    console.error('Admin products error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
