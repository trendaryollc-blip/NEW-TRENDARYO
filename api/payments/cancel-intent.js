/**
 * TRENDARYO CANCEL PAYMENT INTENT
 * Voids an abandoned/declined Stripe PaymentIntent owned by the current user.
 * Used by the client to clean up intents that lost their checkout cart or
 * were superseded by a price change.
 */
'use strict';

const { initFirebase } = require('../_lib/firebase');
const { getStripe } = require('../_lib/stripe');
const { handleCors } = require('../_lib/cors');
const { requireAuth } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');

const CANCELLABLE_STATUSES = new Set([
  'requires_payment_method',
  'requires_action',
  'requires_confirmation',
  'processing',
  'requires_capture',
]);

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 40)) {
    res.status(429).json({ error: { message: 'Too many requests. Please try again in a moment.' } });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Method not allowed' } });
    return;
  }
  try {
    const user = await requireAuth(req, res);
    if (!user) return;

    const { paymentIntentId } = req.body || {};
    if (typeof paymentIntentId !== 'string' || !paymentIntentId) {
      res.status(400).json({ error: { message: 'A paymentIntentId is required.' } });
      return;
    }

    const stripe = getStripe();
    let intent;
    try {
      intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (e) {
      res.status(404).json({ error: { message: 'Payment intent not found.' } });
      return;
    }

    if (!intent.metadata || intent.metadata.userId !== user.uid) {
      res.status(403).json({ error: { message: 'This payment does not belong to the current user.' } });
      return;
    }

    if (!CANCELLABLE_STATUSES.has(intent.status)) {
      // Already terminal (succeeded / canceled); nothing to do.
      res.status(200).json({ data: { id: intent.id, status: intent.status, canceled: false } });
      return;
    }

    const canceled = await stripe.paymentIntents.cancel(paymentIntentId);

    const { db } = initFirebase();
    await db.collection('payments').doc(paymentIntentId).set(
      {
        status: 'canceled',
        cancelReason: 'user_canceled',
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    ).catch(function (err) {
      console.error('[cancel-intent] Failed to record cancellation:', err.message);
    });

    res.status(200).json({ data: { id: canceled.id, status: canceled.status, canceled: true } });
  } catch (error) {
    console.error('[cancel-intent] Error:', error);
    res.status(500).json({ error: { message: 'Could not cancel payment. Please try again.' } });
  }
};