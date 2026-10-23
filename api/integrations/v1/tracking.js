const { initFirebase } = require('../../_lib/firebase');
const { applyRateLimit } = require('../../_lib/security');
const integrations = require('../../_lib/integrations');
const { canTransition } = require('../../_lib/order-state');
const { log: auditLog } = require('../../_lib/audit');

/**
 * External service endpoint: push carrier + tracking to an order
 * (Product Hunter's pushTrackingToBuyerStore path).
 *   POST /api/integrations/v1/tracking   (scope fulfillments.write)
 *   { orderId? | orderNumber?, carrier, trackingNumber, trackingUrl? }
 */
module.exports = async function handler(req, res) {
  if (!applyRateLimit(req, res, 120)) return res.status(429).json({ error: { message: 'Too many requests' } });

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  try {
    const { db } = initFirebase();
    const integration = await integrations.authenticate(db, req);
    if (!integration) return res.status(401).json({ error: { message: 'Invalid or revoked linking code' } });

    if (!integrations.hasScope(integration, 'fulfillments.write')) {
      return res.status(403).json({ error: { message: 'Missing scope: fulfillments.write' } });
    }

    const body = req.body || {};
    const carrier = String(body.carrier || '').trim().slice(0, 60);
    const trackingNumber = String(body.trackingNumber || '').trim().slice(0, 80);
    const trackingUrl = integrations.validWebhookUrl(body.trackingUrl);
    if (!carrier || !trackingNumber) {
      return res.status(400).json({ error: { message: 'carrier and trackingNumber are required' } });
    }

    let doc = null;
    if (body.orderId) {
      const snap = await db.collection('orders').doc(String(body.orderId).slice(0, 60)).get();
      if (snap.exists) doc = snap;
    } else if (body.orderNumber) {
      const snap = await db.collection('orders').where('number', '==', String(body.orderNumber)).limit(1).get();
      if (!snap.empty) doc = snap.docs[0];
    }
    if (!doc) return res.status(404).json({ error: { message: 'Order not found - use orderId (Trendaryo order id) or orderNumber' } });

    const order = { id: doc.id, ...doc.data() };
    const current = order.status || 'pending';
    const now = new Date().toISOString();

    /* Tracking usually marks an order shipped; move the state machine only if
       the rules allow it and the order is not cancelled/refunded. */
    let status = current;
    const wanted = current === 'shipped' && order.deliveredAt ? current : (body.status === 'delivered' && canTransition(current, 'delivered', 'system') ? 'delivered' : 'shipped');
    if (canTransition(current, wanted, 'system') && wanted !== current) {
      status = wanted;
      if (status === 'shipped') await doc.ref.set({ status, shippedAt: now, updatedAt: now }, { merge: true });
      else await doc.ref.set({ status, deliveredAt: now, updatedAt: now }, { merge: true });
    }

    const patch = {
      carrier,
      trackingNumber,
      trackingSource: integration.appName,
      trackingUpdatedAt: now,
      updatedAt: now,
    };
    if (trackingUrl) patch.trackingUrl = trackingUrl;
    await doc.ref.set(patch, { merge: true });

    auditLog(db, {
      actorUid: 'integration:' + integration.appName,
      actorEmail: null,
      action: 'tracking.pushed',
      targetType: 'order',
      targetId: doc.id,
      after: { carrier, trackingNumber, status },
      ip: req.headers['x-forwarded-for'] || null,
    });

    return res.status(200).json({ data: { ok: true, orderId: doc.id, status, carrier, trackingNumber } });
  } catch (error) {
    console.error('Integration tracking error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
