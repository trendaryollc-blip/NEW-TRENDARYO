const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

let db;
let auth;

function initFirebase() {
  if (db) return { db, auth };

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

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
