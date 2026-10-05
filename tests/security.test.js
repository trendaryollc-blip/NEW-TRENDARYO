const assert = require('node:assert/strict');
const test = require('node:test');
const security = require('../api/_lib/security');

function response() {
  return {
    headers: new Map(),
    setHeader(name, value) {
      this.headers.set(name, value);
    },
  };
}

test('sets required response security headers and CSP', () => {
  const res = response();
  security.setSecurityHeaders(res);
  security.setContentSecurityPolicy(res);
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(res.headers.get('X-Frame-Options'), 'DENY');
  assert.match(res.headers.get('Content-Security-Policy'), /object-src 'none'/);
});

test('rate-limits a client and reports remaining capacity', () => {
  const key = `security-test-${Date.now()}-${Math.random()}`;
  assert.equal(security.checkRateLimit(key, 2), true);
  assert.equal(security.getRateLimitHeaders(key, 2)['X-RateLimit-Remaining'], '1');
  assert.equal(security.checkRateLimit(key, 2), true);
  assert.equal(security.checkRateLimit(key, 2), false);
  assert.equal(security.getRateLimitHeaders(key, 2)['X-RateLimit-Remaining'], '0');
});

test('applies rate-limit and security headers to API responses', () => {
  const res = response();
  const req = {
    headers: { 'x-forwarded-for': `security-test-${Date.now()}-${Math.random()}` },
    url: '/testing',
    socket: {},
  };
  assert.equal(security.applyRateLimit(req, res, 1), true);
  assert.equal(res.headers.get('X-RateLimit-Limit'), '1');
  assert.equal(res.headers.get('Strict-Transport-Security'), 'max-age=31536000; includeSubDomains; preload');
});

test('translates known upstream errors without exposing raw messages', () => {
  assert.equal(security.sanitizeError({ code: 'auth/invalid-email' }), 'Invalid email address');
  assert.equal(security.sanitizeError({ code: 'auth/wrong-password' }), 'Invalid credentials');
  assert.equal(security.sanitizeError({ message: 'STRIPE error: details' }), 'Payment processing error');
  assert.equal(security.sanitizeError({ message: 'Firebase unavailable' }), 'Service temporarily unavailable');
  assert.equal(security.sanitizeError({ message: 'secret internal details' }), 'An unexpected error occurred');
});
