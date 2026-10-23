const { initFirebase } = require('../_lib/firebase');
const { requireAdmin } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');
const { log: auditLog } = require('../_lib/audit');
const integrations = require('../_lib/integrations');

/**
 * Admin integrations registry.
 *   GET  /api/admin/integrations      -> list (full key never returned)
 *   POST /api/admin/integrations      -> create + return the key ONCE
 */
module.exports = async function handler(req, res) {
  if (!applyRateLimit(req, res, 60)) return res.status(429).json({ error: { message: 'Too many requests' } });

  try {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;

    const { db } = initFirebase();

    if (req.method === 'GET') {
      const snapshot = await db.collection('integrations').orderBy('createdAt', 'desc').get();
      const rows = snapshot.docs.map(d => {
        const data = d.data();
        const row = integrations.publicView({ id: d.id, ...data });
        row.webhookSecret = data.webhookSecret || '';
        return row;
      });
      return res.status(200).json({ data: rows, scopes: integrations.SCOPES, endpoints: integrations.ENDPOINTS, events: integrations.EVENTS });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const appName = String(body.appName || '').trim().slice(0, 80);
      if (!appName) return res.status(400).json({ error: { message: 'Service name is required' } });

      const scopes = integrations.normalizeScopes(body.scopes);
      if (!scopes.length) return res.status(400).json({ error: { message: 'Grant at least one scope' } });

      const webhookUrl = integrations.validWebhookUrl(body.webhookUrl);
      const webhookSecret = webhookUrl ? integrations.generateSecret() : '';

      const code = integrations.generateKey();
      const now = new Date().toISOString();

      const doc = await db.collection('integrations').add({
        appName,
        appId: String(body.appId || 'custom').trim().slice(0, 40) || 'custom',
        note: String(body.note || '').trim().slice(0, 300),
        scopes,
        status: 'active',
        keyHash: integrations.hashKey(code),
        keyPreview: integrations.keyPreview(code),
        webhookUrl: webhookUrl || '',
        webhookSecret,
        webhookEvents: integrations.EVENTS,
        webhookStatus: '',
        webhookFailCount: 0,
        callCount: 0,
        createdAt: now,
        createdBy: adminUser.email || adminUser.uid || null,
        updatedAt: now,
      });

      auditLog(db, {
        actorUid: adminUser.uid || null,
        actorEmail: adminUser.email || null,
        action: 'integration.create',
        targetType: 'integration',
        targetId: doc.id,
        after: { appName, scopes },
        ip: req.headers['x-forwarded-for'] || null,
      });

      return res.status(201).json({
        data: {
          id: doc.id,
          code,
          keyPreview: integrations.keyPreview(code),
          appName,
          appId: body.appId || 'custom',
          scopes,
          webhookUrl,
          webhookSecret,
          statuses: integrations.ENDPOINTS,
        },
      });
    }

    return res.status(405).json({ error: { message: 'Method not allowed' } });
  } catch (error) {
    console.error('Admin integrations error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
