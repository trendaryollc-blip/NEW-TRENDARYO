'use strict';

function log(db, entry) {
  const rec = {
    actorUid: entry.actorUid || null,
    actorEmail: entry.actorEmail || null,
    action: entry.action || 'unknown',
    targetType: entry.targetType || null,
    targetId: entry.targetId || null,
    before: entry.before ? safe(entry.before) : null,
    after: entry.after ? safe(entry.after) : null,
    ip: entry.ip || null,
    userAgent: entry.userAgent || null,
    createdAt: new Date().toISOString(),
  };
  return db.collection('adminLogs').add(rec).catch((e) => console.error('[audit] log failed:', e.message));
}

function safe(obj) {
  try {
    const s = JSON.stringify(obj);
    if (s.length > 2048) return { _truncated: true };
    return obj;
  } catch (e) {
    return { _truncated: true };
  }
}

module.exports = { log };
