const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

function responseFactory() {
  const headers = new Map();
  return {
    headers,
    statusCode: 200,
    body: undefined,
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(String(name).toLowerCase());
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.body = obj;
      return this;
    },
    end(payload) {
      this.body = payload;
      return this;
    },
  };
}

function loadHandler(relativePath) {
  const absolutePath = path.resolve(__dirname, '..', 'api', relativePath);
  delete require.cache[absolutePath];
  return require(absolutePath);
}

function makeChainableQuery(docs, mapDoc = (doc) => doc) {
  const query = {
    where() {
      return query;
    },
    orderBy() {
      return query;
    },
    limit() {
      return query;
    },
    async get() {
      return {
        empty: docs.length === 0,
        size: docs.length,
        docs: docs.map((doc, index) => ({
          id: doc.id || `doc-${index}`,
          ref: { delete: async () => {}, update: async () => {} },
          data: () => mapDoc(doc),
        })),
      };
    },
  };
  return query;
}

function installBaseStubs({
  authUser = null,
  adminUser = null,
  db = {},
  auth = {},
  security = {},
  cors = {},
  pricing = {},
  stripe = {},
}) {
  const firebase = require('../api/_lib/firebase');
  const authLib = require('../api/_lib/auth');
  const securityLib = require('../api/_lib/security');
  const corsLib = require('../api/_lib/cors');
  const pricingLib = require('../api/_lib/pricing');
  const stripeLib = require('../api/_lib/stripe');

  firebase.initFirebase = () => ({ db, auth });
  authLib.requireAuth = async () => authUser;
  authLib.requireAdmin = async () => adminUser;
  securityLib.applyRateLimit = () => true;
  securityLib.sanitizeError = (err) => (err && err.message ? err.message : 'error');
  securityLib.setSecurityHeaders = () => {};
  corsLib.handleCors = () => false;

  pricingLib.priceOrder = pricing.priceOrder || (async () => ({
    subtotal: 100,
    discount: 0,
    shipping: 0,
    tax: 8,
    total: 108,
    currency: 'usd',
    lineItems: [{ productId: 'p1', quantity: 1, name: 'Widget', price: 100 }],
    coupon: null,
  }));

  pricingLib.PricingError = pricing.PricingError || class PricingError extends Error {
    constructor(message, statusCode = 400, code = 'invalid_order') {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  };

  pricingLib.toCents = pricing.toCents || ((n) => Math.round(Number(n) * 100));
  pricingLib.getSettings = pricing.getSettings || (async () => ({
    currency: 'usd',
    taxRate: 0.08,
    shippingFlat: 9.99,
    freeShippingThreshold: 50,
    codEnabled: true,
  }));
  pricingLib.round2 = pricing.round2 || ((n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100);

  stripeLib.getStripe = stripe.getStripe || (() => ({
    paymentIntents: {
      create: async () => ({ id: 'pi_123', client_secret: 'secret', amount: 10800, currency: 'usd' }),
      retrieve: async () => ({
        status: 'succeeded',
        amount: 10800,
        amount_received: 10800,
        currency: 'usd',
        metadata: { userId: 'user-1' },
      }),
    },
    refunds: {
      create: async () => ({ id: 're_1', status: 'succeeded', amount: 10800 }),
    },
    webhooks: {
      constructEvent: () => ({
        type: 'payment_intent.succeeded',
        data: {
          object: { id: 'pi_123', metadata: { userId: 'user-1' }, amount_received: 10800 },
        },
      }),
    },
  }));

  const cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: 'demo',
    api_key: 'demo',
    api_secret: 'secret',
  });
  cloudinary.uploader.upload = (file, options, callback) => {
    callback(null, {
      secure_url: 'https://example.com/image.png',
      public_id: 'demo-image',
      width: 1200,
      height: 800,
      format: 'png',
      bytes: 12345,
      duration: null,
    });
  };
}

test('auth register, logout, forgot-password, me handlers all behave as expected', async () => {
  const user = { uid: 'user-1', email: 'user@example.com', displayName: 'User Example' };
  const db = {
    collection: () => ({
      doc: () => ({
        set: async () => {},
        get: async () => ({ exists: true, data: () => ({ role: 'user', status: 'active', firstName: 'User', lastName: 'Example' }) }),
      }),
    }),
  };
  const auth = {
    createUser: async () => ({ uid: 'user-1', email: 'user@example.com' }),
    createCustomToken: async () => 'custom-token',
    sendPasswordResetEmail: async () => {},
    verifyIdToken: async () => user,
  };
  installBaseStubs({ authUser: user, db, auth });

  const register = loadHandler('auth/register.js');
  const forgot = loadHandler('auth/forgot-password.js');
  const me = loadHandler('auth/me.js');
  const logout = loadHandler('auth/logout.js');

  const res1 = responseFactory();
  await register({ method: 'POST', body: { email: 'user@example.com', password: 'password123', firstName: 'User', lastName: 'Example' } }, res1);
  assert.equal(res1.statusCode, 201);
  assert.equal(res1.body.data.userId, 'user-1');

  const res2 = responseFactory();
  await forgot({ method: 'POST', body: { email: 'user@example.com' } }, res2);
  assert.equal(res2.statusCode, 200);

  const res3 = responseFactory();
  await me({ method: 'GET', headers: { authorization: 'Bearer valid-token' } }, res3);
  assert.equal(res3.statusCode, 200);
  assert.equal(res3.body.data.uid, 'user-1');

  const res4 = responseFactory();
  await logout({ method: 'POST', headers: { authorization: 'Bearer valid-token' } }, res4);
  assert.equal(res4.statusCode, 200);
  assert.equal(res4.body.data.userId, 'user-1');
});

test('cart and wishlist handlers support add/update/delete flows', async () => {
  const user = { uid: 'user-1' };
  let cartData = { items: [{ productId: 'p1', quantity: 1, name: 'Widget', price: 10 }] };
  const db = {
    collection: () => ({
      doc: () => ({
        get: async () => ({ exists: !!cartData, data: () => cartData }),
        set: async (next) => { cartData = next; },
        update: async (next) => { cartData = { ...cartData, ...next }; },
      }),
    }),
  };
  installBaseStubs({ authUser: user, db });

  const cart = loadHandler('cart/index.js');
  const wishlist = loadHandler('wishlist/index.js');

  const cartGet = responseFactory();
  await cart({ method: 'GET', headers: {} }, cartGet);
  assert.equal(cartGet.statusCode, 200);

  const cartPost = responseFactory();
  await cart({ method: 'POST', body: { productId: 'p2', quantity: 2, name: 'Gadget', price: 25 }, headers: {} }, cartPost);
  assert.equal(cartPost.statusCode, 200);
  assert.equal(cartPost.body.data.items.some((item) => item.productId === 'p2'), true);

  const cartPut = responseFactory();
  await cart({ method: 'PUT', body: { productId: 'p1', quantity: 5 }, headers: {} }, cartPut);
  assert.equal(cartPut.body.data.items.find((item) => item.productId === 'p1').quantity, 5);

  const cartDelete = responseFactory();
  await cart({ method: 'DELETE', query: { productId: 'p2' }, headers: {} }, cartDelete);
  assert.equal(cartDelete.body.data.items.some((item) => item.productId === 'p2'), false);

  const wishlistPost = responseFactory();
  await wishlist({ method: 'POST', body: { productId: 'w1' }, headers: {} }, wishlistPost);
  assert.equal(wishlistPost.statusCode, 200);

  const wishlistDelete = responseFactory();
  await wishlist({ method: 'DELETE', query: { productId: 'w1' }, headers: {} }, wishlistDelete);
  assert.equal(wishlistDelete.statusCode, 200);
});

test('public config, newsletter, settings, and upload handlers cover validation and admin branches', async () => {
  const user = { uid: 'user-1' };
  const admin = { uid: 'admin-1' };
  const newsletterDocs = [{ id: 'n1', email: 'sub@example.com', createdAt: '2024-01-01' }];
  const db = {
    collection: (name) => {
      if (name === 'newsletter') {
        return {
          where: () => ({
            limit: () => ({
              get: async () => ({
                empty: false,
                size: 1,
                docs: newsletterDocs.map((doc) => ({
                  ref: { delete: async () => {} },
                  data: () => doc,
                })),
              }),
            }),
          }),
          add: async () => {},
          orderBy: () => ({
            limit: () => ({
              get: async () => ({
                docs: newsletterDocs.map((doc) => ({ id: doc.id, data: () => doc })),
              }),
            }),
          }),
          get: async () => ({
            docs: newsletterDocs.map((doc) => ({ id: doc.id, data: () => doc })),
          }),
        };
      }
      if (name === 'settings') {
        return {
          doc: () => ({
            set: async () => {},
            get: async () => ({ exists: true, data: () => ({ taxRate: 0.1, shippingFlat: 9.99 }) }),
          }),
        };
      }
      return {};
    },
    batch: () => ({ delete: () => {}, commit: async () => {} }),
  };
  installBaseStubs({ authUser: user, adminUser: admin, db });

  const publicConfig = loadHandler('config/public.js');
  const newsletter = loadHandler('newsletter/index.js');
  const settings = loadHandler('settings.js');
  const upload = loadHandler('upload.js');

  const cfgRes = responseFactory();
  process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_abc';
  await publicConfig({ method: 'GET' }, cfgRes);
  assert.equal(cfgRes.statusCode, 200);
  assert.equal(cfgRes.body.data.stripeMode, 'test');

  const newsRes = responseFactory();
  await newsletter({ method: 'POST', body: { email: 'sub@example.com' } }, newsRes);
  assert.equal(newsRes.statusCode, 200);

  const settingsRes = responseFactory();
  await settings({ method: 'PUT', body: { taxRate: 0.15, shippingFlat: 12.5 }, headers: {} }, settingsRes);
  assert.equal(settingsRes.statusCode, 200);

  const uploadRes = responseFactory();
  process.env.CLOUDINARY_CLOUD_NAME = 'demo';
  process.env.CLOUDINARY_API_KEY = 'demo';
  process.env.CLOUDINARY_API_SECRET = 'secret';
  await upload({ method: 'POST', body: { file: 'data:image/png;base64,AAAA', folder: 'products', type: 'image' }, headers: {} }, uploadRes);
  assert.equal(uploadRes.statusCode, 200);

  const invalidUpload = responseFactory();
  await upload({ method: 'POST', body: { file: 'badfile' }, headers: {} }, invalidUpload);
  assert.equal(invalidUpload.statusCode, 400);
});

test('contact handler validates message/chat branches and admin listing', async () => {
  const admin = { uid: 'admin-1' };
  const db = {
    collection: () => ({
      add: async () => {},
      where: () => ({
        get: async () => ({ docs: [] }),
      }),
      orderBy: () => ({
        limit: () => ({
          get: async () => ({ docs: [{ id: 'm1', data: () => ({ name: 'Sam', email: 'sam@example.com', topic: 'orders', message: 'hello' }) }] }),
        }),
      }),
    }),
  };
  installBaseStubs({ adminUser: admin, db });
  const contact = loadHandler('contact/index.js');

  const badRes = responseFactory();
  await contact({ method: 'POST', body: { name: '', email: 'bad', topic: 'orders', message: 'hello' } }, badRes);
  assert.equal(badRes.statusCode, 400);

  const goodRes = responseFactory();
  await contact({ method: 'POST', body: { name: 'Sam', email: 'sam@example.com', topic: 'orders', message: 'Please help me track my order' } }, goodRes);
  assert.equal(goodRes.statusCode, 201);

  const chatRes = responseFactory();
  await contact({ method: 'POST', body: { type: 'chat', name: 'Sam', email: 'sam@example.com', message: 'hello there' } }, chatRes);
  assert.equal(chatRes.statusCode, 201);

  const listRes = responseFactory();
  await contact({ method: 'GET' }, listRes);
  assert.equal(listRes.statusCode, 200);
});

test('products and reviews handlers support listing, filtering, posting, updating and deleting', async () => {
  const admin = { uid: 'admin-1' };
  const user = { uid: 'user-1' };
  const products = {
    p1: { id: 'p1', name: 'P1', price: 10, status: 'active', category: 'boots', images: [], rating: 0, reviewCount: 0 },
    p2: { id: 'p2', name: 'P2', price: 20, status: 'active', category: 'shoes', images: [], rating: 0, reviewCount: 0 },
  };
  const reviews = {
    r1: { id: 'r1', userId: 'user-1', productId: 'p1', rating: 5, title: 'Nice', comment: 'Great', createdAt: '2024-01-01' },
  };
  const db = {
    collection: (name) => {
      if (name === 'products') {
        const base = {
          where: () => base,
          orderBy: () => base,
          get: async () => ({ docs: Object.values(products).map((doc) => ({ id: doc.id, data: () => doc })) }),
        };
        return {
          ...base,
          doc: (id) => ({
            get: async () => ({ exists: !!products[id], data: () => ({ ...products[id], id }) }),
            update: async (next) => { products[id] = { ...products[id], ...next }; },
            delete: async () => { delete products[id]; },
            set: async (next) => { products[id] = next; },
          }),
          add: async (payload) => {
            const id = 'new-product';
            products[id] = { id, ...payload };
            return { id };
          },
        };
      }
      if (name === 'reviews') {
        const base = {
          where: () => base,
          orderBy: () => base,
          get: async () => ({ docs: Object.values(reviews).map((doc) => ({ id: doc.id, data: () => doc })) }),
        };
        return {
          ...base,
          doc: (id) => ({
            get: async () => ({ exists: !!reviews[id], data: () => ({ ...reviews[id], id }) }),
            update: async (next) => { reviews[id] = { ...reviews[id], ...next }; },
            delete: async () => { delete reviews[id]; },
          }),
          add: async (payload) => {
            const id = 'r2';
            reviews[id] = { id, ...payload };
            return { id };
          },
        };
      }
      if (name === 'users') {
        return {
          doc: (id) => ({
            get: async () => ({ exists: true, data: () => ({ role: id === 'admin-1' ? 'admin' : 'user', uid: id }) }),
          }),
        };
      }
      return {};
    },
  };
  installBaseStubs({ authUser: user, adminUser: admin, db });

  const productsHandler = loadHandler('products/index.js');
  const productDetail = loadHandler('products/[id].js');
  const reviewsHandler = loadHandler('reviews/index.js');
  const reviewDetail = loadHandler('reviews/[id].js');

  const listRes = responseFactory();
  await productsHandler({ method: 'GET', query: { status: 'active', category: 'boots', page: 1, limit: 10 } }, listRes);
  assert.equal(listRes.statusCode, 200);

  const createRes = responseFactory();
  await productsHandler({ method: 'POST', body: { name: 'New Widget', price: 50, category: 'boots' } }, createRes);
  assert.equal(createRes.statusCode, 201);

  const prodRes = responseFactory();
  await productDetail({ method: 'GET', query: { id: 'p1' } }, prodRes);
  assert.equal(prodRes.statusCode, 200);

  const updateRes = responseFactory();
  await productDetail({ method: 'PUT', query: { id: 'p1' }, body: { name: 'Updated' } }, updateRes);
  assert.equal(updateRes.statusCode, 200);

  const reviewPost = responseFactory();
  await reviewsHandler({ method: 'POST', body: { productId: 'p1', rating: 5, title: 'good', comment: 'nice' } }, reviewPost);
  assert.equal(reviewPost.statusCode, 201);

  const reviewList = responseFactory();
  await reviewsHandler({ method: 'GET', query: { productId: 'p1', page: 1, limit: 20 } }, reviewList);
  assert.equal(reviewList.statusCode, 200);

  const reviewEdit = responseFactory();
  await reviewDetail({ method: 'PUT', query: { id: 'r1' }, body: { title: 'Updated review' } }, reviewEdit);
  assert.equal(reviewEdit.statusCode, 200);

  const reviewDelete = responseFactory();
  await reviewDetail({ method: 'DELETE', query: { id: 'r1' } }, reviewDelete);
  assert.equal(reviewDelete.statusCode, 200);
});

test('orders and payments flows cover pricing, verification, admin listing, and refund logic', async () => {
  const user = { uid: 'user-1', email: 'user@example.com' };
  const admin = { uid: 'admin-1' };
  const orders = {
    o1: {
      id: 'o1',
      userId: 'user-1',
      status: 'pending',
      paymentStatus: 'paid',
      total: 108,
      shippingAddress: { fullName: 'User Example', email: 'user@example.com', street: '1 Main', city: 'X', country: 'US' },
      createdAt: '2024-01-01',
    },
  };
  const payments = {
    p1: { id: 'p1', userId: 'user-1', paymentIntentId: 'pi_123', status: 'succeeded', amount: 108, orderId: 'o1' },
  };
  const products = { p1: { id: 'p1', price: 100, status: 'active', stock: 10 } };
  const db = {
    collection: (name) => {
      if (name === 'orders') {
        const orderQuery = {
          where: (field) => {
            if (field === 'paymentIntentId') {
              return {
                limit: () => ({
                  get: async () => ({ empty: true, docs: [] }),
                }),
              };
            }
            return orderQuery;
          },
          orderBy: () => orderQuery,
          limit: () => orderQuery,
          get: async () => ({
            empty: false,
            docs: Object.values(orders).map((doc) => ({ id: doc.id, data: () => doc })),
          }),
          doc: (id = 'o2') => ({
            id,
            get: async () => ({ exists: !!orders[id], data: () => ({ ...orders[id], id }) }),
            update: async (next) => { orders[id] = { ...orders[id], ...next }; },
          }),
          add: async (payload) => {
            const orderId = 'o2';
            orders[orderId] = { id: orderId, ...payload };
            return { id: orderId };
          },
        };
        return orderQuery;
      }
      if (name === 'payments') {
        const paymentQuery = {
          where: () => paymentQuery,
          orderBy: () => paymentQuery,
          limit: () => paymentQuery,
          get: async () => ({ docs: Object.values(payments).map((doc) => ({ id: doc.id, ref: { update: async () => {} }, data: () => doc })) }),
          doc: (id) => ({
            get: async () => ({ exists: !!payments[id], data: () => ({ ...payments[id], id }) }),
            update: async (next) => { payments[id] = { ...payments[id], ...next }; },
          }),
          add: async (payload) => {
            const paymentId = 'p2';
            payments[paymentId] = { id: paymentId, ...payload };
            return { id: paymentId };
          },
        };
        return paymentQuery;
      }
      if (name === 'products') {
        return {
          doc: (id) => ({
            get: async () => ({ exists: !!products[id], data: () => ({ ...products[id], id }) }),
          }),
        };
      }
      if (name === 'carts') {
        return { doc: () => ({ set: async () => {}, get: async () => ({ exists: false, data: () => ({ items: [] }) }) }) };
      }
      if (name === 'coupons') {
        return { doc: () => ({ get: async () => ({ exists: false, data: () => ({}) }) }) };
      }
      if (name === 'users') {
        return {
          doc: (id) => ({
            get: async () => ({ exists: true, data: () => ({ role: id === 'admin-1' ? 'admin' : 'user', uid: id }) }),
          }),
        };
      }
      return {};
    },
    batch: () => ({ set: () => {}, commit: async () => {} }),
    runTransaction: async (callback) => callback({
      get: async (query) => query.get(),
      getAll: async (...refs) => Promise.all(refs.map((ref) => ref.get())),
      set: () => {},
      update: () => {},
    }),
  };
  installBaseStubs({ authUser: user, adminUser: admin, db });

  const ordersIndex = loadHandler('orders/index.js');
  const orderDetail = loadHandler('orders/[id].js');
  const createIntent = loadHandler('payments/create-intent.js');
  const refund = loadHandler('payments/refund.js');
  const webhook = loadHandler('payments/webhook.js');

  const listRes = responseFactory();
  await ordersIndex({ method: 'GET', query: { page: 1, limit: 20 } }, listRes);
  assert.equal(listRes.statusCode, 200);

  const createRes = responseFactory();
  await ordersIndex({
    method: 'POST',
    body: {
      items: [{ productId: 'p1', quantity: 1 }],
      shippingAddress: { fullName: 'User Example', email: 'user@example.com', street: '1 Main', city: 'X', country: 'US' },
      paymentMethod: 'card',
      paymentIntentId: 'pi_123',
    },
  }, createRes);
  assert.equal(createRes.statusCode, 201);

  const orderGet = responseFactory();
  await orderDetail({ method: 'GET', query: { id: 'o1' } }, orderGet);
  assert.equal(orderGet.statusCode, 200);

  const intentRes = responseFactory();
  await createIntent({ method: 'POST', body: { items: [{ productId: 'p1', quantity: 1 }] }, headers: { authorization: 'Bearer valid-token' } }, intentRes);
  assert.equal(intentRes.statusCode, 200);

  const refundRes = responseFactory();
  await refund({ method: 'POST', body: { paymentId: 'p1', amount: 500 }, headers: { authorization: 'Bearer admin-token' } }, refundRes);
  assert.equal(refundRes.statusCode, 200);

  const previousWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  const webhookRes = responseFactory();
  await webhook({ method: 'POST', headers: { 'stripe-signature': 'test_sig' }, body: { type: 'payment_intent.succeeded', data: { object: { id: 'pi_123', metadata: { userId: 'user-1' }, amount_received: 10800 } } } }, webhookRes);
  if (previousWebhookSecret === undefined) {
    delete process.env.STRIPE_WEBHOOK_SECRET;
  } else {
    process.env.STRIPE_WEBHOOK_SECRET = previousWebhookSecret;
  }
  assert.equal(webhookRes.statusCode, 200);
});

test('checkout quote returns server-priced items and rejects invalid methods', async () => {
  const priceOrder = async () => ({
    subtotal: 100,
    discount: 10,
    shipping: 0,
    tax: 7.2,
    total: 97.2,
    currency: 'usd',
    lineItems: [{ productId: 'p1', name: 'Widget', price: 100, quantity: 1, lineTotal: 100 }],
    coupon: { code: 'SAVE10', type: 'percent', value: 10 },
    settings: { codEnabled: false },
  });
  installBaseStubs({
    authUser: { uid: 'user-1' },
    db: {},
    pricing: { priceOrder },
  });

  const quote = loadHandler('checkout/quote.js');
  const response = responseFactory();
  await quote({
    method: 'POST',
    body: { items: [{ productId: 'p1', quantity: 1 }], couponCode: 'SAVE10' },
    headers: {},
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.breakdown.total, 97.2);
  assert.equal(response.body.data.lineItems[0].price, 100);
  assert.equal(response.body.data.coupon.code, 'SAVE10');
  assert.equal(response.body.data.codEnabled, false);
});

test('admin dashboards cover stats/users/orders/products and route-level guards', async () => {
  const admin = { uid: 'admin-1' };
  const usersDocs = [
    { id: 'u1', createdAt: new Date().toISOString(), email: 'a@example.com', role: 'user', status: 'active' },
    { id: 'u2', createdAt: new Date().toISOString(), email: 'b@example.com', role: 'admin', status: 'active' },
  ];
  const ordersDocs = [
    { id: 'o1', status: 'pending', total: 50, paymentStatus: 'paid', createdAt: new Date().toISOString() },
    { id: 'o2', status: 'shipped', total: 100, paymentStatus: 'paid', createdAt: new Date(Date.now() - 20 * 86400000).toISOString() },
  ];
  const productsDocs = [
    { id: 'p1', status: 'active', name: 'Alpha', sku: 'A1', brand: 'Acme', createdAt: new Date().toISOString() },
  ];
  const db = {
    collection: (name) => ({
      get: async () => ({ docs: (name === 'users' ? usersDocs : name === 'orders' ? ordersDocs : name === 'products' ? productsDocs : []).map((doc) => ({ id: doc.id || 'id', data: () => doc })) }),
      where: () => ({ get: async () => ({ docs: productsDocs.map((doc) => ({ id: doc.id, data: () => doc })) }) }),
      doc: (id) => ({
        get: async () => ({ exists: true, data: () => ({ id, role: 'user', status: 'active' }) }),
        set: async () => {},
        delete: async () => {},
      }),
      orderBy: () => ({ get: async () => ({ docs: ordersDocs.map((doc) => ({ id: doc.id, data: () => doc })) }) }),
    }),
  };
  installBaseStubs({ adminUser: admin, db });

  const stats = loadHandler('admin/stats.js');
  const users = loadHandler('admin/users.js');
  const orders = loadHandler('admin/orders.js');
  const products = loadHandler('admin/products.js');
  const userDetail = loadHandler('admin/users/[id].js');

  const statsRes = responseFactory();
  await stats({}, statsRes);
  assert.equal(statsRes.statusCode, 200);
  assert.ok(statsRes.body.data.totalUsers >= 1);

  const usersRes = responseFactory();
  await users({ method: 'GET', query: { page: 1, limit: 10 } }, usersRes);
  assert.equal(usersRes.statusCode, 200);

  const ordersRes = responseFactory();
  await orders({ method: 'GET', query: { page: 1, limit: 10, status: 'pending' } }, ordersRes);
  assert.equal(ordersRes.statusCode, 200);

  const productsRes = responseFactory();
  await products({ method: 'GET', query: { page: 1, limit: 10, status: 'active' } }, productsRes);
  assert.equal(productsRes.statusCode, 200);

  const userDetailRes = responseFactory();
  await userDetail({ method: 'GET', query: { id: 'u1' } }, userDetailRes);
  assert.equal(userDetailRes.statusCode, 200);
});

test('authentication helpers validate tokens and admin checks', async () => {
  delete require.cache[require.resolve('../api/_lib/auth')];
  const authLib = require('../api/_lib/auth');
  const firebase = require('../api/_lib/firebase');
  let verifiedToken;
  firebase.initFirebase = () => ({
    auth: {
      verifyIdToken: async (token) => {
        verifiedToken = token;
        return { uid: 'u1', email: 'ok@example.com' };
      },
    },
    db: {
      collection: () => ({
        doc: () => ({ get: async () => ({ exists: true, data: () => ({ role: 'admin' }) }) }),
      }),
    },
  });
  delete require.cache[require.resolve('../api/_lib/auth')];
  const testAuthLib = require('../api/_lib/auth');

  const valid = await testAuthLib.verifyAuth({ headers: { authorization: 'Bearer valid-token' } });
  assert.equal(valid.uid, 'u1');

  const admin = await testAuthLib.requireAdmin({ headers: { authorization: 'Bearer admin-token' } }, responseFactory());
  assert.equal(admin.role, 'admin');

  const missing = await testAuthLib.requireAuth({ headers: {} }, responseFactory());
  assert.equal(missing, null);
});
