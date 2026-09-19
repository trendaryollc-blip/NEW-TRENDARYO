/**
 * TRENDARYO Configuration
 * API routes are served as Vercel serverless functions at /api/*
 *
 * The Stripe publishable key is fetched from the server (/api/config/public),
 * which reads STRIPE_PUBLISHABLE_KEY from the Vercel environment. The key
 * below is only a local/dev fallback - it is NOT used once the env key is set.
 *
 * Publishable keys are public by design and safe to expose to browsers;
 * the SECRET key (sk_...) must never leave the server.
 */

window.TrendaryoConfig = {
  api: {
    baseURL: '/api',
  },
  stripe: {
    publishableKey: window.__STRIPE_KEY__ || 'pk_test_51T7Mox3fqZKBWMkDjDd4wT6w7j0Kn7enxmNwYRUCFN3nnGWfMiIv7cK6ys30MFXXcCxpuscqiUiEn3BLF4F4Tv5w00TnWqo4Sd',
    mode: 'dev-fallback',
  },
  _ready: false,
};

(function () {
  function apply(data) {
    try {
      if (data && data.stripePublishableKey) {
        window.TrendaryoConfig.stripe.publishableKey = data.stripePublishableKey;
        window.TrendaryoConfig.stripe.mode = data.stripeMode || 'live';
      }
      if (data && data.currency) window.TrendaryoConfig.currency = data.currency;
      window.TrendaryoConfig._ready = true;
      window.dispatchEvent(new CustomEvent('trendaryo:config', { detail: window.TrendaryoConfig }));
    } catch (e) { /* keep sync fallback */ window.TrendaryoConfig._ready = true; }
  }

  if (window.__STRIPE_KEY__) { apply({ stripePublishableKey: window.__STRIPE_KEY__ }); return; }

  fetch('/api/config/public')
    .then(function (r) {
      if (!r.ok) throw new Error('config');
      return r.json();
    })
    .then(function (body) { apply(body && body.data); })
    .catch(function () { window.TrendaryoConfig._ready = true; });
})();