const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAdmin } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');
const { deadlineFor, isBreached, isOpen, shipDays, daysOver, aggregate, resolveDefaultLead } = require('../_lib/supplier-sla');

/* Supplier SLA report: per-supplier on-time performance plus every order
   currently outside its lead time. Read-only. */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 30)) return res.status(429).json({ error: { message: 'Too many requests' } });
  if (req.method !== 'GET') return res.status(405).json({ error: { message: 'Method not allowed' } });

  try {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;

    const { db } = initFirebase();
    const [ordersSnap, productsSnap, storeSnap, ruleSnap] = await Promise.all([
      db.collection('orders').where('fulfillment', '==', 'cj').limit(2000).get(),
      db.collection('products').limit(1000).get(),
      db.collection('settings').doc('store').get(),
      db.collection('automations').doc('supplier-sla-watch').get(),
    ]);

    const store = storeSnap.exists ? storeSnap.data() : {};
    const ruleConfig = ruleSnap.exists ? (ruleSnap.data().config || {}) : {};
    /* Same precedence as the watch rule: rule config > store > 7 days. */
    const defaultLead = resolveDefaultLead(ruleConfig.leadTimeDays, store.supplierLeadDays);

    const leadByProduct = {};
    const supplierByProduct = {};
    productsSnap.docs.forEach((doc) => {
      const p = doc.data();
      const lead = Number(p.leadTimeDays);
      if (Number.isFinite(lead) && lead > 0) leadByProduct[doc.id] = lead;
      supplierByProduct[doc.id] = p.supplierId || p.supplier || null;
    });

    const orders = ordersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const now = Date.now();

    const entries = orders.map((o) => {
      const firstItem = (Array.isArray(o.items) && o.items[0]) || {};
      const supplierId = supplierByProduct[String(firstItem.productId || firstItem.product || firstItem.id || '')] || null;
      const deadline = deadlineFor(o, leadByProduct, defaultLead);
      const sd = shipDays(o);
      return {
        supplierId,
        status: o.status,
        deadline,
        shippedAt: o.supplierShippedAt || null,
        shipDays: sd,
        breach: !!o.slaBreached || isBreached(o, leadByProduct, defaultLead, now),
      };
    });

    const suppliers = aggregate(entries);

    const openBreaches = orders
      .filter((o) => isOpen(o) && (o.slaBreached || isBreached(o, leadByProduct, defaultLead, now)))
      .map((o) => ({
        orderId: o.id,
        orderNumber: o.orderNumber || o.id,
        status: o.status,
        supplierId: supplierByProduct[String(((o.items || [])[0] || {}).productId || '')] || null,
        deadline: deadlineFor(o, leadByProduct, defaultLead),
        daysOver: daysOver(o, leadByProduct, defaultLead, now),
        submittedAt: o.supplierSubmittedAt || o.confirmedAt || o.createdAt || null,
      }))
      .sort((a, b) => b.daysOver - a.daysOver);

    const shipped = entries.filter((e) => e.shipDays != null);
    const scored = shipped.filter((e) => e.deadline);
    const onTime = scored.filter((e) => e.shippedAt && new Date(e.shippedAt).getTime() <= new Date(e.deadline).getTime());

    return res.status(200).json({
      data: {
        suppliers,
        openBreaches,
        totals: {
          submitted: entries.length,
          shipped: shipped.length,
          onTimePct: scored.length ? Math.round((onTime.length / scored.length) * 1000) / 10 : null,
          avgShipDays: shipped.length
            ? Math.round((shipped.reduce((a, e) => a + e.shipDays, 0) / shipped.length) * 10) / 10
            : null,
          openBreaches: openBreaches.length,
        },
        defaultLeadDays: defaultLead,
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Supplier SLA report error:', error);
    return res.status(500).json({ error: { message: error.message } });
  }
};
