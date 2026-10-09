'use strict';
const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { buffer } = require('../_lib/raw-body');
const { verify } = require('../_lib/stripe');
const { FieldValue } = require('firebase-admin/firestore');
const { restockForOrder } = require('../_lib/stock');
const { assertTransition } = require('../_lib/order-state');

function nowIso() {
  return new Date().toISOString();
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Method not allowed' } });

  const sig = req.headers['stripe-signature'];
  const rawBody = await buffer(req);
  let event;
  try {
    event = verify(rawBody, sig);
  } catch (e) {
    return res.status(400).json({ error: { message: 'Invalid signature' } });
  }

  try {
    const { db } = initFirebase();
    const evRef = db.collection('stripe_events').doc(event.id);
    let claimed = false;
    await db.runTransaction(async (tx) => {
      const s = await tx.get(evRef);
      if (s.exists && s.data().status === 'processed') {
        claimed = false;
        return;
      }
      tx.set(evRef, { type: event.type, status: 'processing', receivedAt: nowIso(), attempts: FieldValue.increment(1) }, { merge: true });
      claimed = true;
    });
    if (!claimed) return res.status(200).json({ received: true, duplicate: true });

    try {
      await handleEvent(db, event);
      await evRef.set({ status: 'processed', processedAt: nowIso() }, { merge: true });
      return res.status(200).json({ received: true });
    } catch (err) {
      await evRef.set({ status: 'failed', error: err.message }, { merge: true });
      throw err;
    }
  } catch (e) {
    return res.status(500).json({ error: { message: e.message } });
  }
};

async function getOrderByPaymentIntent(db, pi) {
  const snap = await db.collection('orders').where('paymentIntentId', '==', pi).limit(1).get();
  if (!snap.empty) return { id: snap.docs[0].id, ...snap.docs[0].data() };
  const psnap = await db.collection('payments').where('paymentIntentId', '==', pi).limit(1).get();
  if (!psnap.empty) {
    const p = psnap.docs[0].data();
    if (p.orderId) {
      const os = await db.collection('orders').doc(p.orderId).get();
      if (os.exists) return { id: os.id, ...os.data() };
    }
  }
  return null;
}

async function handleEvent(db, event) {
  const t = event.type;
  if (t === 'payment_intent.succeeded') {
    const pi = event.data.object.id;
    const order = await getOrderByPaymentIntent(db, pi);
    if (order) {
      try { assertTransition(order.status || 'pending', 'confirmed', 'webhook'); } catch (e) {}
      await db.collection('orders').doc(order.id).set({ paymentStatus: 'paid', paidAt: nowIso(), updatedAt: nowIso(), status: 'confirmed' }, { merge: true });
    try { await emitEvent(db, 'order.paid', { orderId: order.id }); } catch (e) { console.error('[wh:emit]', e.message); }
    }
    const ps = await db.collection('payments').where('paymentIntentId', '==', pi).limit(1).get();
    if (!ps.empty) await ps.docs[0].ref.set({ status: 'succeeded', updatedAt: nowIso() }, { merge: true });
    return;
  }
  if (t === 'payment_intent.payment_failed') {
    const pi = event.data.object.id;
    const ps = await db.collection('payments').where('paymentIntentId', '==', pi).limit(1).get();
    if (!ps.empty) await ps.docs[0].ref.set({ status: 'failed', failureReason: event.data.object.last_payment_error?.message || 'failed', updatedAt: nowIso() }, { merge: true });
    return;
  }
  if (t === 'payment_intent.canceled') {
    const pi = event.data.object.id;
    const order = await getOrderByPaymentIntent(db, pi);
    if (order) {
      try { assertTransition(order.status || 'pending', 'cancelled', 'webhook'); } catch (e) {}
      await db.collection('orders').doc(order.id).set({ status: 'cancelled', updatedAt: nowIso() }, { merge: true });
      try { await restockForOrder(db, order, 'cancel', null); } catch (e) { console.error('[wh:restock]', e.message); }
    }
    const ps = await db.collection('payments').where('paymentIntentId', '==', pi).limit(1).get();
    if (!ps.empty) await ps.docs[0].ref.set({ status: 'canceled', updatedAt: nowIso() }, { merge: true });
    return;
  }
  if (t === 'charge.refunded') {
    const ch = event.data.object;
    const pi = ch.payment_intent;
    const order = await getOrderByPaymentIntent(db, pi);
    if (order) {
      const reason = ch.amount_refunded < ch.amount ? 'partially_refunded' : 'refunded';
      const to = reason === 'refunded' ? 'refunded' : order.status;
      if (reason === 'refunded') {
        try { assertTransition(order.status || 'pending', 'refunded', 'webhook'); } catch (e) {}
      }
      await db.collection('orders').doc(order.id).set({ status: reason === 'refunded' ? 'refunded' : order.status, refundAmount: ch.amount_refunded / 100, updatedAt: nowIso() }, { merge: true });
      if (reason === 'refunded') {
        try { await restockForOrder(db, order, 'refund', null); } catch (e) { console.error('[wh:restock]', e.message); }
      }
    }
    const ps = await db.collection('payments').where('paymentIntentId', '==', pi).limit(1).get();
    if (!ps.empty) await ps.docs[0].ref.set({ status: 'refunded', updatedAt: nowIso() }, { merge: true });
    return;
  }
  if (t === 'charge.dispute.created') {
    const d = event.data.object;
    const pi = d.payment_intent;
    const order = await getOrderByPaymentIntent(db, pi);
    if (order) {
      await db.collection('orders').doc(order.id).set({ riskLevel: 'disputed', needsAttention: true, attentionReason: 'dispute ' + d.id, autoFulfillOptOut: true, updatedAt: nowIso() }, { merge: true });
      try { await db.collection('automation_alerts').doc('dispute-' + d.id).set({ id: 'dispute-' + d.id, type: 'dispute', orderId: order.id, message: 'Dispute opened ' + d.id, resolved: false, createdAt: nowIso() }, { merge: true }); } catch (e) {}
    }
    return;
  }
  if (t === 'charge.dispute.closed') {
    const d = event.data.object;
    const pi = d.payment_intent;
    const order = await getOrderByPaymentIntent(db, pi);
    if (order) {
      await db.collection('orders').doc(order.id).set({ needsAttention: false, updatedAt: nowIso() }, { merge: true });
      try { await db.collection('automation_alerts').doc('dispute-' + d.id).set({ resolved: true, resolvedAt: nowIso() }, { merge: true }); } catch (e) {}
    }
    return;
  }
}
