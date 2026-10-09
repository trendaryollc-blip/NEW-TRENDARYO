const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAdmin } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');
const cj = require('../_lib/cj');

async function syncTracking(db) {
  const snap = await db.collection('orders').where('fulfillment', '==', 'cj').get();
  let updated = 0;
  const results = [];
  for (const doc of snap.docs) {
    const o = { id: doc.id, ...doc.data() };
    if (!o.cjOrderId || o.status === 'delivered' || o.status === 'cancelled') continue;
    try {
      const detail = await cj.getOrderDetail(db, o.cjOrderId);
      const trackNumber = detail && (detail.trackNumber || (detail.tracking && detail.tracking.trackNumber));
      const logisticName = detail && (detail.logisticName || (detail.tracking && detail.tracking.logisticName));
      const patch = { fulfillmentStatus: (detail && detail.orderStatus) || o.fulfillmentStatus, updatedAt: new Date().toISOString() };
      if (trackNumber && trackNumber !== o.trackingNumber) {
        patch.trackingNumber = trackNumber;
        patch.trackingCarrier = logisticName || o.trackingCarrier || '';
        patch.status = 'shipped';
      }
      await db.collection('orders').doc(o.id).set(patch, { merge: true });
      updated++;
      results.push({ orderId: o.id, trackNumber: trackNumber || null, status: patch.fulfillmentStatus });
    } catch (e) {
      results.push({ orderId: o.id, error: e.message });
    }
  }
  return { updated, results };
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 10)) return res.status(429).json({ error: { message: 'Too many requests' } });
  try {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;
    if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Method not allowed' } });
    const { db } = initFirebase();
    res.status(200).json({ data: await syncTracking(db) });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: { message: error.message } });
  }
};

module.exports.syncTracking = syncTracking;
