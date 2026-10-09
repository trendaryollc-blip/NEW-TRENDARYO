const { initFirebase } = require('../_lib/firebase');
const { syncTracking } = require('../admin/supplier-sync');
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
    const out = await syncTracking(db);
    const failures = (out.results || []).filter((r) => r.error).length;
    await beat(db, 'cron:supplier-sync', {
      status: failures ? 'degraded' : 'ok',
      detail: (out.updated || 0) + ' updated, ' + failures + ' failed',
      durationMs: Date.now() - started,
    });
    res.status(200).json({ ok: true, ...out });
  } catch (e) {
    try {
      const { db } = initFirebase();
      await beat(db, 'cron:supplier-sync', { status: 'error', detail: e.message, durationMs: Date.now() - started });
    } catch (ignored) { /* ignore */ }
    res.status(500).json({ error: { message: e.message } });
  }
};
