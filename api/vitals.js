'use strict';
const { initFirebase } = require('./_lib/firebase');
const { handleCors } = require('./_lib/cors');
const { applyRateLimit } = require('./_lib/security');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Method not allowed' } });
  if (!applyRateLimit(req, res, 30)) return res.status(429).json({ error: { message: 'Too many requests' } });

  try {
    const { db } = initFirebase();
    const body = req.body || {};

    const entry = {
      page: String(body.page || 'unknown').slice(0, 200),
      lcp: Number(body.lcp) || null,
      cls: Number(body.cls) || null,
      fcp: Number(body.fcp) || null,
      ttfb: Number(body.ttfb) || null,
      jsErrors: Array.isArray(body.jsErrors) ? body.jsErrors.slice(0, 10).map(e => String(e).slice(0, 500)) : [],
      userAgent: String(body.userAgent || req.headers['user-agent'] || '').slice(0, 300),
      at: new Date().toISOString(),
    };

    await db.collection('vitals').add(entry);

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Vitals error:', error);
    res.status(500).json({ error: { message: error.message } });
  }
};
