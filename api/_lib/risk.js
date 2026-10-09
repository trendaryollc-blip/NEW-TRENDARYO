'use strict';

/* Fraud / velocity scoring for new orders.  Ships INERT: riskEnabled defaults
   to false, so every rule short-circuits until an admin flips it on. */

function num(v, fallback, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

async function scoreOrder(db, { userId, email, addressFingerprint, total, isCod, now }) {
  const settings = await db.collection('settings').doc('store').get().catch(() => null);
  const cfg = settings && settings.exists ? settings.data() : {};
  if (cfg.riskEnabled !== true) return { score: 0, flags: [], enabled: false };

  const threshold = num(cfg.riskReviewThreshold, 50, 1, 100);
  const maxValue = num(cfg.riskMaxOrderValue, 1000, 1, 100000);
  const nowMs = now ? new Date(now).getTime() : Date.now();
  const flags = [];
  let score = 0;

  const since = (ms) => new Date(nowMs - ms).toISOString();

  try {
    const orders = db.collection('orders');
    if (userId) {
      const q = await orders.where('userId', '==', userId).where('createdAt', '>=', since(86400000)).limit(50).get();
      const count = q.size;
      if (count >= 3) { score += 30; flags.push('user_orders_24h:' + count); }
    }
    if (addressFingerprint) {
      const q = await orders.where('addressFingerprint', '==', addressFingerprint).where('createdAt', '>=', since(86400000)).limit(50).get();
      const count = q.size;
      if (count >= 3) { score += 30; flags.push('address_orders_24h:' + count); }
    }
  } catch (e) {
    flags.push('velocity_scan_failed');
  }

  if (Number(total) > maxValue) { score += 20; flags.push('high_value:' + Math.round(Number(total))); }
  if (isCod && Number(total) > maxValue / 2) { score += 15; flags.push('cod_high_value:' + Math.round(Number(total))); }

  return { score, flags, threshold, enabled: true, review: score >= threshold, at: new Date(nowMs).toISOString() };
}

module.exports = { scoreOrder };
