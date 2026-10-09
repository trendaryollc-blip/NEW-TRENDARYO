const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAdmin } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');
const cj = require('../_lib/cj');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 30)) return res.status(429).json({ error: { message: 'Too many requests' } });

  try {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;
    const { db } = initFirebase();

    /* GET /admin/supplier-products?q=... -> CJ search */
    if (req.method === 'GET') {
      const q = String(req.query.q || '').trim();
      if (!q) return res.status(400).json({ error: { message: 'Missing search query' } });
      const data = await cj.searchProducts(db, q, { page: parseInt(req.query.page) || 1, size: Math.min(50, parseInt(req.query.size) || 20) });
      return res.status(200).json({ data });
    }

    /* POST /admin/supplier-products { pid, name, image, price, vid, category } -> import */
    if (req.method === 'POST') {
      const b = req.body || {};
      if (!b.pid || !b.name) return res.status(400).json({ error: { message: 'pid and name are required' } });
      const s = (await cj.getSettings(db)) || {};
      const markup = Math.max(1, parseFloat(b.markup) || s.markup || 2);
      const price = Math.round((parseFloat(b.price) || 0) * markup * 100) / 100;
      const ref = await db.collection('products').add({
        name: b.name,
        description: 'Imported from CJ Dropshipping',
        price,
        image: b.image || '',
        images: b.image ? [b.image] : [],
        category: b.category || 'General',
        stock: 999,
        status: 'active',
        brand: 'CJ',
        sku: b.pid,
        searchTerms: String(b.name).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
        supplier: 'cj',
        supplierPid: b.pid,
        supplierVid: b.vid || null,
        createdAt: new Date().toISOString(),
      });
      return res.status(201).json({ data: { id: ref.id } });
    }

    res.status(405).json({ error: { message: 'Method not allowed' } });
  } catch (error) {
    console.error('Supplier products error:', error);
    res.status(error.status === 400 ? 400 : 500).json({ error: { message: error.message || 'Internal server error' } });
  }
};
