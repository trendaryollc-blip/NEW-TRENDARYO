const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAdmin } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');
const { getSettings } = require('../_lib/pricing');
const { effectiveThreshold, marginPct } = require('../_lib/product-ops');

/* Reorder report: every active product at or below its effective reorder
   point, with lead time and margin so the owner can place one PO instead of
   guessing. Read-only. */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 30)) return res.status(429).json({ error: { message: 'Too many requests' } });
  if (req.method !== 'GET') return res.status(405).json({ error: { message: 'Method not allowed' } });

  try {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;

    const { db } = initFirebase();
    const [products, store] = await Promise.all([
      db.collection('products').where('status', '==', 'active').limit(1000).get(),
      getSettings(db).catch(() => ({})),
    ]);

    const storeDefault = store.lowStock === undefined || store.lowStock === null ? 8 : store.lowStock;
    const rows = products.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .map((p) => {
        const threshold = effectiveThreshold(p, 0, storeDefault);
        return {
          id: p.id,
          name: p.name || p.id,
          sku: p.sku || '',
          stock: Number(p.stock) || 0,
          reorderPoint: Number.isFinite(Number(p.reorderPoint)) && Number(p.reorderPoint) > 0 ? Number(p.reorderPoint) : null,
          effectiveThreshold: threshold,
          leadTimeDays: Number.isFinite(Number(p.leadTimeDays)) && Number(p.leadTimeDays) > 0 ? Number(p.leadTimeDays) : null,
          costPrice: Number.isFinite(Number(p.costPrice)) ? Number(p.costPrice) : null,
          price: Number(p.price) || 0,
          marginPct: marginPct(p),
          supplierId: p.supplierId || p.supplier || null,
          outOfStock: (Number(p.stock) || 0) <= 0,
        };
      })
      .filter((row) => row.stock <= row.effectiveThreshold)
      .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name));

    return res.status(200).json({
      data: rows,
      meta: {
        total: rows.length,
        outOfStock: rows.filter((r) => r.outOfStock).length,
        storeDefaultThreshold: storeDefault,
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Reorder report error:', error);
    return res.status(500).json({ error: { message: error.message } });
  }
};
