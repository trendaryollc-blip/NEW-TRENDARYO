const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadCartManager(initialCart) {
  const values = new Map([
    ['trendaryo_cart', JSON.stringify(initialCart)],
    ['trendaryo_cart_products', '{}'],
  ]);
  const listeners = new Map();
  const badges = {
    'cart-badge': { textContent: '0', style: {} },
    'cart-count': { textContent: '0', style: {} },
  };
  const window = {
    addEventListener(name, listener) {
      const registered = listeners.get(name) || [];
      registered.push(listener);
      listeners.set(name, registered);
    },
    dispatchEvent(event) {
      (listeners.get(event.type) || []).forEach((listener) => listener(event));
    },
  };
  const document = {
    addEventListener(name, listener) {
      if (name === 'DOMContentLoaded') this.onReady = listener;
    },
    getElementById(id) {
      return badges[id] || null;
    },
  };
  const context = vm.createContext({
    window,
    document,
    CustomEvent: class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options.detail;
      }
    },
    localStorage: {
      getItem(key) {
        return values.has(key) ? values.get(key) : null;
      },
      setItem(key, value) {
        values.set(key, value);
      },
      removeItem(key) {
        values.delete(key);
      },
    },
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'cart-manager.js'), 'utf8');
  vm.runInContext(source, context);
  return {
    CartManager: vm.runInContext('CartManager', context),
    badges,
    window,
    listeners,
    ready: document.onReady,
  };
}

test('cart badge counts distinct products and updates immediately for shop additions', () => {
  const { CartManager, badges, ready } = loadCartManager([
    { id: 'headphones', quantity: 2 },
    { id: 'watch', quantity: 1 },
  ]);

  ready();
  assert.equal(CartManager.getCount(), 3);
  assert.equal(CartManager.getProductCount(), 2);
  assert.equal(badges['cart-badge'].textContent, '2');
  assert.equal(badges['cart-badge'].style.display, 'flex');

  CartManager.addItem('headphones', 1);
  assert.equal(CartManager.getCount(), 4);
  assert.equal(CartManager.getProductCount(), 2);
  assert.equal(badges['cart-badge'].textContent, '2');

  CartManager.addItem('speaker', 1);
  assert.equal(CartManager.getProductCount(), 3);
  assert.equal(badges['cart-badge'].textContent, '3');
});

test('cart badge hides when the cart is cleared', () => {
  const { CartManager, badges, ready } = loadCartManager([
    { id: 'headphones', quantity: 1 },
  ]);
  ready();

  CartManager.clear();

  assert.equal(badges['cart-badge'].textContent, '0');
  assert.equal(badges['cart-badge'].style.display, 'none');
});
