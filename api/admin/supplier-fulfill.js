const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAdmin } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');
const { canTransition } = require('../_lib/order-state');
const { log } = require('../_lib/audit');
const cj = require('../_lib/cj');

async function fulfillOrder(db, orderId, actor) {
  const ref = db.collection('orders').doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Order not found');
  const order = { id: snap.id, ...snap.data() };
  if (order.cjOrderId) return { skipped: true, cjOrderId: order.cjOrderId };
  if (order.autoFulfillOptOut === true) {
    return { skipped: true, reason: order.attentionReason || 'fulfillment held (order flagged)' };
  }
  if (order.riskLevel === 'review' || order.riskLevel === 'disputed') {
    return { skipped: true, reason: 'order held for review: ' + order.riskLevel };
  }

  const itemIds = Array.isArray(order.items) ? order.items : [];
  const lineItems = [];
  for (const it of itemIds) {
    const pid = it.productId || it.product || it.id;
    let vid = it.vid || it.variantId || null;
    if (!vid && pid) {
      const pSnap = await db.collection('products').doc(String(pid)).get();
      if (pSnap.exists && pSnap.data().supplierVid) vid = pSnap.data().supplierVid;
    }
    if (vid) lineItems.push({ vid, quantity: it.quantity || 1 });
  }
  if (!lineItems.length) throw new Error('No CJ variant IDs found on this order - was it imported from CJ?');

  const result = await cj.createOrder(db, order, lineItems);
  const cjOrderId = (result && (result.orderId || result.id)) || '';
  const patch = {
    cjOrderId: String(cjOrderId),
    fulfillment: 'cj',
    fulfillmentStatus: 'submitted',
    /* F9: start the SLA clock the moment the supplier receives the order. */
    supplierSubmittedAt: nowIsoSafe(),
    updatedAt: nowIsoSafe(),
  };
  /* Only move the state when the machine allows it; the supplier hand-off
     itself must never roll an order backwards. */
  if (canTransition(order.status || 'pending', 'processing', 'system')) {
    patch.status = 'processing';
  }
  await ref.set(patch, { merge: true });
  await log(db, {
    actorUid: (actor && actor.uid) || null,
    actorEmail: (actor && actor.email) || null,
    action: 'order.supplier_fulfill',
    targetType: 'order',
    targetId: order.id,
    after: { cjOrderId: String(cjOrderId), fulfillment: 'cj', supplierSubmittedAt: patch.supplierSubmittedAt },
  });
  return { cjOrderId: String(cjOrderId) };
}

function nowIsoSafe() {
  return new Date().toISOString();
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 20)) return res.status(429).json({ error: { message: 'Too many requests' } });

  try {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;
    if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Method not allowed' } });

    const { db } = initFirebase();
    const { orderId } = req.body || {};
    if (!orderId) return res.status(400).json({ error: { message: 'orderId required' } });

    const out = await fulfillOrder(db, orderId, adminUser);
    res.status(200).json({ data: out });
  } catch (error) {
    console.error('Fulfill error:', error);
    res.status(400).json({ error: { message: error.message } });
  }
};

module.exports.fulfillOrder = fulfillOrder;
