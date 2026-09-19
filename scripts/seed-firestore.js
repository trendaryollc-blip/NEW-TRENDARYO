/**
 * Seed Firestore with the Trendaryo demo catalogue + sample activity.
 *
 * Usage:
 *   node --env-file=.env scripts/seed-firestore.js            # upsert catalogue + samples
 *   node --env-file=.env scripts/seed-firestore.js --fresh    # wipe app collections first
 *   node --env-file=.env scripts/seed-firestore.js --no-users # skip demo customer creation
 *
 * Requires FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY
 * (the same service account the API uses).
 */
try { require('dotenv').config(); } catch (e) { /* dotenv optional */ }

const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { products, categories, coupons, settings, reviewSamples } = require('./data/catalog');

const FRESH = process.argv.includes('--fresh');
const SKIP_USERS = process.argv.includes('--no-users');

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
  snap.docs.forEach((d) => {
    chunk.push(d.ref);
    n++;
  });
  for (let i = 0; i < chunk.length; i += 400) {
    const batch = db.batch();
    chunk.slice(i, i + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
  return n;
}

const DEMO_USERS = [
  { email: 'amelia@example.com', password: 'Demo1234!', firstName: 'Amelia', lastName: 'Stone', city: 'London', country: 'UK' },
  { email: 'james@example.com', password: 'Demo1234!', firstName: 'James', lastName: 'Okafor', city: 'Lagos', country: 'Nigeria' },
  { email: 'priya@example.com', password: 'Demo1234!', firstName: 'Priya', lastName: 'Menon', city: 'Dubai', country: 'UAE' },
];

async function ensureUsers(db, auth) {
  const created = [];
  for (const u of DEMO_USERS) {
    let record;
    try {
      record = await auth.getUserByEmail(u.email);
    } catch (e) {
      record = await auth.createUser({ email: u.email, password: u.password, displayName: u.firstName + ' ' + u.lastName });
      console.log('  + auth user', u.email);
    }
    await db.collection('users').doc(record.uid).set(
      {
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        phone: '',
        role: 'user',
        status: 'active',
        addresses: [{ label: 'Home', city: u.city, country: u.country }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    created.push({ uid: record.uid, ...u });
  }
  return created;
}

async function seedReviews(db, productIds, users) {
  let added = 0;
  for (let i = 0; i < productIds.length; i++) {
    const productId = productIds[i];
    const count = 2 + (i % 3);
    for (let j = 0; j < count; j++) {
      const sample = reviewSamples[(i + j) % reviewSamples.length];
      const user = users.length ? users[(i + j) % users.length] : null;
      await db.collection('reviews').add({
        productId,
        userId: user ? user.uid : 'seed',
        userName: user ? user.firstName + ' ' + user.lastName : 'Trendaryo Customer',
        rating: sample.rating,
        title: sample.title,
        comment: sample.comment,
        status: 'approved',
        helpful: Math.floor(Math.random() * 25),
        createdAt: new Date(Date.now() - (i * 3 + j) * 86400000).toISOString(),
      });
      added++;
    }
  }
  return added;
}

function pickProduct(products, slug) {
  return products.find((p) => p.slug === slug) || products[0];
}

async function seedOrders(db, productList, users) {
  const statuses = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled', 'refunded'];
  const productsBySlug = productList.map((p) => ({ id: p.slug, name: p.name, price: p.price, image: p.image, emoji: p.emoji }));

  let n = 0;
  for (let i = 0; i < 12; i++) {
    const buyer = users.length ? users[i % users.length] : { uid: 'guest-' + i, firstName: 'Guest', lastName: String(i), email: 'guest@example.com', city: 'Muscat', country: 'Oman' };
    const itemCount = 1 + (i % 3);
    const lineItems = [];
    for (let k = 0; k < itemCount; k++) {
      const prod = productsBySlug[(i + k * 3) % productsBySlug.length];
      const quantity = 1 + ((i + k) % 3);
      lineItems.push({
        productId: prod.id,
        name: prod.name,
        price: prod.price,
        quantity,
        image: prod.image || '',
        emoji: prod.emoji || '',
        lineTotal: round2(prod.price * quantity),
      });
    }
    const totals = computeTotals(lineItems);
    const status = statuses[i % statuses.length];
    const paid = !['pending', 'cancelled'].includes(status);
    const createdAt = new Date(Date.now() - i * 2.4 * 86400000).toISOString();

    await db.collection('orders').add({
      userId: buyer.uid,
      orderNumber: 'TRD-SEED-' + String(1000 + i),
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
      paymentIntentId: i % 4 === 0 ? null : 'pi_seed_' + i,
      subtotal: totals.subtotal,
      discount: 0,
      shipping: totals.shipping,
      tax: totals.tax,
      total: totals.total,
      currency: settings.currency,
      coupon: null,
      status,
      paymentStatus: paid ? 'paid' : 'pending',
      statusHistory: [{ status: 'pending', timestamp: createdAt, note: 'Order placed (seed data)' }],
      createdAt,
      updatedAt: createdAt,
    });
    n++;
  }
  return n;
}

async function seedNewsletter(db) {
  const emails = ['newsletter1@example.com', 'newsletter2@example.com', 'newsletter3@example.com'];
  for (let i = 0; i < emails.length; i++) {
    await db.collection('newsletter').add({
      email: emails[i],
      source: 'seed',
      createdAt: new Date(Date.now() - i * 86400000).toISOString(),
    });
  }
  return emails.length;
}

async function main() {
  initAdmin();
  const db = getFirestore();
  const auth = getAuth();

  console.log('Seeding Firestore project:', process.env.FIREBASE_PROJECT_ID);

  if (FRESH) {
    for (const name of ['products', 'categories', 'coupons', 'orders', 'reviews', 'newsletter', 'adminLogs']) {
      const removed = await clearCollection(db, name);
      console.log('  - cleared', name, '(' + removed + ')');
    }
  }

  /* settings */
  await db.collection('settings').doc('store').set(
    { ...settings, updatedAt: new Date().toISOString() },
    { merge: true }
  );
  console.log('  ✓ settings/store');

  /* categories */
  for (const c of categories) {
    await db.collection('categories').doc(c.id).set({ ...c, updatedAt: new Date().toISOString() }, { merge: true });
  }
  console.log('  ✓ categories:', categories.length);

  /* products (doc id = slug, idempotent) */
  const nowIso = new Date().toISOString();
  for (const product of products) {
    const { slug, ...rest } = product;
    await db.collection('products').doc(slug).set(
      {
        ...rest,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      { merge: true }
    );
  }
  console.log('  ✓ products:', products.length);

  /* coupons (doc id = code) */
  for (const c of coupons) {
    const { id, ...rest } = c;
    await db.collection('coupons').doc(id).set({ ...rest, updatedAt: nowIso }, { merge: true });
  }
  console.log('  ✓ coupons:', coupons.length);

  /* users + reviews + orders + newsletter */
  let users = [];
  if (!SKIP_USERS) {
    users = await ensureUsers(db, auth);
    console.log('  ✓ demo users:', users.length);
  }

  const productIds = products.map((p) => p.slug);
  const reviews = await seedReviews(db, productIds, users);
  console.log('  ✓ reviews:', reviews);

  const orders = await seedOrders(db, products, users);
  console.log('  ✓ orders:', orders);

  const newsletter = await seedNewsletter(db);
  console.log('  ✓ newsletter:', newsletter);

  console.log('\nDone. Demo coupons: WELCOME10, SAVE20, FREESHIP, VIP50');
  if (!SKIP_USERS) console.log('Demo customers: amelia@example.com / james@example.com / priya@example.com (password Demo1234!)');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
