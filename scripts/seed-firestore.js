/**
 * Seed Firestore with the Trendaryo demo + development catalogue and a full set
 * of realistic sample activity for testing EVERY feature before launch.
 *
 * Everything this script writes is DEVELOPMENT DATA. Before going live, run:
 *     node --env-file=.env scripts/purge-mock.js     (or re-run with --fresh
 *     once scripts/data/mock-catalog.js is removed) to delete mock products,
 *     users, orders and reviews and start clean with real products.
 *
 * Usage:
 *   node --env-file=.env scripts/seed-firestore.js            # full dev seed
 *   node --env-file=.env scripts/seed-firestore.js --fresh    # wipe app collections first
 *   node --env-file=.env scripts/seed-firestore.js --no-users # skip Auth user creation
 *   node --env-file=.env scripts/seed-firestore.js --users 60 # created demo users
 *
 * Requires FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
 * (the same service account the API uses).
 */
try { require('dotenv').config(); } catch (e) { /* dotenv optional */ }

const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { products, categories, coupons, settings, reviewSamples } = require('./data/catalog');
const { generateMockProducts } = require('./data/mock-catalog');

const FRESH = process.argv.includes('--fresh');
const SKIP_USERS = process.argv.includes('--no-users');
const USER_COUNT = (() => {
  const i = process.argv.indexOf('--users');
  const n = i !== -1 ? parseInt(process.argv[i + 1], 10) : 120;
  return Number.isFinite(n) && n > 0 && n <= 300 ? n : 120;
})();
const MOCK_PRODUCT_COUNT = 130; // curated (25) + mock = 155 documents

const YEAR = new Date().getUTCFullYear();
const DAY = 86400000;

function initAdmin() {
  if (admin.apps && admin.apps.length) return admin;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY');
  }
  const cert =
    admin.credential && admin.credential.cert ? admin.credential.cert : admin.cert;
  admin.initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }),
  });
  return admin;
}

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function computeTotals(lineItems) {
  const subtotal = round2(lineItems.reduce((s, i) => s + i.price * i.quantity, 0));
  const shipping = subtotal >= settings.freeShippingThreshold ? 0 : settings.shippingFlat;
  const tax = round2(subtotal * settings.taxRate);
  const total = round2(subtotal + shipping + tax);
  return { subtotal, shipping, tax, total };
}

async function clearCollection(db, name) {
  const snap = await db.collection(name).get();
  if (snap.empty) return 0;
  let n = 0;
  const chunk = [];
  snap.docs.forEach((d) => { chunk.push(d.ref); n++; });
  for (let i = 0; i < chunk.length; i += 400) {
    const batch = db.batch();
    chunk.slice(i, i + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
  return n;
}

/* Performs fn(item) for each item, committing one batched write per 400 docs.
   Uses .set(merge:true) so repeated seeds are idempotent. */
async function bulkSet(db, collectionName, entries, nowIso) {
  let committed = 0;
  for (let i = 0; i < entries.length; i += 400) {
    const slice = entries.slice(i, i + 400);
    const batch = db.batch();
    slice.forEach(({ id, data }) => {
      batch.set(db.collection(collectionName).doc(id), { ...data, updatedAt: nowIso }, { merge: true });
    });
    await batch.commit();
    committed += slice.length;
  }
  return committed;
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

const FIRST_NAMES = ['Amelia', 'James', 'Priya', 'Liam', 'Sofia', 'Noah', 'Mia', 'Ethan', 'Ava', 'Lucas',
  'Isabella', 'Mateo', 'Chloe', 'Zayn', 'Hannah', 'Omar', 'Leila', 'Daniel', 'Elena', 'Adam',
  'Nina', 'Ravi', 'Grace', 'Felix', 'Yara', 'Kenji', 'Amara', 'Ivan', 'Zara', 'Hugo',
  'Fatima', 'Lars', 'Ingrid', 'Sami', 'Camille', 'Diego', 'Mei', 'Oscar', 'Layla', 'Theo',
  'Anya', 'Bruno', 'Clara', 'Dario', 'Esme', 'Farid', 'Gita', 'Harper', 'Iris', 'Jonas'];
const LAST_NAMES = ['Stone', 'Okafor', 'Menon', 'Chen', 'Garcia', 'Smith', 'Khan', 'Kim', 'Silva',
  'Novak', 'Bauer', 'Kowalski', 'Rossi', 'Ivanov', 'Ahmed', 'Moreau', 'Tanaka', 'Olsen', 'Meyer',
  'Costa', 'Lopez', 'Muller', 'Sato', 'Ali', 'Bogdanov', 'Weber', 'Fischer', 'Kato', 'Nakamura',
  'Petrov', 'Andersson', 'Rashid', 'Pereira', 'Dubois', 'Mensah', 'Lindqvist', 'Haddad', 'Osei',
  'Torres', 'Novotny', 'Hansen', 'Varga', 'Fontaine', 'Reed', 'Bello', 'Minor', 'Ivory', 'Santos'];
const CITIES = ['London', 'Lagos', 'Dubai', 'New York', 'Toronto', 'Sydney', 'Berlin', 'Paris', 'Tokyo',
  'Singapore', 'Amsterdam', 'Madrid', 'Oslo', 'Bangkok', 'Jakarta', 'Mumbai', 'Cairo', 'Sao Paulo',
  'Mexico City', 'Seoul', 'Zurich', 'Lisbon', 'Stockholm', 'Rome', 'Warsaw', 'Istanbul', 'Nairobi', 'Manila'];
const STREETS = ['12 Example Street', '45 Market Avenue', '8 Sunset Road', '221 Innovation Drive',
  '3 Maple Lane', '90 Highland Blvd', '17 Willow Court', '6 Ocean View Terrace', '33 Grand Parade', '58 Cedar Walk'];

function buildMockUsers(count) {
  const rnd01 = (k) => {
    let x = Math.sin(k + 1) * 10000;
    return x - Math.floor(x);
  };
  const out = [];
  for (let i = 0; i < count; i++) {
    const idx = i + 3; // 0..2 reserved for the hand-picked demo users below
    const firstName = FIRST_NAMES[idx % FIRST_NAMES.length];
    const lastName = LAST_NAMES[Math.floor(idx / FIRST_NAMES.length) % LAST_NAMES.length];
    const email = 'user' + String(idx + 1).padStart(3, '0') + '@trendaryo.dev';
    const city = CITIES[Math.floor(idx % CITIES.length)];
    const sinceDays = Math.floor(rnd01(idx) * 120) + 2;
    out.push({
      email, firstName, lastName, city,
      createdAt: new Date(Date.now() - sinceDays * DAY).toISOString(),
      phone: '+44 ' + (0 + idx % 9 + 1) + ' ' + String(1000000 + Math.floor(rnd01(idx) * 8999999)),
      street: STREETS[idx % STREETS.length],
    });
  }
  return out;
}

const DEMO_USERS = [
  { email: 'amelia@example.com', firstName: 'Amelia', lastName: 'Stone', city: 'London', country: 'UK' },
  { email: 'james@example.com', firstName: 'James', lastName: 'Okafor', city: 'Lagos', country: 'Nigeria' },
  { email: 'priya@example.com', firstName: 'Priya', lastName: 'Menon', city: 'Dubai', country: 'UAE' },
];

async function ensureUsers(db, auth) {
  const created = [];
  const people = DEMO_USERS.concat(buildMockUsers(Math.max(0, USER_COUNT - DEMO_USERS.length)));

  for (const u of people) {
    let record;
    try {
      record = await auth.getUserByEmail(u.email);
    } catch (e) {
      try {
        record = await auth.createUser({
          email: u.email,
          password: 'Demo1234!',
          displayName: u.firstName + ' ' + u.lastName,
          emailVerified: true,
        });
      } catch (createErr) {
        // Quota / transient failures must not abort the whole seed. Log and skip.
        console.log('  ~ skipped auth create', u.email, '->', createErr.code || createErr.message);
        continue;
      }
    }
    const createdAt = u.createdAt || new Date().toISOString();
    await db.collection('users').doc(record.uid).set(
      {
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        emailLower: u.email.toLowerCase(),
        phone: u.phone || '',
        role: 'user',
        status: 'active',
        addresses: [{ label: 'Home', street: u.street || '', city: u.city, state: '', zipCode: '', country: u.country || '' }],
        ordersCount: 0,
        totalSpent: 0,
        seeded: true,
        createdAt,
        lastLoginAt: createdAt,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    created.push({ uid: record.uid, ...u, createdAt });
  }
  return created;
}

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */

function buildProductList() {
  const bySlug = new Map();
  const now = Date.now();
  products.forEach((p, i) => {
    bySlug.set(p.slug, {
      ...p,
      createdAt: new Date(now - (products.length - i) * 7 * DAY).toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });
  const mock = generateMockProducts(MOCK_PRODUCT_COUNT);
  mock.forEach((p, i) => {
    if (bySlug.has(p.slug)) return; // curated wins on collision
    const ageDays = Math.floor((i * 37) % 180);
    bySlug.set(p.slug, {
      ...p,
      createdAt: new Date(now - ageDays * DAY - (i % 5) * DAY).toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });
  return Array.from(bySlug.values());
}

async function seedProducts(db, productList) {
  const entries = productList.map((p) => ({ id: p.slug, data: { ...p, seeded: true } }));
  const committed = await bulkSet(db, 'products', entries, new Date().toISOString());
  return committed;
}

/* ------------------------------------------------------------------ */
/* Reviews                                                             */
/* ------------------------------------------------------------------ */

async function seedReviews(db, productList, users) {
  const reviewer = (i) => users.length ? users[Math.abs(i) % users.length] : null;
  const docs = [];
  productList.forEach((p, i) => {
    if (p.status !== 'active') return;
    const count = 2 + (i % 4); // 2..5 per product
    for (let j = 0; j < count; j++) {
      const sample = reviewSamples[(i + j) % reviewSamples.length];
      const user = reviewer(i * 3 + j);
      const daysAgo = (i % 90) + j * 2;
      docs.push({
        id: 'rev-' + i + '-' + j,
        data: {
          productId: p.slug,
          userId: user ? user.uid : 'seed',
          userName: user ? user.firstName + ' ' + user.lastName : 'Trendaryo Customer',
          rating: sample.rating,
          title: sample.title,
          comment: sample.comment,
          status: (i + j) % 37 === 0 ? 'pending' : 'approved', // a few pending for moderation
          helpful: Math.floor(((i * 7 + j * 13) % 25)),
          seeded: true,
          createdAt: new Date(Date.now() - daysAgo * DAY).toISOString(),
        },
      });
    }
  });
  return bulkSet(db, 'reviews', docs, new Date().toISOString());
}

/* ------------------------------------------------------------------ */
/* Orders                                                              */
/* ------------------------------------------------------------------ */

function buildOrders(productList, users) {
  const statuses = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'delivered', 'cancelled', 'refunded'];
  const docs = [];
  const tally = {};
  const totalOrders = 60;
  const active = productList.filter((p) => p.status === 'active');

  for (let i = 0; i < totalOrders; i++) {
    const buyer = users.length ? users[i % users.length] : { uid: 'guest-' + i, firstName: 'Guest', lastName: String(i), email: 'guest@example.com', city: 'Muscat', country: 'Oman' };
    const itemCount = 1 + (i % 3);
    const lineItems = [];
    for (let k = 0; k < itemCount; k++) {
      const prod = active[(i * 5 + k * 7) % active.length];
      const quantity = 1 + ((i + k) % 3);
      lineItems.push({
        productId: prod.slug,
        name: prod.name,
        price: prod.price,
        quantity,
        image: prod.image || (prod.images && prod.images[0]) || '',
        emoji: prod.emoji || '',
        lineTotal: round2(prod.price * quantity),
      });
    }
    const totals = computeTotals(lineItems);
    const status = statuses[i % statuses.length];
    const paid = !['pending', 'cancelled'].includes(status);
    const createdAt = new Date(Date.now() - i * 2.2 * DAY).toISOString();
    const orderNumber = 'TRD-' + YEAR + '-' + String(10000 + i).slice(1);

    tally[buyer.uid] = tally[buyer.uid] || { count: 0, spend: 0 };
    tally[buyer.uid].count += 1;
    tally[buyer.uid].spend = round2(tally[buyer.uid].spend + totals.total);

    docs.push({
      id: orderNumber,
      data: {
        orderNumber,
        userId: buyer.uid,
        email: buyer.email,
        items: lineItems,
        shippingAddress: {
          fullName: (buyer.firstName || 'Guest') + ' ' + (buyer.lastName || ''),
          email: buyer.email,
          phone: '+1 555 000 0000',
          street: '12 Example Street',
          city: buyer.city || 'Muscat',
          state: '',
          zipCode: '00000',
          country: buyer.country || 'Oman',
        },
        paymentMethod: i % 4 === 0 ? 'cod' : 'card',
        paymentIntentId: i % 4 === 0 ? null : 'pi_demo_' + orderNumber.toLowerCase(),
        subtotal: totals.subtotal,
        discount: 0,
        shipping: totals.shipping,
        tax: totals.tax,
        total: totals.total,
        currency: settings.currency,
        coupon: null,
        status,
        paymentStatus: paid ? 'paid' : 'pending',
        trackingNumber: ['shipped', 'delivered'].includes(status) ? '1Z' + String(9e8 + i) : '',
        statusHistory: [{ status: 'pending', timestamp: createdAt, note: 'Order placed (dev seed)' }],
        seeded: true,
        createdAt,
        updatedAt: createdAt,
      },
    });
  }
  return { docs, tally };
}

/* ------------------------------------------------------------------ */
/* Wishlist / cart / newsletter                                        */
/* ------------------------------------------------------------------ */

function buildWishlists(productList, users) {
  const docs = [];
  const active = productList.filter((p) => p.status === 'active');
  for (let u = 0; u < Math.min(8, users.length); u++) {
    const pick = [];
    for (let k = 0; k < 6; k++) pick.push(active[(u * 11 + k * 3) % active.length].slug);
    docs.push({ id: users[u].uid, data: { items: pick, seeded: true, updatedAt: new Date().toISOString() } });
  }
  return docs;
}

function buildCarts(productList, users) {
  const docs = [];
  const active = productList.filter((p) => p.status === 'active');
  for (let u = 0; u < Math.min(3, users.length); u++) {
    const items = [];
    for (let k = 0; k < 2; k++) {
      const prod = active[(u * 13 + k * 5) % active.length];
      items.push({ productId: prod.slug, quantity: 1 + (k % 2), name: prod.name, price: prod.price, image: prod.image || '', emoji: prod.emoji || '' });
    }
    docs.push({ id: users[u].uid, data: { items, seeded: true, updatedAt: new Date().toISOString() } });
  }
  return docs;
}

function seedNewsletter() {
  const docs = [];
  const emails = ['newsletter1@example.com', 'newsletter2@example.com', 'newsletter3@example.com'];
  for (let i = 0; i < 40; i++) {
    docs.push({
      id: 'nl-' + i,
      data: {
        email: emails[i % emails.length],
        source: 'seed',
        seeded: true,
        createdAt: new Date(Date.now() - i * DAY).toISOString(),
      },
    });
  }
  return docs;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  initAdmin();
  const db = getFirestore();
  const auth = getAuth();
  const nowIso = new Date().toISOString();

  console.log('Seeding Firestore project:', process.env.FIREBASE_PROJECT_ID);
  console.log('Targets: products=155+, users=' + USER_COUNT + ', orders=60, reviews=spread');

  if (FRESH) {
    for (const name of ['products', 'categories', 'coupons', 'orders', 'reviews', 'newsletter', 'adminLogs', 'wishlists', 'carts']) {
      const removed = await clearCollection(db, name);
      console.log('  - cleared', name, '(' + removed + ')');
    }
  }

  /* settings */
  await db.collection('settings').doc('store').set(
    { ...settings, updatedAt: nowIso },
    { merge: true }
  );
  console.log('  ✓ settings/store');

  /* categories */
  for (const c of categories) {
    await db.collection('categories').doc(c.id).set({ ...c, updatedAt: nowIso }, { merge: true });
  }
  console.log('  ✓ categories:', categories.length);

  /* products (doc id = SEO slug) */
  const productList = buildProductList();
  const productCount = await seedProducts(db, productList);
  console.log('  ✓ products:', productCount,
    '(active ' + productList.filter((p) => p.status === 'active').length + ')');

  /* coupons */
  for (const c of coupons) {
    const { id, ...rest } = c;
    await db.collection('coupons').doc(id).set({ ...rest, updatedAt: nowIso }, { merge: true });
  }
  console.log('  ✓ coupons:', coupons.length);

  /* users + everything tied to them */
  let users = [];
  if (!SKIP_USERS) {
    users = await ensureUsers(db, auth);
    console.log('  ✓ users (Auth + profiles):', users.length);
  }

  const reviews = await seedReviews(db, productList, users);
  console.log('  ✓ reviews:', reviews);

  const { docs: orderDocs, tally } = buildOrders(productList, users);
  const orders = await bulkSet(db, 'orders', orderDocs, nowIso);
  console.log('  ✓ orders:', orders, '(doc ids = order numbers)');

  /* reflect order activity on user profiles (dashboard consistency) */
  if (users.length) {
    for (const uid of Object.keys(tally)) {
      await db.collection('users').doc(uid).set(
        { ordersCount: tally[uid].count, totalSpent: tally[uid].spend, updatedAt: nowIso },
        { merge: true }
      );
    }
    console.log('  ✓ user spend tallies:', Object.keys(tally).length);
  }

  if (users.length) {
    await bulkSet(db, 'wishlists', buildWishlists(productList, users), nowIso);
    console.log('  ✓ wishlists seeded');
    await bulkSet(db, 'carts', buildCarts(productList, users), nowIso);
    console.log('  ✓ carts seeded');
  }

  await bulkSet(db, 'newsletter', seedNewsletter(), nowIso);
  console.log('  ✓ newsletter');

  console.log('\nDone.');
  console.log('Catalogue: ' + productCount + ' products (25 curated + ' + MOCK_PRODUCT_COUNT + ' mock), ' +
    (users.length ? users.length + ' demo users' : 'users skipped') + '.');
  console.log('Demo coupons: WELCOME10, SAVE20, FREESHIP, VIP50');
  if (!SKIP_USERS) {
    console.log('Demo customers: amelia@example.com / james@example.com / priya@example.com');
    console.log('Bulk dev users: user004@trendaryo.dev … (password Demo1234!)');
  }
  console.log('\nREMEMBER: mock products/users/orders are DEVELOPMENT DATA. Purge before launch:');
  console.log('  node --env-file=.env scripts/purge-mock.js');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});