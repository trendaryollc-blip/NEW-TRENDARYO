const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { applyRateLimit } = require('../_lib/security');
const { createHash } = require('crypto');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const COL = 'stock_waitlist';

function waitId(productId, email) {
  return createHash('sha256').update(productId + ':' + email).digest('hex').slice(0, 40);
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 20)) return res.status(429).json({ error: { message: 'Too many requests' } });

  try {
    const { db } = initFirebase();

    if (req.method === 'POST') {
      const { productId, email } = req.body || {};
      const pid = String(productId || '').trim();
      const mail = String(email || '').trim().toLowerCase();

      if (!pid) return res.status(400).json({ error: { message: 'Product is required' } });
      if (!EMAIL_RE.test(mail)) return res.status(400).json({ error: { message: 'A valid email is required' } });

      const prodSnap = await db.collection('products').doc(pid).get();
      if (!prodSnap.exists) return res.status(404).json({ error: { message: 'Product not found' } });
      const product = prodSnap.data();
      if (product.status && product.status !== 'active') {
        return res.status(409).json({ error: { message: 'This product is not available' } });
      }

      const id = waitId(pid, mail);
      const ref = db.collection(COL).doc(id);
      const existing = await ref.get();
      const now = new Date().toISOString();
      const already = existing.exists && existing.data().status === 'pending';

      if (!already) {
        await ref.set({
          productId: pid,
          productName: product.name || pid,
          email: mail,
          status: 'pending',
          createdAt: now,
          updatedAt: now,
          joins: (existing.exists ? existing.data().joins || 0 : 0) + 1,
        }, { merge: true });
      }

      return res.status(200).json({ data: { productId: pid, joined: true, already } });
    }

    if (req.method === 'GET') {
      const pid = String(req.query.productId || '').trim();
      if (!pid) return res.status(400).json({ error: { message: 'productId is required' } });
      /* Social proof only - never expose who joined. */
      const snap = await db.collection(COL).where('productId', '==', pid).where('status', '==', 'pending').limit(1000).get();
      return res.status(200).json({ data: { productId: pid, waiting: snap.size } });
    }

    return res.status(405).json({ error: { message: 'Method not allowed' } });
  } catch (error) {
    console.error('Waitlist error:', error);
    return res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
