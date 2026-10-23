const { initFirebase } = require('../../_lib/firebase');
const { requireAdmin } = require('../../_lib/auth');
const { applyRateLimit } = require('../../_lib/security');
const { log: auditLog } = require('../../_lib/audit');
const integrations = require('../../_lib/integrations');

/**
 * Single integration row.
 *   POST   /api/admin/integrations/:id  -> rotate the linking code (new key returned once)
 *   PATCH  /api/admin/integrations/:id  -> update name/scopes/status (activate|revoked)
 *   DELETE /api/admin/integrations/:id  -> revoke the connection
 */
module.exports = async function handler(req, res) {
  if (!applyRateLimit(req, res, 60)) return res.status(429).json({ error: { message: 'Too many requests' } });

  try {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;

    const { db } = initFirebase();
    const id = req.query.id;
    const docRef = db.collection('integrations').doc(String(id || ''));
    const existing = await docRef.get();
    if (!existing.exists) return res.status(404).json({ error: { message: 'Integration not found' } });
    const before = integrations.publicView({ id: existing.id, ...existing.data() });

    if (req.method === 'DELETE') {
      const now = new Date().toISOString();
      await docRef.update({ status: 'revoked', updatedAt: now });
      auditLog(db, {
        actorUid: adminUser.uid || null,
        actorEmail: adminUser.email || null,
        action: 'integration.revoke',
        targetType: 'integration',
        targetId: String(id),
        before: { status: before.status },
        after: { status: 'revoked' },
      });
      return res.status(200).json({ data: { ...before, status: 'revoked' } });
    }

    if (req.method === 'PATCH') {
      const body = req.body || {};
      const patch = {};
      if (body.appName !== undefined) patch.appName = String(body.appName).trim().slice(0, 80);
      if (body.note !== undefined) patch.note = String(body.note).trim().slice(0, 300);
      if (body.scopes !== undefined) {
        const scopes = integrations.normalizeScopes(body.scopes);
        if (!scopes.length) return res.status(400).json({ error: { message: 'Grant at least one scope' } });
        patch.scopes = scopes;
      }
      if (body.status !== undefined) {
        if (['active', 'revoked'].includes(body.status)) patch.status = body.status;
        else return res.status(400).json({ error: { message: 'Invalid status' } });
      }
      if (body.webhookUrl !== undefined) {
        const url = integrations.validWebhookUrl(body.webhookUrl);
        patch.webhookUrl = url || '';
        if (url) patch.webhookSecret = existing.data().webhookSecret || integrations.generateSecret();
        else patch.webhookSecret = '';
      }
      if (!Object.keys(patch).length) return res.status(400).json({ error: { message: 'Nothing to update' } });
      patch.updatedAt = new Date().toISOString();
      await docRef.update(patch);
      const after = await docRef.get();
      return res.status(200).json({ data: integrations.publicView({ id: after.id, ...after.data() }) });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      if (body.action === 'test') {
        /* Fire one sample event at ONLY this connection to verify the webhook. */
        const sample = {
          id: 'sample-order', number: 'TEST-0001', status: 'confirmed', paymentStatus: 'paid',
          email: adminUser.email || '', total: 19.99,
          items: [{ id: 'sample-product', name: 'Webhook test event', qty: 1 }],
          createdAt: new Date().toISOString(),
        };
        if (!integrations.validWebhookUrl(existing.data().webhookUrl)) return res.status(400).json({ error: { message: 'Set a webhook URL first' } });        await integrations.notifyStoreEvent(db, sample, 'order.created', { test: true }, String(id));
        return res.status(200).json({ data: { ok: true, sent: 'order.created' } });
      }

      const code = integrations.generateKey();
      const now = new Date().toISOString();
      await docRef.update({
        keyHash: integrations.hashKey(code),
        keyPreview: integrations.keyPreview(code),
        updatedAt: now,
      });
      auditLog(db, {
        actorUid: adminUser.uid || null,
        actorEmail: adminUser.email || null,
        action: 'integration.rotate',
        targetType: 'integration',
        targetId: String(id),
        before: { keyPreview: before.keyPreview },
        after: { keyPreview: integrations.keyPreview(code) },
      });
      return res.status(200).json({ data: { id: String(id), code, keyPreview: integrations.keyPreview(code) } });
    }

    return res.status(405).json({ error: { message: 'Method not allowed' } });
  } catch (error) {
    console.error('Admin integration [id] error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
