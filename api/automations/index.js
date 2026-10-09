const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAdmin } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');
const { listRules, runRule, runAll } = require('../_lib/automations');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 30)) return res.status(429).json({ error: { message: 'Too many requests' } });

  try {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;

    const { db } = initFirebase();

    /* GET - the rule list with recent activity, exactly what the dashboard renders. */
    if (req.method === 'GET') {
      const [rules, runsSnap, alertsSnap] = await Promise.all([
        listRules(db),
        db.collection('automation_runs').orderBy('createdAt', 'desc').limit(20).get(),
        db.collection('automation_alerts').where('resolved', '==', false).limit(50).get(),
      ]);
      return res.status(200).json({
        data: {
          rules,
          runs: runsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
          alerts: alertsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        },
      });
    }
    /* POST - run one rule ({ rule, dryRun }) or every enabled rule ({ all: true }). */
    if (req.method === 'POST') {
      const body = req.body || {};
      const dryRun = !!body.dryRun;

      if (body.all) {
        const runs = await runAll(db, { trigger: 'manual', dryRun });
        return res.status(200).json({ data: { runs } });
      }

      const key = String(body.rule || '');
      const record = await runRule(db, key, { trigger: dryRun ? 'dry' : 'manual', dryRun });
      return res.status(200).json({ data: record });
    }

    return res.status(405).json({ error: { message: 'Method not allowed' } });
  } catch (error) {
    const status = /Unknown automation|paused/.test(error.message) ? 400 : 500;
    console.error('Automations error:', error);
    res.status(status).json({ error: { message: error.message } });
  }
};
