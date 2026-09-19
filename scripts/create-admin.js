/**
 * Create (or promote) the first Trendaryo administrator.
 *
 * Usage:
 *   node --env-file=.env scripts/create-admin.js --email you@trendaryo.com --password "StrongPass123!"
 *   node --env-file=.env scripts/create-admin.js --email you@trendaryo.com --password "..." --name "Store Owner"
 *   node --env-file=.env scripts/create-admin.js --email existing@trendaryo.com            # promote existing account
 *
 * Requires the same Firebase service-account env vars as the API.
 */
try { require('dotenv').config(); } catch (e) { /* dotenv optional */ }

const crypto = require('crypto');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

function arg(name) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

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

async function main() {
  initAdmin();
  const db = getFirestore();
  const auth = getAuth();

  const email = (arg('email') || process.env.ADMIN_EMAIL || 'admin@trendaryo.com').trim().toLowerCase();
  let password = arg('password') || process.env.ADMIN_PASSWORD;
  const name = arg('name') || process.env.ADMIN_NAME || 'Store Owner';
  const [firstName, ...rest] = name.split(' ');
  const lastName = rest.join(' ');

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid --email');

  let record;
  let created = false;

  try {
    record = await auth.getUserByEmail(email);
    console.log('Found existing auth user:', email);
  } catch (e) {
    if (!password) {
      password = 'Trd-' + crypto.randomBytes(6).toString('base64url') + '!';
      console.log('No --password supplied, generated one.');
    }
    if (password.length < 8) throw new Error('Password must be at least 8 characters');
    record = await auth.createUser({ email, password, displayName: name });
    created = true;
    console.log('Created auth user:', email);
  }

  await db.collection('users').doc(record.uid).set(
    {
      firstName: firstName || 'Store',
      lastName: lastName || 'Owner',
      email,
      role: 'admin',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  console.log('\n✓ Admin ready');
  console.log('  UID   :', record.uid);
  console.log('  Email :', email);
  if (created) console.log('  Password:', password);
  console.log('\nSign in at /admin-login.html and the server will verify the admin role.');
  process.exit(0);
}

main().catch((err) => {
  console.error('create-admin failed:', err.message);
  process.exit(1);
});
