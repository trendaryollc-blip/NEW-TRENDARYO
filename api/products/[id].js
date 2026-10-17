const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAuth, requireAdmin } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');
const { normalizeOpsFields } = require('../_lib/product-ops');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 60)) return res.status(429).json({ error: { message: 'Too many requests' } });

  const { id } = req.query;

  try {
    const { db } = initFirebase();

    if (req.method === 'GET') {
      const doc = await db.collection('products').doc(id).get();
      if (!doc.exists) {
        return res.status(404).json({ error: { message: 'Product not found' } });
      }
      return res.status(200).json({ data: { id: doc.id, ...doc.data() } });
    }

    if (req.method === 'PUT') {
      const adminUser = await requireAdmin(req, res);
      if (!adminUser) return;

      const updateData = { ...req.body, updatedAt: new Date().toISOString() };
      delete updateData.id;
      /* F7: coerce ops fields so garbage never lands in the catalog. */
      Object.assign(updateData, normalizeOpsFields(req.body));
      for (const key of ['costPrice', 'reorderPoint', 'leadTimeDays']) {
        if (key in updateData && updateData[key] === undefined) delete updateData[key];
      }

      const beforeDoc = await db.collection('products').doc(id).get();
      const before = beforeDoc.exists ? beforeDoc.data() : {};

      /* Stock never lands through a bare update: route every change through
         stock.move so it is recorded and product.restocked fires (F2/F8) -
         this is the path the dashboard +12 button and the editor use. */
      const hasStock = Object.prototype.hasOwnProperty.call(updateData, 'stock');
      let stockDelta = null;
      if (hasStock) {
        const next = Math.max(0, parseInt(updateData.stock, 10) || 0);
        const prev = Number(before.stock) || 0;
        stockDelta = next - prev;
        delete updateData.stock;
      }

      await db.collection('products').doc(id).update(updateData);

      if (hasStock && stockDelta) {
        const { move } = require('../_lib/stock');
        try {
          await move(db, {
            productId: id,
            delta: stockDelta,
            reason: 'admin_edit:' + Date.now(),
            actorUid: adminUser.uid,
            note: 'admin stock edit',
          });
        } catch (moveError) {
          console.error('[product] stock move failed:', moveError.message);
          return res.status(400).json({ error: { message: moveError.message === 'negative_stock' ? 'Stock cannot go below zero' : 'Stock update failed' } });
        }
      }

      const updatedDoc = await db.collection('products').doc(id).get();
      try {
        const { log } = require('../_lib/audit');
        await log(db, {
          actorUid: adminUser.uid,
          actorEmail: adminUser.email || null,
          action: 'product.updated',
          targetType: 'product',
          targetId: id,
          before: beforeDoc.exists ? beforeDoc.data() : null,
          after: updatedDoc.data(),
          ip: req.headers['x-forwarded-for'] || null,
          userAgent: req.headers['user-agent'] || null,
        });
      } catch (auditError) {
        console.error('[product] audit failed:', auditError.message);
      }
      return res.status(200).json({ data: { id: updatedDoc.id, ...updatedDoc.data() } });
    }

    if (req.method === 'DELETE') {
      const adminUser = await requireAdmin(req, res);
      if (!adminUser) return;

      const beforeDoc = await db.collection('products').doc(id).get();
      await db.collection('products').doc(id).delete();
      try {
        const { log } = require('../_lib/audit');
        await log(db, {
          actorUid: adminUser.uid,
          actorEmail: adminUser.email || null,
          action: 'product.deleted',
          targetType: 'product',
          targetId: id,
          before: beforeDoc.exists ? beforeDoc.data() : null,
          ip: req.headers['x-forwarded-for'] || null,
          userAgent: req.headers['user-agent'] || null,
        });
      } catch (auditError) {
        console.error('[product] audit failed:', auditError.message);
      }
      return res.status(200).json({ data: { message: 'Product deleted' } });
    }

    return res.status(405).json({ error: { message: 'Method not allowed' } });
  } catch (error) {
    console.error('Product detail error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
