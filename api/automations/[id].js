const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAdmin } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');
const { DEFINITIONS, updateRule, runRule } = require('../_lib/automations');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 30)) return res.status(429).json({ error: { message: 'Too many requests' } });

  const key = String(req.query.id || '');
  const def = DEFINITIONS[key];

  try {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;

    if (!def) return res.status(404).json({ error: { message: 'Unknown automation rule' } });

    const { db } = initFirebase();

    /* GET - rule + its recent runs. */
    if (req.method === 'GET') {
      const doc = await db.collection('automations').doc(key).get();
      const runsSnap = await db.collection('automation_runs')
        .orderBy('createdAt', 'desc')
        .limit(60)
        .get();
      const rule = doc.exists ? doc.data() : {};
      return res.status(200).json({
        data: {
          rule: {
            key,
            name: def.name,
            group: def.group,
            icon: def.icon,
            about: def.about,
            fields: def.fields,
            enabled: !!rule.enabled,
            config: { ...def.defaults, ...(rule.config || {}) },
            stats: rule.stats || {},
          },
          runs: runsSnap.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((run) => run.ruleKey === key)
            .slice(0, 10),
        },
      });
    }

    /* PATCH - toggle and/or retune the rule. */
    if (req.method === 'PATCH' || req.method === 'PUT') {
      const body = req.body || {};
      const update = await updateRule(db, key, {
        enabled: body.enabled,
        config: body.config,
      });
      return res.status(200).json({ data: update });
    }

    /* POST - run the rule now, or dry-run it first. */
    if (req.method === 'POST') {
      const body = req.body || {};
      const dryRun = !!body.dryRun;
      const record = await runRule(db, key, { trigger: dryRun ? 'dry' : 'manual', dryRun });
      return res.status(200).json({ data: record });
    }

    return res.status(405).json({ error: { message: 'Method not allowed' } });
  } catch (error) {
    console.error('Automation rule error:', error);
    res.status(400).json({ error: { message: error.message } });
  }
};
