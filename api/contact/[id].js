const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAdmin } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');

const STATUSES = ['new', 'handled'];

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 60)) return res.status(429).json({ error: { message: 'Too many requests' } });

  if (req.method !== 'PUT') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  try {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;

    const id = String(req.query.id || '').trim();
    if (!id || id.length > 128) {
      return res.status(400).json({ error: { message: 'Missing message id' } });
    }

    const status = String((req.body && req.body.status) || '').trim();
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ error: { message: 'Status must be new or handled' } });
    }

    const { db } = initFirebase();
    const ref = db.collection('contact_messages').doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return res.status(404).json({ error: { message: 'Message not found' } });
    }

    await ref.update({
      status,
      updatedAt: new Date().toISOString(),
      handledBy: status === 'handled' ? (adminUser.email || adminUser.uid) : null,
    });

    return res.status(200).json({ data: { id, status } });
  } catch (error) {
    console.error('Contact update error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
