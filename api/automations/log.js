const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAdmin } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 30)) return res.status(429).json({ error: { message: 'Too many requests' } });

  try {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;
    if (req.method !== 'GET') return res.status(405).json({ error: { message: 'Method not allowed' } });

    const { db } = initFirebase();
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);

    const [runsSnap, alertsSnap] = await Promise.all([
      db.collection('automation_runs').orderBy('createdAt', 'desc').limit(limit).get(),
      db.collection('automation_alerts').orderBy('lastAlertedAt', 'desc').limit(100).get(),
    ]);

    res.status(200).json({
      data: {
        runs: runsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        alerts: alertsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((a) => !a.resolved),
      },
    });
  } catch (error) {
    console.error('Automation log error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
