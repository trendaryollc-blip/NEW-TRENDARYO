const { initFirebase } = require('../_lib/firebase');
const { runAll } = require('../_lib/automations');

module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  if (secret && auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }
  try {
    const { db } = initFirebase();
    const runs = await runAll(db, { trigger: 'cron' });
    res.status(200).json({ ok: true, runs: runs.length, data: runs });
  } catch (e) {
    console.error('Automation cron error:', e);
    res.status(500).json({ error: { message: e.message } });
  }
};
