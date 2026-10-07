/**
 * TRENDARYO API - AI relay
 * ---------------------------------------------------------------------------
 * The admin deck normally calls the AI provider straight from the browser.
 * Some networks, extensions or policies drop that cross-origin request and the
 * browser only reports "Failed to fetch". This endpoint is the same-origin
 * fallback: the admin sends the prompt plus the key that is already stored in
 * this browser, the server forwards it to the provider, and the text comes back.
 *
 * The key is never written to Firestore or logs - it passes through in memory
 * only. Admin auth is required, so this can never be used as an open proxy.
 */
const { handleCors } = require('./_lib/cors');
const { requireAdmin } = require('./_lib/auth');
const { applyRateLimit } = require('./_lib/security');

const PROVIDERS = {
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    envKey: 'OPENAI_API_KEY',
    title: 'OpenAI',
  },
  openrouter: {
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    envKey: 'OPENROUTER_API_KEY',
    title: 'OpenRouter',
    headers: { 'X-Title': 'Trendaryo Admin' },
  },
  groq: {
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    envKey: 'GROQ_API_KEY',
    title: 'Groq',
  },
  gemini: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/',
    envKey: 'GEMINI_API_KEY',
    title: 'Google Gemini',
    kind: 'gemini',
  },
  anthropic: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    envKey: 'ANTHROPIC_API_KEY',
    title: 'Anthropic',
    kind: 'anthropic',
  },
};

const MAX_PROMPT_CHARS = 60000;
const MAX_SECONDS = 60;

function clean(value, max) {
  return String(value == null ? '' : value).slice(0, max);
}

function buildUpstream(provider, key, model, system, user) {
  const headers = { 'Content-Type': 'application/json' };

  if (provider.kind === 'gemini') {
    const url = `${provider.endpoint}${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    return {
      url,
      headers,
      body: {
        contents: [{ role: 'user', parts: [{ text: `${system}\n\n${user}` }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1200 },
      },
    };
  }

  if (provider.kind === 'anthropic') {
    headers['x-api-key'] = key;
    headers['anthropic-version'] = '2023-06-01';
    return {
      url: provider.endpoint,
      headers,
      body: { model, max_tokens: 1200, system, messages: [{ role: 'user', content: user }] },
    };
  }

  headers.Authorization = `Bearer ${key}`;
  Object.assign(headers, provider.headers || {});
  return {
    url: provider.endpoint,
    headers,
    body: {
      model,
      temperature: 0.7,
      max_tokens: 1200,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    },
  };
}

function extractText(kind, data) {
  if (kind === 'gemini') {
    const parts = data && data.candidates && data.candidates[0] &&
      data.candidates[0].content && data.candidates[0].content.parts;
    let text = '';
    for (const part of parts || []) text += part.text || '';
    return text;
  }
  if (kind === 'anthropic') {
    let text = '';
    for (const block of (data && data.content) || []) {
      if (block.type === 'text') text += block.text;
    }
    return text;
  }
  return data && data.choices && data.choices[0] && data.choices[0].message
    ? data.choices[0].message.content || ''
    : '';
}

function snippet(raw) {
  return String(raw || '').replace(/\s+/g, ' ').slice(0, 300);
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  // Bulk runs (SEO autofill across the whole shelf) go through this route when
  // the direct browser call is blocked, so the ceiling stays generous - it is
  // admin-authenticated, and the per-call generation time caps the real rate.
  if (!applyRateLimit(req, res, 60)) {
    return res.status(429).json({ error: { message: 'Too many requests' } });
  }

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: { message: 'Method not allowed' } });
    }

    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;

    const body = req.body || {};
    const provider = PROVIDERS[String(body.provider || '').toLowerCase()];
    if (!provider) {
      return res.status(400).json({ error: { message: `Unsupported provider: ${clean(body.provider, 40)}` } });
    }

    const model = clean(body.model, 120).trim();
    const system = clean(body.system, MAX_PROMPT_CHARS);
    const user = clean(body.user, MAX_PROMPT_CHARS);
    if (!model) return res.status(400).json({ error: { message: 'A model is required' } });
    if (!user && !system) return res.status(400).json({ error: { message: 'An empty prompt was sent' } });

    const key = clean(body.key, 400).trim() || String(process.env[provider.envKey] || '').trim();
    if (!key) {
      return res.status(400).json({
        error: { message: `No ${provider.title} key - save one in Admin > Settings > AI configuration.` },
      });
    }

    const seconds = Math.min(MAX_SECONDS, Math.max(5, parseInt(body.seconds, 10) || 45));
    const upstream = buildUpstream(provider, key, model, system, user);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), seconds * 1000);

    let response;
    try {
      response = await fetch(upstream.url, {
        method: 'POST',
        headers: upstream.headers,
        body: JSON.stringify(upstream.body),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      const message = error && error.name === 'AbortError'
        ? `${provider.title} timed out after ${seconds}s.`
        : `Could not reach ${provider.title} from the server.`;
      return res.status(502).json({ error: { message } });
    }
    clearTimeout(timer);

    const raw = await response.text();
    if (!response.ok) {
      let upstreamMessage = '';
      try {
        const parsed = JSON.parse(raw);
        upstreamMessage = (parsed.error && (parsed.error.message || parsed.error.type)) ||
          (parsed.message) || '';
      } catch (e) {
        upstreamMessage = snippet(raw);
      }
      return res.status(response.status).json({
        error: {
          message: `${provider.title} replied ${response.status}: ${clean(upstreamMessage, 240) || 'request rejected'}`,
        },
      });
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return res.status(502).json({ error: { message: `${provider.title} returned non-JSON data.` } });
    }

    const text = extractText(provider.kind, data);
    if (!text) {
      return res.status(502).json({ error: { message: `${provider.title} returned an empty response.` } });
    }

    return res.status(200).json({ data: { text, provider: String(body.provider).toLowerCase(), model } });
  } catch (error) {
    console.error('AI relay error:', error && error.message);
    return res.status(500).json({ error: { message: 'AI relay failed unexpectedly.' } });
  }
};
