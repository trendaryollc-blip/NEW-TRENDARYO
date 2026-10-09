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

      const { status, note, trackingNumber, carrier } = req.body;
      const doc = await db.collection('orders').doc(id).get();
      if (!doc.exists) {
        return res.status(404).json({ error: { message: 'Order not found' } });
      }

      const order = doc.data();
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

      await db.collection('orders').doc(id).update(updateData);
      try { if (status === 'cancelled' || status === 'refunded') { await restockForOrder(db, updatedOrder || order || { id, ...updateData }, status, user.uid); } } catch (e) { console.error('[order:restock] failed', e.message); }

      const updatedDoc = await db.collection('orders').doc(id).get();
      const updatedOrder = { id: updatedDoc.id, ...updatedDoc.data() };

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
