/**
 * Purge all DEVELOPMENT/seed data from Firestore before launch.
 *
 * Only removes documents that scripts/seed-firestore.js marked with
 * `seeded: true`, plus the Firebase Auth accounts the seed created
 * (userNNN@trendaryo.dev and the amelia/james/priya@example.com demo logins).
 * Real users, products, orders and settings added through the admin UI are
 * untouched.
 *
 * Usage:
 *   node --env-file=.env scripts/purge-mock.js --yes      # required confirmation
 *
 * The seed script prints the same command, so running the full dev wipe after
 * testing every feature is a single step:
 *   node --env-file=.env scripts/seed-firestore.js --fresh
 *   node --env-file=.env scripts/purge-mock.js --yes
 */
try { require('dotenv').config(); } catch (e) { /* dotenv optional */ }

const CONFIRM = process.argv.includes('--yes');
if (!CONFIRM) {
  console.error('Refusing to run without confirmation. Add --yes to purge.');
  process.exit(1);
}

const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

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

async function clearSeeded(db, name) {
  let removed = 0;
  let keepGoing = true;
  while (keepGoing) {
    const snap = await db.collection(name).where('seeded', '==', true).limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    removed += snap.size;
    keepGoing = snap.size === 400;
  }
  console.log('  - purged ' + name + ':', removed);
  return removed;
}

async function purgeUsersAndAuth(db, auth) {
  const devEmailRe = /(^user\d+@trendaryo\.dev$)|(@example\.com$)/;

  let userDocs = 0;
  let keepGoing = true;
  while (keepGoing) {
    const snap = await db.collection('users').where('seeded', '==', true).limit(400).get();
    if (snap.empty) break;
    for (const d of snap.docs) {
      if (devEmailRe.test(String(d.data().email || ''))) {
        await d.ref.delete();
        userDocs++;
      }
    }
    keepGoing = snap.size === 400;
  }
  console.log('  - purged dev user profiles:', userDocs);

  let authDeleted = 0;
  let nextToken = undefined;
  do {
    const page = await auth.listUsers(1000, nextToken);
    for (const u of page.users) {
      if (devEmailRe.test(u.email || '')) {
        await auth.deleteUser(u.uid).catch(() => {});
        authDeleted++;
      }
    }
    nextToken = page.pageToken;
  } while (nextToken);
  console.log('  - purged dev Auth accounts:', authDeleted);
}

async function main() {
  initAdmin();
  const db = getFirestore();
  const auth = getAuth();
  console.log('Purging dev seed data from project:', process.env.FIREBASE_PROJECT_ID);

  for (const name of ['products', 'orders', 'reviews', 'wishlists', 'carts', 'newsletter']) {
    await clearSeeded(db, name);
  }
  await purgeUsersAndAuth(db, auth);

  console.log('\nDone. Development data removed. The store is clean for real products.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Purge failed:', err.message);
  process.exit(1);
});