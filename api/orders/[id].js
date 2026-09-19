const { initFirebase } = require('../../_lib/firebase');
const { handleCors } = require('../../_lib/cors');
const { requireAuth, requireAdmin } = require('../../_lib/auth');
const { applyRateLimit } = require('../../_lib/security');

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
      const userDoc = await db.collection('users').doc(user.uid).get();
      const isAdmin = userDoc.exists && userDoc.data().role === 'admin';

      if (!isAdmin && order.userId !== user.uid) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }

      const updateData = { updatedAt: new Date().toISOString() };

      if (status) {
        updateData.status = status;
        if (!Array.isArray(updateData.statusHistory)) updateData.statusHistory = [];
        updateData.statusHistory = [...(order.statusHistory || []), {
          status,
          timestamp: new Date().toISOString(),
          note: note || '',
        }];

        if (status === 'shipped') {
          updateData.paymentStatus = 'paid';
        }
      }

      if (trackingNumber) updateData.trackingNumber = trackingNumber;
      if (carrier) updateData.carrier = carrier;

      await db.collection('orders').doc(id).update(updateData);

      const updatedDoc = await db.collection('orders').doc(id).get();
      return res.status(200).json({ data: { id: updatedDoc.id, ...updatedDoc.data() } });
    }

    return res.status(405).json({ error: { message: 'Method not allowed' } });
  } catch (error) {
    console.error('Order detail error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
