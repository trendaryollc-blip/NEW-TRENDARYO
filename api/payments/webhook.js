'use strict';
const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { verify } = require('../_lib/stripe');
const { FieldValue } = require('firebase-admin/firestore');
const { restockForOrder } = require('../_lib/stock');
const { canTransition } = require('../_lib/order-state');
const { emitEvent } = require('../_lib/automations');

function nowIso() {
  return new Date().toISOString();
}

/* Stripe signs the RAW payload, so read the body exactly as it arrived.
   Vercel gives us a string/Buffer when body parsing is skipped, otherwise a
   parsed object which we re-stringify. */
function readRawBody(req) {
  if (typeof req.rawBody === 'string') return req.rawBody;
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body;
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  return '';
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Method not allowed' } });

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = verify(readRawBody(req), sig);
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
      if (canTransition(order.status || 'pending', 'confirmed', 'webhook')) {
        await db.collection('orders').doc(order.id).set({ paymentStatus: 'paid', paidAt: nowIso(), updatedAt: nowIso(), status: 'confirmed' }, { merge: true });
      } else {
        await db.collection('orders').doc(order.id).set({ paymentStatus: 'paid', paidAt: nowIso(), updatedAt: nowIso() }, { merge: true });
      }
      await emitEvent(db, 'order.paid', { orderId: order.id });
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
      if (canTransition(order.status || 'pending', 'cancelled', 'webhook')) {
        await db.collection('orders').doc(order.id).set({ status: 'cancelled', updatedAt: nowIso() }, { merge: true });
        try { await restockForOrder(db, order, 'cancel', null); } catch (e) { console.error('[wh:restock]', e.message); }
      } else {
        await db.collection('orders').doc(order.id).set({ attentionReason: 'payment cancelled in stripe', needsAttention: true, updatedAt: nowIso() }, { merge: true });
      }
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
      const full = !(ch.amount_refunded < ch.amount);
      const target = full ? 'refunded' : (order.status || 'pending');
      const patch = { refundAmount: ch.amount_refunded / 100, paymentStatus: 'refunded', updatedAt: nowIso() };
      if (canTransition(order.status || 'pending', target, 'webhook')) {
        patch.status = target;
      } else {
        patch.needsAttention = true;
        patch.attentionReason = 'refund recorded in stripe while order is ' + (order.status || 'pending');
      }
      await db.collection('orders').doc(order.id).set(patch, { merge: true });
      if (patch.status === 'refunded') {
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
      await db.collection('automation_alerts').doc('dispute-' + d.id).set({ id: 'dispute-' + d.id, type: 'dispute', orderId: order.id, name: order.orderNumber || order.id, reason: 'dispute ' + d.id, resolved: false, createdAt: nowIso(), lastAlertedAt: nowIso() }, { merge: true });
      await notifyAdmin(db, 'Trendaryo: chargeback on order ' + (order.orderNumber || order.id),
        'Stripe opened a dispute (' + d.id + ') on order ' + (order.orderNumber || order.id) + '. Amount: ' + ((d.amount || 0) / 100) + '. Reason: ' + (d.reason || 'unknown') + '. The order is now held - fulfilment is blocked and refunds are paused until you resolve it.');
    }
    return;
  }
  if (t === 'charge.dispute.closed') {
    const d = event.data.object;
    const pi = d.payment_intent;
    const order = await getOrderByPaymentIntent(db, pi);
    if (order) {
      const won = d.status === 'won';
      const patch = { updatedAt: nowIso() };
      if (won) {
        patch.needsAttention = false;
        patch.riskLevel = 'cleared';
        patch.autoFulfillOptOut = false;
        patch.attentionReason = FieldValue.delete();
      }
      await db.collection('orders').doc(order.id).set(patch, { merge: true });
      await db.collection('automation_alerts').doc('dispute-' + d.id).set({ resolved: true, resolvedAt: nowIso(), outcome: d.status }, { merge: true });
      await notifyAdmin(db, 'Trendaryo: dispute ' + (won ? 'won' : 'closed') + ' (' + (order.orderNumber || order.id) + ')',
        'The dispute ' + d.id + ' closed with status "' + d.status + '" on order ' + (order.orderNumber || order.id) + '.' + (won ? ' The hold has been lifted.' : ' Review the order before releasing it.'));
    }
    return;
  }
}

async function notifyAdmin(db, subject, text) {
  try {
    const st = await db.collection('settings').doc('store').get();
    const to = st.exists ? st.data().supportEmail : null;
    if (!to) return;
    const { send } = require('../_lib/mail');
    await send({ to, subject, text });
  } catch (e) {
    console.error('[wh:notify]', e.message);
  }
}
