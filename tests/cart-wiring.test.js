const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('pages with add-to-cart UI load cart-manager.js', () => {
  const pages = fs.readdirSync(root).filter((f) => f.endsWith('.html'));
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const hasAddToCartUi = /data-add=|data-qv-add=/.test(html);
    if (!hasAddToCartUi) continue;
    assert.match(
      html,
      /<script src="cart-manager\.js"><\/script>/,
      `${page} renders add-to-cart buttons but does not load cart-manager.js`
    );
  }
});

test('components.js updates the cart badge on cartUpdated without cart-manager.js', () => {
  const source = fs.readFileSync(path.join(root, 'components.js'), 'utf8');
  assert.match(source, /addEventListener\(['"]cartUpdated['"],\s*refreshCartBadges\)/);
  assert.match(source, /getElementById\(['"]cart-badge['"]\)/);
});

test('cart.html works even when the cached CartManager lacks getProductCount', () => {
  const html = fs.readFileSync(path.join(root, 'cart.html'), 'utf8');
  assert.match(html, /typeof CartManager\.getProductCount === 'function'/);
});

test('vercel.json does not serve JavaScript as immutable (prevents stale-JS desync)', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const jsRule = vercel.routes.find((r) => r.src === '/(.*\\.js)');
  assert.ok(jsRule, 'expected a route for *.js');
  assert.doesNotMatch(jsRule.headers['Cache-Control'], /immutable/);
});
