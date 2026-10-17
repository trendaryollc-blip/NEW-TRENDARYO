'use strict';
const { initFirebase } = require('../_lib/firebase');
const { getStripe } = require('../_lib/stripe');
const { beat } = require('../_lib/health');

module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  if (secret && auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }

  const started = Date.now();
  const report = { ranAt: new Date().toISOString(), issues: [], stats: { checked: 0, matched: 0 } };

  try {
    const { db } = initFirebase();
    const stripe = getStripe();

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const intentsRes = await stripe.paymentIntents.list({ limit: 100, created: { gte: Math.floor(Date.now() / 1000) - 24 * 60 * 60 } });
    const intents = intentsRes.data || [];
    report.stats.checked = intents.length;

    const orderSnap = await db.collection('orders').where('createdAt', '>=', since).limit(500).get();
    const orders = orderSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    report.stats.matched = orders.length;

    const orderByIntent = new Map();
    for (const o of orders) {
      if (o.paymentIntentId) orderByIntent.set(o.paymentIntentId, o);
    }

    for (const pi of intents) {
      if (pi.status !== 'succeeded' && pi.status !== 'canceled') continue;
      const order = orderByIntent.get(pi.id);

      if (!order && pi.status === 'succeeded') {
        report.issues.push({
          type: 'orphaned_intent',
          intentId: pi.id,
          amount: pi.amount / 100,
          currency: pi.currency,
          created: new Date(pi.created * 1000).toISOString(),
        });
      }

      if (order) {
        if (order.paymentStatus !== 'paid' && pi.status === 'succeeded') {
          report.issues.push({
            type: 'unmarked_paid',
            intentId: pi.id,
            orderId: order.id,
            orderNumber: order.orderNumber,
          });
        }
        const expectedAmount = Math.round((Number(order.total) || 0) * 100);
        if (pi.amount !== expectedAmount) {
          report.issues.push({
            type: 'amount_mismatch',
            intentId: pi.id,
            orderId: order.id,
            expected: expectedAmount / 100,
            actual: pi.amount / 100,
          });
        }
        if (order.paymentMethod === 'cod' && pi.status === 'succeeded') {
          report.issues.push({
            type: 'cod_card_mixup',
            intentId: pi.id,
            orderId: order.id,
            orderNumber: order.orderNumber,
          });
        }
      }
    }

    for (const o of orders) {
      if (o.paymentStatus === 'paid' && !o.paymentIntentId) {
        report.issues.push({
          type: 'paid_without_intent',
          orderId: o.id,
          orderNumber: o.orderNumber,
        });
      }
      if (o.paymentMethod === 'card' && o.paymentStatus === 'pending') {
        report.issues.push({
          type: 'card_stuck_pending',
          orderId: o.id,
          orderNumber: o.orderNumber,
          createdAt: o.createdAt,
        });
      }
    }

    await db.collection('reconciliation_reports').doc(report.ranAt.slice(0, 10)).set(report, { merge: true });

    if (report.issues.length > 0) {
      try {
        const { sendToAdmin } = require('../_lib/mail');
        await sendToAdmin(db, {
          subject: 'Trendaryo: ' + report.issues.length + ' reconciliation issues found',
          text: 'Issues:\n' + report.issues.map(i => i.type + ': ' + JSON.stringify(i)).join('\n'),
        });
      } catch (e) {
        console.error('[reconcile] admin email failed:', e.message);
      }
    }

    await beat(db, 'cron:reconciliation', {
      status: report.issues.length ? 'degraded' : 'ok',
      detail: report.issues.length + ' issues, ' + report.stats.checked + ' intents checked',
      durationMs: Date.now() - started,
    });

    res.status(200).json({ ok: true, report });
  } catch (e) {
    console.error('Reconciliation cron error:', e);
    try {
      const { db } = initFirebase();
      await beat(db, 'cron:reconciliation', { status: 'error', detail: e.message, durationMs: Date.now() - started });
    } catch (ignored) { }
    res.status(500).json({ error: { message: e.message } });
  }
};
