'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { MockFirestore } = require('./helpers/fake-firestore');

/* Load the real mail module first, then swap in a capturing stub so the
   automations module (loaded afterwards) sees the stub. */
const realMail = require('../api/_lib/mail');
const sentMail = [];
const mailPath = require.resolve('../api/_lib/mail');
require.cache[mailPath].exports = {
  send: async (opts) => { sentMail.push(opts); return { ok: true }; },
  sendToAdmin: async (db, opts) => { sentMail.push(opts); return { ok: true }; },
  orderConfirmationEmail: realMail.orderConfirmationEmail,
  shippingUpdateEmail: realMail.shippingUpdateEmail,
  sendOrderConfirmation: realMail.sendOrderConfirmation,
  sendShippingUpdate: realMail.sendShippingUpdate,
};

const { beat, readAll, statusOf } = require('../api/_lib/health');
const automations = require('../api/_lib/automations');

function freshDb(seed = {}) {
  return new MockFirestore(seed);
}

async function seedHealthyProbes(db, now = Date.now()) {
  for (const key of ['cron:automations', 'cron:supplier-sync', 'stripe-webhook']) {
    await db.collection('system_health').doc(key).set({
      key,
      lastRunAt: new Date(now).toISOString(),
      lastStatus: 'ok',
      okStreak: 3,
      failStreak: 0,
    });
  }
}

/* ---------------------------------------------------------------- health -- */

test('beat writes the probe and counts streaks', async () => {
  const db = freshDb();
  await beat(db, 'cron:automations', { status: 'ok', detail: '1 rules', durationMs: 42 });
  let probe = db.raw('system_health', 'cron:automations');
  assert.equal(probe.lastStatus, 'ok');
  assert.equal(probe.okStreak, 1);
  assert.equal(probe.failStreak, 0);
  assert.equal(probe.durationMs, 42);

  await beat(db, 'cron:automations', { status: 'error', detail: 'boom' });
  probe = db.raw('system_health', 'cron:automations');
  assert.equal(probe.lastStatus, 'error');
  assert.equal(probe.okStreak, 1);
  assert.equal(probe.failStreak, 1);

  await beat(db, 'cron:automations', { status: 'ok' });
  probe = db.raw('system_health', 'cron:automations');
  assert.equal(probe.okStreak, 2);
  assert.equal(probe.failStreak, 1);
});

test('beat never throws when the store rejects', async () => {
  const broken = {
    collection: () => { throw new Error('permission denied'); },
  };
  await assert.doesNotReject(() => beat(broken, 'x', { status: 'ok' }));
});

test('statusOf classifies ok / stale / error / missing', async () => {
  const now = Date.now();
  const fresh = { lastRunAt: new Date(now - 60000).toISOString(), lastStatus: 'ok' };
  const old = { lastRunAt: new Date(now - 3 * 60 * 60000).toISOString(), lastStatus: 'ok' };
  const failing = { lastRunAt: new Date(now - 60000).toISOString(), lastStatus: 'error' };
  assert.equal(statusOf(fresh, 90, now), 'ok');
  assert.equal(statusOf(old, 90, now), 'stale');
  assert.equal(statusOf(failing, 90, now), 'error');
  assert.equal(statusOf(undefined, 90, now), 'missing');
  assert.equal(statusOf({}, 90, now), 'missing');
});

test('readAll returns probes keyed by id', async () => {
  const db = freshDb();
  await beat(db, 'cron:automations', { status: 'ok' });
  const probes = await readAll(db);
  assert.equal(probes.length, 1);
  assert.equal(probes[0].id, 'cron:automations');
});

/* --------------------------------------------------------------- digest -- */

test('daily-ops-digest ships disabled with its config schema', async () => {
  const db = freshDb();
  const rules = await automations.listRules(db);
  const digest = rules.find((r) => r.key === 'daily-ops-digest');
  assert.ok(digest, 'rule exists');
  assert.equal(digest.enabled, false, 'ships disabled');
  assert.equal(digest.group, 'Ops');
  const keys = digest.fields.map((f) => f.key);
  for (const k of ['hour', 'staleAfterMinutes', 'emailAdmin', 'maxItems']) {
    assert.ok(keys.includes(k), 'field ' + k);
  }
  assert.equal(digest.config.hour, 9);
});

test('manual run collects open alerts, stale probes and flagged orders', async () => {
  const db = freshDb();
  await seedHealthyProbes(db);
  /* Silence the probes: leave them fresh, then break one. */
  await db.collection('system_health').doc('stripe-webhook').set({
    key: 'stripe-webhook',
    lastRunAt: new Date(Date.now() - 4 * 60 * 60000).toISOString(),
    lastStatus: 'ok',
  });
  await db.collection('automation_alerts').add({
    type: 'low-stock', resolved: false, reason: 'SKU-1 below reorder point', name: 'SKU-1',
  });
  await db.collection('orders').add({
    orderNumber: 'T-100', needsAttention: true, attentionReason: 'held for risk review',
  });
  await db.collection('stripe_events').add({
    type: 'payment_intent.succeeded', status: 'failed', error: 'handler exploded',
    receivedAt: new Date().toISOString(),
  });

  sentMail.length = 0;
  await automations.updateRule(db, 'daily-ops-digest', { enabled: true, config: { emailAdmin: true } });
  const record = await automations.runRule(db, 'daily-ops-digest', { trigger: 'manual' });

  assert.equal(record.status, 'ok', JSON.stringify(record.errors));
  assert.equal(record.matched, 1);
  assert.equal(record.acted, 1);

  /* 1 stale probe + 1 alert + 1 failed webhook + 1 flagged order = 4. */
  assert.ok(record.results[0].message.startsWith('4 item(s)'), record.results[0].message);
  assert.equal(sentMail.length, 1, 'digest emailed once');
  assert.match(sentMail[0].subject, /ops digest - 4 item/);
  assert.match(sentMail[0].text, /Open alert: low-stock/);
  assert.match(sentMail[0].text, /Probe stripe-webhook: stale/);
  assert.match(sentMail[0].text, /Stripe webhook failed/);
  assert.match(sentMail[0].text, /Order needs attention: T-100/);
});

test('digest stays quiet when everything is healthy', async () => {
  const db = freshDb();
  await seedHealthyProbes(db);
  sentMail.length = 0;
  await automations.updateRule(db, 'daily-ops-digest', { enabled: true });
  const record = await automations.runRule(db, 'daily-ops-digest', { trigger: 'manual' });
  assert.equal(record.status, 'ok');
  assert.match(record.results[0].message, /All clear/);
  assert.equal(sentMail.length, 0, 'no email when there is nothing to report');
});

test('emailAdmin=false records the report without sending', async () => {
  const db = freshDb();
  await seedHealthyProbes(db);
  await db.collection('orders').add({ orderNumber: 'T-200', needsAttention: true, attentionReason: 'x' });
  sentMail.length = 0;
  await automations.updateRule(db, 'daily-ops-digest', { enabled: true, config: { emailAdmin: false } });
  const record = await automations.runRule(db, 'daily-ops-digest', { trigger: 'manual' });
  assert.equal(record.acted, 1);
  assert.equal(sentMail.length, 0, 'email suppressed by config');
});

test('cron trigger only fires during the configured UTC hour', async () => {
  const db = freshDb();
  await seedHealthyProbes(db);
  await automations.updateRule(db, 'daily-ops-digest', { enabled: true, config: { emailAdmin: false } });

  const nowHour = new Date().getUTCHours();
  const wrongHour = (nowHour + 1) % 24;

  await automations.updateRule(db, 'daily-ops-digest', { config: { hour: wrongHour } });
  const skipped = await automations.runRule(db, 'daily-ops-digest', { trigger: 'cron' });
  assert.equal(skipped.matched, 0, 'quiet outside the configured hour');

  await automations.updateRule(db, 'daily-ops-digest', { config: { hour: nowHour } });
  const ran = await automations.runRule(db, 'daily-ops-digest', { trigger: 'cron' });
  assert.equal(ran.matched, 1, 'runs during the configured hour');
  assert.equal(ran.acted, 1);
});

test('manual runs ignore the hour gate', async () => {
  const db = freshDb();
  await seedHealthyProbes(db);
  await automations.updateRule(db, 'daily-ops-digest', {
    enabled: true,
    config: { emailAdmin: false, hour: (new Date().getUTCHours() + 7) % 24 },
  });
  const record = await automations.runRule(db, 'daily-ops-digest', { trigger: 'manual' });
  assert.equal(record.matched, 1, 'Run now always collects');
});

test('digest caps items at maxItems', async () => {
  const db = freshDb();
  await seedHealthyProbes(db);
  for (let i = 0; i < 40; i++) {
    await db.collection('orders').add({ orderNumber: 'T-' + i, needsAttention: true, attentionReason: 'r' });
  }
  sentMail.length = 0;
  await automations.updateRule(db, 'daily-ops-digest', {
    enabled: true,
    config: { emailAdmin: true, maxItems: 10 },
  });
  const record = await automations.runRule(db, 'daily-ops-digest', { trigger: 'manual' });
  assert.equal(record.acted, 1);
  const lines = sentMail[0].text.split('\n').filter((l) => l.startsWith('- ['));
  assert.equal(lines.length, 10, 'capped at maxItems');
});

/* ------------------------------------------------------- mail recipient -- */

test('sendToAdmin resolves settings/store.supportEmail', async () => {
  process.env.EMAIL_PROVIDER = 'console';
  const withAddr = freshDb();
  await withAddr.collection('settings').doc('store').set({ supportEmail: ' owner@example.com ' });
  const ok = await realMail.sendToAdmin(withAddr, { subject: 's', text: 't' });
  assert.equal(ok.ok, true);
  assert.equal(ok.via, 'console');

  const withoutAddr = freshDb();
  const skipped = await realMail.sendToAdmin(withoutAddr, { subject: 's', text: 't' });
  assert.equal(skipped.ok, false);
  assert.equal(skipped.skipped, true, 'no configured admin -> silently skipped');
  delete process.env.EMAIL_PROVIDER;
});
