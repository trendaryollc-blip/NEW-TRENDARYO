const { getStripe } = require('../_lib/stripe');
const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAdmin } = require('../_lib/auth');
const { applyRateLimit, sanitizeError } = require('../_lib/security');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 10)) return res.status(429).json({ error: { message: 'Too many requests' } });

  try {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;

    if (req.method === 'POST') {
      const { paymentId, amount, reason } = req.body;

      if (!paymentId) {
        return res.status(400).json({ error: { message: 'Payment ID is required' } });
      }

      const { db } = initFirebase();

      const paymentDoc = await db.collection('payments').doc(paymentId).get();
      if (!paymentDoc.exists) {
        return res.status(404).json({ error: { message: 'Payment not found' } });
      }

      const paymentData = paymentDoc.data();

      if (paymentData.status !== 'succeeded') {
        return res.status(400).json({ error: { message: 'Payment cannot be refunded' } });
      }

      const stripe = getStripe();
      const refund = await stripe.refunds.create({
        payment_intent: paymentData.paymentIntentId,
        amount: amount ? Math.round(amount * 100) : undefined,
        reason: reason || 'requested_by_customer',
      });

      await db.collection('payments').doc(paymentId).update({
        status: 'refunded',
        refundId: refund.id,
        refundAmount: amount || paymentData.amount,
        refundReason: reason || 'requested_by_customer',
        updatedAt: new Date().toISOString(),
      });

      if (paymentData.orderId) {
        await db.collection('orders').doc(paymentData.orderId).update({
          paymentStatus: 'refunded',
          status: 'refunded',
          updatedAt: new Date().toISOString(),
        });
      }

      return res.status(200).json({
        data: {
          refundId: refund.id,
          status: refund.status,
          amount: refund.amount / 100,
        },
      });
    }

    return res.status(405).json({ error: { message: 'Method not allowed' } });
  } catch (error) {
    console.error('Refund error:', error);
    res.status(500).json({ error: { message: error.message || 'Refund failed' } });
  }
};
