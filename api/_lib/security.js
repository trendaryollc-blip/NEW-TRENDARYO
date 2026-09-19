const RATE_LIMIT_STORE = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
}

function setContentSecurityPolicy(res) {
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com https://apis.google.com https://js.stripe.com https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https: http:",
    "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://api.stripe.com wss://*.firebaseio.com",
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  res.setHeader('Content-Security-Policy', csp);
}

function checkRateLimit(identifier, maxRequests = 100) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;

  if (!RATE_LIMIT_STORE.has(identifier)) {
    RATE_LIMIT_STORE.set(identifier, []);
  }

  const timestamps = RATE_LIMIT_STORE.get(identifier).filter(t => t > windowStart);
  RATE_LIMIT_STORE.set(identifier, timestamps);

  if (timestamps.length >= maxRequests) {
    return false;
  }

  timestamps.push(now);
  return true;
}

function getRateLimitHeaders(identifier, maxRequests = 100) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;
  const timestamps = (RATE_LIMIT_STORE.get(identifier) || []).filter(t => t > windowStart);
  const remaining = Math.max(0, maxRequests - timestamps.length);

  return {
    'X-RateLimit-Limit': String(maxRequests),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(Math.ceil((windowStart + RATE_LIMIT_WINDOW) / 1000)),
  };
}

function applyRateLimit(req, res, maxRequests = 100) {
  setSecurityHeaders(res);

  const identifier = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const rateLimitKey = `${identifier}:${req.url || '/'}`;

  if (!checkRateLimit(rateLimitKey, maxRequests)) {
    const headers = getRateLimitHeaders(rateLimitKey, maxRequests);
    Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
    res.setHeader('Retry-After', '60');
    return false;
  }

  const headers = getRateLimitHeaders(rateLimitKey, maxRequests);
  Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));
  return true;
}

function sanitizeError(error) {
  const safeMessages = {
    'auth/email-already-exists': 'An account with this email already exists',
    'auth/invalid-email': 'Invalid email address',
    'auth/weak-password': 'Password is too weak',
    'auth/user-not-found': 'Invalid credentials',
    'auth/wrong-password': 'Invalid credentials',
    'auth/too-many-requests': 'Too many attempts. Please try again later',
    'auth/invalid-credential': 'Invalid credentials',
  };

  if (error.code && safeMessages[error.code]) {
    return safeMessages[error.code];
  }

  if (error.message && error.message.includes('STRIPE')) {
    return 'Payment processing error';
  }

  if (error.message && error.message.includes('Firebase')) {
    return 'Service temporarily unavailable';
  }

  return 'An unexpected error occurred';
}

module.exports = {
  setSecurityHeaders,
  setContentSecurityPolicy,
  checkRateLimit,
  getRateLimitHeaders,
  applyRateLimit,
  sanitizeError,
};
