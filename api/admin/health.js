const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAdmin } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');
const { readAll, statusOf } = require('../_lib/health');

/* Ops health detail for the admin System panel. Read-only. */
module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 30)) return res.status(429).json({ error: { message: 'Too many requests' } });
  if (req.method !== 'GET') return res.status(405).json({ error: { message: 'Method not allowed' } });

  try {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;

    const { db } = initFirebase();
    const staleMinutes = 90;
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;

    const probes = (await readAll(db)).map((p) => ({
      key: p.key || p.id,
      lastRunAt: p.lastRunAt || null,
      lastStatus: p.lastStatus || null,
      detail: p.detail || null,
      durationMs: p.durationMs || null,
      okStreak: p.okStreak || 0,
      failStreak: p.failStreak || 0,
      state: statusOf(p, staleMinutes),
    }));

    let openAlerts = 0;
    let failedWebhooks = 0;
    let attentionOrders = 0;
    try {
      const [a, w, o] = await Promise.all([
        db.collection('automation_alerts').where('resolved', '==', false).limit(100).get(),
        db.collection('stripe_events').where('status', '==', 'failed').limit(100).get(),
        db.collection('orders').where('needsAttention', '==', true).limit(100).get(),
      ]);
      openAlerts = a.size;
      failedWebhooks = w.docs.filter((d) => {
        const at = d.data().receivedAt ? new Date(d.data().receivedAt).getTime() : 0;
        return !at || at >= dayAgo;
      }).length;
      attentionOrders = o.size;
    } catch (e) {
      console.error('[admin/health:counts]', e.message);
    }

    const overall = probes.some((p) => p.state === 'error' || p.state === 'missing')
      ? 'error'
      : probes.some((p) => p.state === 'stale') || openAlerts || attentionOrders
        ? 'degraded'
        : 'ok';

    return res.status(200).json({
      data: {
        overall,
        staleMinutes,
        probes,
        counts: { openAlerts, failedWebhooks, attentionOrders },
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Admin health error:', error);
    return res.status(500).json({ error: { message: error.message } });
  }
};
