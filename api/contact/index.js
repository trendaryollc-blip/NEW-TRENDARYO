const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAdmin } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_MESSAGE_LENGTH = 2000;
const MAX_CHAT_LENGTH = 500;

const TOPICS = [
  'orders',
  'returns',
  'shipping',
  'payments',
  'product',
  'account',
  'other',
];

function escapeText(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function chatReply(message) {
  const text = String(message || '').toLowerCase();

  if (/\b(track|tracking|where is my order|shipping status|dispatch)\b/.test(text) || /order\b/.test(text)) {
    return 'You can track your order on the <a href="track-order.html">Track Order</a> page — enter the number from your confirmation email (it looks like TRD-2024-1234). Tracking usually activates within 24 hours of dispatch.';
  }
  if (/\b(return|refund|exchange|money back)\b/.test(text)) {
    return 'We offer returns within 30 days of delivery. Start it on the <a href="return-request.html">Return Request</a> page, and faulty or incorrect items ship back free. Refunds arrive 3-5 business days after we inspect the return.';
  }
  if (/\b(pay|payment|charged|card|stripe|invoice|billing)\b/.test(text)) {
    return 'We accept Visa, Mastercard, American Express, PayPal, Apple Pay and Google Pay. All payments run over a 256-bit SSL connection and your card number is never stored on our servers.';
  }
  if (/\b(discount|coupon|promo|code|offer|WELCOME10)\b/.test(text)) {
    return 'Paste your code in the promo field on the <a href="cart.html">cart page</a> and click Apply. First order? Try <strong>WELCOME10</strong> for 10% off. One code redeems per order.';
  }
  if (/\b(shipping|deliver|arrive\b|delivery time|international)\b/.test(text)) {
    return 'Orders are packed within 24 business hours. Standard shipping is 5-7 business days (free over $50), express is 2-3. We ship worldwide — GCC in 3-5 days, worldwide in 7-14.';
  }
  if (/\b(warranty|broken|broke|not working\b|faulty|defective|damaged|stock|genuine)\b/.test(text)) {
    return 'Every item includes a 12-month manufacturer warranty. Electronics carry the full manufacturer term. Keep your order number — it is all we need to process a claim or exchange.';
  }
  if (/\b(password|login|sign in|account|register|delete my account)\b/.test(text)) {
    return 'Account help is on the <a href="account.html">Account</a> page. Reset your password via <a href="forgot-password.html">Forgot Password</a>, and manage your data from <a href="privacy.html">Privacy</a>.';
  }
  if (/\b(human|agent|representative|someone|talk to\b|call)\b/.test(text)) {
    return 'I can pass your message straight to our team. Message admin@trendaryo.com or call +1 (307) 533-4512 and you will reach a human during support hours (Mon-Fri, 9AM-6PM EST).';
  }
  if (/\b(hi|hello|hey|thank|thanks)\b/.test(text)) {
    return 'Hello! Happy to help. Try asking about <strong>tracking an order</strong>, <strong>returns</strong>, <strong>shipping</strong>, <strong>payments</strong> or <strong>warranty</strong>.';
  }
  return 'I can help with tracking, returns, shipping, payments, promo codes, warranty and account questions. For anything else, send a message below or email admin@trendaryo.com — a real person replies within 1 business day.';
}

function validateMessage(req) {
  const body = req.body || {};

  const name = String(body.name || '').trim().slice(0, 100);
  if (!name) return { error: 'Your name is required' };

  const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
  if (!email || !EMAIL_RE.test(email)) return { error: 'A valid email address is required' };

  const topic = String(body.topic || '').trim().toLowerCase();
  if (!TOPICS.includes(topic)) return { error: 'Please choose a topic' };

  const message = String(body.message || '').trim().slice(0, MAX_MESSAGE_LENGTH);
  if (message.length < 10) return { error: 'Please write a message of at least 10 characters' };

  return {
    data: {
      type: 'message',
      name: escapeText(name),
      email,
      topic,
      message: escapeText(message),
    },
  };
}

function validateChat(req) {
  const body = req.body || {};

  const name = String(body.name || '').trim().slice(0, 100);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 200);

  const message = String(body.message || '').trim().slice(0, MAX_CHAT_LENGTH);
  if (!message) return { error: 'Type a message to start the conversation' };

  return {
    data: {
      type: 'chat',
      name: escapeText(name),
      email: email && EMAIL_RE.test(email) ? email : '',
      message: escapeText(message),
    },
  };
}

module.exports = handler;
module.exports.chatReply = chatReply;

async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 30)) return res.status(429).json({ error: { message: 'Too many requests' } });

  try {
    const { db } = initFirebase();

    if (req.method === 'POST') {
      const body = req.body || {};
      const chat = body.type === 'chat';

      const result = chat ? validateChat(req) : validateMessage(req);
      if (result.error) {
        return res.status(400).json({ error: { message: result.error } });
      }

      if (chat) {
        const reply = chatReply(result.data.message);
        await db.collection('contact_messages').add({
          ...result.data,
          reply,
          createdAt: new Date().toISOString(),
        });
        return res.status(201).json({ data: { reply } });
      }

      await db.collection('contact_messages').add({
        ...result.data,
        status: 'new',
        createdAt: new Date().toISOString(),
      });

      const firstName = result.data.name.split(' ')[0];
      return res.status(201).json({
        data: {
          message: 'Thanks ' + firstName + '! Your message is on its way. We reply within 1 business day.',
        },
      });
    }

    if (req.method === 'GET') {
      const adminUser = await requireAdmin(req, res);
      if (!adminUser) return;

      const snapshot = await db.collection('contact_messages')
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get();
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      return res.status(200).json({ data });
    }

    return res.status(405).json({ error: { message: 'Method not allowed' } });
  } catch (error) {
    console.error('Contact error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};