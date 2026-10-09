const Stripe = require('stripe');

let stripeInstance;

function getStripe() {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
    stripeInstance = new Stripe(key);
  }
  return stripeInstance;
}

/* Verify a webhook payload against the endpoint secret.
   Vercel hands us the raw body as a string or Buffer when the route is
   mounted without JSON parsing; fall back to stringify for parsed bodies. */
function verify(rawBody, signature) {
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!endpointSecret) throw new Error('STRIPE_WEBHOOK_SECRET not configured');
  if (!signature) throw new Error('Missing stripe-signature header');
  let payload = rawBody;
  if (Buffer.isBuffer(payload)) payload = payload.toString('utf8');
  if (typeof payload !== 'string') payload = JSON.stringify(payload);
  return getStripe().webhooks.constructEvent(payload, signature, endpointSecret);
}

module.exports = { getStripe, verify };
