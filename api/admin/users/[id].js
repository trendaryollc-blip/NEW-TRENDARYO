const { initFirebase } = require('../../_lib/firebase');
const { getAuth } = require('firebase-admin/auth');
const { handleCors } = require('../../_lib/cors');
const { requireAdmin } = require('../../_lib/auth');
const { applyRateLimit } = require('../../_lib/security');

const ALLOWED_ROLES = ['user', 'admin', 'staff'];
const ALLOWED_STATUS = ['active', 'suspended', 'banned'];

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 30)) return res.status(429).json({ error: { message: 'Too many requests' } });

  const { id } = req.query;

  try {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;

    const { db } = initFirebase();
    const userRef = db.collection('users').doc(id);
    const doc = await userRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: { message: 'User not found' } });
    }

    if (req.method === 'GET') {
      return res.status(200).json({ data: { id, ...doc.data() } });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const { role, status, firstName, lastName, phone, note } = req.body || {};
      const update = { updatedAt: new Date().toISOString() };

      if (role !== undefined) {
        if (!ALLOWED_ROLES.includes(role)) {
          return res.status(400).json({ error: { message: 'Invalid role' } });
        }
        if (id === adminUser.uid && role !== 'admin') {
          return res.status(400).json({ error: { message: 'You cannot remove your own admin role' } });
        }
        update.role = role;
      }
      if (status !== undefined) {
        if (!ALLOWED_STATUS.includes(status)) {
          return res.status(400).json({ error: { message: 'Invalid status' } });
        }
        if (id === adminUser.uid && status !== 'active') {
          return res.status(400).json({ error: { message: 'You cannot suspend your own account' } });
        }
        update.status = status;
      }
      if (firstName !== undefined) update.firstName = firstName;
      if (lastName !== undefined) update.lastName = lastName;
      if (phone !== undefined) update.phone = phone;
      if (note !== undefined) update.note = note;

      await userRef.set(update, { merge: true });

      if (update.status === 'suspended' || update.status === 'banned') {
        try {
          await getAuth().updateUser(id, { disabled: true });
        } catch (e) {
          console.warn('Could not disable auth user', id, e.message);
        }
      } else if (update.status === 'active') {
        try {
          await getAuth().updateUser(id, { disabled: false });
        } catch (e) {
          console.warn('Could not enable auth user', id, e.message);
        }
      }

      const updated = await userRef.get();
      return res.status(200).json({ data: { id, ...updated.data() } });
    }

    if (req.method === 'DELETE') {
      if (id === adminUser.uid) {
        return res.status(400).json({ error: { message: 'You cannot delete your own account here' } });
      }

      await userRef.delete();
      try {
        await getAuth().deleteUser(id);
      } catch (e) {
        console.warn('Auth user already gone', id, e.message);
      }

      return res.status(200).json({ data: { message: 'User deleted', id } });
    }

    return res.status(405).json({ error: { message: 'Method not allowed' } });
  } catch (error) {
    console.error('Admin user detail error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
