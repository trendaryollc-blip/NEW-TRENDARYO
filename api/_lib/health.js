'use strict';

/* System health probes.  Every cron, webhook and external integration writes
   a "beat" here so the dashboard can see what is alive and what went quiet. */

const COL = 'system_health';

function nowIso() {
  return new Date().toISOString();
}

async function beat(db, key, { status = 'ok', detail = null, durationMs = null } = {}) {
  try {
    const ref = db.collection(COL).doc(key);
    const prevSnap = await ref.get();
    const prev = prevSnap.exists ? prevSnap.data() : {};
    const okStreak = status === 'ok' ? Number(prev.okStreak || 0) + 1 : Number(prev.okStreak || 0);
    const failStreak = status === 'ok' ? Number(prev.failStreak || 0) : Number(prev.failStreak || 0) + 1;
    await ref.set({
      key,
      lastRunAt: nowIso(),
      lastStatus: status,
      detail,
      durationMs,
      okStreak,
      failStreak,
      updatedAt: nowIso(),
    }, { merge: true });
  } catch (e) {
    console.error('[health:beat] ' + key + ' failed:', e.message);
  }
}

async function readAll(db) {
  try {
    const snap = await db.collection(COL).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error('[health:read] failed:', e.message);
    return [];
  }
}

/* A probe is stale when its last successful beat is older than intervalMinutes. */
function isStale(probe, intervalMinutes, now = Date.now()) {
  if (!probe) return true;
  const at = probe.lastRunAt ? new Date(probe.lastRunAt).getTime() : 0;
  return !at || now - at > intervalMinutes * 60000;
}

function statusOf(probe, intervalMinutes, now = Date.now()) {
  if (!probe || !probe.lastRunAt) return 'missing';
  if (probe.lastStatus !== 'ok') return 'error';
  return isStale(probe, intervalMinutes, now) ? 'stale' : 'ok';
}

module.exports = { beat, readAll, isStale, statusOf, COL };
