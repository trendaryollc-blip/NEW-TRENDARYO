/**
 * TRENDARYO AUTOMATIONS ENGINE
 * ---------------------------------------------------------------------------
 * A small rule engine the admin dashboard drives end-to-end:
 *
 *   - Every built-in rule has one document in Firestore `automations`
 *     (toggle + JSON config). The Automations view in the admin dashboard
 *     reads and writes these, so every knob lives with the admin.
 *   - `runRule` scans the live collections, acts on matching entities with
 *     the Admin SDK, and appends a record to `automation_runs` so the
 *     dashboard can show what happened and when.
 *   - Run triggers: manual ("Run now") and dry-run ("Preview") from the
 *     dashboard, the Vercel cron at /api/cron/automations, and future
 *     event hooks (e.g. the Stripe webhook marking an order paid).
 *
 * Safety model:
 *   - Rules ship DISABLED. Nothing cancels, fulfils, emails or flags
 *     anything until an admin flips the switch on purpose.
 *   - `dryRun` scans and reports matches without writing a single field.
 *   - Every rule documents exactly what it does in `DEFINITIONS[key].about`.
 */
'use strict';

const { FieldValue } = require('firebase-admin/firestore');
const { assertTransition } = require('./order-state');
const { fulfillOrder } = require('../admin/supplier-fulfill');
const { getSettings } = require('./pricing');
const { send, sendToAdmin } = require('./mail');
const { readAll: readHealth, statusOf } = require('./health');
const { effectiveThreshold } = require('./product-ops');
const sla = require('./supplier-sla');

const { isBreached, isOpen, daysOver, resolveDefaultLead } = sla;

/* productId -> leadTimeDays (only products that define one). */
async function productLeadMap(db) {
  const map = {};
  try {
    const snap = await db.collection('products').limit(1000).get();
    snap.docs.forEach((doc) => {
      const lead = Number(doc.data().leadTimeDays);
      if (Number.isFinite(lead) && lead > 0) map[doc.id] = lead;
    });
  } catch (e) {
    console.error('[automations:leadMap]', e.message);
  }
  return map;
}

const RULES = 'automations';
const RUNS = 'automation_runs';
const ALERTS = 'automation_alerts';
const WAITLIST = 'stock_waitlist';

const RUN_HISTORY_CAP = 300;

function nowIso() {
  return new Date().toISOString();
}

function num(value, fallback, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function bool(value, fallback) {
  return value === undefined ? fallback : !!value;
}

/* Probes every healthy deployment should be beating. */
const EXPECTED_PROBES = ['cron:automations', 'cron:supplier-sync', 'cron:reconciliation', 'cron:abandoned-checkout', 'cron:backup', 'stripe-webhook'];

/* One pass over the collections the owner cares about. Read-only. */
async function collectOpsItems(db, cfg) {
  const items = [];
  const maxItems = num(cfg.maxItems, 30, 5, 100);
  const staleMinutes = num(cfg.staleAfterMinutes, 90, 5, 1440);
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;

  try {
    const alerts = await db.collection(ALERTS).where('resolved', '==', false).limit(maxItems).get();
    alerts.docs.forEach((doc) => {
      const a = doc.data();
      items.push({ severity: 'error', label: 'Open alert: ' + (a.type || 'ops'), detail: a.reason || a.name || doc.id });
    });
  } catch (e) { console.error('[digest:alerts]', e.message); }

  try {
    const probes = await readHealth(db);
    const byKey = {};
    probes.forEach((p) => { byKey[p.id] = p; });
    for (const key of EXPECTED_PROBES) {
      const probe = byKey[key];
      const state = statusOf(probe, staleMinutes);
      if (state === 'ok') continue;
      items.push({
        severity: state === 'error' ? 'error' : 'warn',
        label: 'Probe ' + key + ': ' + state,
        detail: probe && probe.lastRunAt ? 'last beat ' + probe.lastRunAt + (probe.detail ? ' - ' + probe.detail : '') : 'never beat',
      });
    }
  } catch (e) { console.error('[digest:probes]', e.message); }

  try {
    const failed = await db.collection('stripe_events').where('status', '==', 'failed').limit(20).get();
    failed.docs.forEach((doc) => {
      const ev = doc.data();
      const at = ev.receivedAt ? new Date(ev.receivedAt).getTime() : 0;
      if (at && at < dayAgo) return;
      items.push({ severity: 'error', label: 'Stripe webhook failed: ' + (ev.type || doc.id), detail: ev.error || 'unknown error' });
    });
  } catch (e) { console.error('[digest:webhooks]', e.message); }

  try {
    const attention = await db.collection('orders').where('needsAttention', '==', true).limit(50).get();
    attention.docs.forEach((doc) => {
      const o = doc.data();
      items.push({ severity: 'warn', label: 'Order needs attention: ' + (o.orderNumber || doc.id), detail: o.attentionReason || o.status || '' });
    });
  } catch (e) { console.error('[digest:orders]', e.message); }

  return items.slice(0, maxItems);
}

/* ==========================================================================
   RULE DEFINITIONS
   Each rule: about / fields (config schema) / defaults / scan / act
   scan(db, cfg)  -> [{ id, ...entity }]  (candidates, cheapest query first)
   act(db, entity, cfg) -> { ok, skipped?, message, error? }
   ========================================================================== */

const DEFINITIONS = {
  'supplier-auto-fulfillment': { on:['order.paid'],
    name: 'Supplier auto-fulfillment',
    group: 'Orders',
    icon: 'truck',
    about: 'Paid CJ-stocked orders are forwarded to your supplier the moment they are created (when CJ auto-fulfil is switched on in Suppliers). This rule is the sweep: anything that slipped through - a failed webhook, an order placed while CJ was down, a manual import - gets retried here on a short delay so a bad payment still has time to fail before goods ship. Nothing is ever sent twice.',
    defaults: { delayMinutes: 15, maxPerRun: 25 },
    fields: [
      { key: 'delayMinutes', label: 'Wait after payment (min)', type: 'number', min: 0, max: 1440, step: 5, help: 'Grace period before an order is sent to the supplier.' },
      { key: 'maxPerRun', label: 'Max orders per run', type: 'number', min: 1, max: 100, step: 1, help: 'Batch cap so a backlog is cleared gradually.' },
    ],
    async scan(db, cfg) {
      const snap = await db.collection('orders')
        .where('paymentStatus', '==', 'paid')
        .orderBy('createdAt', 'asc')
        .limit(200)
        .get();
      const cutoff = Date.now() - (num(cfg.delayMinutes, 15, 0, 1440) * 60000);
      return snap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((o) => !o.cjOrderId)
        .filter((o) => o.autoFulfillSkipped !== true)
        .filter((o) => ['confirmed', 'processing'].includes(o.status))
        .filter((o) => o.autoFulfillOptOut !== true)
        .filter((o) => o.riskLevel !== 'review' && o.riskLevel !== 'disputed')
        .filter((o) => new Date(o.createdAt).getTime() <= cutoff)
        .slice(0, num(cfg.maxPerRun, 25, 1, 100));
    },
    async act(db, order) {
      const out = await fulfillOrder(db, order.id);
      if (out && out.skipped) {
        if (out.cjOrderId) return { ok: true, skipped: true, message: 'Already submitted (CJ ' + out.cjOrderId + ')' };
        return { ok: true, skipped: true, message: out.reason || 'Skipped' };
      }
      return { ok: true, message: 'Submitted to supplier (CJ ' + (out && out.cjOrderId) + ')' };
    },
    /* Orders with no CJ variant ids will never fulfil from a supplier - stop retrying them. */
    async onError(db, order, cfg, err) {
      if (!/No CJ variant IDs/.test(err.message)) return;
      await db.collection('orders').doc(order.id).set({
        autoFulfillSkipped: true,
        autoFulfillSkipReason: 'no supplier variant ids on line items',
        autoFulfillSkippedAt: nowIso(),
      }, { merge: true });
    },
  },

  'unpaid-order-watchdog': {
    name: 'Unpaid order watchdog',
    group: 'Orders',
    icon: 'clock',
    about: 'Card orders still sitting in "pending" long after checkout are abandoned checkouts that hold stock. The watchdog cancels them, frees the stock and keeps the ledger honest. Cash-on-delivery orders are excluded by default because they are meant to start unpaid.',
    defaults: { hours: 48, excludeCod: true, maxScan: 200 },
    fields: [
      { key: 'hours', label: 'Cancel after (hours)', type: 'number', min: 1, max: 336, step: 1, help: 'Unpaid time before an order is cancelled.' },
      { key: 'excludeCod', label: 'Exclude cash-on-delivery', type: 'boolean', help: 'COD orders start unpaid by design - leave this on.' },
    ],
    async scan(db, cfg) {
      const hours = num(cfg.hours, 48, 1, 336);
      const cutoff = Date.now() - hours * 3600000;
      const snap = await db.collection('orders')
        .where('status', '==', 'pending')
        .orderBy('createdAt', 'asc')
        .limit(num(cfg.maxScan, 200, 1, 1000))
        .get();
      return snap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((o) => o.paymentStatus !== 'paid')
        .filter((o) => new Date(o.createdAt).getTime() <= cutoff)
        .filter((o) => !(cfg.excludeCod && o.paymentMethod === 'cod'));
    },
    async act(db, order, cfg) {
      const hours = num(cfg.hours, 48, 1, 336);
      assertTransition(order.status || 'pending', 'cancelled', 'system');
      await db.collection('orders').doc(order.id).update({
        status: 'cancelled',
        cancelReason: 'unpaid',
        statusHistory: FieldValue.arrayUnion({
          status: 'cancelled',
          timestamp: nowIso(),
          note: 'Automation: unpaid order watchdog after ' + hours + 'h',
          actor: 'system',
        }),
        updatedAt: nowIso(),
      });
      try {
        const { restockForOrder } = require('./stock');
        await restockForOrder(db, order, 'cancel', null);
      } catch (e) {
        console.error('[automations:watchdog] restock failed:', e.message);
      }
      return { ok: true, message: 'Cancelled unpaid order ' + (order.orderNumber || order.id) };
    },
  },

  'low-stock-alerts': {
    name: 'Low-stock alerts',
    group: 'Inventory',
    icon: 'warehouse',
    about: 'Watches the live shelf for products at or below their reorder point and raises one alert per product so nothing sells out silently. Threshold precedence: this rule\u2019s override (if set) beats the product\u2019s own reorder point, which beats the store low-stock setting. Alerts are deduplicated for the cooldown window, and a single digest email goes to the store support address.',
    defaults: { threshold: 0, cooldownHours: 24, emailAdmin: true, maxPerRun: 25 },
    fields: [
      { key: 'threshold', label: 'Threshold override', type: 'number', min: 0, max: 999, step: 1, help: '0 = per-product reorder point, falling back to the store low-stock setting.' },
      { key: 'cooldownHours', label: 'Re-alert after (hours)', type: 'number', min: 1, max: 168, step: 1, help: 'Quiet period before the same product alerts again.' },
      { key: 'emailAdmin', label: 'Email the store inbox', type: 'boolean', help: 'One digest per run to supportEmail.' },
      { key: 'maxPerRun', label: 'Max products per run', type: 'number', min: 1, max: 100, step: 1, help: 'Batch cap while clearing a backlog.' },
    ],
    async scan(db, cfg) {
      const [products, store] = await Promise.all([
        db.collection('products').where('status', '==', 'active').orderBy('createdAt', 'desc').limit(400).get(),
        getSettings(db).catch(() => ({})),
      ]);
      return products.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .map((p) => ({ product: p, threshold: effectiveThreshold(p, cfg.threshold, store.lowStock === undefined || store.lowStock === null ? 8 : store.lowStock) }))
        .filter((row) => num(row.product.stock, 0, 0, 1e9) <= row.threshold)
        .slice(0, num(cfg.maxPerRun, 25, 1, 100))
        .map((row) => ({ ...row.product, _threshold: row.threshold }));
    },
    async act(db, product, cfg) {
      const cooldown = num(cfg.cooldownHours, 24, 1, 168);
      const ref = db.collection(ALERTS).doc('low-stock-' + product.id);
      const snap = await ref.get();
      const last = snap.exists ? new Date(snap.data().lastAlertedAt || 0).getTime() : 0;
      if (last && Date.now() - last < cooldown * 3600000) {
        return { ok: true, skipped: true, message: product.name + ' already alerted within cooldown' };
      }
      await ref.set({
        type: 'low-stock',
        ruleKey: 'low-stock-alerts',
        productId: product.id,
        name: product.name || product.id,
        stock: num(product.stock, 0, 0, 1e9),
        threshold: product._threshold,
        resolved: false,
        lastAlertedAt: nowIso(),
        count: (snap.exists ? snap.data().count || 0 : 0) + 1,
      }, { merge: true });
      return { ok: true, message: product.name + ' down to ' + num(product.stock, 0, 0, 1e9) + ' units (threshold ' + num(product._threshold, 0, 0, 1e9) + ')' };
    },
    async after(db, cfg, results) {
      if (!bool(cfg.emailAdmin, true)) return;
      if (!results.length) return;
      const store = await getSettings(db).catch(() => ({}));
      const to = store.supportEmail;
      if (!to) return;
      const lines = results.map((r) => '- ' + r.message).join('\n');
      await send({
        to: String(to).trim(),
        subject: 'Trendaryo low-stock alert (' + results.length + ' product' + (results.length > 1 ? 's' : '') + ')',
        text: 'These products are at or below the low-stock threshold:\n\n' + lines + '\n\nRestock from the Catalog tab in the admin dashboard.',
      }).catch((err) => console.error('[automations:low-stock] email failed:', err.message));
    },
    /* Close alerts whose product is stocked again so the open list stays honest. */
    async sync(db, cfg) {
      const [store, alerts] = await Promise.all([
        getSettings(db).catch(() => ({})),
        db.collection(ALERTS).where('type', '==', 'low-stock').limit(200).get(),
      ]);
      const threshold = num(cfg.threshold, 0, 0, 999) > 0
        ? num(cfg.threshold, 0, 0, 999)
        : num(store.lowStock, 8, 0, 999);
      for (const doc of alerts.docs) {
        if (doc.data().resolved) continue;
        const alert = doc.data();
        const product = await db.collection('products').doc(alert.productId).get();
        const stock = product.exists ? num(product.data().stock, 0, 0, 1e9) : 0;
        if (!product.exists || stock > threshold) {
          await doc.ref.set({ resolved: true, resolvedAt: nowIso(), stock }, { merge: true });
        }
      }
    },
  },

  'stuck-order-escalation': {
    name: 'Stuck order escalation',
    group: 'Support',
    icon: 'flag',
    about: 'Orders parked in "processing" for days usually mean a supplier delay or a missed hand-off. This rule flags them with needsAttention so they surface at the top of the orders board instead of quietly going stale.',
    defaults: { days: 3, maxPerRun: 25 },
    fields: [
      { key: 'days', label: 'Stuck after (days)', type: 'number', min: 1, max: 30, step: 1, help: 'Time in processing before an order is flagged.' },
      { key: 'maxPerRun', label: 'Max orders per run', type: 'number', min: 1, max: 100, step: 1, help: 'Batch cap so flags land gradually.' },
    ],
    async scan(db, cfg) {
      const days = num(cfg.days, 3, 1, 30);
      const cutoff = Date.now() - days * 86400000;
      const snap = await db.collection('orders')
        .where('status', '==', 'processing')
        .orderBy('createdAt', 'asc')
        .limit(num(cfg.maxPerRun, 25, 1, 100) * 4)
        .get();
      return snap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((o) => new Date(o.createdAt).getTime() <= cutoff)
        .filter((o) => o.needsAttention !== true)
        .slice(0, num(cfg.maxPerRun, 25, 1, 100));
    },
    async act(db, order, cfg) {
      const days = num(cfg.days, 3, 1, 30);
      await db.collection('orders').doc(order.id).update({
        needsAttention: true,
        attentionReason: 'stuck ' + days + '+ days in processing',
        attentionAt: nowIso(),
        updatedAt: nowIso(),
      });
      await db.collection(ALERTS).doc('stuck-' + order.id).set({
        type: 'stuck-order',
        ruleKey: 'stuck-order-escalation',
        orderId: order.id,
        name: order.orderNumber || order.id,
        reason: 'processing ' + days + '+ days',
        resolved: false,
        lastAlertedAt: nowIso(),
      }, { merge: true });
      return { ok: true, message: 'Flagged ' + (order.orderNumber || order.id) + ' for attention' };
    },
    /* Orders that moved on (or were cancelled) close their stuck alert. */
    async sync(db, cfg) {
      const alerts = await db.collection(ALERTS).where('type', '==', 'stuck-order').limit(200).get();
      for (const doc of alerts.docs) {
        if (doc.data().resolved) continue;
        const order = await db.collection('orders').doc(doc.data().orderId).get();
        if (!order.exists || order.data().status !== 'processing') {
          await doc.ref.set({ resolved: true, resolvedAt: nowIso() }, { merge: true });
        }
      }
    },
  },

  'risk-review-queue': {
    name: 'Risk review queue',
    group: 'Orders',
    icon: 'shield',
    about: 'Orders whose risk score crossed the review threshold are held here instead of being sent to the supplier. This rule keeps the hold visible on the board and closes it automatically once an admin clears the order. Held orders are excluded from auto-fulfilment until released.',
    defaults: { maxPerRun: 50 },
    fields: [
      { key: 'maxPerRun', label: 'Max per run', type: 'number', min: 1, max: 200, step: 1, help: 'How many held orders to surface per run.' },
    ],
    async scan(db, cfg) {
      const snap = await db.collection('orders')
        .where('riskLevel', '==', 'review')
        .orderBy('createdAt', 'asc')
        .limit(num(cfg.maxPerRun, 50, 1, 200))
        .get();
      return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    },
    async act(db, order) {
      await db.collection('orders').doc(order.id).update({
        needsAttention: true,
        attentionReason: 'held for risk review',
        attentionAt: nowIso(),
        updatedAt: nowIso(),
      });
      await db.collection(ALERTS).doc('risk-' + order.id).set({
        type: 'risk',
        ruleKey: 'risk-review-queue',
        orderId: order.id,
        name: order.orderNumber || order.id,
        reason: order.attentionReason || 'risk review',
        resolved: false,
        lastAlertedAt: nowIso(),
      }, { merge: true });
      return { ok: true, message: 'Held ' + (order.orderNumber || order.id) + ' for review' };
    },
    async sync(db) {
      const alerts = await db.collection(ALERTS).where('type', '==', 'risk').limit(200).get();
      for (const doc of alerts.docs) {
        if (doc.data().resolved) continue;
        const order = await db.collection('orders').doc(doc.data().orderId).get();
        if (!order.exists || order.data().riskLevel !== 'review') {
          await doc.ref.set({ resolved: true, resolvedAt: nowIso() }, { merge: true });
        }
      }
    },
  },

  'restock-notify': {
    on: ['product.restocked'],
    name: 'Back-in-stock notifications',
    group: 'Inventory',
    icon: 'bell',
    about: 'Emails everyone on the waitlist for a product the moment it is back in stock. Rows are re-checked against live stock before sending, so nobody gets a false alarm; a failed send stays pending and retries on the next run. Waitlist rows expire after the configured window or when their product is removed from the catalog.',
    defaults: { maxPerRun: 50, expiryDays: 60 },
    fields: [
      { key: 'maxPerRun', label: 'Max emails per run', type: 'number', min: 1, max: 200, step: 1, help: 'Batch cap so one restock cannot burst the mail provider.' },
      { key: 'expiryDays', label: 'Expire entries after (days)', type: 'number', min: 1, max: 365, step: 1, help: 'Old waitlist rows stop being emailed after this window.' },
    ],
    async scan(db, cfg) {
      const cutoff = new Date(Date.now() - num(cfg.expiryDays, 60, 1, 365) * 86400000).toISOString();
      const pending = await db.collection(WAITLIST)
        .where('status', '==', 'pending')
        .limit(num(cfg.maxPerRun, 50, 1, 200))
        .get();
      /* Aged rows are skipped here and expired by sync below - never email them. */
      const rows = pending.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((row) => String(row.createdAt || '') >= cutoff);
      const productCache = {};
      for (const row of rows) {
        if (productCache[row.productId] !== undefined) continue;
        const snap = await db.collection('products').doc(row.productId).get();
        productCache[row.productId] = snap.exists ? snap.data() : null;
      }
      return rows.filter((row) => {
        const p = productCache[row.productId];
        return !!p && (!p.status || p.status === 'active') && num(p.stock, 0, 0, 1e9) > 0;
      });
    },
    async act(db, row) {
      const snap = await db.collection('products').doc(row.productId).get();
      const p = snap.exists ? snap.data() : null;
      if (!p || (p.status && p.status !== 'active') || num(p.stock, 0, 0, 1e9) <= 0) {
        return { ok: true, skipped: true, message: (p && p.name || row.productId) + ' no longer in stock' };
      }
      const link = 'https://trendaryo.com/product.html?id=' + encodeURIComponent(row.productId);
      const res = await send({
        to: row.email,
        subject: (p.name || 'Item') + ' is back in stock',
        text: [
          'Good news - ' + (p.name || 'the item you wanted') + ' is back in stock.',
          '',
          'Grab it before it goes again: ' + link,
          '',
          'You are receiving this because you asked to be notified on Trendaryo.',
        ].join('\n'),
      });
      if (!res || !res.ok) {
        return { ok: true, skipped: true, message: 'mail provider unavailable - will retry' };
      }
      await db.collection(WAITLIST).doc(row.id).set({
        status: 'notified',
        notifiedAt: nowIso(),
        updatedAt: nowIso(),
      }, { merge: true });
      return { ok: true, message: 'notified ' + row.email + ' about ' + (p.name || row.productId) };
    },
    /* Expire rows whose product is gone or who aged out. */
    async sync(db, cfg) {
      const expiryDays = num(cfg.expiryDays, 60, 1, 365);
      const cutoff = new Date(Date.now() - expiryDays * 86400000).toISOString();
      const snap = await db.collection(WAITLIST).where('status', '==', 'pending').limit(500).get();
      for (const doc of snap.docs) {
        const row = doc.data();
        const prod = await db.collection('products').doc(row.productId).get();
        const inactive = !prod.exists || (prod.data().status && prod.data().status !== 'active');
        const agedOut = String(row.createdAt || '') < cutoff;
        if (inactive || agedOut) {
          await doc.ref.set({ status: 'expired', expiredAt: nowIso(), updatedAt: nowIso(), expiredReason: inactive ? 'product' : 'age' }, { merge: true });
        }
      }
    },
  },

  'supplier-sla-watch': {
    name: 'Supplier SLA watch',
    group: 'Orders',
    icon: 'clock',
    about: 'Fires when a supplier-handled order has not shipped within its lead time. The deadline is confirmed/hand-off time plus the slowest item\u2019s lead time (the product\u2019s own leadTimeDays wins over this rule\u2019s default). Breached orders are flagged, held for attention and alerted once; the alert clears automatically when the order finally ships or closes.',
    defaults: { leadTimeDays: 0, maxPerRun: 50 },
    fields: [
      { key: 'leadTimeDays', label: 'Default lead time (days)', type: 'number', min: 0, max: 120, step: 1, help: '0 = store supplierLeadDays setting (7 days when unset). Products with their own leadTimeDays always win.' },
      { key: 'maxPerRun', label: 'Max breaches per run', type: 'number', min: 1, max: 200, step: 1 },
    ],
    async scan(db, cfg) {
      const [ordersSnap, leadMap, store] = await Promise.all([
        db.collection('orders').where('fulfillment', '==', 'cj').limit(1000).get(),
        productLeadMap(db),
        getSettings(db).catch(() => ({})),
      ]);
      const defaultLead = resolveDefaultLead(cfg.leadTimeDays, store.supplierLeadDays);
      return ordersSnap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((o) => !o.slaBreached && isBreached(o, leadMap, defaultLead))
        .slice(0, num(cfg.maxPerRun, 50, 1, 200));
    },
    async act(db, order, cfg) {
      const [leadMap, store] = await Promise.all([productLeadMap(db), getSettings(db).catch(() => ({}))]);
      const defaultLead = resolveDefaultLead(cfg.leadTimeDays, store.supplierLeadDays);
      if (!isBreached(order, leadMap, defaultLead)) {
        return { ok: true, skipped: true, message: 'shipped within SLA' };
      }
      const name = order.orderNumber || order.id;
      const over = daysOver(order, leadMap, defaultLead);
      await db.collection('orders').doc(order.id).set({
        slaBreached: true,
        slaBreachAt: nowIso(),
        needsAttention: true,
        attentionReason: 'supplier SLA breached (' + over + 'd over)',
        attentionAt: nowIso(),
        updatedAt: nowIso(),
      }, { merge: true });
      await db.collection(ALERTS).doc('sla-' + order.id).set({
        type: 'supplier-sla',
        ruleKey: 'supplier-sla-watch',
        orderId: order.id,
        name,
        reason: 'not shipped within lead time - ' + over + 'd over',
        resolved: false,
        lastAlertedAt: nowIso(),
      }, { merge: true });
      return { ok: true, message: name + ' breached supplier SLA by ' + over + 'd' };
    },
    /* Close alerts once the order leaves the open states. */
    async sync(db) {
      const alerts = await db.collection(ALERTS).where('type', '==', 'supplier-sla').limit(200).get();
      for (const doc of alerts.docs) {
        if (doc.data().resolved) continue;
        const orderId = doc.data().orderId;
        const orderSnap = await db.collection('orders').doc(orderId).get();
        if (!orderSnap.exists || !isOpen(orderSnap.data())) {
          await doc.ref.set({ resolved: true, resolvedAt: nowIso() }, { merge: true });
          if (orderSnap.exists && String(orderSnap.data().attentionReason || '').startsWith('supplier SLA')) {
            await db.collection('orders').doc(orderId).set({
              needsAttention: false,
              attentionReason: null,
              updatedAt: nowIso(),
            }, { merge: true });
          }
        }
      }
    },
  },

  'daily-ops-digest': {
    name: 'Daily ops digest',
    group: 'Ops',
    icon: 'activity',
    about: 'Collects everything an owner should look at once a day - unresolved automation alerts, monitoring probes that stopped beating, failed Stripe webhook deliveries in the last 24 hours and orders flagged as needing attention - and emails a single digest to the admin. Sends at most once per day at the configured hour, and stays silent when there is nothing to report.',
    defaults: { hour: 9, staleAfterMinutes: 90, emailAdmin: true, maxItems: 30 },
    fields: [
      { key: 'hour', label: 'Send hour (UTC)', type: 'number', min: 0, max: 23, step: 1, help: 'Digest goes out on the cron run closest after this hour (0-23, UTC).' },
      { key: 'staleAfterMinutes', label: 'Stale after (minutes)', type: 'number', min: 5, max: 1440, step: 5, help: 'A monitoring probe with no beat for this long is reported as stale.' },
      { key: 'emailAdmin', label: 'Email digest to admin', type: 'boolean', help: 'Send the digest email. Off means the run only records the report.' },
      { key: 'maxItems', label: 'Max items', type: 'number', min: 5, max: 100, step: 1 },
    ],
    async scan(db, cfg, ctx) {
      const trigger = (ctx && ctx.trigger) || 'manual';
      if (trigger !== 'cron' || new Date().getUTCHours() === num(cfg.hour, 9, 0, 23)) return [{ id: 'ops-digest' }];
      return [];
    },
    async act(db, entity, cfg) {
      const items = await collectOpsItems(db, cfg);
      if (!items.length) {
        return { ok: true, message: 'All clear - nothing to report' };
      }
      if (cfg.emailAdmin !== false) {
        const text = [
          'TRENDARYO OPS DIGEST',
          'Generated: ' + nowIso(),
          '',
          ...items.map((i) => '- [' + i.severity + '] ' + i.label + ' (' + i.detail + ')'),
          '',
          'Admin dashboard: /admin',
        ].join('\n');
        try {
          await sendToAdmin(db, { subject: 'Trendaryo ops digest - ' + items.length + ' item(s)', text });
        } catch (e) {
          console.error('[digest:mail]', e.message);
        }
      }
      return { ok: true, message: items.length + ' item(s): ' + items.map((i) => i.label).slice(0, 5).join(', ') };
    },
  },

  /* Phase 27 - every published product gets its blog brief, even when the
     publish happened through a path that skipped the API (imports, seeds). */
  'missing-brief-backfill': {
    name: 'Missing brief backfill',
    group: 'Content',
    icon: 'book',
    about: 'Products with published content but no blog brief lose their place in the article pipeline. This rule creates the READY_FOR_GENERATION brief shells from the frozen snapshots, so the Blog Generator always has a starting point.',
    defaults: { maxPerRun: 25 },
    fields: [
      { key: 'maxPerRun', label: 'Max products per run', type: 'number', min: 1, max: 100, step: 1, help: 'Batch cap so briefs are created gradually.' },
    ],
    async scan(db, cfg) {
      const { missingBriefs } = require('./content-briefs');
      return (await missingBriefs(db, num(cfg.maxPerRun, 25, 1, 100))).slice(0, num(cfg.maxPerRun, 25, 1, 100));
    },
    async act(db, content) {
      const { ensureBlogBrief } = require('./content-briefs');
      const productId = content.id;
      let product = null;
      try {
        const productDoc = await db.collection('products').doc(productId).get();
        if (productDoc.exists) product = productDoc.data();
      } catch (e) { /* product row is optional garnish for the brief */ }
      const result = await ensureBlogBrief(db, productId, content.published || {}, { uid: 'automation', email: null }, product);
      if (!result) return { ok: false, message: 'Brief creation failed for ' + productId };
      return { ok: true, message: 'Brief ' + (result.created ? 'created' : 'refreshed') + ' for ' + productId };
    },
  },

  /* Phase 27 - content drafts that stop moving get a nudge before they rot. */
  'content-draft-escalation': {
    name: 'Content draft escalation',
    group: 'Content',
    icon: 'flag',
    about: 'Product content drafts parked for review (or left as drafts) for days usually mean the review step was missed. This rule flags them so they surface instead of quietly going stale.',
    defaults: { days: 5, maxPerRun: 25 },
    fields: [
      { key: 'days', label: 'Stale after (days)', type: 'number', min: 1, max: 30, step: 1, help: 'Time without an update before a draft is flagged.' },
      { key: 'maxPerRun', label: 'Max drafts per run', type: 'number', min: 1, max: 100, step: 1, help: 'Batch cap so flags land gradually.' },
    ],
    async scan(db, cfg) {
      const days = num(cfg.days, 5, 1, 30);
      const cutoff = Date.now() - days * 86400000;
      const snap = await db.collection('product_content')
        .where('status', 'in', ['draft', 'review_pending'])
        .limit(num(cfg.maxPerRun, 25, 1, 100) * 4)
        .get();
      return snap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((c) => {
          const t = new Date(c.updatedAt || c.createdAt || 0).getTime();
          return t && t <= cutoff;
        })
        .slice(0, num(cfg.maxPerRun, 25, 1, 100));
    },
    async act(db, content) {
      await db.collection(ALERTS).doc('content-' + content.id).set({
        type: 'content-draft',
        ruleKey: 'content-draft-escalation',
        productId: content.id,
        name: (content.sections && content.sections.title) || content.productId || content.id,
        reason: 'content ' + content.status + ' with no update',
        resolved: false,
        lastAlertedAt: nowIso(),
      }, { merge: true });
      return { ok: true, message: 'Flagged content draft for ' + content.id };
    },
    /* Drafts that moved on close their alert automatically. */
    async sync(db) {
      const alerts = await db.collection(ALERTS).where('type', '==', 'content-draft').limit(200).get();
      for (const doc of alerts.docs) {
        if (doc.data().resolved) continue;
        const content = await db.collection('product_content').doc(doc.data().productId).get();
        if (!content.exists || ['ready_to_publish', 'published'].indexOf(content.data().status) >= 0) {
          await doc.ref.set({ resolved: true, resolvedAt: nowIso() }, { merge: true });
        }
      }
    },
  },
};

/* ==========================================================================
   STORAGE
   ========================================================================== */

async function ensureSeeded(db) {
  const existing = new Map();
  const snap = await db.collection(RULES).get();
  snap.docs.forEach((doc) => existing.set(doc.id, doc.data()));

  const missing = [];
  for (const key of Object.keys(DEFINITIONS)) {
    if (!existing.has(key)) missing.push(key);
  }
  if (!missing.length) return;

  const batch = db.batch();
  for (const key of missing) {
    const def = DEFINITIONS[key];
    batch.set(db.collection(RULES).doc(key), {
      key,
      builtIn: true,
      enabled: false,
      config: { ...def.defaults },
      stats: { runs: 0, matched: 0, acted: 0, lastRunAt: null, lastStatus: null, lastError: null },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }
  await batch.commit();
}

async function listRules(db) {
  await ensureSeeded(db);
  const snap = await db.collection(RULES).get();
  const byKey = {};
  snap.docs.forEach((doc) => { byKey[doc.id] = doc.data(); });

  return Object.keys(DEFINITIONS).map((key) => {
    const def = DEFINITIONS[key];
    const doc = byKey[key] || {};
    return {
      key,
      name: def.name,
      group: def.group,
      icon: def.icon,
      about: def.about,
      fields: def.fields,
      builtIn: true,
      enabled: !!doc.enabled,
      config: { ...def.defaults, ...(doc.config || {}) },
      stats: doc.stats || {},
      updatedAt: doc.updatedAt || null,
    };
  });
}

async function getRule(db, key) {
  const ref = db.collection('automations').doc(key);
  const s = await ref.get();
  return s.exists ? { key, ...s.data() } : null;
}
async function updateRule(db, key, patch) {
  const def = DEFINITIONS[key];
  if (!def) throw new Error('Unknown automation rule: ' + key);

  const update = { updatedAt: nowIso() };
  if (patch.enabled !== undefined) update.enabled = !!patch.enabled;

  if (patch.config !== undefined) {
    const incoming = patch.config && typeof patch.config === 'object' ? patch.config : {};
    const config = {};
    for (const field of def.fields) {
      if (incoming[field.key] === undefined) continue;
      config[field.key] = field.type === 'boolean'
        ? !!incoming[field.key]
        : num(incoming[field.key], def.defaults[field.key], field.min, field.max);
    }
    // merge:true keeps every config key the payload did not mention.
    await db.collection(RULES).doc(key).set({ ...update, config }, { merge: true });
    return { enabled: update.enabled, config };
  }

  await db.collection(RULES).doc(key).set(update, { merge: true });
  return { enabled: update.enabled };
}

/* ==========================================================================
   RUNNER
   ========================================================================== */

async function writeRun(db, record) {
  await db.collection(RUNS).add(record);
  // Keep the feed bounded: drop anything past the cap, oldest first.
  const old = await db.collection(RUNS)
    .orderBy('createdAt', 'desc')
    .offset(RUN_HISTORY_CAP)
    .limit(50)
    .get();
  if (!old.empty) {
    const batch = db.batch();
    old.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit().catch(() => {});
  }
}

async function runRule(db, key, ctx) {
  const trigger = (ctx && ctx.trigger) || 'manual';
  const dryRun = !!(ctx && ctx.dryRun);

  const def = DEFINITIONS[key];
  if (!def) throw new Error('Unknown automation rule: ' + key);

  const snap = await db.collection(RULES).doc(key).get();
  const rule = snap.exists ? snap.data() : {};
  if (!rule.enabled && trigger !== 'dry') {
    throw new Error('Rule is paused - enable it first');
  }

  const cfg = { ...def.defaults, ...(rule.config || {}) };
  const startedAt = nowIso();
  const startedMs = Date.now();

  const record = {
    ruleKey: key,
    ruleName: def.name,
    trigger,
    dryRun,
    status: 'ok',
    matched: 0,
    acted: 0,
    skipped: 0,
    errors: [],
    startedAt,
    finishedAt: null,
    durationMs: 0,
  };

  try {
    const candidates = await def.scan(db, cfg, { trigger, dryRun });
    record.matched = candidates.length;

    const results = [];
    for (const entity of candidates) {
      if (dryRun) {
        record.skipped++;
        results.push({ entity: entity.id, skipped: true, message: 'Would act' });
        continue;
      }
      try {
        const out = await def.act(db, entity, cfg, { trigger, dryRun });
        if (out && out.skipped) {
          record.skipped++;
        } else {
          record.acted++;
        }
        results.push({ entity: entity.id, ok: true, skipped: !!(out && out.skipped), message: out && out.message });
      } catch (err) {
        record.errors.push({ entity: entity.id, message: err.message });
        results.push({ entity: entity.id, ok: false, error: err.message });
        if (typeof def.onError === 'function') {
          await def.onError(db, entity, cfg, err).catch((e) => {
            console.error('[automations:' + key + '] onError hook failed:', e.message);
          });
        }
      }
    }

    if (!dryRun && typeof def.after === 'function') {
      await def.after(db, cfg, results.filter((r) => r.ok && !r.skipped)).catch((err) => {
        console.error('[automations:' + key + '] after hook failed:', err.message);
      });
    }

    if (!dryRun && typeof def.sync === 'function') {
      await def.sync(db, cfg).catch((err) => {
        console.error('[automations:' + key + '] sync hook failed:', err.message);
      });
    }

    record.results = results.slice(0, 50);
  } catch (err) {
    record.status = 'error';
    record.errors.push({ message: err.message });
  }

  if (record.errors.length && record.status !== 'error') record.status = 'partial';
  record.finishedAt = nowIso();
  record.durationMs = Date.now() - startedMs;
  record.createdAt = record.finishedAt;

  if (!dryRun) {
    await Promise.all([
      writeRun(db, record),
      db.collection(RULES).doc(key).set({
        stats: {
          runs: (rule.stats && rule.stats.runs || 0) + 1,
          matched: record.matched,
          acted: record.acted,
          lastRunAt: record.finishedAt,
          lastStatus: record.status,
          lastError: record.errors.length ? record.errors[record.errors.length - 1].message : null,
        },
        updatedAt: nowIso(),
      }, { merge: true }),
    ]);
  }

  return record;
}

function emitEvent(db, name, payload) { return (async () => { try { const rules = await listRules(db); for (const r of rules) { if (r.enabled) { const def = DEFINITIONS[r.key]; if (def && Array.isArray(def.on) && def.on.includes(name)) { try { await runRule(db, r.key, { trigger: 'event:' + name }); } catch (e) { console.error('[automations:emit]', e.message); } } } } } catch (e) { console.error('[automations:emit]', e.message); } })(); }

async function runAll(db, ctx) {
  const rules = await listRules(db);
  const out = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    try {
      out.push(await runRule(db, rule.key, { trigger: (ctx && ctx.trigger) || 'cron' }));
    } catch (err) {
      out.push({
        ruleKey: rule.key,
        ruleName: rule.name,
        status: 'error',
        errors: [{ message: err.message }],
        finishedAt: nowIso(),
      });
    }
  }
  return out;
}

module.exports = { ensureSeeded, listRules, getRule, updateRule, runRule, runAll, DEFINITIONS, emitEvent };

module.exports = { ensureSeeded, listRules, getRule, updateRule, runRule, runAll, DEFINITIONS, emitEvent };
