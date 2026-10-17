const { handleCors } = require('./_lib/cors');

// Single-function gateway: Hobby plan caps deployments at 12 serverless
// functions, so every /api/* route is dispatched from this one entry point.
const ROUTES = {
  '/health': require('./health'),
  '/auth/register': require('./auth/register'),
  '/auth/logout': require('./auth/logout'),
  '/auth/forgot-password': require('./auth/forgot-password'),
  '/auth/me': require('./auth/me'),
  '/products': require('./products/index'),
  '/products/:id': require('./products/[id]'),
  '/products/:id/content': require('./products/[id]/content'),
  '/blog': require('./blog/index'),
  '/blog/:id': require('./blog/[id]'),
  '/blog/briefs': require('./blog/briefs/index'),
  '/blog/briefs/:id': require('./blog/briefs/[id]'),
  '/blog/rss': require('./blog/rss'),
  '/rss': require('./blog/rss'),
  '/sitemap': require('./blog/sitemap'),
  '/sitemap.xml': require('./blog/sitemap'),
  '/cart': require('./cart/index'),
  '/checkout/quote': require('./checkout/quote'),
  '/orders': require('./orders/index'),
  '/orders/:id': require('./orders/[id]'),
  '/payments/create-intent': require('./payments/create-intent'),
  '/payments/webhook': require('./payments/webhook'),
  '/payments/cancel-intent': require('./payments/cancel-intent'),
  '/payments/refund': require('./payments/refund'),
  '/coupons/validate': require('./coupons/validate'),
  '/reviews': require('./reviews/index'),
  '/reviews/:id': require('./reviews/[id]'),
  '/users/profile': require('./users/profile'),
  '/users/claim-guest': require('./users/claim-guest'),
  '/admin/stats': require('./admin/stats'),
  '/admin/users': require('./admin/users'),
  '/admin/users/:id': require('./admin/users/[id]'),
  '/admin/orders': require('./admin/orders'),
  '/admin/products': require('./admin/products'),
  '/admin/supplier': require('./admin/supplier'),
  '/admin/supplier-products': require('./admin/supplier-products'),
  '/admin/audit': require('./admin/audit'),
  '/admin/health': require('./admin/health'),
  '/admin/reorder': require('./admin/reorder'),
  '/admin/content-overview': require('./admin/content-overview'),
  '/admin/supplier-sla': require('./admin/supplier-sla'),
  '/admin/supplier-fulfill': require('./admin/supplier-fulfill'),
  '/admin/supplier-sync': require('./admin/supplier-sync'),
  '/automations': require('./automations/index'),
  '/automations/log': require('./automations/log'),
  '/automations/:id': require('./automations/[id]'),
  '/cron/supplier-sync': require('./cron/supplier-sync'),
  '/cron/automations': require('./cron/automations'),
  '/cron/reconciliation': require('./cron/reconciliation'),
  '/cron/abandoned-checkout': require('./cron/abandoned-checkout'),
  '/cron/backup': require('./cron/backup'),
  '/cron/publish-posts': require('./cron/publish-posts'),
  '/vitals': require('./vitals'),
  '/wishlist': require('./wishlist/index'),
  '/waitlist': require('./waitlist/index'),
  '/newsletter': require('./newsletter/index'),
  '/contact': require('./contact/index'),
  '/contact/:id': require('./contact/[id]'),
  '/settings': require('./settings'),
  '/ai': require('./ai'),
  '/upload': require('./upload'),
  '/config/public': require('./config/public'),
  '/config/deploy': require('./config/deploy'),
};

const MAX_BODY_BYTES = 10 * 1024 * 1024;

function ensureResHelpers(res) {
  if (typeof res.status !== 'function') {
    res.status = function (code) {
      this.statusCode = code;
      return this;
    };
  }
  if (typeof res.json !== 'function') {
    res.json = function (obj) {
      if (!this.getHeader('Content-Type')) {
        this.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      this.end(JSON.stringify(obj));
      return this;
    };
  }
}

// Vercel's default body parser mangles the raw request body, which breaks
// Stripe's webhook signature verification (it needs the exact bytes).
// We disable it for every route (bodyParser: false), read the raw body from
// the stream ourselves, and hand it through as req.rawBody. JSON routes are
// re-parsed here so downstream handlers keep working untouched; the webhook
// route receives the raw Buffer.
function readRawBody(req) {
  return new Promise(function (resolve, reject) {
    if (req.body !== undefined && req.body !== null) {
      if (Buffer.isBuffer(req.body)) return resolve(req.body);
      if (typeof req.body === 'string') return resolve(Buffer.from(req.body));
      if (typeof req.body === 'object') {
        return resolve(Buffer.from(JSON.stringify(req.body)));
      }
    }
    if (typeof req.read !== 'function') return resolve(Buffer.alloc(0));
    const chunks = [];
    let size = 0;
    req.on('data', function (chunk) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', function () {
      resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
}

function parseBodyForRoute(req, rawBody, routePath) {
  if (routePath === '/payments/webhook') {
    req.body = rawBody;
    return { ok: true };
  }
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    req.body = undefined;
    return { ok: true };
  }
  if (!rawBody.length) {
    req.body = {};
    return { ok: true };
  }
  try {
    req.body = JSON.parse(rawBody.toString('utf8'));
    return { ok: true };
  } catch (e) {
    return { ok: false };
  }
}

module.exports = async function handler(req, res) {
  ensureResHelpers(res);

  try {
    if (!req.query) req.query = {};

    const routePath = (String(req.query.__route || '').split('?')[0] || '').replace(/\/+$/, '') || '/';
    const method = (req.method || 'GET').toUpperCase();

    if (method === 'OPTIONS') {
      handleCors(req, res);
      return;
    }

    let rawBody;
    try {
      rawBody = await readRawBody(req);
    } catch (error) {
      res.status(413).json({ error: { message: 'Request body too large' } });
      return;
    }
    req.rawBody = rawBody;

    const parsed = parseBodyForRoute(req, rawBody, routePath);
    if (!parsed.ok) {
      res.status(400).json({ error: { message: 'Invalid JSON body' } });
      return;
    }

    let target = ROUTES[routePath];
    let id;
    if (!target) {
      const segments = routePath.split('/').filter(Boolean);
      if (segments.length === 2) {
        target = ROUTES[`/${segments[0]}/:id`];
        if (target) id = segments[1];
      } else if (segments.length === 3) {
        /* collection/:id/sub (e.g. /orders/x/refund) */
        target = ROUTES[`/${segments[0]}/${segments[1]}/:id`];
        if (target) id = segments[2];
        if (!target) {
          /* collection/:id/action (e.g. /products/p1/content) */
          target = ROUTES[`/${segments[0]}/:id/${segments[2]}`];
          if (target) id = segments[1];
        }
      }
    }

    if (!target) {
      res.statusCode = 404;
      return res.json({ error: { message: 'Not found' } });
    }

    if (id !== undefined) req.query.id = id;

    return await target(req, res);
  } catch (error) {
    console.error('Gateway error:', error);
    try {
      const { recordApiError } = require('./_lib/health');
      const { db } = require('./_lib/firebase').initFirebase();
      await recordApiError(db, routePath, 500, error.message);
    } catch (ignored) { /* health must never mask the failure */ }
    if (res.headersSent) {
      return res.end();
    }
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};

module.exports.config = {
  api: {
    bodyParser: false,
    externalResolver: true,
    // AI relay generations can run past the 10s default on the Hobby plan.
    maxDuration: 60,
  },
};