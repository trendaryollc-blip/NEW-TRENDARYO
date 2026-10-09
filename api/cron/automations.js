const { initFirebase } = require('../_lib/firebase');
const { runAll } = require('../_lib/automations');
const { beat } = require('../_lib/health');

module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  if (secret && auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }
  const started = Date.now();
  try {
    const { db } = initFirebase();
    const runs = await runAll(db, { trigger: 'cron' });
    const errors = runs.reduce((n, r) => n + ((r.errors && r.errors.length) || 0), 0);
    await beat(db, 'cron:automations', {
      status: errors ? 'degraded' : 'ok',
      detail: runs.length + ' rules, ' + errors + ' entity errors',
      durationMs: Date.now() - started,
    });
    res.status(200).json({ ok: true, runs: runs.length, data: runs });
  } catch (e) {
    console.error('Automation cron error:', e);
    try {
      const { db } = initFirebase();
      await beat(db, 'cron:automations', { status: 'error', detail: e.message, durationMs: Date.now() - started });
    } catch (ignored) { /* health must never mask the failure */ }
    res.status(500).json({ error: { message: e.message } });
  }
};
