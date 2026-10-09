'use strict';

/* Supplier SLA math (F9): when a supplier-fulfilled order was due to ship,
   what counts as a breach, and how a supplier is performing overall.
   Every function is pure so the rule, the report and the tests share one
   definition of "late". */

const OPEN_STATUSES = ['confirmed', 'processing', 'packed'];

function toMs(iso) {
  const t = iso ? new Date(iso).getTime() : 0;
  return Number.isFinite(t) && t > 0 ? t : 0;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/* Default lead time: rule config beats store setting beats 7 days. */
function resolveDefaultLead(ruleLead, storeLead) {
  const r = Number(ruleLead);
  if (Number.isFinite(r) && r > 0) return r;
  const s = Number(storeLead);
  if (Number.isFinite(s) && s > 0) return s;
  return 7;
}

/* Slowest line wins: an order ships when every item's lead time has run.
   A product's own leadTimeDays beats the rule/store default. */
function leadTimeFor(order, leadByProduct, defaultDays) {
  const items = Array.isArray(order.items) ? order.items : [];
  let best = 0;
  for (const it of items) {
    const pid = String(it.productId || it.product || it.id || '');
    const lead = Number(leadByProduct ? leadByProduct[pid] : NaN);
    if (Number.isFinite(lead) && lead > best) best = lead;
  }
  if (best > 0) return best;
  const d = Number(defaultDays);
  return Number.isFinite(d) && d >= 0 ? d : 0;
}

/* The SLA clock starts when the order went to the supplier; fall back to
   confirmation, then creation, so legacy rows still get a deadline. */
function startOf(order) {
  return toMs(order.supplierSubmittedAt) || toMs(order.confirmedAt) || toMs(order.createdAt);
}

function deadlineFor(order, leadByProduct, defaultDays) {
  const start = startOf(order);
  if (!start) return null;
  return new Date(start + leadTimeFor(order, leadByProduct, defaultDays) * 86400000).toISOString();
}

function isOpen(order) {
  return OPEN_STATUSES.includes(order && order.status);
}

function isBreached(order, leadByProduct, defaultDays, now = Date.now()) {
  if (!isOpen(order)) return false;
  const dl = deadlineFor(order, leadByProduct, defaultDays);
  if (!dl) return false;
  return now > toMs(dl);
}

/* Days from hand-off to shipment (null until shipped). */
function shipDays(order) {
  const a = toMs(order.supplierSubmittedAt) || toMs(order.confirmedAt);
  const b = toMs(order.supplierShippedAt);
  if (!a || !b) return null;
  return round1((b - a) / 86400000);
}

function daysOver(order, leadByProduct, defaultDays, now = Date.now()) {
  const dl = deadlineFor(order, leadByProduct, defaultDays);
  if (!dl) return 0;
  const over = now - toMs(dl);
  return over > 0 ? round1(over / 86400000) : 0;
}

/* entries: [{ supplierId, status, deadline, shippedAt, shipDays, breach }] */
function aggregate(entries) {
  const bySupplier = {};
  for (const e of entries) {
    const key = e.supplierId || 'unassigned';
    const s = bySupplier[key] || (bySupplier[key] = {
      supplierId: key,
      submitted: 0,
      shipped: 0,
      late: 0,
      onTime: 0,
      openBreaches: 0,
      shipDayList: [],
    });
    s.submitted++;
    if (e.shipDays != null) {
      s.shipped++;
      s.shipDayList.push(e.shipDays);
      if (e.deadline) {
        if (toMs(e.shippedAt) > toMs(e.deadline)) s.late++;
        else s.onTime++;
      }
    } else if (e.breach) {
      s.openBreaches++;
    }
  }
  return Object.keys(bySupplier).sort().map((key) => {
    const s = bySupplier[key];
    const scored = s.onTime + s.late;
    const total = s.shipDayList.reduce((a, b) => a + b, 0);
    return {
      supplierId: s.supplierId,
      submitted: s.submitted,
      shipped: s.shipped,
      late: s.late,
      onTimePct: scored ? Math.round((s.onTime / scored) * 1000) / 10 : null,
      avgShipDays: s.shipDayList.length ? round1(total / s.shipDayList.length) : null,
      openBreaches: s.openBreaches,
    };
  });
}

module.exports = { OPEN_STATUSES, leadTimeFor, deadlineFor, isBreached, isOpen, shipDays, daysOver, aggregate, resolveDefaultLead, toMs };
