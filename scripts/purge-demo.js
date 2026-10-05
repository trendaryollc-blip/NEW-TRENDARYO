/**
 * Launch cleanup: remove DEMO data before going live while keeping the catalog.
 *
 * Removes:
 *   - All seeded orders + orphan orders whose owner no longer exists
 *   - Dev/test Auth accounts (userNNN@trendaryo.dev, *@example.com) and their
 *     Firestore user profiles
 *   - Seeded carts and carts owned by removed users
 *
 * Keeps:
 *   - products, categories, coupons, settings, reviews
 *   - The real admin account (admin@trendaryo.com) and any other real users
 *
 * Usage:
 *   node scripts/purge-demo.js          # dry run: prints what WOULD be deleted
 *   node scripts/purge-demo.js --yes    # actually delete
 */
try { require('dotenv').config(); } catch (e) { /* optional */ }

const EXECUTE = process.argv.includes('--yes');
const DEV_EMAIL = /(^user\d+@trendaryo\.dev$)|(@example\.com$)/i;

function initAdmin() {
  const admin = require('firebase-admin');
  const cert = admin.credential && admin.credential.cert ? admin.credential.cert : admin.cert;
  let credential;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    credential = cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY));
  } else {
    credential = cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    });
  }
  admin.initializeApp({ credential });
  return admin;
}

async function deleteDocs(db, refs) {
  let count = 0;
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch();
    refs.slice(i, i + 400).forEach((r) => batch.delete(r));
    await batch.commit();
    count += Math.min(400, refs.length - i);
  }
  return count;
}

async function main() {
  initAdmin();
  const { getFirestore } = require('firebase-admin/firestore');
  const { getAuth } = require('firebase-admin/auth');
  const db = getFirestore();
  const auth = getAuth();

  console.log(`Project: ${process.env.FIREBASE_PROJECT_ID}`);
  console.log(`Mode:    ${EXECUTE ? 'EXECUTE (deleting)' : 'DRY RUN (no changes; add --yes to delete)'}\n`);

  // 1. Inventory users
  const userSnap = await db.collection('users').get();
  const devUids = new Set();
  const devUserRefs = [];
  const realUserIds = new Set();
  userSnap.forEach((d) => {
    const email = String(d.data().email || '');
    if (DEV_EMAIL.test(email)) {
      devUids.add(d.id);
      devUserRefs.push(d.ref);
    } else {
      realUserIds.add(d.id);
    }
  });

  // 2. Orders: seeded ones + orphans (owner deleted) + orders owned by dev users
  const orderSnap = await db.collection('orders').get();
  const orderRefs = [];
  let seededOrders = 0;
  let orphanOrders = 0;
  let devOwnedOrders = 0;
  orderSnap.forEach((d) => {
    const x = d.data();
    const uid = String(x.userId || '');
    if (x.seeded === true) {
      seededOrders++;
    } else if (!uid || !realUserIds.has(uid)) {
      orphanOrders++;
    } else if (devUids.has(uid)) {
      devOwnedOrders++;
    } else {
      return; // real order from a real customer -> keep
    }
    orderRefs.push(d.ref);
  });

  // 3. Carts owned by dev users or missing owners, plus seeded carts
  const cartRefs = [];
  for (const name of ['carts', 'cart']) {
    try {
      const snap = await db.collection(name).get();
      snap.forEach((d) => {
        const x = d.data();
        const uid = String(x.userId || x.uid || '');
        if (x.seeded === true || devUids.has(uid) || (uid && !realUserIds.has(uid))) {
          cartRefs.push(d.ref);
        }
      });
    } catch (e) { /* collection may not exist */ }
  }

  // 4. Dev Auth accounts
  const authDelete = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    page.users.forEach((u) => { if (DEV_EMAIL.test(u.email || '')) authDelete.push({ uid: u.uid, email: u.email }); });
    pageToken = page.pageToken;
  } while (pageToken);

  console.log('WILL DELETE');
  console.log(`  orders:            ${orderRefs.length}  (${seededOrders} seeded, ${orphanOrders} orphaned, ${devOwnedOrders} dev-owned)`);
  console.log(`  dev user profiles: ${devUserRefs.length}`);
  console.log(`  dev Auth accounts: ${authDelete.length}`);
  console.log(`  demo carts:        ${cartRefs.length}`);
  console.log('\nWILL KEEP');
  console.log(`  real users: ${realUserIds.size} (incl. admin)`);
  console.log('  products / categories / coupons / reviews / settings');

  if (!EXECUTE) {
    console.log('\nDry run only. Re-run with --yes to delete.');
    return;
  }

  const o = await deleteDocs(db, orderRefs);
  const u = await deleteDocs(db, devUserRefs);
  const c = await deleteDocs(db, cartRefs);
  let a = 0;
  for (const u of authDelete) {
    await auth.deleteUser(u.uid).catch(() => {});
    a++;
  }

  console.log(`\nDONE. Deleted ${o} orders, ${u} user profiles, ${a} Auth accounts, ${c} carts.`);
}

main().catch((err) => {
  console.error('Purge failed:', err.message);
  process.exit(1);
});
