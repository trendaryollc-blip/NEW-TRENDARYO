'use strict';

const TRANSITIONS = {
  pending: ['confirmed', 'cancelled', 'refunded'],
  confirmed: ['processing', 'cancelled', 'refunded'],
  processing: ['packed', 'shipped', 'cancelled', 'refunded'],
  packed: ['shipped', 'refunded'],
  shipped: ['delivered', 'refunded'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
};

const ACTORS = {
  customer: ['cancelled'],
  webhook: ['confirmed', 'cancelled', 'refunded'],
  admin: ['*'],
  system: ['processing', 'shipped', 'cancelled', 'confirmed', 'packed', 'delivered', 'refunded'],
};

function allowedFrom(from) {
  return TRANSITIONS[from] || [];
}

function canTransition(from, to, actorRole) {
  const allowed = allowedFrom(from);
  if (to === from) return true;
  if (!allowed.includes(to)) return false;
  const roleAllowed = ACTORS[actorRole] || [];
  if (roleAllowed.includes('*')) return true;
  if (roleAllowed.includes(to)) return true;
  return false;
}

function assertTransition(from, to, actorRole) {
  if (from === to) return;
  if (!canTransition(from, to, actorRole)) {
    const err = new Error('invalid_transition');
    err.statusCode = 409;
    err.code = 'invalid_transition';
    throw err;
  }
}

module.exports = {
  TRANSITIONS,
  ACTORS,
  allowedFrom,
  canTransition,
  assertTransition,
};
