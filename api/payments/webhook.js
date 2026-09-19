const { getStripe } = require('../_lib/stripe');
const { initFirebase } = require('../_lib/firebase');
const { setSecurityHeaders } = require('../_lib/security');

module.exports = async function handler(req, res) {
  setSecurityHeaders(res);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  const stripe = getStripe();
  const { db } = initFirebase();

  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!endpointSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: { message: 'Webhook configuration error' } });
  }

  if (!sig) {
    return res.status(400).json({ error: { message: 'Missing stripe-signature header' } });
  }

  let event;

  try {
    let rawBody;
    if (typeof req.body === 'string') {
      rawBody = req.body;
    } else if (Buffer.isBuffer(req.body)) {
      rawBody = req.body;
    } else {
      rawBody = JSON.stringify(req.body);
    }

    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: { message: 'Invalid signature' } });
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        const payments = await db.collection('payments')
          .where('paymentIntentId', '==', paymentIntent.id)
          .get();

        for (const doc of payments.docs) {
          await doc.ref.update({
            status: 'succeeded',
            updatedAt: new Date().toISOString(),
          });

          const paymentData = doc.data();
          if (paymentData.orderId) {
            const orderRef = db.collection('orders').doc(paymentData.orderId);
            const orderDoc = await orderRef.get();
            if (orderDoc.exists) {
              await orderRef.update({
                paymentStatus: 'paid',
                status: 'confirmed',
                updatedAt: new Date().toISOString(),
              });
            }
          }
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        const payments = await db.collection('payments')
          .where('paymentIntentId', '==', paymentIntent.id)
          .get();

        for (const doc of payments.docs) {
          await doc.ref.update({
            status: 'failed',
            failureReason: paymentIntent.last_payment_error?.message || 'Unknown',
            updatedAt: new Date().toISOString(),
          });
        }
        break;
      }

      default:
        break;
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: { message: 'Webhook handler failed' } });
  }
};
