const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

let db;
let auth;

function initFirebase() {
  if (db) return { db, auth };

  let projectId = process.env.FIREBASE_PROJECT_ID;
  let clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  // FIREBASE_SERVICE_ACCOUNT_KEY (single-line JSON) is the most
  // copy/paste-safe format, so prefer it when it present and valid. The
  // split FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY
  // vars are only used as a fallback because their multi-line private key
  // value is easy to mangle in env dashboards.
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      if (sa.project_id && sa.client_email && sa.private_key) {
        projectId = sa.project_id;
        clientEmail = sa.client_email;
        privateKey = sa.private_key;
      }
    } catch (e) { /* fall through to split vars */ }
  }

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing Firebase credentials in environment variables');
  }

  const cert =
    admin.credential && admin.credential.cert ? admin.credential.cert : admin.cert;

  if (!admin.apps || !admin.apps.length) {
    admin.initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
    });
  }

  db = getFirestore();
  auth = getAuth();
  return { db, auth };
}

module.exports = { initFirebase, admin };
