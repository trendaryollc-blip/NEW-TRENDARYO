/**
 * TRENDARYO BACKEND BRIDGE
 * ---------------------------------------------------------------------------
 * Connects the static storefront to the serverless API / Firestore.
 *
 *  - Catalogue : fetched from /api/products, cached in localStorage and used
 *                by products-data.js as its source of truth (one-time reload
 *                when the server catalogue changes).
 *  - Cart      : merged with the signed-in user's Firestore cart and kept in
 *                sync on every change.
 *  - Auth      : thin helpers around Firebase Auth for other scripts.
 *  - Newsletter: wires any element carrying [data-newsletter-form].
 *
 * Load order on a page:
 *   config.js -> firebase-config.js -> api-client.js -> products-data.js ->
 *   cart-manager.js -> backend-bridge.js
 */
(function () {
  'use strict';

  var CATALOG_CACHE_KEY = 'trendaryo_catalog_cache';
  var CATALOG_VERSION_KEY = 'trendaryo_catalog_version';
  var RELOAD_GUARD = 'trendaryo_catalog_reloaded';

  function api() { return window.API; }
  function haveApi() { return !!(window.API && typeof window.API.request === 'function'); }

  function lsGet(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function lsSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* quota */ }
  }

  function hashString(str) {
    var h = 5381, i = str.length;
    while (i) h = (h * 33) ^ str.charCodeAt(--i);
    return (h >>> 0).toString(36) + ':' + str.length;
  }

  /* ------------------------------------------------------------------ */
  /* Catalogue                                                          */
  /* ------------------------------------------------------------------ */

  function toFrontendProduct(p) {
    var specs = [];
    if (Array.isArray(p.specs)) {
      specs = p.specs.map(function (s) {
        return Array.isArray(s) ? s : [s.label || '', s.value || ''];
      });
    }
    return {
      id: p.id || p.slug,
      name: p.name || 'Product',
      description: p.description || '',
      price: Number(p.price) || 0,
      oldPrice: p.originalPrice != null ? Number(p.originalPrice) : undefined,
      emoji: p.emoji || '📦',
      badge: p.badge || null,
      rating: Number(p.rating) || 0,
      reviews: Number(p.reviewCount) || 0,
      image: p.image || (p.images && p.images[0]) || '',
      category: p.category || '',
      brand: p.brand || '',
      stock: p.stock,
      sku: p.sku || '',
      specs: specs,
      features: p.features || [],
      _backend: true
    };
  }

  var Backend = window.TrendaryoBackend = {};

  Backend.mapProduct = toFrontendProduct;

  Backend.hydrateCatalog = function () {
    if (!haveApi()) return Promise.resolve(false);
    return api().getProducts(1, 500, { status: 'active' }).then(function (res) {
      var list = (res && res.data) || [];
      if (!Array.isArray(list) || !list.length) return false;

      var mapped = list.map(toFrontendProduct);
      var serialized = JSON.stringify(mapped);
      var version = hashString(serialized);
      var knownVersion = window.__CATALOG_VERSION__ || null;

      lsSet(CATALOG_CACHE_KEY, mapped);
      lsSet(CATALOG_VERSION_KEY, version);

      if (knownVersion !== version) {
        // The catalogue changed on the server (or this is the first visit, when
        // products-data.js had no cache yet). Reload once so the synchronous
        // renderers pick up the cached copy without per-page rewrites.
        if (!sessionStorage.getItem(RELOAD_GUARD)) {
          sessionStorage.setItem(RELOAD_GUARD, '1');
          window.location.reload();
        }
      }
      return true;
    }).catch(function () { return false; });
  };

  /* ------------------------------------------------------------------ */
  /* Cart                                                               */
  /* ------------------------------------------------------------------ */

  function localCart() {
    try { return window.CartManager ? window.CartManager.getCart() : []; }
    catch (e) { return lsGet('trendaryo_cart', []); }
  }

  function serverPayload() {
    return localCart().map(function (item) {
      return { productId: String(item.id), quantity: Number(item.quantity) || 1 };
    });
  }

  function currentUser() {
    if (window.firebase && firebase.auth && firebase.auth().currentUser) return firebase.auth().currentUser;
    return null;
  }

  Backend.isLoggedIn = function () { return !!currentUser(); };

  Backend.syncCart = function () {
    if (!haveApi() || !currentUser()) return Promise.resolve();
    return api().getCart().then(function (res) {
      var server = (res && res.data && res.data.items) || [];
      var merged = {};
      var i;

      for (i = 0; i < server.length; i++) {
        var s = server[i];
        merged[String(s.productId)] = Number(s.quantity) || 1;
      }
      var local = localCart();
      for (i = 0; i < local.length; i++) {
        var id = String(local[i].id);
        merged[id] = (merged[id] || 0) + (Number(local[i].quantity) || 1);
      }

      var items = Object.keys(merged).map(function (id) {
        return { productId: id, quantity: merged[id] };
      });

      if (items.length) return api().request('/cart', { method: 'PUT', body: { items } });
      return null;
    }).catch(function () { /* offline - keep local cart */ });
  };

  Backend.pushCart = function () {
    if (!haveApi() || !currentUser()) return Promise.resolve();
    return api().request('/cart', { method: 'PUT', body: { items: serverPayload() } }).catch(function () {});
  };

  /* ------------------------------------------------------------------ */
  /* Auth + settings + newsletter                                       */
  /* ------------------------------------------------------------------ */

  Backend.getUser = function () {
    var u = currentUser();
    if (!u) return null;
    return { uid: u.uid, email: u.email, displayName: u.displayName || '' };
  };

  Backend.getSettings = function () {
    if (!haveApi()) return Promise.resolve(null);
    return api().getSettings().then(function (r) { return r.data; }).catch(function () { return null; });
  };

  Backend.subscribeNewsletter = function (email) {
    if (!haveApi()) return Promise.reject(new Error('Backend unavailable'));
    return api().subscribeNewsletter(email);
  };

  function bindNewsletterForms() {
    var forms = document.querySelectorAll('[data-newsletter-form]');
    for (var i = 0; i < forms.length; i++) {
      (function (form) {
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var input = form.querySelector('input[type="email"]');
          if (!input || !input.value) return;
          Backend.subscribeNewsletter(input.value.trim()).then(function () {
            var msg = form.querySelector('[data-newsletter-msg]');
            if (msg) { msg.textContent = 'Subscribed. Welcome to Trendaryo.'; msg.style.color = 'var(--accent-3, #0f8)'; }
            input.value = '';
          }).catch(function (err) {
            var msg = form.querySelector('[data-newsletter-msg]');
            if (msg) { msg.textContent = (err && err.message) || 'Subscription failed'; msg.style.color = 'var(--danger, #f66)'; }
          });
        });
      })(forms[i]);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                               */
  /* ------------------------------------------------------------------ */

  var pushCartDebounced = null;
  function debouncePush() {
    if (pushCartDebounced) clearTimeout(pushCartDebounced);
    pushCartDebounced = setTimeout(function () { Backend.pushCart(); }, 600);
  }

  function ensureClient() {
    if (haveApi()) return Promise.resolve();
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = 'api-client.js';
      s.onload = resolve;
      s.onerror = resolve;
      document.head.appendChild(s);
    });
  }

  function boot() {
    bindNewsletterForms();
    ensureClient().then(function () {
      Backend.hydrateCatalog();
      if (currentUser()) {
        Backend.syncCart();
        window.addEventListener('cartUpdated', debouncePush);
      }
      if (window.firebase && firebase.auth) {
        firebase.auth().onAuthStateChanged(function (user) {
          if (user) {
            Backend.syncCart();
            window.addEventListener('cartUpdated', debouncePush);
          }
        });
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();
