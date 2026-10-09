'use strict';
const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAdmin } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  const admin = await requireAdmin(req, res);
  if (!admin) return res.status(403).json({ error: { message: 'Admin required' } });
  if (req.method !== 'GET') return res.status(405).json({ error: { message: 'Method not allowed' } });

  try {
    const { db } = initFirebase();
    const { limit, action, actor, cursor } = req.query;
    let q = db.collection('adminLogs').orderBy('createdAt', 'desc').limit(parseInt(limit || '50', 10));
    if (action) q = q.where('action', '==', action);
    if (actor) q = q.where('actorUid', '==', actor);
    const snap = await q.get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return res.status(200).json({ data: items });
  } catch (e) {
    return res.status(500).json({ error: { message: e.message } });
  }
};
