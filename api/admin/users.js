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

    const { db } = initFirebase();

    const { page = 1, limit = 50, status, search } = req.query;

    let query = db.collection('users');
    const snapshot = await query.get();
    let users = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      password: undefined,
    }));

    if (status) users = users.filter(u => u.status === status);
    if (search) {
      const q = search.toLowerCase();
      users = users.filter(u =>
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.firstName && u.firstName.toLowerCase().includes(q)) ||
        (u.lastName && u.lastName.toLowerCase().includes(q))
      );
    }

    users.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });

    const total = users.length;
    const p = parseInt(page);
    const l = parseInt(limit);
    const paginated = users.slice((p - 1) * l, p * l);

    res.status(200).json({
      data: paginated,
      pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) },
    });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
