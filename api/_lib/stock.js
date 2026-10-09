'use strict';
const { FieldValue } = require('firebase-admin/firestore');

function idempotentKey(productId, reason, orderId) {
  return productId + ':' + reason + ':' + (orderId || 'manual');
}

async function move(db, { productId, delta, reason, orderId, actorUid, note }) {
  const col = db.collection('inventory_movements');
  const key = idempotentKey(productId, reason, orderId || 'manual');
  const ref = col.doc(key);
  const ex = await ref.get();
  if (ex.exists) return ex.data();
  const pRef = db.collection('products').doc(productId);
  const pSnap = await pRef.get();
  if (!pSnap.exists) throw new Error('product_not_found');
  const stock = (pSnap.data().stock || 0) + delta;
  if (stock < 0) throw new Error('negative_stock');
  await pRef.update({ stock, lastMovementAt: new Date().toISOString() });
  const rec = {
    productId,
    delta,
    reason,
    orderId: orderId || null,
    actorUid: actorUid || null,
    stockAfter: stock,
    note: note || null,
    createdAt: new Date().toISOString(),
  };
  await ref.set(rec);
  return rec;
}

async function restockForOrder(db, order, reason, actorUid) {
  const items = Array.isArray(order.items) ? order.items : [];
  const out = [];
  for (const it of items) {
    const pid = it.productId || it.id;
    const qty = it.quantity || 0;
    if (!pid || qty <= 0) continue;
    out.push(await move(db, { productId: pid, delta: qty, reason, orderId: order.id, actorUid }));
  }
  return out;
}

async function movementCount(db, productId, sinceIso) {
  const q = db.collection('inventory_movements').where('productId', '==', productId).where('createdAt', '>=', sinceIso).limit(1000);
  const s = await q.get();
  return s.size;
}

module.exports = { move, restockForOrder, movementCount, idempotentKey };
