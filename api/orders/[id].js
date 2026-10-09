const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAuth, requireAdmin } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');
const { sendShippingUpdate } = require('../_lib/mail');
const { assertTransition, allowedFrom } = require('../_lib/order-state');
const { restockForOrder } = require('../_lib/stock');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 30)) return res.status(429).json({ error: { message: 'Too many requests' } });

  const { id } = req.query;

  try {
    const { db } = initFirebase();

    if (req.method === 'GET') {
      const user = await requireAuth(req, res);
      if (!user) return;

      const doc = await db.collection('orders').doc(id).get();
      if (!doc.exists) {
        return res.status(404).json({ error: { message: 'Order not found' } });
      }

      const order = { id: doc.id, ...doc.data() };
      if (order.userId !== user.uid) {
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (!userDoc.exists || userDoc.data().role !== 'admin') {
          return res.status(403).json({ error: { message: 'Access denied' } });
        }
      }

      return res.status(200).json({ data: order });
    }

    if (req.method === 'PUT') {
      const user = await requireAuth(req, res);
      if (!user) return;

      const { status, note, trackingNumber, carrier, riskRelease } = req.body;
      const doc = await db.collection('orders').doc(id).get();
      if (!doc.exists) {
        return res.status(404).json({ error: { message: 'Order not found' } });
      }

      const order = doc.data();
      const userDoc = await db.collection('users').doc(user.uid).get();
      const isAdmin = userDoc.exists && userDoc.data().role === 'admin';
      const isOwner = order.userId === user.uid;

      if (!isAdmin && !isOwner) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }

      const updateData = { updatedAt: new Date().toISOString() };

      if (status) {
        let actorRole = 'admin';
        if (!isAdmin) {
          actorRole = 'customer';
        }
        try {
          assertTransition(order.status || 'pending', status, actorRole);
        } catch (e) {
          const code = e.code || 'invalid_transition';
          const sc = e.statusCode || 409;
          return res.status(sc).json({ error: { message: code } });
        }
        updateData.status = status;
        const hist = Array.isArray(order.statusHistory) ? order.statusHistory : [];
        updateData.statusHistory = [...hist, {
          status,
          timestamp: new Date().toISOString(),
          note: note || '',
          actor: actorRole,
          actorUid: user.uid,
        }];
      }

      if (trackingNumber) updateData.trackingNumber = trackingNumber;
      if (carrier) updateData.carrier = carrier;

      if (riskRelease && isAdmin) {
        updateData.riskLevel = 'cleared';
        updateData.needsAttention = false;
        updateData.attentionReason = '';
        updateData.autoFulfillOptOut = false;
      }

      await db.collection('orders').doc(id).update(updateData);

      try {
        const { log } = require('../_lib/audit');
        await log(db, {
          actorUid: user.uid,
          actorEmail: user.email || null,
          action: status ? 'order.status_changed' : (riskRelease ? 'order.risk_released' : 'order.updated'),
          targetType: 'order',
          targetId: id,
          before: status || riskRelease ? { status: order.status, riskLevel: order.riskLevel || null } : null,
          after: status || riskRelease ? { status: updateData.status || order.status, riskLevel: updateData.riskLevel || order.riskLevel || null } : null,
          ip: req.headers['x-forwarded-for'] || req.socket && req.socket.remoteAddress || null,
          userAgent: req.headers['user-agent'] || null,
        });
      } catch (auditError) {
        console.error('[orders:id] audit failed:', auditError.message);
      }

      const updatedDoc = await db.collection('orders').doc(id).get();
      const updatedOrder = { id: updatedDoc.id, ...updatedDoc.data() };

      if (status === 'cancelled' || status === 'refunded') {
        try {
          await restockForOrder(db, { id, ...order, ...updateData }, status, user.uid);
        } catch (e) {
          console.error('[order:restock] failed', e.message);
        }
      }

      // Notify the customer when an order moves to shipped. Best-effort:
      // a missing email provider or delivery failure never fails the update.
      if (status === 'shipped' && order.status !== 'shipped') {
        try {
          await sendShippingUpdate(updatedOrder);
        } catch (mailError) {
          console.error('[orders:id] Shipping email failed:', mailError.message);
        }
      }

      return res.status(200).json({ data: updatedOrder });
    }

    return res.status(405).json({ error: { message: 'Method not allowed' } });
  } catch (error) {
    console.error('Order detail error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
