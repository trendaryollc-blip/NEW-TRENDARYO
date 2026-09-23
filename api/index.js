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
  '/cart': require('./cart/index'),
  '/orders': require('./orders/index'),
  '/orders/:id': require('./orders/[id]'),
  '/payments/create-intent': require('./payments/create-intent'),
  '/payments/webhook': require('./payments/webhook'),
  '/payments/refund': require('./payments/refund'),
  '/coupons/validate': require('./coupons/validate'),
  '/reviews': require('./reviews/index'),
  '/reviews/:id': require('./reviews/[id]'),
  '/users/profile': require('./users/profile'),
  '/admin/stats': require('./admin/stats'),
  '/admin/users': require('./admin/users'),
  '/admin/users/:id': require('./admin/users/[id]'),
  '/admin/orders': require('./admin/orders'),
  '/admin/products': require('./admin/products'),
  '/wishlist': require('./wishlist/index'),
  '/newsletter': require('./newsletter/index'),
  '/contact': require('./contact/index'),
  '/settings': require('./settings'),
  '/upload': require('./upload'),
  '/config/public': require('./config/public'),
};

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

    let target = ROUTES[routePath];
    let id;
    if (!target) {
      const segments = routePath.split('/').filter(Boolean);
      if (segments.length === 2) {
        target = ROUTES[`/${segments[0]}/:id`];
        if (target) id = segments[1];
      } else if (segments.length === 3) {
        target = ROUTES[`/${segments[0]}/${segments[1]}/:id`];
        if (target) id = segments[2];
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
    if (res.headersSent) {
      return res.end();
    }
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};

module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};
