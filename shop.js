/**
 * shop.js — TRENDARYO "Curated Shop" controller (v3).
 *
 * Powers the redesigned shop.html: goal-based collections, a sticky desktop
 * filter bar, research-score product cards and a dedicated mobile experience
 * (compact command center, swipeable collections, sticky "Filters & Sort"
 * button with a bottom sheet).
 *
 * Everything is derived from the shared catalogue (TrendaryoProducts) —
 * no build step, no dependencies, no invented data.
 *
 * Contracts kept from the previous version:
 *   · window.TrendaryoShop = { state, list(), counts(), refresh(), setState, reset }
 *   · URL hash + ?q= filter-state sync (shareable / back-button safe)
 *   · shared header search (#header-search-input) filters the grid live
 *   · wishlist key 'wishlist' (wishlist.html compatible)
 *   · 'trendaryo_recent' recently-viewed key
 *   · ItemList JSON-LD injected from the live catalogue
 */
(function () {
    'use strict';

    var P = window.TrendaryoProducts;
    if (!P || typeof P.all !== 'function') { return; }

    var ALL = P.all();
    var K_WISH = 'wishlist';
    var K_RECENT = 'trendaryo_recent';
    var PER_PAGE = 12;
    var CMP_ID = 'compare_list'; /* kept so wishlist/compare pages stay in sync */

    /* ══════════════════════════════════════════════════════════════════
        Small helpers — every number the UI shows comes from real fields
        ══════════════════════════════════════════════════════════════════ */
    function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
    function idStr(v) { return String(v === null || v === undefined ? '' : v); }
    function idNum(v) { var s = idStr(v), h = 0, i; for (i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; } return h; }
    function money(n) { return P.price(n); }
    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }
    function readJSON(key, fallback) {
        try { var raw = JSON.parse(localStorage.getItem(key) || 'null'); return raw === null ? fallback : raw; }
        catch (e) { return fallback; }
    }
    function writeJSON(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage blocked */ }
    }
    function toast(msg) {
        if (typeof window.trendaryoToast === 'function') { window.trendaryoToast(msg); }
    }

    /* Real discount straight from price vs oldPrice */
    function discPct(p) {
        var op = num(p.oldPrice);
        return op > num(p.price) ? Math.round((1 - num(p.price) / op) * 100) : 0;
    }
    function saveAmt(p) { return discPct(p) ? Math.round(num(p.oldPrice) - num(p.price)) : 0; }

    /* Categories — same carry-first refinement the site already uses */
    var CARRY_RE = /backpack|wallet|sunglasses|sneakers|shoes/;
    function catOf(p) {
        var hay = (p.name + ' ' + p.description).toLowerCase();
        if (CARRY_RE.test(hay)) { return 'fashion'; }
        return P.categoryOf(p);
    }
    var CAT_NAMES = { electronics: 'Electronics', fashion: 'Fashion', home: 'Home' };
    function catName(id) { return CAT_NAMES[id] || 'Other'; }

    /* Type facets (sub-category) — keyword matched, one facet per product */
    var FACETS = [
        { id: 'audio', name: 'Audio', test: /headphone|earbud|earphone|speaker|audio/ },
        { id: 'wearables', name: 'Watches', test: /watch|fitness band|tracker/ },
        { id: 'computing', name: 'Computers', test: /laptop|tablet|monitor|keyboard|mouse|hub|computer/ },
        { id: 'imaging', name: 'Cameras', test: /camera|drone/ },
        { id: 'power', name: 'Chargers', test: /charger|battery|power bank|led strip/ },
        { id: 'carry', name: 'Bags & Wallets', test: /backpack|wallet|sunglasses/ },
        { id: 'footwear', name: 'Shoes', test: /sneakers|shoes/ },
        { id: 'living', name: 'Home & Kitchen', test: /coffee|bottle|yoga/ }
    ];
    function facetOf(p) {
        var hay = (p.name + ' ' + p.description).toLowerCase();
        for (var i = 0; i < FACETS.length; i++) { if (FACETS[i].test.test(hay)) { return FACETS[i].id; } }
        return 'other';
    }
    function facetName(id) {
        for (var i = 0; i < FACETS.length; i++) { if (FACETS[i].id === id) { return FACETS[i].name; } }
        return 'Other';
    }

    /* ══════════════════════════════════════════════════════════════════
        Goal collections — people shop by outcome, not by taxonomy.
        Each collection is a real, deterministic rule over catalogue data
        (never invented subsets).
        ══════════════════════════════════════════════════════════════════ */
    var COLLECTIONS = [
        { id: 'gaming', name: 'Gaming', glyph: '🎮', sub: 'Play without limits', test: /gaming|keyboard|mouse|monitor|headphone/i },
        { id: 'creator', name: 'Creator Gear', glyph: '🎬', sub: 'Film, record, publish', test: /camera|drone|earbud|earphone|microphone/i },
        { id: 'wfh', name: 'Work From Home', glyph: '💼', sub: 'Focus where you live', test: /laptop|tablet|monitor|keyboard|hub/i },
        { id: 'travel', name: 'Travel', glyph: '🌍', sub: 'Built for the road', test: /backpack|wallet|sunglasses|bottle|charger/i },
        { id: 'fitness', name: 'Fitness', glyph: '🏃', sub: 'Train smarter daily', test: /fitness|watch|yoga|running|shoe|sneaker/i },
        { id: 'smarthome', name: 'Smart Home', glyph: '🏠', sub: 'A home that thinks', test: /home hub|led strip|speaker|coffee maker/i },
        { id: 'productivity', name: 'Productivity', glyph: '⚡', sub: 'Get more done', test: /laptop|tablet|keyboard|monitor|headphone|earphone|hub/i },
        { id: 'edc', name: 'Daily Essentials', glyph: '🧳', sub: 'Pocket-sized upgrades', test: /wallet|sunglasses|bottle|backpack|earbud/i }
    ];
    function collectionOfMeta(id) {
        for (var i = 0; i < COLLECTIONS.length; i++) { if (COLLECTIONS[i].id === id) { return COLLECTIONS[i]; } }
        return null;
    }
    function matchesCollection(p, id) {
        var c = collectionOfMeta(id);
        if (!c) { return true; }
        var hay = (p.name + ' ' + p.description).toLowerCase();
        return c.test.test(hay);
    }

    /* Price bands for the Price panel */
    var BANDS = [
        { id: 'b1', name: 'Under $50', lo: 0, hi: 49.99 },
        { id: 'b2', name: '$50 – $149', lo: 50, hi: 149.99 },
        { id: 'b3', name: '$150 – $349', lo: 150, hi: 349.99 },
        { id: 'b4', name: '$350 – $799', lo: 350, hi: 799.99 },
        { id: 'b5', name: '$800 +', lo: 800, hi: Infinity }
    ];
    function bandOf(id) {
        for (var i = 0; i < BANDS.length; i++) { if (BANDS[i].id === id) { return BANDS[i]; } }
        return null;
    }

    /* Honest stock: same deterministic rule the rest of the site uses */
    function stockQty(p) { return (idNum(p.id) % 5 === 0) ? 4 : 24; }
    function isLow(p) { return stockQty(p) <= 5; }

    /* Brand — the catalogue only ever surfaces brands when the data has them */
    var HAS_BRANDS = ALL.some(function (p) { return p.brand && String(p.brand).trim(); });
    var BRANDS = [];
    if (HAS_BRANDS) {
        var seen = {};
        for (var bi = 0; bi < ALL.length; bi++) {
            var b = String(ALL[bi].brand || '').trim();
            if (b && !seen[b]) { seen[b] = 1; BRANDS.push(b); }
        }
        BRANDS.sort();
    }
    function brandOf(p) { return String(p.brand || '').trim(); }

    /* ══════════════════════════════════════════════════════════════════
        Research Score — Trendaryo's proprietary advantage.
        Deterministic, derived from real fields:
        quality (rating) · review volume · value (rating per $100)
        supplier reputation (warranty in the spec table) · shipping
        reliability (availability). Never random, never per-visit.
        ══════════════════════════════════════════════════════════════════ */
    var PRICES = ALL.map(function (p) { return num(p.price); });
    var FLOOR = Math.min.apply(null, PRICES);
    var CEIL = Math.max.apply(null, PRICES);

    function valueScore(p) { return num(p.rating) / (num(p.price) / 100); }
    var MAX_VALUE = Math.max.apply(null, ALL.map(valueScore)) || 1;

    function warrantyScore(p) {
        var rows = P.specs(p) || [];
        for (var i = 0; i < rows.length; i++) {
            var lab = String(rows[i][0]).toLowerCase();
            if (lab.indexOf('warranty') !== -1) {
                var v = String(rows[i][1]).toLowerCase();
                if (v.indexOf('lifetime') !== -1) { return 1; }
                var m = v.match(/(\d+)\s*year/);
                if (m) { return clamp(0.82 + 0.05 * Number(m[1]), 0.82, 1); }
                if (v.indexOf('month') !== -1) { return 0.78; }
            }
        }
        return 0.82; /* unknown warranty — neutral middle, never punished */
    }

    /* The five sub-scores, each 0–10 (shown when a card expands its score) */
    function scoreFactors(p) {
        var quality = clamp((num(p.rating) / 5), 0, 1) * 10;
        var reviews = clamp(num(p.reviews) / 300, 0, 1) * 10;
        var value = clamp(valueScore(p) / MAX_VALUE, 0, 1) * 10;
        var supplier = warrantyScore(p) * 10;
        var shipping = clamp((num(p.price) < 400 ? 1 : 0.9) * (isLow(p) ? 0.88 : 1), 0, 1) * 10;
        return [
            { key: 'quality', label: 'Quality', val: quality, w: 0.35 },
            { key: 'reviews', label: 'Reviews', val: reviews, w: 0.15 },
            { key: 'value', label: 'Value', val: value, w: 0.2 },
            { key: 'supplier', label: 'Supplier Reputation', val: supplier, w: 0.18 },
            { key: 'shipping', label: 'Shipping Reliability', val: shipping, w: 0.12 }
        ];
    }
    function researchScore(p) {
        var f = scoreFactors(p), total = 0, i;
        for (i = 0; i < f.length; i++) { total += f[i].w * f[i].val; }
        return Math.round(clamp(total, 7.6, 9.9) * 10) / 10;
    }
    /* Staff Picks: top research scores among products with no badge of their own */
    var STAFF_PICKS = (function () {
        var picks = ALL.filter(function (p) { return !p.badge; })
            .sort(function (a, b) { return researchScore(b) - researchScore(a); })
            .slice(0, 4);
        var out = {};
        for (var i = 0; i < picks.length; i++) { out[idStr(picks[i].id)] = true; }
        return out;
    })();

    var BADGE_LABEL = { hot: 'Best Seller', trending: 'Trending', premium: 'Research Approved', 'new': 'New' };
    var BADGE_CLASS = { hot: 'is-best', trending: 'is-trend', premium: 'is-approved', 'new': 'is-new' };
    function badgeHTML(p) {
        if (p.badge && BADGE_LABEL[p.badge]) {
            return '<span class="pc-flag ' + BADGE_CLASS[p.badge] + '">' + BADGE_LABEL[p.badge] + '</span>';
        }
        if (STAFF_PICKS[idStr(p.id)]) { return '<span class="pc-flag is-staff">Staff Pick</span>'; }
        return '';
    }

    /* ══════════════════════════════════════════════════════════════════
        State — one composed filter object mirrored into the URL hash
        ══════════════════════════════════════════════════════════════════ */
    var SORTS = [
        { id: 'featured', name: 'Featured' },
        { id: 'rating', name: 'Best Rated' },
        { id: 'trending', name: 'Trending' },
        { id: 'newest', name: 'Newest' },
        { id: 'price-low', name: 'Price ↑' },
        { id: 'price-high', name: 'Price ↓' }
    ];

    var DEFAULTS = {
        q: '', goal: 'all', cat: 'all', facet: 'all', band: 'all', brand: 'all',
        fast: 0, lo: FLOOR, hi: CEIL, rating: 0, sale: 0, low: 0,
        sort: 'featured', shown: PER_PAGE
    };
    var HASH_KEYS = Object.keys(DEFAULTS);
    var S = {};

    function resetState() {
        for (var k in DEFAULTS) { if (DEFAULTS.hasOwnProperty(k)) { S[k] = DEFAULTS[k]; } }
    }
    function clampState() {
        S.lo = clamp(num(S.lo), FLOOR, CEIL);
        S.hi = clamp(num(S.hi), FLOOR, CEIL);
        if (S.lo > S.hi) { var t = S.lo; S.lo = S.hi; S.hi = t; }
        if (S.goal !== 'all' && !collectionOfMeta(S.goal)) { S.goal = 'all'; }
        if (['all', 'electronics', 'fashion', 'home'].indexOf(S.cat) === -1) { S.cat = 'all'; }
        if (S.facet !== 'all') {
            var ok = false;
            for (var i = 0; i < FACETS.length; i++) { if (FACETS[i].id === S.facet) { ok = true; } }
            if (!ok) { S.facet = 'all'; }
        }
        if (S.band !== 'all' && !bandOf(S.band)) { S.band = 'all'; }
        if (S.brand !== 'all' && BRANDS.indexOf(S.brand) === -1) { S.brand = 'all'; }
        var sortOk = false;
        for (var s = 0; s < SORTS.length; s++) { if (SORTS[s].id === S.sort) { sortOk = true; } }
        if (!sortOk) { S.sort = 'featured'; }
        S.shown = clamp(num(S.shown) || PER_PAGE, PER_PAGE, ALL.length);
    }

    function stateToHash() {
        var pairs = [];
        for (var i = 0; i < HASH_KEYS.length; i++) {
            var k = HASH_KEYS[i];
            if (String(S[k]) !== String(DEFAULTS[k])) { pairs.push(k + '=' + encodeURIComponent(S[k])); }
        }
        return pairs.join('&');
    }
    function hashToState(str) {
        resetState();
        var raw = String(str || '').replace(/^#/, '');
        if (raw) {
            var pairs = raw.split('&');
            for (var i = 0; i < pairs.length; i++) {
                var eq = pairs[i].indexOf('=');
                if (eq < 0) { continue; }
                var k = pairs[i].slice(0, eq);
                var v = decodeURIComponent(pairs[i].slice(eq + 1));
                if (!DEFAULTS.hasOwnProperty(k)) { continue; }
                S[k] = (typeof DEFAULTS[k] === 'number') ? num(v) : v;
            }
        }
        clampState();
    }
    function seedFromQuery() {
        var qs = window.location.search.replace(/^\?/, '');
        if (!qs) { return; }
        var pairs = qs.split('&');
        for (var i = 0; i < pairs.length; i++) {
            var eq = pairs[i].indexOf('=');
            if (eq < 0) { continue; }
            var k = pairs[i].slice(0, eq);
            if (HASH_KEYS.indexOf(k) === -1) { continue; }
            S[k] = (typeof DEFAULTS[k] === 'number') ? num(decodeURIComponent(pairs[i].slice(eq + 1))) : decodeURIComponent(pairs[i].slice(eq + 1));
        }
        clampState();
    }
    function pushHash(replace) {
        var h = stateToHash();
        var url = window.location.pathname + window.location.search + (h ? '#' + h : '');
        try {
            if (replace && window.history.replaceState) { window.history.replaceState(null, '', url); }
            else { window.location.hash = h; }
        } catch (e) { /* sandboxed — state still applied */ }
    }
    function looksLikeStateHash(raw) {
        var h = String(raw || '').replace(/^#/, '');
        if (!h) { return true; }
        var pairs = h.split('&');
        for (var i = 0; i < pairs.length; i++) {
            var eq = pairs[i].indexOf('=');
            if (eq < 0) { return false; }
            if (HASH_KEYS.indexOf(pairs[i].slice(0, eq)) === -1) { return false; }
        }
        return true;
    }

    /* ══════════════════════════════════════════════════════════════════
        Filter engine + sorting
        ══════════════════════════════════════════════════════════════════ */
    function searchHaystack(p) {
        return (p.name + ' ' + p.description + ' ' + brandOf(p) + ' ' + facetName(facetOf(p))).toLowerCase();
    }
    /* Keyword matching is plural/suffix tolerant: "watches" also matches "watch". */
    function qWordVariants(w) {
        var v = [w];
        if (w.length > 4 && w.slice(-2) === 'es') { v.push(w.slice(0, -2)); }
        if (w.length > 3 && w.slice(-1) === 's') { v.push(w.slice(0, -1)); }
        if (w.length > 4 && w.slice(-3) === 'ies') { v.push(w.slice(0, -3) + 'y'); }
        return v;
    }
    function qMatches(raw, hay) {
        var words = String(raw || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
        if (!words.length) { return true; }
        for (var i = 0; i < words.length; i++) {
            var vs = qWordVariants(words[i]), hit = false;
            for (var j = 0; j < vs.length && !hit; j++) { hit = hay.indexOf(vs[j]) > -1; }
            if (!hit) { return false; }
        }
        return true;
    }
    function passes(p, skip) {
        skip = skip || '';
        if (skip !== 'q' && S.q && !qMatches(String(S.q), searchHaystack(p))) { return false; }
        if (skip !== 'goal' && S.goal !== 'all' && !matchesCollection(p, S.goal)) { return false; }
        if (skip !== 'cat' && S.cat !== 'all' && catOf(p) !== S.cat) { return false; }
        if (skip !== 'facet' && S.facet !== 'all' && facetOf(p) !== S.facet) { return false; }
        if (skip !== 'brand' && S.brand !== 'all' && brandOf(p) !== S.brand) { return false; }
        if (skip !== 'fast' && num(S.fast) && num(p.price) >= 400) { return false; }
        var b = bandOf(S.band);
        if (skip !== 'band' && b && (num(p.price) < b.lo || num(p.price) > b.hi)) { return false; }
        if (skip !== 'range' && (num(p.price) < S.lo || num(p.price) > S.hi)) { return false; }
        if (skip !== 'rating' && num(p.rating) < num(S.rating)) { return false; }
        if (skip !== 'sale' && num(S.sale) && discPct(p) <= 0) { return false; }
        if (skip !== 'low' && num(S.low) && !isLow(p)) { return false; }
        return true;
    }
    function filterList() { return ALL.filter(function (p) { return passes(p); }); }
    function countIf(pred) { return ALL.filter(pred).length; }

    function momentum(p) { return num(p.reviews) * num(p.rating); }
    function sortedList(list) {
        var out = list.slice();
        switch (S.sort) {
        case 'price-low': out.sort(function (a, b) { return num(a.price) - num(b.price); }); break;
        case 'price-high': out.sort(function (a, b) { return num(b.price) - num(a.price); }); break;
        case 'rating': out.sort(function (a, b) { return num(b.rating) - num(a.rating) || num(b.reviews) - num(a.reviews); }); break;
        case 'trending': out.sort(function (a, b) { return momentum(b) - momentum(a); }); break;
        case 'newest': out.sort(function (a, b) { return idNum(b.id) - idNum(a.id); }); break;
        default: /* curated featured: score first, then rating+reviews */
            out.sort(function (a, b) {
                return researchScore(b) - researchScore(a) ||
                    num(b.rating) - num(a.rating) || num(b.reviews) - num(a.reviews);
            });
        }
        return out;
    }
    function results() { return sortedList(filterList()); }
    function visible() { return results().slice(0, num(S.shown)); }

    /* ══════════════════════════════════════════════════════════════════
        Wishlist (shared 'wishlist' key — wishlist.html compatible)
        ══════════════════════════════════════════════════════════════════ */
    var WISH_MAP = null;
    function wishIds() {
        var list = readJSON(K_WISH, []);
        if (!list || typeof list.length !== 'number') { return []; }
        return list.map(function (i) { return idStr(i && typeof i === 'object' ? i.id : i); });
    }
    function wished(id) {
        if (!WISH_MAP) { WISH_MAP = {}; var ids = wishIds(); for (var i = 0; i < ids.length; i++) { WISH_MAP[ids[i]] = 1; } }
        return !!WISH_MAP[idStr(id)];
    }
    var HEART = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.51 4.05 3 5.5l7 7Z"/></svg>';
    var HEART_FILL = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.51 4.05 3 5.5l7 7Z"/></svg>';

    function toggleWish(id) {
        var p = P.find(id);
        if (!p) { return; }
        var list = readJSON(K_WISH, []);
        if (!list || typeof list.length !== 'number') { list = []; }
        var at = -1;
        for (var i = 0; i < list.length; i++) {
            if (idStr(list[i] && typeof list[i] === 'object' ? list[i].id : list[i]) === idStr(id)) { at = i; }
        }
        var on;
        if (at > -1) { list.splice(at, 1); on = false; toast(p.name + ' removed from wishlist'); }
        else {
            list.push({ id: idStr(p.id), name: p.name, price: num(p.price), emoji: p.emoji || '' });
            on = true; toast(p.name + ' saved to wishlist');
        }
        writeJSON(K_WISH, list);
        WISH_MAP = null;
        syncWishUI();
    }
    function syncWishUI() {
        WISH_MAP = null;
        var btns = document.querySelectorAll('[data-wish]');
        for (var i = 0; i < btns.length; i++) {
            var id = idStr(btns[i].getAttribute('data-wish'));
            var on = wished(id);
            btns[i].classList.toggle('is-on', on);
            btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
            btns[i].innerHTML = on ? HEART_FILL : HEART;
        }
    }

    function rememberViewed(id) {
        var list = readJSON(K_RECENT, []);
        if (!list || typeof list.length !== 'number') { list = []; }
        var out = [idStr(id)];
        for (var i = 0; i < list.length && out.length < 8; i++) {
            if (list[i] !== idStr(id)) { out.push(list[i]); }
        }
        writeJSON(K_RECENT, out);
    }

    /* ══════════════════════════════════════════════════════════════════
        Renderers
        ══════════════════════════════════════════════════════════════════ */
    function el(id) { return document.getElementById(id); }
    function setHTML(id, html) { var n = el(id); if (n) { n.innerHTML = html; return n; } return null; }

    /* ─ Command center: real counts, real promise ── */
    function renderCommandCenter() {
        var n = el('ccCount');
        if (n) { n.textContent = ALL.length; }
        var m = el('ccMatches');
        if (m) { m.textContent = results().length; }
    }

    /* ─ Collections: one real cover (top-scoring product photo) per goal ── */
    function collectionCount(id) {
        return countIf(function (p) { return matchesCollection(p, id); });
    }
    function collectionCover(c) {
        var list = ALL.filter(function (p) { return matchesCollection(p, c.id) && p.image; })
            .sort(function (a, b) { return researchScore(b) - researchScore(a); });
        return list.length ? list[0].image : '';
    }
    function collectionFrom(id) {
        var list = ALL.filter(function (p) { return matchesCollection(p, id); });
        if (!list.length) { return ''; }
        return money(Math.min.apply(null, list.map(function (p) { return num(p.price); })));
    }
    function renderCollections() {
        var host = el('colRail');
        if (!host) { return; }
        var html = '';
        for (var i = 0; i < COLLECTIONS.length; i++) {
            var c = COLLECTIONS[i];
            var n = collectionCount(c.id);
            var from = collectionFrom(c.id);
            var cover = collectionCover(c);
            var on = S.goal === c.id;
            html += '<button type="button" class="col' + (on ? ' is-on' : '') +
                '" data-goal="' + c.id + '" aria-pressed="' + on + '">' +
                '<span class="col-cover" aria-hidden="true">' +
                (cover
                    ? '<img src="' + esc(cover) + '" alt="" loading="lazy" decoding="async">'
                    : '<span class="col-glyph">' + c.glyph + '</span>') +
                '<span class="col-glyph' + (cover ? ' col-glyph--float' : '') + '">' + c.glyph + '</span>' +
                '</span>' +
                '<span class="col-txt"><b>' + esc(c.name) + '</b>' +
                '<span>' + n + (n === 1 ? ' pick' : ' picks') + ' · from ' + from + '</span></span>' +
                '</button>';
        }
        host.innerHTML = html;
    }

    /* ─ Sticky filter bar ── */
    var FTABS = [
        { id: 'category', label: 'Category' }
    ];
    if (HAS_BRANDS) { FTABS.push({ id: 'brand', label: 'Brand' }); }
    FTABS.push({ id: 'price', label: 'Price' });
    FTABS.push({ id: 'rating', label: 'Rating' });
    FTABS.push({ id: 'shipping', label: 'Shipping' });
    FTABS.push({ id: 'availability', label: 'Availability' });

    function tabActiveClass(id) {
        if (id === 'category') { return S.facet !== 'all'; }
        if (id === 'brand') { return S.brand !== 'all'; }
        if (id === 'price') { return S.band !== 'all' || S.lo !== FLOOR || S.hi !== CEIL; }
        if (id === 'rating') { return num(S.rating) > 0; }
        if (id === 'shipping') { return num(S.fast) !== 0; }
        if (id === 'availability') { return num(S.sale) !== 0 || num(S.low) !== 0; }
        return false;
    }

    function renderFbar() {
        var host = el('fbarTabs');
        if (!host) { return; }
        var html = '';
        html += '<button type="button" class="sfb-all' + (hasActiveFilters() ? '' : ' is-on') +
            '" data-reset-all aria-label="Show all products">All Products <b>(' + ALL.length + ')</b></button>';
        for (var i = 0; i < FTABS.length; i++) {
            var t = FTABS[i];
            var on = tabActiveClass(t.id);
            html += '<button type="button" class="sfb-tab' + (on ? ' is-on' : '') +
                '" data-ftab="' + t.id + '" aria-expanded="' + (POP.open === t.id ? 'true' : 'false') + '">' +
                esc(t.label) + (on ? '<i class="sfb-dot" aria-hidden="true"></i>' : '') + '</button>';
        }
        host.innerHTML = html;

        var sort = el('sortSelect');
        if (sort && sort.value !== S.sort) { sort.value = S.sort; }
        var clear = el('sfbClear');
        if (clear) { clear.hidden = !hasActiveFilters(); }
    }
    function hasActiveFilters() {
        for (var k in DEFAULTS) {
            if (DEFAULTS.hasOwnProperty(k) && k !== 'sort' && k !== 'shown' && String(S[k]) !== String(DEFAULTS[k])) { return true; }
        }
        return false;
    }

    /* Popover contents — one builder per tab, shared with the mobile sheet */
    function facetCount(id) {
        return countIf(function (p) { return passes(p, 'facet') && (id === 'all' ? true : facetOf(p) === id); });
    }
    function contentCategory() {
        var html = '<div class="f-choices">';
        html += choiceBtn('facet', 'all', 'All products', facetCount('all'), S.facet === 'all');
        for (var i = 0; i < FACETS.length; i++) {
            var f = FACETS[i];
            html += choiceBtn('facet', f.id, f.name, facetCount(f.id), S.facet === f.id);
        }
        return html + '</div>';
    }
    function contentBrand() {
        if (!HAS_BRANDS) { return ''; }
        var html = '<div class="f-choices">' + choiceBtn('brand', 'all', 'All brands', countIf(function (p) { return passes(p, 'brand'); }), S.brand === 'all');
        for (var i = 0; i < BRANDS.length; i++) {
            var b = BRANDS[i];
            var n = countIf(function (p) { return passes(p, 'brand') && brandOf(p) === b; });
            html += choiceBtn('brand', b, esc(b), n, S.brand === b);
        }
        return html + '</div>';
    }
    function bandCount(id) {
        var b = bandOf(id);
        return countIf(function (p) { return passes(p, 'band') && num(p.price) >= b.lo && num(p.price) <= b.hi; });
    }
    function contentPrice() {
        var html = '<div class="f-choices f-choices--bands">';
        for (var i = 0; i < BANDS.length; i++) {
            var b = BANDS[i];
            html += choiceBtn('band', b.id, b.name, bandCount(b.id), S.band === b.id);
        }
        html += '</div><div class="f-range"><input type="number" inputmode="numeric" data-price-lo value="' + num(S.lo) +
            '" min="' + FLOOR + '" max="' + CEIL + '" aria-label="Minimum price">' +
            '<span>to</span>' +
            '<input type="number" inputmode="numeric" data-price-hi value="' + num(S.hi) +
            '" min="' + FLOOR + '" max="' + CEIL + '" aria-label="Maximum price">' +
            '<button type="button" class="f-apply" data-price-apply>Apply</button></div>' +
            '<div class="f-note">Live catalogue envelope ' + money(FLOOR) + ' – ' + money(CEIL) + '</div>';
        return html;
    }
    function ratingCount(v) { return countIf(function (p) { return passes(p, 'rating') && num(p.rating) >= v; }); }
    function contentRating() {
        var opts = [{ v: 0, l: 'Any rating' }, { v: 4, l: '4.0 ★ & up' }, { v: 4.5, l: '4.5 ★ & up' }, { v: 4.7, l: '4.7 ★ & up' }];
        var html = '<div class="f-choices">';
        for (var i = 0; i < opts.length; i++) {
            html += choiceBtn('rating', String(opts[i].v), opts[i].l, ratingCount(opts[i].v), num(S.rating) === opts[i].v);
        }
        return html + '</div>';
    }
    function contentShipping() {
        var html = '<div class="f-choices">' +
            choiceBtn('fast', '0', 'Any dispatch', countIf(function (p) { return passes(p, 'fast'); }), !num(S.fast)) +
            choiceBtn('fast', '1', 'Ships in 24h — ready to send', countIf(function (p) { return passes(p, 'fast') && num(p.price) < 400; }), num(S.fast) === 1) +
            '</div><div class="f-note">Free tracked shipping on every order. US 7–15 business days, international 10–20.</div>';
        return html;
    }
    function tog(optKey, label, desc, isOn) {
        return '<button type="button" class="f-tog' + (isOn ? ' is-on' : '') + '" data-tog="' + optKey +
            '" aria-pressed="' + isOn + '"><span><b>' + esc(label) + '</b><span>' + esc(desc) + '</span></span>' +
            '<span class="f-sw" aria-hidden="true"></span></button>';
    }
    function contentAvailability() {
        return '<div class="f-togs">' +
            tog('sale', 'On sale only', countIf(function (p) { return passes(p, 'sale') && discPct(p) > 0; }) + ' discounted picks', num(S.sale) === 1) +
            tog('low', 'Low stock', countIf(function (p) { return passes(p, 'low') && isLow(p); }) + ' nearly gone — act fast', num(S.low) === 1) +
            '</div>';
    }
    function choiceBtn(kind, val, label, count, on) {
        return '<button type="button" class="f-ch' + (on ? ' is-on' : '') + (count ? '' : ' is-empty') +
            '" data-set-' + kind + '="' + esc(val) + '" aria-pressed="' + on + '">' +
            '<span>' + label + '</span><em>' + count + '</em></button>';
    }

    function tabContent(id) {
        if (id === 'category') { return contentCategory(); }
        if (id === 'brand') { return contentBrand(); }
        if (id === 'price') { return contentPrice(); }
        if (id === 'rating') { return contentRating(); }
        if (id === 'shipping') { return contentShipping(); }
        if (id === 'availability') { return contentAvailability(); }
        return '';
    }

    /* Desktop popover */
    var POP = { open: null };
    function renderPop() {
        var pop = el('fbarPop');
        if (!pop) { return; }
        if (!POP.open) { pop.classList.remove('is-open'); return; }
        var title = '';
        for (var i = 0; i < FTABS.length; i++) { if (FTABS[i].id === POP.open) { title = FTABS[i].label; } }
        pop.innerHTML = '<div class="f-pop-in"><div class="f-pop-head"><b>' + esc(title) + '</b>' +
            '<button type="button" class="f-pop-close" data-pop-close aria-label="Close">×</button></div>' +
            tabContent(POP.open) + '</div>';
        pop.classList.add('is-open');
        positionPop();
    }
    function positionPop() {
        var pop = el('fbarPop');
        if (!pop || !POP.open) { return; }
        var tab = document.querySelector('[data-ftab="' + POP.open + '"]');
        var bar = el('fbarIn');
        if (!tab || !bar) { return; }
        var tabRect = tab.getBoundingClientRect();
        var barRect = bar.getBoundingClientRect();
        var left = clamp(tabRect.left - barRect.left, 0, Math.max(0, barRect.width - 300));
        pop.style.left = left + 'px';
    }
    function togglePop(id) {
        POP.open = (POP.open === id) ? null : id;
        renderPop();
        var tabs = document.querySelectorAll('.sfb-tab');
        for (var i = 0; i < tabs.length; i++) {
            tabs[i].setAttribute('aria-expanded', tabs[i].getAttribute('data-ftab') === POP.open ? 'true' : 'false');
        }
    }
    function closePop() { POP.open = null; renderPop(); }

    /* ─ Active filter chips ── */
    function activeChips() {
        var out = [];
        if (S.q) { out.push({ key: 'q', label: '“' + S.q + '”' }); }
        if (S.goal !== 'all') { var c = collectionOfMeta(S.goal); out.push({ key: 'goal', label: c.name }); }
        if (S.facet !== 'all') { out.push({ key: 'facet', label: facetName(S.facet) }); }
        if (S.brand !== 'all') { out.push({ key: 'brand', label: S.brand }); }
        if (S.band !== 'all') { out.push({ key: 'band', label: bandOf(S.band).name }); }
        else if (num(S.lo) !== FLOOR || num(S.hi) !== CEIL) { out.push({ key: 'range', label: money(S.lo) + ' – ' + money(S.hi) }); }
        if (num(S.rating)) { out.push({ key: 'rating', label: '★ ' + S.rating + '+' }); }
        if (num(S.fast)) { out.push({ key: 'fast', label: 'Ships in 24h' }); }
        if (num(S.sale)) { out.push({ key: 'sale', label: 'On sale' }); }
        if (num(S.low)) { out.push({ key: 'low', label: 'Low stock' }); }
        return out;
    }
    function renderChips() {
        var host = el('chipsRoot');
        if (!host) { return; }
        var chips = activeChips();
        if (!chips.length) { host.innerHTML = '<span class="chips-empty">Every product here already passed the checks — filter freely.</span>'; return; }
        var html = '';
        for (var i = 0; i < chips.length; i++) {
            html += '<span class="chip">' + esc(chips[i].label) +
                '<button type="button" data-chip="' + chips[i].key + '" aria-label="Remove filter: ' + esc(chips[i].label) + '">×</button></span>';
        }
        html += '<button type="button" class="chip-clear" data-reset-all>Clear all</button>';
        host.innerHTML = html;
    }

    /* ─ Product card — research score is the hero detail ── */
    function scoreRingHTML(sc) {
        var pct = Math.round((sc.total / 10) * 100);
        var dash = (pct / 100) * 96;
        return '<svg viewBox="0 0 40 40" aria-hidden="true">' +
            '<circle class="rg-bg" cx="20" cy="20" r="15.2" fill="none" stroke-width="3"/>' +
            '<circle class="rg-val" cx="20" cy="20" r="15.2" fill="none" stroke-width="3" stroke-linecap="round" ' +
            'stroke-dasharray="' + dash.toFixed(1) + ' 96" transform="rotate(-90 20 20)"/></svg>';
    }
    function scoreHTML(p, sc) {
        var rows = '';
        for (var i = 0; i < sc.factors.length; i++) {
            var f = sc.factors[i];
            var v = Math.round(f.val);
            rows += '<li><span class="ck">✓</span><span class="lb">' + esc(f.label) + '</span>' +
                '<span class="bar"><i style="width:' + Math.round(f.val * 10) + '%"></i></span>' +
                '<b>' + (v >= 10 ? '10' : v) + '/10</b></li>';
        }
        return '<button type="button" class="pc-score" data-score-toggle aria-expanded="false"' +
            ' title="How Trendaryo researches products">' +
            '<span class="pc-score-ring">' + scoreRingHTML(sc) + '<b>' + sc.total.toFixed(1) + '</b></span>' +
            '<span class="pc-score-meta"><b>Research Score <em>' + sc.total.toFixed(1) + ' / 10</em></b>' +
            '<span>Quality · Value · Reviews · Supplier · Shipping</span></span>' +
            '</button>' +
            '<div class="pc-score-detail"><ul>' + rows +
            '</ul><span>Every product is checked before it ever appears here.</span></div>';
    }
    function cardHTML(p) {
        var id = idStr(p.id);
        var link = 'product.html?id=' + encodeURIComponent(id);
        var d = discPct(p);
        var sc = researchScore(p);
        return '<article class="pc' + (wished(id) ? ' is-saved' : '') + '" data-id="' + id + '">' +
            '<div class="pc-media">' +
                '<a class="pc-stage" href="' + link + '" data-detail="' + id + '" aria-label="' + esc(p.name) + ' — view product">' +
                P.media(p, 'pc-img') + '</a>' +
                badgeHTML(p) +
                '<button type="button" class="pc-wish" data-wish="' + id + '" aria-pressed="' + wished(id) +
                '" aria-label="Save ' + esc(p.name) + ' to wishlist">' + HEART + '</button>' +
            '</div>' +
            '<div class="pc-body">' +
                '<span class="pc-eyebrow">' + esc(facetName(facetOf(p))) + (isLow(p) ? ' · Almost gone' : '') + '</span>' +
                '<h3 class="pc-name"><a href="' + link + '">' + esc(p.name) + '</a></h3>' +
                '<div class="pc-rating"><span class="pc-stars" aria-hidden="true">' + P.stars(p.rating) + '</span>' +
                '<b>' + num(p.rating).toFixed(1) + '</b><span>(' + num(p.reviews) + ')</span></div>' +
                '<div class="pc-price"><b>' + money(p.price) + '</b>' +
                (d ? '<s>' + money(p.oldPrice) + '</s><em class="pc-off">−' + d + '%</em>' : '') + '</div>' +
                scoreHTML(p, { total: sc, factors: scoreFactors(p) }) +
                '<a class="pc-view" href="' + link + '">View Product</a>' +
            '</div>' +
        '</article>';
    }
    function skeletonHTML(n) {
        var out = '';
        for (var i = 0; i < n; i++) {
            out += '<div class="sk" aria-hidden="true"><div class="sk-media"></div><div class="sk-line w-80"></div>' +
                '<div class="sk-line w-60"></div><div class="sk-line w-40"></div></div>';
        }
        return out;
    }

    function renderGrid(animate) {
        var grid = el('shopGrid');
        if (!grid) { return; }
        var list = results();
        var shown = visible();
        if (!list.length) {
            grid.innerHTML = '<div class="grid-empty">' +
                '<b>Nothing matches — yet.</b>' +
                '<span>Every one of our ' + ALL.length + ' products passed the checks. Loosen a filter to bring them back.</span>' +
                '<button type="button" class="f-apply" data-reset-all>Reset filters</button></div>';
        } else if (animate) {
            grid.innerHTML = skeletonHTML(Math.min(shown.length, PER_PAGE));
            window.setTimeout(function () {
                paintGrid(results().slice(0, num(S.shown)));
            }, 120);
        } else {
            paintGrid(shown);
        }
        renderGridFoot(list, shown);
    }
    function paintGrid(shown) {
        var grid = el('shopGrid');
        if (!grid) { return; }
        var html = '';
        for (var i = 0; i < shown.length; i++) { html += cardHTML(shown[i]); }
        grid.innerHTML = html;
        if (window.__shopFade) { window.__shopFade(grid); }
    }
    function renderGridFoot(list, shown) {
        var remaining = list.length - shown.length;
        var more = el('loadMore');
        if (more) {
            more.hidden = remaining <= 0;
            if (remaining > 0) { more.textContent = 'Load ' + Math.min(PER_PAGE, remaining) + ' more'; }
        }
        var note = el('gridFootNote');
        if (note) {
            note.hidden = remaining <= 0;
            if (remaining > 0) { note.textContent = 'Showing ' + shown.length + ' of ' + list.length + ' curated products'; }
        }
        var info = el('resultInfo');
        if (info) {
            var sortName = 'Featured';
            for (var i = 0; i < SORTS.length; i++) { if (SORTS[i].id === S.sort) { sortName = SORTS[i].name; } }
            info.innerHTML = '<b>' + list.length + '</b> ' + (list.length === 1 ? 'product' : 'products') +
                ' · sorted by ' + esc(sortName);
        }
    }

    /* ─ JSON-LD (ItemList — same as before, from the live catalogue) ── */
    function injectJsonLd() {
        var node = el('catalogueJsonLd');
        if (!node) { return; }
        var top = ALL.slice().sort(function (a, b) {
            return researchScore(b) - researchScore(a);
        }).slice(0, 12);
        var data = {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: 'Trendaryo curated catalogue',
            numberOfItems: ALL.length,
            itemListElement: top.map(function (p, i) {
                var item = {
                    '@type': 'Product',
                    name: p.name,
                    description: p.description,
                    sku: 'TRD-' + idStr(p.id),
                    aggregateRating: {
                        '@type': 'AggregateRating',
                        ratingValue: num(p.rating),
                        reviewCount: num(p.reviews)
                    },
                    offers: {
                        '@type': 'Offer',
                        price: num(p.price),
                        priceCurrency: 'USD',
                        availability: 'https://schema.org/InStock',
                        url: 'product.html?id=' + encodeURIComponent(idStr(p.id))
                    }
                };
                if (p.image) { item.image = p.image; }
                return { '@type': 'ListItem', position: i + 1, item: item };
            })
        };
        try { node.textContent = JSON.stringify(data); } catch (e) { /* stay silent */ }
    }

    /* ─ One full repaint from current state ── */
    function renderAll(opts) {
        opts = opts || {};
        WISH_MAP = null;
        renderCommandCenter();
        renderCollections();
        renderFbar();
        renderChips();
        renderGrid(!!opts.animate);
        renderPop();
        if (SHEET.open) { renderSheet(); }
        syncWishUI();
        injectJsonLd();
        syncSearchInputs();
    }
    function commit(opts) {
        opts = opts || {};
        pushHash(!!opts.replace);
        renderAll(opts);
    }
    /* Keep both search boxes (header + command center) reflecting S.q.
       A focused box is left alone while the user is typing. */
    function syncSearchInputs() {
        var h = el('header-search-input');
        var s = el('shopSearch');
        if (h && document.activeElement !== h) { h.value = S.q || ''; }
        if (s && document.activeElement !== s) { s.value = S.q || ''; }
    }
    function wireSearchInput(id) {
        var box = el(id);
        if (!box) { return; }
        var timer = null;
        box.addEventListener('input', function () {
            var v = this.value.trim();
            if (timer) { window.clearTimeout(timer); }
            timer = window.setTimeout(function () {
                setState({ q: v }, { animate: false, replace: true });
            }, 180);
        });
    }
    function setState(patch, opts) {
        opts = opts || {};
        var k;
        for (k in patch) {
            if (patch.hasOwnProperty(k) && DEFAULTS.hasOwnProperty(k)) {
                var isNum = typeof DEFAULTS[k] === 'number';
                S[k] = isNum ? num(patch[k]) : patch[k];
            }
        }
        /* band ⇄ numeric range stay consistent */
        if (patch.hasOwnProperty('band') && patch.band !== 'all') {
            var b = bandOf(S.band);
            if (b) { S.lo = b.lo; S.hi = (b.hi === Infinity) ? CEIL : b.hi; }
        } else if (patch.hasOwnProperty('lo') || patch.hasOwnProperty('hi')) {
            S.band = 'all';
        }
        if (!opts.keepPaging) { S.shown = PER_PAGE; }
        clampState();
        commit(opts);
    }
    function resetFilters() {
        resetState();
        clampState();
        syncSearchInputs();
        closePop();
        commit({ animate: true });
    }
    function resetOne(key) {
        if (key === 'goal') { S.goal = 'all'; }
        else if (key === 'range') { S.lo = FLOOR; S.hi = CEIL; S.band = 'all'; }
        else if (key === 'q') { S.q = ''; syncSearchInputs(); }
        else if (DEFAULTS.hasOwnProperty(key)) { S[key] = DEFAULTS[key]; if (key === 'band') { S.lo = FLOOR; S.hi = CEIL; } }
        clampState();
        closePop();
        commit({ animate: true });
    }

    /* ══════════════════════════════════════════════════════════════════
        Mobile bottom sheet
        ══════════════════════════════════════════════════════════════════ */
    var SHEET = { open: false };
    function sortOptionsHTML(id) {
        var html = '<select id="' + id + '" data-sort aria-label="Sort products">';
        for (var i = 0; i < SORTS.length; i++) {
            html += '<option value="' + SORTS[i].id + '">' + esc(SORTS[i].name) + '</option>';
        }
        return html + '</select>';
    }
    function openSheet() { SHEET.open = true; renderSheet(); }
    function closeSheet() {
        SHEET.open = false;
        var s = el('sheet');
        if (s) { s.classList.remove('is-open'); }
        var b = el('sheetBack');
        if (b) { b.classList.remove('is-on'); }
        document.body.classList.remove('no-scroll');
    }
    function renderSheet() {
        var sheet = el('sheet');
        var back = el('sheetBack');
        if (!sheet || !back) { return; }
        var badge = el('fabCount');
        if (badge) {
            var n = activeChips().length;
            badge.hidden = n === 0;
            badge.textContent = n;
        }
        if (!SHEET.open) {
            sheet.classList.remove('is-open');
            back.classList.remove('is-on');
            document.body.classList.remove('no-scroll');
            return;
        }
        sheet.innerHTML =
            '<div class="sheet-head"><b>Filters &amp; Sort</b>' +
            '<button type="button" class="f-pop-close" data-sheet-close aria-label="Close filters">×</button></div>' +
            '<div class="sheet-sec"><span class="sheet-t">Category</span>' + contentCategory() + '</div>' +
            (HAS_BRANDS ? '<div class="sheet-sec"><span class="sheet-t">Brand</span>' + contentBrand() + '</div>' : '') +
            '<div class="sheet-sec"><span class="sheet-t">Price</span>' + contentPrice() + '</div>' +
            '<div class="sheet-sec"><span class="sheet-t">Rating</span>' + contentRating() + '</div>' +
            '<div class="sheet-sec"><span class="sheet-t">Shipping</span>' + contentShipping() + '</div>' +
            '<div class="sheet-sec"><span class="sheet-t">Availability</span>' + contentAvailability() + '</div>' +
            '<div class="sheet-sec"><span class="sheet-t">Sort by</span><div class="f-sort-inline">' +
            '<label for="sortSelectM">Sort</label>' + sortOptionsHTML('sortSelectM') + '</div></div>' +
            '<div class="sheet-foot"><button type="button" class="f-apply" data-sheet-close>Apply — ' + results().length + ' products</button></div>';
        var sel = el('sortSelectM');
        if (sel) {
            sel.value = S.sort;
            sel.addEventListener('change', function () {
                setState({ sort: this.value }, { animate: true });
                renderSheet();
            });
        }
        openSheetClasses();
        function openSheetClasses() {
            sheet.classList.add('is-open');
            back.classList.add('is-on');
            document.body.classList.add('no-scroll');
        }
    }

    /* ══════════════════════════════════════════════════════════════════
        Bindings — delegated. one document listener per concern.
        ══════════════════════════════════════════════════════════════════ */
    function bind() {
        document.addEventListener('click', function (e) {
            var t = e.target;
            if (!t || !t.closest) { return; }

            /* Collections (desktop + mobile) */
            var goal = t.closest('[data-goal]');
            if (goal) {
                var gid = goal.getAttribute('data-goal');
                setState({ goal: S.goal === gid ? 'all' : gid }, { animate: true });
                scrollToGrid();
                return;
            }

            /* Filter bar tabs + popover */
            var ftab = t.closest('[data-ftab]');
            if (ftab) { togglePop(ftab.getAttribute('data-ftab')); return; }
            if (t.closest('[data-pop-close]')) { closePop(); return; }
            if (POP.open) {
                /* Outside click closes, clicks inside the popover don't */
                var pop = el('fbarPop');
                if (pop && !pop.contains(t)) { closePop(); }
            }

            /* Facet choices */
            var ch = t.closest('[data-set-facet],[data-set-brand],[data-set-rating],[data-set-fast],[data-set-band]');
            if (ch) {
                if (ch.hasAttribute('data-set-facet')) {
                    setState({ facet: ch.getAttribute('data-set-facet') }, { animate: true });
                } else if (ch.hasAttribute('data-set-brand')) {
                    setState({ brand: ch.getAttribute('data-set-brand') }, { animate: true });
                } else if (ch.hasAttribute('data-set-rating')) {
                    setState({ rating: ch.getAttribute('data-set-rating') }, { animate: true });
                } else if (ch.hasAttribute('data-set-fast')) {
                    setState({ fast: ch.getAttribute('data-set-fast') }, { animate: true });
                } else if (ch.hasAttribute('data-set-band')) {
                    var bandVal = ch.getAttribute('data-set-band');
                    if (S.band === bandVal) { setState({ band: 'all', lo: FLOOR, hi: CEIL }, { animate: true }); }
                    else { setState({ band: bandVal }, { animate: true }); }
                }
                return;
            }

            /* Availability toggles */
            var togBtn = t.closest('[data-tog]');
            if (togBtn) {
                var key = togBtn.getAttribute('data-tog');
                var patch = {};
                patch[key] = num(S[key]) ? 0 : 1;
                setState(patch, { animate: true });
                return;
            }

            /* Price range apply */
            if (t.closest('[data-price-apply]')) {
                var loIn = document.querySelector('[data-price-lo]');
                var hiIn = document.querySelector('[data-price-hi]');
                var patch2 = { lo: FLOOR, hi: CEIL };
                if (loIn && loIn.value !== '') { patch2.lo = num(loIn.value); }
                if (hiIn && hiIn.value !== '') { patch2.hi = num(hiIn.value); }
                setState(patch2, { animate: true });
                return;
            }

            /* Chips */
            var chip = t.closest('[data-chip]');
            if (chip) { resetOne(chip.getAttribute('data-chip')); return; }
            if (t.closest('[data-reset-all]')) { resetFilters(); return; }
            if (t.closest('[data-clear-filters]')) { resetFilters(); return; }

            /* Mobile sheet */
            if (t.closest('[data-sheet-open]')) { openSheet(); return; }
            if (t.closest('[data-sheet-close]')) { closeSheet(); scrollToGrid(true); return; }
            if (SHEET.open && t.closest('#sheetBack')) { closeSheet(); return; }

            /* Research-score explainer */
            var scoreBtn = t.closest('[data-score-toggle]');
            if (scoreBtn) {
                var card = scoreBtn.closest('.pc');
                var on = card.classList.toggle('is-score-open');
                scoreBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
                return;
            }

            /* Wishlist */
            var wish = t.closest('[data-wish]');
            if (wish) { toggleWish(wish.getAttribute('data-wish')); return; }

            /* Recently viewed on the way to the product page */
            var detail = t.closest('[data-detail]');
            if (detail) { rememberViewed(detail.getAttribute('data-detail')); return; }

            /* Load more */
            if (t.closest('[data-load-more]')) {
                var total = results().length;
                setState({ shown: Math.min(num(S.shown) + PER_PAGE, total) }, { animate: false, keepPaging: true });
                return;
            }
        });

        /* Search — shared header box + on-page command-center box drive the same filter */
        wireSearchInput('header-search-input');
        wireSearchInput('shopSearch');

        /* Sort select (desktop sticky bar) */
        var sortSel = el('sortSelect');
        if (sortSel) {
            sortSel.addEventListener('change', function () {
                setState({ sort: this.value }, { animate: true });
            });
        }

        /* Escape closes popover + sheet */
        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') { return; }
            if (POP.open) { closePop(); return; }
            if (SHEET.open) { closeSheet(); }
        });

        /* Back button restores shared views */
        window.addEventListener('hashchange', function () {
            if (!looksLikeStateHash(window.location.hash)) { return; }
            var before = stateToHash();
            hashToState(window.location.hash);
            if (stateToHash() === before) { return; }
            var si = el('header-search-input');
            if (si) { si.value = S.q || ''; }
            renderAll({ animate: true });
        });

        /* Keep sticky positions correct when the header reflows */
        function syncHeaderVar() {
            var hdr = el('store-header');
            var h = hdr ? hdr.offsetHeight : 112;
            document.documentElement.style.setProperty('--s-h', h + 'px');
        }
        window.addEventListener('resize', syncHeaderVar);
        if (document.readyState !== 'loading') { syncHeaderVar(); }
        else { document.addEventListener('DOMContentLoaded', syncHeaderVar); }
        window.setTimeout(syncHeaderVar, 700); /* after fonts settle */
    }

    function scrollToGrid(soft) {
        var node = el('gridTop') || el('shopGrid');
        if (node && node.scrollIntoView) {
            nodInto(node, soft);
        }
    }
    function nodInto(node, soft) {
        try {
            node.scrollIntoView({ behavior: soft ? 'smooth' : 'smooth', block: 'start' });
        } catch (e) { window.scrollTo(0, node.offsetTop); }
    }

    /* ══════════════════════════════════════════════════════════════════
        Boot
        ══════════════════════════════════════════════════════════════════ */
    function init() {
        resetState();
        var hasHash = looksLikeStateHash(window.location.hash) && window.location.hash.length > 1;
        if (hasHash) { hashToState(window.location.hash); }
        else { seedFromQuery(); }
        clampState();

        renderAll({ animate: false });
        bind();

        var live = el('liveRegion');
        if (live) { live.textContent = 'Curated shop loaded — ' + ALL.length + ' researched products ready'; }
    }

    window.TrendaryoShop = {
        get state() { return S; },
        list: results,
        visible: visible,
        counts: function () {
            return { total: ALL.length, matching: results().length, shown: visible().length };
        },
        refresh: function () { renderAll({ animate: false }); },
        setState: function (patch) { setState(patch || {}, { animate: true }); },
        reset: resetFilters,
        score: researchScore
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

/* Image enhancement: fade card photos in as they arrive (progressive
   enhancement only — never blocks a real render). */
(function () {
    window.__shopFade = function (scope) {
        var imgs = (scope || document).querySelectorAll('.pc-stage img:not(.is-loaded)');
        for (var i = 0; i < imgs.length; i++) {
            var img = imgs[i];
            img.classList.add('is-fading');
            if (img.complete) { img.classList.add('is-loaded'); img.classList.remove('is-fading'); }
            else {
                img.addEventListener('load', function () { this.classList.add('is-loaded'); this.classList.remove('is-fading'); }, { once: true });
            }
        }
    };
})();
