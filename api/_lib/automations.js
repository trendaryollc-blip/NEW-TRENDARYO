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

const { assertTransition } = require('./order-state');
const { fulfillOrder } = require('../admin/supplier-fulfill');
const { getSettings } = require('./pricing');
const { send } = require('./mail');

const RULES = 'automations';
const RUNS = 'automation_runs';
const ALERTS = 'automation_alerts';

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

/* ==========================================================================
   RULE DEFINITIONS
   Each rule: about / fields (config schema) / defaults / scan / act
   scan(db, cfg)  -> [{ id, ...entity }]  (candidates, cheapest query first)
   act(db, entity, cfg) -> { ok, skipped?, message, error? }
   ========================================================================== */

const DEFINITIONS = {
  'supplier-auto-fulfillment': {
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
        .filter((o) => new Date(o.createdAt).getTime() <= cutoff)
        .slice(0, num(cfg.maxPerRun, 25, 1, 100));
    },
    async act(db, order) {
      const out = await fulfillOrder(db, order.id);
      if (out && out.skipped) return { ok: true, skipped: true, message: 'Already submitted (CJ ' + out.cjOrderId + ')' };
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
      await db.collection('orders').doc(order.id).update({
        status: 'cancelled',
        cancelReason: 'unpaid',
        statusHistory: FieldValue.arrayUnion({
          status: 'cancelled',
          timestamp: nowIso(),
          note: 'Automation: unpaid order watchdog after ' + hours + 'h',
        }),
        updatedAt: nowIso(),
      });
      return { ok: true, message: 'Cancelled unpaid order ' + (order.orderNumber || order.id) };
    },
  },

  'low-stock-alerts': {
    name: 'Low-stock alerts',
    group: 'Inventory',
    icon: 'warehouse',
    about: 'Watches the live shelf for products at or below the stock threshold (your store setting, or an override here) and raises one alert per product so nothing sells out silently. Alerts are deduplicated for the cooldown window, and a single digest email goes to the store support address.',
    defaults: { threshold: 0, cooldownHours: 24, emailAdmin: true, maxPerRun: 25 },
    fields: [
      { key: 'threshold', label: 'Threshold override', type: 'number', min: 0, max: 999, step: 1, help: '0 = use the store low-stock setting.' },
      { key: 'cooldownHours', label: 'Re-alert after (hours)', type: 'number', min: 1, max: 168, step: 1, help: 'Quiet period before the same product alerts again.' },
      { key: 'emailAdmin', label: 'Email the store inbox', type: 'boolean', help: 'One digest per run to supportEmail.' },
      { key: 'maxPerRun', label: 'Max products per run', type: 'number', min: 1, max: 100, step: 1, help: 'Batch cap while clearing a backlog.' },
    ],
    async scan(db, cfg) {
      const [products, store] = await Promise.all([
        db.collection('products').where('status', '==', 'active').orderBy('createdAt', 'desc').limit(400).get(),
        getSettings(db).catch(() => ({})),
      ]);
      const threshold = num(cfg.threshold, 0, 0, 999) > 0
        ? num(cfg.threshold, 0, 0, 999)
        : num(store.lowStock, 8, 0, 999);
      return products.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((p) => num(p.stock, 0, 0, 1e9) <= threshold)
        .slice(0, num(cfg.maxPerRun, 25, 1, 100));
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
        resolved: false,
        lastAlertedAt: nowIso(),
        count: (snap.exists ? snap.data().count || 0 : 0) + 1,
      }, { merge: true });
      return { ok: true, message: product.name + ' down to ' + (num(product.stock, 0, 0, 1e9)) + ' units' };
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
    const candidates = await def.scan(db, cfg);
    record.matched = candidates.length;

    const results = [];
    for (const entity of candidates) {
      if (dryRun) {
        record.skipped++;
        results.push({ entity: entity.id, skipped: true, message: 'Would act' });
        continue;
      }
      try {
        const out = await def.act(db, entity, cfg);
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

module.exports = {
  DEFINITIONS,
  listRules,
  updateRule,
  runRule,
  runAll,
  ensureSeeded,
};
