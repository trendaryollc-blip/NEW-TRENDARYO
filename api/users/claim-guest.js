/**
 * TRENDARYO CLAIM GUEST DATA
 * Migrates a guest's orders, payments, cart and wishlist onto the currently
 * signed-in account. Used when a shopper placed orders as an anonymous user
 * and later signs in (or registers) with an email account.
 *
 * Security: the guestUid is a long random Firebase anonymous UID that the
 * client only knows from its own browser (localStorage). Anonymous accounts
 * are rejected as the *target* of a claim (nothing to merge into), and the
 * endpoint only ever moves data — it never reads it out.
 */
'use strict';

const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAuth } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');

const BATCH_SIZE = 400;

function mergeCartItems(current, incoming) {
  const merged = [];
  const byId = {};
  (current || []).forEach(function (item) {
    const key = String(item.productId);
    if (!byId[key]) {
      byId[key] = merged.length;
      merged.push(Object.assign({}, item));
    } else {
      merged[byId[key]].quantity = (Number(merged[byId[key]].quantity) || 0) + (Number(item.quantity) || 0);
    }
  });
  (incoming || []).forEach(function (item) {
    const key = String(item.productId);
    if (!byId[key]) {
      byId[key] = merged.length;
      merged.push(Object.assign({}, item));
    } else {
      merged[byId[key]].quantity = (Number(merged[byId[key]].quantity) || 0) + (Number(item.quantity) || 0);
    }
  });
  return merged;
}

async function commitBatches(db, ops) {
  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    const chunk = ops.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach(function (op) {
      if (op.type === 'delete') {
        batch.delete(op.ref);
      } else {
        batch.set(op.ref, op.data, op.merge ? { merge: true } : undefined);
      }
    });
    await batch.commit();
  }
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 20)) {
    res.status(429).json({ error: { message: 'Too many requests. Please try again in a moment.' } });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Method not allowed' } });
    return;
  }

  try {
    const user = await requireAuth(req, res);
    if (!user) return;

    if (user.firebase && user.firebase.sign_in_provider === 'anonymous') {
      res.status(403).json({ error: { message: 'Sign in with an email account to claim guest data.' } });
      return;
    }

    const { guestUid } = req.body || {};
    if (typeof guestUid !== 'string' || !/^[A-Za-z0-9_-]{20,128}$/.test(guestUid)) {
      res.status(400).json({ error: { message: 'A valid guestUid is required.' } });
      return;
    }
    if (guestUid === user.uid) {
      res.status(200).json({ data: { claimed: true, orders: 0 } });
      return;
    }

    const { db, auth } = initFirebase();
    const now = new Date().toISOString();
    const ops = [];
    let orderCount = 0;

    const ordersSnap = await db.collection('orders')
      .where('userId', '==', guestUid)
      .limit(500)
      .get();
    ordersSnap.docs.forEach(function (doc) {
      ops.push({ ref: doc.ref, data: { userId: user.uid, updatedAt: now } });
      orderCount += 1;
    });

    const paymentsSnap = await db.collection('payments')
      .where('userId', '==', guestUid)
      .limit(500)
      .get();
    paymentsSnap.docs.forEach(function (doc) {
      ops.push({ ref: doc.ref, data: { userId: user.uid, updatedAt: now } });
    });

    const guestCartRef = db.collection('carts').doc(guestUid);
    const userCartRef = db.collection('carts').doc(user.uid);
    const [guestCartSnap, userCartSnap] = await Promise.all([guestCartRef.get(), userCartRef.get()]);

    if (guestCartSnap.exists && Array.isArray(guestCartSnap.data().items)) {
      const currentItems = (userCartSnap.exists && Array.isArray(userCartSnap.data().items))
        ? userCartSnap.data().items
        : [];
      const merged = mergeCartItems(currentItems, guestCartSnap.data().items);
      ops.push({ ref: userCartRef, data: { items: merged, updatedAt: now } });
      ops.push({ ref: guestCartRef, type: 'delete', data: {} });
    }

    const guestWishlistRef = db.collection('wishlists').doc(guestUid);
    const userWishlistRef = db.collection('wishlists').doc(user.uid);
    const [guestWishSnap, userWishSnap] = await Promise.all([guestWishlistRef.get(), userWishlistRef.get()]);

    const guestWish = guestWishSnap.exists ? guestWishSnap.data().items || [] : [];
    if (Array.isArray(guestWish) && guestWish.length) {
      const userWish = (userWishSnap.exists && Array.isArray(userWishSnap.data().items))
        ? userWishSnap.data().items
        : [];
      const mergedWish = Array.from(new Set(userWish.concat(guestWish)));
      ops.push({ ref: userWishlistRef, data: { items: mergedWish, updatedAt: now } });
      ops.push({ ref: guestWishlistRef, data: { items: [] } });
    }

    if (ops.length) await commitBatches(db, ops);

    await db.collection('users').doc(guestUid).delete().catch(function () { /* not present */ });
    await auth.deleteUser(guestUid).catch(function () { /* already gone */ });

    res.status(200).json({ data: { claimed: true, orders: orderCount } });
  } catch (error) {
    console.error('[claim-guest] Error:', error);
    res.status(500).json({ error: { message: 'Could not claim guest data. Please try again.' } });
  }
};