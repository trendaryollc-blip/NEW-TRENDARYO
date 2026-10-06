/**
 * TRENDARYO MAIL
 * Transactional email sending for order confirmations and shipping updates.
 *
 * Providers (selected by EMAIL_PROVIDER):
 *   - "resend" : Sent through Resend (https://resend.com). Requires RESEND_API_KEY
 *                and EMAIL_FROM (a verified sender).
 *   - "console": Logs to the server console (useful for local dev / preview).
 *   - any other/missing value: emails are skipped and logged. Orders are never
 *                blocked by an email failure; mail is best-effort.
 *
 * Env vars:
 *   EMAIL_PROVIDER   "resend" | "console" | (default: console if no key, else resend)
 *   RESEND_API_KEY   API key for Resend
 *   EMAIL_FROM       verified sender, e.g. "Trendaryo <orders@trendaryo.com>"
 */
'use strict';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function compactName(name) {
  return String(name || '').trim().slice(0, 60);
}

function money(value, currency) {
  const amount = Number(value) || 0;
  const code = String(currency || 'usd').toUpperCase();
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(amount);
  } catch (e) {
    return code + ' ' + amount.toFixed(2);
  }
}

function orderRows(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  return items.map(function (line) {
    const qty = Number(line.quantity) || 1;
    const price = Number(line.price) || 0;
    const lineTotal = Number(line.lineTotal) || price * qty;
    return (
      '<tr>' +
      '<td style="padding:10px 0;border-bottom:1px solid #eee;">' +
      escapeHtml(line.name || 'Product') + ' &times; ' + qty +
      '</td>' +
      '<td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">' +
      money(lineTotal, order.currency) +
      '</td>' +
      '</tr>'
    );
  }).join('');
}

function summaryRows(order) {
  const currency = order.currency;
  const discount = Number(order.discount) || 0;
  const shipping = Number(order.shipping) || 0;
  let rows = '';
  rows += '<tr><td style="padding:6px 0;color:#555;">Subtotal</td><td style="padding:6px 0;text-align:right;">' + money(order.subtotal, currency) + '</td></tr>';
  if (discount > 0) rows += '<tr><td style="padding:6px 0;color:#555;">Discount</td><td style="padding:6px 0;text-align:right;">-' + money(discount, currency) + '</td></tr>';
  rows += '<tr><td style="padding:6px 0;color:#555;">Shipping</td><td style="padding:6px 0;text-align:right;">' + (shipping > 0 ? money(shipping, currency) : 'FREE') + '</td></tr>';
  rows += '<tr><td style="padding:6px 0;color:#555;">Tax</td><td style="padding:6px 0;text-align:right;">' + money(order.tax, currency) + '</td></tr>';
  rows += '<tr><td style="padding:10px 0 0;font-weight:700;">' +
    (order.paymentMethod === 'cod' && order.paymentStatus !== 'paid' ? 'Order Total' : 'Total Paid') +
    '</td><td style="padding:10px 0 0;text-align:right;font-weight:700;">' + money(order.total, currency) + '</td></tr>';
  return rows;
}

function addressBlock(order) {
  const a = order.shippingAddress || {};
  const lines = [compactName(a.fullName), a.street, a.city, a.state, a.zipCode, a.country]
    .filter(function (v) { return String(v || '').trim(); });
  return lines.map(escapeHtml).join('<br>');
}

function wrap(title, innerHtml) {
  return (
    '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#111;">' +
    '<div style="max-width:640px;margin:0 auto;padding:24px;">' +
    '<div style="background:#0a0a2a;border-radius:14px;padding:22px 28px;color:#fff;font-size:22px;font-weight:bold;letter-spacing:1px;">TRENDARYO</div>' +
    '<div style="background:#fff;border:1px solid #e6e9f0;border-radius:14px;margin-top:16px;padding:28px;">' +
    '<h1 style="margin:0 0 12px;font-size:20px;">' + title + '</h1>' +
    innerHtml +
    '</div>' +
    '<p style="color:#8a92a6;font-size:12px;text-align:center;margin-top:18px;">' +
    'Trendaryo — premium electronics &amp; tech accessories. Questions? Reply to this email or visit <a href="https://trendaryo.com/contact.html" style="color:#5a6bd1;">trendaryo.com</a>.</p>' +
    '</div></body></html>'
  );
}

function orderConfirmationEmail(order) {
  const orderNumber = order.orderNumber || order.id || '';
  const title = 'Order Confirmed — ' + escapeHtml(orderNumber);
  const htmlBody =
    '<p>Thank you for your order' + (order.shippingAddress && order.shippingAddress.fullName ? ', ' + escapeHtml(compactName(order.shippingAddress.fullName)) : '') + '!</p>' +
    '<p style="color:#555;">Your order <strong>' + escapeHtml(orderNumber) + '</strong> is confirmed and being prepared for dispatch.</p>' +
    '<table style="width:100%;border-collapse:collapse;margin:18px 0;">' + orderRows(order) + '</table>' +
    '<table style="width:100%;border-collapse:collapse;margin:10px 0 18px;">' + summaryRows(order) + '</table>' +
    '<div style="background:#f7f8fc;border-radius:10px;padding:16px;margin-top:8px;">' +
    '<strong>Shipping to</strong><br>' + addressBlock(order) +
    '</div>';
  const text = [
    'Order Confirmed: ' + orderNumber,
    'Thank you for your order. It is confirmed and being prepared for dispatch.',
    '',
    (Array.isArray(order.items) ? order.items.map(function (l) { return l.name + ' x ' + l.quantity + ' - ' + money(l.lineTotal, order.currency); }).join('\n') : ''),
    '',
    'Total: ' + money(order.total, order.currency),
    'Shipping to: ' + (order.shippingAddress ? order.shippingAddress.fullName : '') + ' ' + (order.shippingAddress ? order.shippingAddress.street : '') + ' ' + (order.shippingAddress ? order.shippingAddress.city : '') + ' ' + (order.shippingAddress ? order.shippingAddress.country : ''),
  ].filter(Boolean).join('\n');
  return { subject: 'Order ' + orderNumber + ' confirmed — Trendaryo', html: wrap(title, htmlBody), text: text };
}

function shippingUpdateEmail(order) {
  const orderNumber = order.orderNumber || order.id || '';
  const title = 'Order Shipped — ' + escapeHtml(orderNumber);
  const trackingLine = order.trackingNumber
    ? '<p>Track your parcel with ' + escapeHtml(order.carrier || 'our carrier') + ' using tracking number <strong>' + escapeHtml(order.trackingNumber) + '</strong>.</p>'
    : '<p>Your parcel is on the way. Tracking details will appear shortly on the <a href="https://trendaryo.com/track-order.html">Track Order</a> page.</p>';
  const htmlBody =
    '<p>Good news — your order <strong>' + escapeHtml(orderNumber) + '</strong> has shipped!</p>' +
    trackingLine +
    '<div style="background:#f7f8fc;border-radius:10px;padding:16px;margin-top:8px;">' +
    '<strong>Delivery to</strong><br>' + addressBlock(order) +
    '</div>';
  return {
    subject: 'Your Trendaryo order ' + orderNumber + ' has shipped',
    html: wrap(title, htmlBody),
    text: 'Your order ' + orderNumber + ' has shipped.' + (order.trackingNumber ? ' Tracking: ' + order.trackingNumber : '') + (order.carrier ? ' Carrier: ' + order.carrier : ''),
  };
}

async function send(opts) {
  const provider = (process.env.EMAIL_PROVIDER || (process.env.RESEND_API_KEY ? 'resend' : 'console')).toLowerCase();
  if (provider === 'console') {
    console.log('[mail:console]', JSON.stringify({ to: opts.to, subject: opts.subject }));
    return { ok: true, via: 'console' };
  }
  if (provider !== 'resend' || !process.env.RESEND_API_KEY) {
    console.warn('[mail] No email provider configured (EMAIL_PROVIDER=resend + RESEND_API_KEY, or EMAIL_PROVIDER=console). Email skipped for ' + opts.to + ': ' + opts.subject);
    return { ok: false, skipped: true };
  }
  if (!process.env.EMAIL_FROM) {
    console.warn('[mail] EMAIL_FROM not configured. Email skipped for ' + opts.subject);
    return { ok: false, skipped: true };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html || '',
        text: opts.text || '',
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      console.error('[mail] Resend failed', res.status, detail);
      return { ok: false };
    }
    return { ok: true, via: 'resend' };
  } catch (error) {
    console.error('[mail] Sending failed:', error.message);
    return { ok: false };
  }
}

async function sendOrderConfirmation(order) {
  const to = (order.shippingAddress && order.shippingAddress.email) || order.email || null;
  if (!to) return { ok: false, skipped: true };
  const mail = orderConfirmationEmail(order);
  return send({ to: String(to).trim(), subject: mail.subject, html: mail.html, text: mail.text });
}

async function sendShippingUpdate(order) {
  const to = (order.shippingAddress && order.shippingAddress.email) || order.email || null;
  if (!to) return { ok: false, skipped: true };
  const mail = shippingUpdateEmail(order);
  return send({ to: String(to).trim(), subject: mail.subject, html: mail.html, text: mail.text });
}

module.exports = {
  send,
  sendOrderConfirmation,
  sendShippingUpdate,
  orderConfirmationEmail,
  shippingUpdateEmail,
};