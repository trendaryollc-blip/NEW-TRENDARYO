const { FieldValue } = require('firebase-admin/firestore');
const { initFirebase } = require('../../_lib/firebase');
const { applyRateLimit } = require('../../_lib/security');
const integrations = require('../../_lib/integrations');

/**
 * External service endpoint: catalog bridge.
 *   GET  /api/integrations/v1/products   (scope products.read)
 *   POST /api/integrations/v1/products   (scope products.write)
 *
 * Pushed products always land as status:'draft' - a human publishes them
 * from the admin Products page. Upsert is keyed on SKU, so a service can
 * push the same product again to refresh price/stock without duplicating.
 */
const MAX_BATCH = 50;

const ALLOWED_PUSH_FIELDS = ['name', 'description', 'price', 'originalPrice', 'category', 'brand', 'stock',
  'image', 'images', 'features', 'sku'];

module.exports = async function handler(req, res) {
  if (!applyRateLimit(req, res, 120)) return res.status(429).json({ error: { message: 'Too many requests' } });

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  try {
    const { db } = initFirebase();
    const integration = await authenticate(db, req);
    if (!integration) return res.status(401).json({ error: { message: 'Invalid or revoked linking code' } });

    if (req.method === 'GET') {
      if (!integrations.hasScope(integration, 'products.read')) {
        return res.status(403).json({ error: { message: 'Missing scope: products.read' } });
      }

      let query = db.collection('products');
      if (req.query.status) query = query.where('status', '==', String(req.query.status).slice(0, 20));
      const snapshot = await query.limit(Math.min(parseInt(req.query.limit) || 100, 100)).get();
      const rows = snapshot.docs.map(d => {
        const p = { id: d.id, ...d.data() };
        return {
          id: p.id, name: p.name, sku: p.sku || '', price: p.price, originalPrice: p.originalPrice || null,
          stock: p.stock != null ? p.stock : null, status: p.status || 'active',
          category: p.category || '', brand: p.brand || '', image: p.image || '', updatedAt: p.updatedAt || null,
        };
      });
      return res.status(200).json({ data: rows });
    }

    if (!integrations.hasScope(integration, 'products.write')) {
      return res.status(403).json({ error: { message: 'Missing scope: products.write' } });
    }

    const incoming = Array.isArray(req.body && req.body.products) ? req.body.products : [];
    if (!incoming.length) return res.status(400).json({ error: { message: 'Send products: [ ... ] with at least one item (name + price required)' } });
    if (incoming.length > MAX_BATCH) return res.status(413).json({ error: { message: 'Maximum ' + MAX_BATCH + ' products per push' } });

    const results = [];
    for (const raw of incoming) {
      const item = raw || {};
      const name = String(item.name || '').trim().slice(0, 200);
      const price = item.price === undefined || item.price === null || item.price === ''
        ? null : parseFloat(item.price);
      if (!name || price === null || !isFinite(price) || price < 0) {
        results.push({ name, sku: item.sku || '', ok: false, error: 'name and a non-negative price are required' });
        continue;
      }

      const sku = String(item.sku || '').trim().slice(0, 60);
      const images = Array.isArray(item.images) ? item.images.slice(0, 8).map(String) : [];
      if (item.image && !images.includes(String(item.image))) images.unshift(String(item.image));

      const payload = {};
      for (const f of ALLOWED_PUSH_FIELDS) {
        if (item[f] === undefined) continue;
        if (f === 'price') payload[f] = price;
        else if (f === 'stock') payload[f] = parseInt(item[f]) || 0;
        else if (f === 'originalPrice') payload[f] = item[f] ? parseFloat(item[f]) || null : null;
        else if (f === 'name') payload[f] = name;
        else if (f === 'sku') payload[f] = sku;
        else payload[f] = item[f];
      }

      let existing = null;
      if (sku) {
        const match = await db.collection('products').where('sku', '==', sku).limit(1).get();
        if (!match.empty) existing = match.docs[0];
      }

      if (existing) {
        const now = new Date().toISOString();
        await existing.ref.update({
          ...payload,
          updatedAt: now,
          pushedBy: integration.appName,
          pushedAt: now,
        });
        results.push({ id: existing.id, sku, name, action: 'updated', ok: true });
      } else {
        const doc = await db.collection('products').add({
          ...payload,
          status: 'draft',
          source: 'integration',
          sourceApp: integration.appName,
          rating: 0,
          reviewCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        results.push({ id: doc.id, sku, name, action: 'created', ok: true });
      }
    }

    await db.collection('integrations').doc(integration.id).update({
      pushedCount: FieldValue.increment(results.filter(r => r.ok).length),
      lastPushedAt: new Date().toISOString(),
    }).catch(() => {});

    const created = results.filter(r => r.action === 'created').length;
    const updated = results.filter(r => r.action === 'updated').length;
    const failed = results.filter(r => !r.ok).length;
    return res.status(200).json({ data: { created, updated, failed, items: results } });
  } catch (error) {
    console.error('Integration products error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
