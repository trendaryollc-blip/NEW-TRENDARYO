'use strict';
const { initFirebase } = require('../_lib/firebase');
const { getStripe } = require('../_lib/stripe');
const { beat } = require('../_lib/health');
const { send } = require('../_lib/mail');

module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  if (secret && auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }

  const started = Date.now();
  const report = { ranAt: new Date().toISOString(), recovered: [], skipped: [] };

  try {
    const { db } = initFirebase();
    const stripe = getStripe();

    const since = Date.now() - 2 * 60 * 60 * 1000;
    const intentsRes = await stripe.paymentIntents.list({
      limit: 100,
      created: { gte: Math.floor(since / 1000) },
    });
    const intents = intentsRes.data || [];

    for (const pi of intents) {
      if (pi.status !== 'succeeded') continue;

      const orderSnap = await db.collection('orders').where('paymentIntentId', '==', pi.id).limit(1).get();
      if (!orderSnap.empty) continue;

      const paymentSnap = await db.collection('payments').where('paymentIntentId', '==', pi.id).limit(1).get();
      if (paymentSnap.empty) continue;

      const payment = paymentSnap.docs[0].data();
      if (!payment.orderId) continue;

      const orderDoc = await db.collection('orders').doc(payment.orderId).get();
      if (!orderDoc.exists) continue;

      const order = { id: orderDoc.id, ...orderDoc.data() };
      if (order.paymentStatus === 'paid') continue;

      const email = (order.shippingAddress && order.shippingAddress.email) || order.email;
      if (!email) {
        report.skipped.push({ intentId: pi.id, reason: 'no_email' });
        continue;
      }

      const retryLink = 'https://trendaryo.com/checkout.html?retry_intent=' + pi.id;

      try {
        await send({
          to: String(email).trim(),
          subject: 'Complete your Trendaryo order',
          html: '<p>Your payment went through but your order was not completed.</p><p><a href="' + retryLink + '">Click here to complete your order</a>.</p>',
          text: 'Your payment went through but your order was not completed. Complete it here: ' + retryLink,
        });

        await db.collection('orders').doc(order.id).set({
          paymentStatus: 'paid',
          paidAt: new Date().toISOString(),
          status: 'confirmed',
          updatedAt: new Date().toISOString(),
        }, { merge: true });

        report.recovered.push({ intentId: pi.id, orderId: order.id, orderNumber: order.orderNumber });
      } catch (e) {
        report.skipped.push({ intentId: pi.id, reason: e.message });
      }
    }

    const pendingSnap = await db.collection('orders')
      .where('paymentStatus', '==', 'pending')
      .where('paymentMethod', '==', 'card')
      .where('createdAt', '<=', new Date(Date.now() - 30 * 60 * 1000).toISOString())
      .limit(50)
      .get();

    for (const doc of pendingSnap.docs) {
      const order = { id: doc.id, ...doc.data() };
      if (!order.paymentIntentId) continue;

      const email = (order.shippingAddress && order.shippingAddress.email) || order.email;
      if (!email) continue;

      const retryLink = 'https://trendaryo.com/checkout.html?retry_intent=' + order.paymentIntentId;

      try {
        await send({
          to: String(email).trim(),
          subject: 'Your Trendaryo order is waiting',
          html: '<p>Your order is still pending. <a href="' + retryLink + '">Click here to complete payment</a>.</p>',
          text: 'Your order is still pending. Complete payment here: ' + retryLink,
        });

        report.recovered.push({ orderId: order.id, orderNumber: order.orderNumber, type: 'pending_reminder' });
      } catch (e) {
        report.skipped.push({ orderId: order.id, reason: e.message });
      }
    }

    await beat(db, 'cron:abandoned-checkout', {
      status: 'ok',
      detail: report.recovered.length + ' recovered, ' + report.skipped.length + ' skipped',
      durationMs: Date.now() - started,
    });

    res.status(200).json({ ok: true, report });
  } catch (e) {
    console.error('Abandoned checkout cron error:', e);
    try {
      const { db } = initFirebase();
      await beat(db, 'cron:abandoned-checkout', { status: 'error', detail: e.message, durationMs: Date.now() - started });
    } catch (ignored) { }
    res.status(500).json({ error: { message: e.message } });
  }
};
