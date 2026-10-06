const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');

const apiDirectory = path.resolve(__dirname, '..', 'api');
const gatewayPath = path.join(apiDirectory, 'index.js');

const routeModules = [
  './health',
  './auth/register',
  './auth/logout',
  './auth/forgot-password',
  './auth/me',
  './products/index',
  './products/[id]',
  './cart/index',
  './checkout/quote',
  './orders/index',
  './orders/[id]',
  './payments/create-intent',
  './payments/webhook',
  './payments/refund',
  './coupons/validate',
  './reviews/index',
  './reviews/[id]',
  './users/profile',
  './admin/stats',
  './admin/users',
  './admin/users/[id]',
  './admin/orders',
  './admin/products',
  './wishlist/index',
  './newsletter/index',
  './contact/index',
  './settings',
  './upload',
  './config/public',
];

const pathByModule = new Map([
  ['./health', '/health'],
  ['./auth/register', '/auth/register'],
  ['./auth/logout', '/auth/logout'],
  ['./auth/forgot-password', '/auth/forgot-password'],
  ['./auth/me', '/auth/me'],
  ['./products/index', '/products'],
  ['./products/[id]', '/products/product-123'],
  ['./cart/index', '/cart'],
  ['./checkout/quote', '/checkout/quote'],
  ['./orders/index', '/orders'],
  ['./orders/[id]', '/orders/order-123'],
  ['./payments/create-intent', '/payments/create-intent'],
  ['./payments/webhook', '/payments/webhook'],
  ['./payments/refund', '/payments/refund'],
  ['./coupons/validate', '/coupons/validate'],
  ['./reviews/index', '/reviews'],
  ['./reviews/[id]', '/reviews/review-123'],
  ['./users/profile', '/users/profile'],
  ['./admin/stats', '/admin/stats'],
  ['./admin/users', '/admin/users'],
  ['./admin/users/[id]', '/admin/users/user-123'],
  ['./admin/orders', '/admin/orders'],
  ['./admin/products', '/admin/products'],
  ['./wishlist/index', '/wishlist'],
  ['./newsletter/index', '/newsletter'],
  ['./contact/index', '/contact'],
  ['./settings', '/settings'],
  ['./upload', '/upload'],
  ['./config/public', '/config/public'],
]);

function createResponse() {
  const headers = new Map();
  return {
    headers,
    statusCode: 200,
    body: undefined,
    headersSent: false,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      this.headersSent = true;
      return this;
    },
    end(value) {
      this.body = value;
      this.headersSent = true;
      return this;
    },
  };
}

function loadGatewayWithRouteSpies() {
  const originalLoad = Module._load;
  const calledRoutes = [];
  Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === gatewayPath && routeModules.includes(request)) {
      return async function routeSpy(req, res) {
        calledRoutes.push(request);
        res.status(200).json({
          route: request,
          id: req.query.id || null,
        });
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[gatewayPath];
    return {
      handler: require(gatewayPath),
      calledRoutes,
    };
  } finally {
    Module._load = originalLoad;
  }
}

test('API gateway dispatches every registered static and parameterized route', async (t) => {
  const { handler, calledRoutes } = loadGatewayWithRouteSpies();
  for (const moduleName of routeModules) {
    await t.test(moduleName, async () => {
      const req = {
        method: 'GET',
        query: { __route: pathByModule.get(moduleName) },
        headers: {},
      };
      const res = createResponse();

      await handler(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.route, moduleName);
      if (moduleName.includes('[id]')) {
        assert.equal(res.body.id, pathByModule.get(moduleName).split('/').pop());
      }
    });
  }
  assert.equal(calledRoutes.length, routeModules.length);
});

test('API gateway normalizes trailing slashes and ignores query strings', async () => {
  const { handler } = loadGatewayWithRouteSpies();
  const req = {
    method: 'GET',
    query: { __route: '/health/?verbose=true' },
    headers: {},
  };
  const res = createResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.route, './health');
});

test('API gateway handles preflight requests without dispatching a route', async () => {
  const { handler, calledRoutes } = loadGatewayWithRouteSpies();
  const req = {
    method: 'OPTIONS',
    query: { __route: '/health' },
    headers: { origin: 'https://trendaryo.com' },
  };
  const res = createResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.getHeader('access-control-allow-origin'), 'https://trendaryo.com');
  assert.equal(calledRoutes.length, 0);
});

test('API gateway returns a JSON 404 for unknown routes', async () => {
  const { handler } = loadGatewayWithRouteSpies();
  const res = createResponse();

  await handler({
    method: 'GET',
    query: { __route: '/not-a-route' },
    headers: {},
  }, res);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: { message: 'Not found' } });
});
