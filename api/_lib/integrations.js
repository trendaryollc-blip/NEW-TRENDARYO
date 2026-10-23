'use strict';

/**
 * Integration link keys - let external services (Product Hunter, AdCopilot,
 * custom tools) connect to the store with a generated code.
 *
 * The full key is shown exactly once at creation; Firestore stores only a
 * SHA-256 hash, so a database leak never leaks usable credentials.
 */

const crypto = require('crypto');

const KEY_PREFIX = 'trd_';

/* Scope catalogue - every capability an external service can be granted. */
const SCOPES = [
    { key: 'products.read', label: 'Read catalog', desc: 'List published + draft products' },
    { key: 'products.write', label: 'Push products', desc: 'Create/update products (arrive as drafts)' },
    { key: 'orders.read', label: 'Read orders', desc: 'List recent orders and their status' },
    { key: 'fulfillments.write', label: 'Push tracking', desc: 'Add carrier + tracking number to shipped orders' },
];

/* Outbound events this store can push to a connected service's webhook. */
const EVENTS = ['order.created'];

function generateKey() {
    return KEY_PREFIX + crypto.randomBytes(20).toString('hex');
}

function hashKey(code) {
    return crypto.createHash('sha256').update(String(code)).digest('hex');
}

/* Accepts "Authorization: Bearer trd_..." or "x-trendaryo-key: trd_...". */
function extractKey(req) {
    if (!req || !req.headers) return null;
    const auth = String(req.headers.authorization || '');
    if (auth.startsWith('Bearer ')) {
        const token = auth.slice(7).trim();
        if (token) return token;
    }
    const header = req.headers['x-trendaryo-key'];
    if (typeof header === 'string' && header.trim()) return header.trim();
    return null;
}

function keyPreview(code) {
    const s = String(code || '');
    return s.length <= 12 ? s : s.slice(0, 12) + '...' + s.slice(-4);
}

function normalizeScopes(requested) {
    const list = [];
    const req = Array.isArray(requested) ? requested : [];
    for (const r of req) {
        const key = String(r || '').trim();
        if (SCOPES.some(s => s.key === key) && !list.includes(key)) list.push(key);
    }
    return list;
}

function hasScope(integration, scope) {
    return !!(integration && Array.isArray(integration.scopes) && integration.scopes.includes(scope));
}

/**
 * Verify the request's linking code against Firestore and (fire-and-forget)
 * record usage. Resolves to the integration doc { id, ... } or null.
 */
async function authenticate(db, req) {
    const code = extractKey(req);
    if (!code || !code.startsWith(KEY_PREFIX)) return null;

    let snapshot;
    try {
        snapshot = await db.collection('integrations').where('keyHash', '==', hashKey(code)).limit(1).get();
    } catch (e) {
        return null;
    }
    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    const data = doc.data();
    if (data.status !== 'active') return null;

    const { FieldValue } = require('firebase-admin/firestore');
    db.collection('integrations').doc(doc.id).update({
        lastUsedAt: new Date().toISOString(),
        callCount: FieldValue.increment(1),
    }).catch(() => {});

    return { id: doc.id, ...data };
}

function publicView(doc) {
    return {
        id: doc.id,
        appName: doc.appName || 'Unnamed service',
        appId: doc.appId || 'custom',
        note: doc.note || '',
        scopes: doc.scopes || [],
        status: doc.status || 'active',
        keyPreview: doc.keyPreview || '',
        webhookUrl: doc.webhookUrl ? String(doc.webhookUrl).slice(0, 300) : '',
        webhookStatus: doc.webhookStatus || '',
        createdAt: doc.createdAt || null,
        createdBy: doc.createdBy || null,
        lastUsedAt: doc.lastUsedAt || null,
        lastWebhookAt: doc.lastWebhookAt || null,
        callCount: doc.callCount || 0,
        webhookFailCount: doc.webhookFailCount || 0,
    };
}

function generateSecret() {
    return 'whsec_' + crypto.randomBytes(16).toString('hex');
}

/* SFShopify-style signed webhook header: "t=<unix>,v1=<hmac-sha256 hex>". */
function signWebhook(secret, body, timestamp) {
    const ts = timestamp || Math.floor(Date.now() / 1000);
    const mac = crypto.createHmac('sha256', String(secret)).update(ts + '.' + String(body)).digest('hex');
    return 't=' + ts + ',v1=' + mac;
}

function validWebhookUrl(url) {
    if (!url) return '';
    const s = String(url).trim().slice(0, 300);
    return /^https:\/\//.test(s) ? s : '';
}

/**
 * Push a store event to every connected service that configured a webhook
 * URL. Signed so the receiver can verify it came from Trendaryo (and, being
 * HMAC-wrapped, that it was not replayed). Never throws.
 */
async function notifyStoreEvent(db, order, event, extra, onlyId) {
    try {
        const name = typeof event === 'string' ? event : String(event || '');
        if (!name) return;
        const snapshot = await db.collection('integrations').where('status', '==', 'active').get();
        if (snapshot.empty) return;

        for (const doc of snapshot.docs) {
            if (onlyId && doc.id !== onlyId) continue;
            const it = doc.data();
            const url = validWebhookUrl(it.webhookUrl);
            if (!url || (Array.isArray(it.webhookEvents) && !it.webhookEvents.includes(name))) continue;
            /* Body is per-connection so the receiver knows exactly which store
               connection produced the push (several stores can share one URL). */
            const body = JSON.stringify({
                event: name,
                store: 'Trendaryo',
                service: it.appName || '',
                serviceId: doc.id,
                sentAt: new Date().toISOString(),
                order: {
                    id: order.id || null,
                    number: order.number || order.orderNumber || '',
                    status: order.status || 'confirmed',
                    paymentStatus: order.paymentStatus || '',
                    email: order.email || '',
                    total: order.total || 0,
                    items: (order.items || []).map(it => ({ id: it.productId || it.id || '', name: it.name || '', qty: it.qty || it.quantity || 0 })),
                    createdAt: order.createdAt || null,
                },
                extra: extra || null,
            });
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'Trendaryo-Integrations/1.0',
                        'X-Trendaryo-Event': name,
                        'X-Trendaryo-Signature': signWebhook(it.webhookSecret || '', body),
                    },
                    body,
                    signal: AbortSignal.timeout(8000),
                });
                db.collection('integrations').doc(doc.id).update({
                    lastWebhookAt: new Date().toISOString(),
                    webhookStatus: res.ok ? 'delivered' : 'failed',
                }).catch(() => {});
            } catch (e) {
                console.error('[integrations] webhook delivery failed for', doc.id, e.message);
                db.collection('integrations').doc(doc.id).update({
                    lastWebhookAt: new Date().toISOString(),
                    webhookStatus: 'failed',
                    webhookFailCount: (it.webhookFailCount || 0) + 1,
                }).catch(() => {});
            }
        }
    } catch (e) {
        console.error('[integrations] notifyStoreEvent failed:', e.message);
    }
}

/* The endpoints a connected service calls, relative to the store root. */
const ENDPOINTS = {
    ping: { method: 'GET', path: '/api/integrations/v1/ping', desc: 'Connection health check' },
    pushProducts: { method: 'POST', path: '/api/integrations/v1/products', desc: 'Push products (upsert by SKU)' },
    listProducts: { method: 'GET', path: '/api/integrations/v1/products', desc: 'Read catalog' },
    listOrders: { method: 'GET', path: '/api/integrations/v1/orders', desc: 'Read orders (polling fallback)' },
    pushTracking: { method: 'POST', path: '/api/integrations/v1/tracking', desc: 'Push carrier + tracking number to an order' },
};

module.exports = {
    KEY_PREFIX,
    SCOPES,
    EVENTS,
    ENDPOINTS,
    generateKey,
    generateSecret,
    hashKey,
    extractKey,
    keyPreview,
    normalizeScopes,
    hasScope,
    authenticate,
    publicView,
    signWebhook,
    validWebhookUrl,
    notifyStoreEvent,
};
