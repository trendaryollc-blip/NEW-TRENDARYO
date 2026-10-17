'use strict';
const { initFirebase } = require('../_lib/firebase');
const { beat } = require('../_lib/health');
const { sendToAdmin } = require('../_lib/mail');

function toCsv(rows, headers) {
  const escape = (v) => {
    const s = String(v == null ? '' : v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => escape(row[h])).join(','));
  }
  return lines.join('\n');
}

module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  if (secret && auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: { message: 'Unauthorized' } });
  }

  const started = Date.now();
  const report = { ranAt: new Date().toISOString(), exports: [] };

  try {
    const { db } = initFirebase();

    const ordersSnap = await db.collection('orders').orderBy('createdAt', 'desc').limit(5000).get();
    const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const ordersCsv = toCsv(orders, ['id', 'orderNumber', 'status', 'paymentStatus', 'paymentMethod', 'total', 'currency', 'createdAt', 'updatedAt']);
    await db.collection('backups').doc('orders-' + report.ranAt.slice(0, 10)).set({
      type: 'orders',
      count: orders.length,
      csv: ordersCsv,
      createdAt: report.ranAt,
    });
    report.exports.push({ type: 'orders', count: orders.length });

    const productsSnap = await db.collection('products').limit(5000).get();
    const products = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const productsCsv = toCsv(products, ['id', 'name', 'price', 'stock', 'status', 'category']);
    await db.collection('backups').doc('products-' + report.ranAt.slice(0, 10)).set({
      type: 'products',
      count: products.length,
      csv: productsCsv,
      createdAt: report.ranAt,
    });
    report.exports.push({ type: 'products', count: products.length });

    const customersSnap = await db.collection('customers').limit(5000).get();
    const customers = customersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const customersCsv = toCsv(customers, ['id', 'email', 'name', 'phone', 'country', 'createdAt']);
    await db.collection('backups').doc('customers-' + report.ranAt.slice(0, 10)).set({
      type: 'customers',
      count: customers.length,
      csv: customersCsv,
      createdAt: report.ranAt,
    });
    report.exports.push({ type: 'customers', count: customers.length });

    try {
      await sendToAdmin(db, {
        subject: 'Trendaryo: nightly backup complete',
        text: 'Exported ' + report.exports.map(e => e.type + ':' + e.count).join(', '),
      });
    } catch (e) {
      console.error('[backup] admin email failed:', e.message);
    }

    await beat(db, 'cron:backup', {
      status: 'ok',
      detail: report.exports.map(e => e.type + ':' + e.count).join(', '),
      durationMs: Date.now() - started,
    });

    res.status(200).json({ ok: true, report });
  } catch (e) {
    console.error('Backup cron error:', e);
    try {
      const { db } = initFirebase();
      await beat(db, 'cron:backup', { status: 'error', detail: e.message, durationMs: Date.now() - started });
    } catch (ignored) { }
    res.status(500).json({ error: { message: e.message } });
  }
};
