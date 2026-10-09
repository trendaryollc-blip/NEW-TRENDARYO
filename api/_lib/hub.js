/**
 * DropShip Hub API client.
 * Server-to-server: Hub accepts `Authorization: Bearer $CRON_SECRET`
 * (withAuthOrCron, runs as OWNER_UID). Set env vars:
 *   DROPSHIP_HUB_URL   e.g. https://your-hub.vercel.app
 *   DROPSHIP_HUB_TOKEN the Hub's CRON_SECRET value
 */
'use strict';

function base() {
  const url = process.env.DROPSHIP_HUB_URL;
  if (!url) throw new Error('DROPSHIP_HUB_URL is not set');
  return url.replace(/\/+$/, '');
}

async function call(path, { method = 'GET', body } = {}) {
  const token = process.env.DROPSHIP_HUB_TOKEN;
  if (!token) throw new Error('DROPSHIP_HUB_TOKEN is not set');
  const res = await fetch(base() + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch (e) { /* ignore */ }
  if (!res.ok) {
    const msg = (json && (json.error || json.message)) || `DropShip Hub request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return json;
}

function searchAll(query, platforms) {
  return call('/api/platforms/search-all', { method: 'POST', body: { query, platforms: platforms && platforms.length ? platforms : undefined, stream: false } });
}

function validateProduct(payload) {
  return call('/api/product-validation', { method: 'POST', body: payload });
}

module.exports = { searchAll, validateProduct, call };
