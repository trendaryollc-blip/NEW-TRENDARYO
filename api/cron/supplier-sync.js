const { initFirebase } = require('../_lib/firebase');
const { syncTracking } = require('../admin/supplier-sync');

module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  if (secret && auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }
  try {
    const { db } = initFirebase();
    const out = await syncTracking(db);
    res.status(200).json({ ok: true, ...out });
  } catch (e) {
    res.status(500).json({ error: { message: e.message } });
  }
};
