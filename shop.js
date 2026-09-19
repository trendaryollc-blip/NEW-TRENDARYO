/**
 * shop.js — Trendaryo SHOP "COMMAND DECK" controller (v2).
 *
 * Powers shop.html only. Everything is derived from the shared catalogue
 * (TrendaryoProducts) + shared helpers (TrendaryoUI) — no new data, no API,
 * no build step, no dependencies.
 *
 * Responsibilities
 *   · live catalogue telemetry for the control deck (hero)
 *   · one composed filter state (collection, category, facet, budget band,
 *     price envelope, rating, discount, sale/photo/low-stock) + URL-hash sync
 *   · grid / list rendering, density, pagination ("Load more")
 *   · ProductCard v2 (media stage, save flags, tools, price-position meter,
 *     quantity stepper, in-cart + wishlist + compare states)
 *   · quick-view modal, 3-item compare tray (writes compare.html's key),
 *     recently-viewed, "pairs with your cart", sticky cart dock
 *
 * Public API (for manual testing in the console):
 *   window.TrendaryoShop = { state, list(), counts(), refresh(), openQuick(id) }
 */
(function () {
    'use strict';

    var P = window.TrendaryoProducts;
    if (!P || typeof P.all !== 'function') { return; }
    var UI = window.TrendaryoUI || {};
    var ALL = P.all();

    /* ── Storage keys (shared with the rest of the site) ── */
    var K_WISH = 'wishlist';                 // [{id,name,price,emoji}]
    var K_CMP = 'compare_list';              // compare.html contract
    var K_RECENT = 'trendaryo_recent';       // [id, id, ...]
    var K_DENSITY = 'trendaryo_shop_density';
    var CMP_MAX = 3;

    /* ── Catalogue envelope (computed once, from real data) ── */
    var PRICES = ALL.map(function (p) { return num(p.price); });
    var FLOOR = Math.min.apply(null, PRICES);
    var CEIL = Math.max.apply(null, PRICES);
    var SORTED_PRICES = PRICES.slice().sort(function (a, b) { return a - b; });
    var MEDIAN = SORTED_PRICES[Math.floor(SORTED_PRICES.length / 2)];
    var AVG_PRICE = Math.round(PRICES.reduce(function (s, n) { return s + n; }, 0) / PRICES.length);
    var TOTAL_REVIEWS = ALL.reduce(function (s, p) { return s + num(p.reviews); }, 0);
    var AVG_RATING = ALL.reduce(function (s, p) { return s + num(p.rating); }, 0) / ALL.length;
    /* Sale + photo subsets (num/discPct are hoisted function declarations) */
    var SALE_LIST = ALL.filter(function (p) { return discPct(p) > 0; });
    var PHOTO_LIST = ALL.filter(function (p) { return !!p.image; });


    /* ── Taxonomy (facet = keyword map, derived; category via P.categoryOf) ── */
    var CATS = [
        { id: 'electronics', name: 'Electronics', icon: '🔌', blurb: 'Audio, wearables, computing, imaging' },
        { id: 'fashion', name: 'Fashion & Carry', icon: '🎒', blurb: 'Footwear, bags, eyewear, small leather' },
        { id: 'home', name: 'Home & Living', icon: '🏠', blurb: 'Kitchen, wellness, drinkware' }
    ];

    var FACETS = [
        { id: 'audio', name: 'Audio', test: /headphone|earbud|earphone|speaker|audio/ },
        { id: 'wearables', name: 'Wearables', test: /watch|fitness band|tracker/ },
        { id: 'computing', name: 'Computing', test: /laptop|tablet|monitor|keyboard|mouse|hub|computer/ },
        { id: 'imaging', name: 'Photography', test: /camera|drone/ },
        { id: 'power', name: 'Power & Light', test: /charger|battery|power bank|led strip/ },
        { id: 'carry', name: 'Everyday Carry', test: /backpack|wallet|sunglasses/ },
        { id: 'footwear', name: 'Footwear', test: /sneakers|shoes/ },
        { id: 'living', name: 'Home & Wellness', test: /coffee|bottle|yoga/ }
    ];

    var BANDS = [
        { id: 'b1', name: 'Under $50', lab: 'under $50', lo: 0, hi: 49.99 },
        { id: 'b2', name: '$50 – $149', lab: '$50–149', lo: 50, hi: 149 },
        { id: 'b3', name: '$150 – $349', lab: '$150–349', lo: 150, hi: 349 },
        { id: 'b4', name: '$350 – $799', lab: '$350–799', lo: 350, hi: 799 },
        { id: 'b5', name: '$800 +', lab: '$800+', lo: 800, hi: Infinity }
    ];

    var COLLECTIONS = [
        { id: 'all', name: 'Everything' },
        { id: 'premium', name: 'Premium' },
        { id: 'trending', name: 'Trending' },
        { id: 'hot', name: 'Hot Deals' },
        { id: 'new', name: 'New Arrivals' },
        { id: 'sale', name: 'On Sale' }
    ];

    var SORTS = [
        { id: 'featured', name: 'Featured (curated)' },
        { id: 'discount', name: 'Biggest discount' },
        { id: 'newest', name: 'Newest first' },
        { id: 'price-low', name: 'Price: low to high' },
        { id: 'price-high', name: 'Price: high to low' },
        { id: 'rating', name: 'Top rated' },
        { id: 'reviews', name: 'Most reviewed' },
        { id: 'value', name: 'Best value' },
        { id: 'az', name: 'Name: A → Z' }
    ];

    var BADGE_NAME = { hot: 'HOT', trending: 'TRENDING', premium: 'PREMIUM', sale: 'SALE', 'new': 'NEW' };
/* ══════════════════════════════════════════════════════════════════
       Derived values — every number the UI shows comes from here
       ══════════════════════════════════════════════════════════════════ */
    function num(v) {
        var n = Number(v);
        return isFinite(n) ? n : 0;
    }
    /* Product ids are opaque strings (Firestore doc ids / slugs) — compare and
       store them as strings. idNum() derives a stable non-negative integer for
       purely visual hashing (gradient hue, stock, rotation). */
    function idStr(v) { return String(v === null || v === undefined ? '' : v); }
    function idNum(v) { var s = idStr(v), h = 0, i; for (i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; } return h; }
    function money(n) { return P.price(n); }

    /* Real discount %, straight from price vs oldPrice */
    function discPct(p) {
        var op = num(p.oldPrice);
        return op > num(p.price) ? Math.round((1 - num(p.price) / op) * 100) : 0;
    }
    function saveAmt(p) { return discPct(p) ? Math.round(num(p.oldPrice) - num(p.price)) : 0; }

    /* Catalogue identity */
    function sku(p) {
        var s = String(p.id);
        while (s.length < 4) { s = '0' + s; }
        return 'TRD-' + s;
    }
    function badgeName(b) { return BADGE_NAME[b] || (b ? String(b).toUpperCase() : ''); }

    /* Facet match (first matching facet wins — each product has exactly one) */
    function facetOf(p) {
        var hay = (p.name + ' ' + p.description).toLowerCase();
        for (var i = 0; i < FACETS.length; i++) {
            if (FACETS[i].test.test(hay)) { return FACETS[i].id; }
        }
        return 'other';
    }
    function facetName(id) {
        for (var i = 0; i < FACETS.length; i++) { if (FACETS[i].id === id) { return FACETS[i].name; } }
        return 'Other';
    }
    /*
     * Category — with one deliberate refinement. The shared P.categoryOf()
     * tests computing keywords first, which files "Designer Backpack … USB
     * charging port and laptop sleeve" under electronics. Carry/fashion
     * vocabulary is therefore checked first here, and everything else defers
     * to the shared function, so this page never contradicts itself.
     */
    var CARRY_RE = /backpack|wallet|sunglasses|sneakers|shoes/;
    function catOf(p) {
        var hay = (p.name + ' ' + p.description).toLowerCase();
        if (CARRY_RE.test(hay)) { return 'fashion'; }
        return P.categoryOf(p);
    }

    function catName(id) {
        for (var i = 0; i < CATS.length; i++) { if (CATS[i].id === id) { return CATS[i].name; } }
        return 'Uncategorised';
    }
    function bandOf(id) {
        for (var i = 0; i < BANDS.length; i++) { if (BANDS[i].id === id) { return BANDS[i]; } }
        return null;
    }
    function inBand(p, bandId) {
        var b = bandOf(bandId);
        if (!b) { return true; }
        var v = num(p.price);
        return v >= b.lo && v <= b.hi;
    }

    /*
     * Stock + urgency. The catalogue carries no inventory feed, so stock is
     * derived deterministically from the SKU — the same rule the rest of the
     * site already uses via UI.stockLine(). Never random, so the card, the
     * quick view and compare.html never contradict each other.
     */
    function stockQty(p) { return (idNum(p.id) % 5 === 0) ? 4 : 24; }
    function isLow(p) { return stockQty(p) <= 5; }

    /* Real spec highlights for the card ticker (values from P.specs) */
    function highlights(p, n) {
        n = n || 3;
        var rows = P.specs(p) || [];
        var out = [];
        var i;
        /* Prefer the rows shoppers actually compare, then fill in order */
        for (i = 0; i < rows.length && out.length < n; i++) {
            if (/battery|driver|display|camera|capacity|gpu|memory|output|panel|power|storage|sensor|material|chip|flight/i.test(String(rows[i][0]))) {
                out.push(String(rows[i][1]));
            }
        }
        for (i = 0; i < rows.length && out.length < n; i++) {
            if (out.indexOf(String(rows[i][1])) === -1) { out.push(String(rows[i][1])); }
        }
        return out.slice(0, n);
    }

    /* Popularity proxy (reviews × rating) — drives rank + momentum bars */
    function momentum(p) { return num(p.reviews) * num(p.rating); }
    function maxMomentum() {
        var m = 0;
        for (var i = 0; i < ALL.length; i++) { m = Math.max(m, momentum(ALL[i])); }
        return m || 1;
    }

    /* Value score = rating per $100 spent (higher is better) */
    function valueScore(p) { return num(p.rating) / (num(p.price) / 100); }
    function maxValueScore() {
        var m = 0;
        for (var i = 0; i < ALL.length; i++) { m = Math.max(m, valueScore(ALL[i])); }
        return m || 1;
    }

    /* Where this price sits inside the catalogue envelope (0–100) */
    function pricePosition(p) {
        if (CEIL === FLOOR) { return 50; }
        return Math.round(((num(p.price) - FLOOR) / (CEIL - FLOOR)) * 100);
    }

    /* Illustrative 3-way split, labelled as illustrative in the UI */
    function instalment(p) { return (num(p.price) / 3).toFixed(2); }

    /* Dispatch promise — mirrors the copy in P.shippingInfo() */
    function dispatchDays(p) { return num(p.price) >= 400 ? '5–7' : '3–5'; }

    /* ─ Collection persistence (wishlist / compare / recently viewed) ── */
    function readJSON(key, fallback) {
        try {
            var raw = JSON.parse(localStorage.getItem(key) || 'null');
            return raw === null ? fallback : raw;
        } catch (e) { return fallback; }
    }
    function writeJSON(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage blocked */ }
    }
    function idList(key) {
        var list = readJSON(key, []);
        if (!list || typeof list.length !== 'number') { return []; }
        return list.map(function (i) {
            return (i && typeof i === 'object') ? idStr(i.id) : idStr(i);
        }).filter(function (s) { return s !== ''; });
    }
    function wishIds() { return idList(K_WISH); }
    function cmpIds() { return idList(K_CMP); }
    function recentIds() { return idList(K_RECENT); }
    function cartItem(id) {
        if (typeof CartManager === 'undefined') { return null; }
        var cart = CartManager.getCart();
        for (var i = 0; i < cart.length; i++) {
            if (idStr(cart[i].id) === idStr(id)) { return cart[i]; }
        }
        return null;
    }
    function cartQty(id) { var it = cartItem(id); return it ? num(it.quantity) : 0; }
    function cartCount() { return (typeof CartManager === 'undefined') ? 0 : CartManager.getCount(); }
    function cartTotal() { return (typeof CartManager === 'undefined') ? 0 : CartManager.getTotal(); }

    /* Toast with a graceful fallback if components.js did not load */
    function toast(msg) {
        if (typeof window.trendaryoToast === 'function') { window.trendaryoToast(msg); return; }
        var live = document.getElementById('liveRegion');
        if (live) { live.textContent = msg; }
    }
/* ═════════════════════════════════════════════════════════════════
       State — one composed filter object, mirrored into the URL hash so a
       filtered view is shareable and the browser back button works.
       ═════════════════════════════════════════════════════════════════ */
    var PER_PAGE = 12;
    var DEFAULTS = {
        q: '', col: 'all', cat: 'all', facet: 'all', band: 'all',
        lo: FLOOR, hi: CEIL, rating: 0, disc: 0,
        sale: 0, photo: 0, low: 0,
        sort: 'featured', view: 'grid', density: 'comfy', shown: PER_PAGE
    };
    var S = {};
    var HASH_KEYS = ['q', 'col', 'cat', 'facet', 'band', 'lo', 'hi', 'rating',
        'disc', 'sale', 'photo', 'low', 'sort', 'view', 'density', 'shown'];

    function resetState() {
        S = {};
        for (var k in DEFAULTS) { if (DEFAULTS.hasOwnProperty(k)) { S[k] = DEFAULTS[k]; } }
    }

    function clampState() {
        S.lo = Math.min(Math.max(num(S.lo), FLOOR), CEIL);
        S.hi = Math.max(Math.min(num(S.hi), CEIL), FLOOR);
        if (S.lo > S.hi) { var t = S.lo; S.lo = S.hi; S.hi = t; }
        if (['all', 'electronics', 'fashion', 'home'].indexOf(S.cat) === -1) { S.cat = 'all'; }
        if (S.facet !== 'all') {
            var ok = false;
            for (var i = 0; i < FACETS.length; i++) { if (FACETS[i].id === S.facet) { ok = true; } }
            if (!ok) { S.facet = 'all'; }
        }
        if (S.band !== 'all' && !bandOf(S.band)) { S.band = 'all'; }
        var colOk = false;
        for (var c = 0; c < COLLECTIONS.length; c++) { if (COLLECTIONS[c].id === S.col) { colOk = true; } }
        if (!colOk) { S.col = 'all'; }
        var sortOk = false;
        for (var s = 0; s < SORTS.length; s++) { if (SORTS[s].id === S.sort) { sortOk = true; } }
        if (!sortOk) { S.sort = 'featured'; }
        if (S.view !== 'list') { S.view = 'grid'; }
        if (S.density !== 'compact') { S.density = 'comfy'; }
        S.shown = Math.max(PER_PAGE, Math.min(num(S.shown) || PER_PAGE, ALL.length));
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

    /* Seed from ?q=…&cat=… so search results and shared links land filtered */
    function seedFromQuery() {
        var qs = window.location.search.replace(/^\?/, '');
        if (!qs) { return; }
        var pairs = qs.split('&');
        for (var i = 0; i < pairs.length; i++) {
            var eq = pairs[i].indexOf('=');
            if (eq < 0) { continue; }
            var k = pairs[i].slice(0, eq);
            if (HASH_KEYS.indexOf(k) === -1) { continue; }
            var v = decodeURIComponent(pairs[i].slice(eq + 1).replace(/\+/g, ' '));
            S[k] = (typeof DEFAULTS[k] === 'number') ? num(v) : v;
        }
        clampState();
    }

    function pushHash(replace) {
        var h = stateToHash();
        var url = window.location.pathname + window.location.search + (h ? '#' + h : '');
        try {
            if (replace && window.history.replaceState) { window.history.replaceState(null, '', url); }
            else { window.location.hash = h; }
        } catch (e) { /* file:// or sandboxed — state still applies */ }
    }
/* ══════════════════════════════════════════════════════════════════
       Filter engine — `skip` lets a facet count itself against every OTHER
       active filter, so the counts stay honest while the user narrows down.
       ══════════════════════════════════════════════════════════════════ */
    function searchHaystack(p) {
        return (p.name + ' ' + p.description + ' ' + sku(p) + ' ' + facetName(facetOf(p)) + ' ' +
            catName(catOf(p)) + ' ' + badgeName(p.badge)).toLowerCase();
    }

    function passes(p, skip) {
        skip = skip || '';
        if (skip !== 'q' && S.q && searchHaystack(p).indexOf(String(S.q).toLowerCase()) === -1) { return false; }
        if (skip !== 'col' && S.col !== 'all') {
            if (S.col === 'sale') { if (discPct(p) <= 0) { return false; } }
            else if (p.badge !== S.col) { return false; }
        }
        if (skip !== 'cat' && S.cat !== 'all' && catOf(p) !== S.cat) { return false; }
        if (skip !== 'facet' && S.facet !== 'all' && facetOf(p) !== S.facet) { return false; }
        if (skip !== 'band' && S.band !== 'all' && !inBand(p, S.band)) { return false; }
        if (skip !== 'range' && (num(p.price) < S.lo || num(p.price) > S.hi)) { return false; }
        if (skip !== 'rating' && num(p.rating) < num(S.rating)) { return false; }
        if (skip !== 'disc' && discPct(p) < num(S.disc)) { return false; }
        if (skip !== 'sale' && num(S.sale) && discPct(p) <= 0) { return false; }
        if (skip !== 'photo' && num(S.photo) && !p.image) { return false; }
        if (skip !== 'low' && num(S.low) && !isLow(p)) { return false; }
        return true;
    }

    function filterList(skip) { return ALL.filter(function (p) { return passes(p, skip); }); }
    function countIf(pred) { return ALL.filter(pred).length; }

    function sortedList(list) {
        var out = list.slice();
        switch (S.sort) {
        case 'price-low':
            out.sort(function (a, b) { return num(a.price) - num(b.price); });
            break;
        case 'price-high':
            out.sort(function (a, b) { return num(b.price) - num(a.price); });
            break;
        case 'rating':
            out.sort(function (a, b) { return num(b.rating) - num(a.rating) || num(b.reviews) - num(a.reviews); });
            break;
        case 'reviews':
            out.sort(function (a, b) { return num(b.reviews) - num(a.reviews); });
            break;
        case 'discount':
            out.sort(function (a, b) { return discPct(b) - discPct(a) || saveAmt(b) - saveAmt(a); });
            break;
        case 'newest':
            /* The catalogue has no date field, so catalogue order (descending
               SKU) stands in for "newest first". This option used to do nothing. */
            out.sort(function (a, b) { return idNum(b.id) - idNum(a.id); });
            break;
        case 'value':
            out.sort(function (a, b) { return valueScore(b) - valueScore(a); });
            break;
        case 'az':
            out.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
            break;
        default:
            /* Curated "featured": highest rated, then most reviewed */
            out.sort(function (a, b) { return num(b.rating) - num(a.rating) || num(b.reviews) - num(a.reviews); });
        }
        return out;
    }

    function results() { return sortedList(filterList()); }
    function visible() { return results().slice(0, num(S.shown)); }

    /* Aggregate rating spread across the whole catalogue (real, review-weighted) */
    function catalogueRatingSpread() {
        var rows = [{ stars: 5, n: 0 }, { stars: 4, n: 0 }, { stars: 3, n: 0 }, { stars: 2, n: 0 }, { stars: 1, n: 0 }];
        var total = 0;
        for (var i = 0; i < ALL.length; i++) {
            var p = ALL[i];
            var brk = P.ratingBreakdown(p);
            var rev = num(p.reviews) || 1;
            for (var j = 0; j < brk.length; j++) {
                var idx = 5 - brk[j].stars;
                if (idx >= 0 && idx < rows.length) {
                    rows[idx].n += (brk[j].pct / 100) * rev;
                    total += (brk[j].pct / 100) * rev;
                }
            }
        }
        total = total || 1;
        return rows.map(function (r, idx) {
            return { stars: 5 - idx, n: Math.round(r.n), pct: Math.round((r.n / total) * 100) };
        });
    }

    /* Cheap deterministic id → colour so rails stay visually varied */
    function hue(id) { return (idNum(id) * 37) % 360; }
/* ══════════════════════════════════════════════════════════════════
       Small view helpers
       ══════════════════════════════════════════════════════════════════ */
    function esc(s) {
        return String(s === null || s === undefined ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function svg(d, size) {
        size = size || 16;
        return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" ' +
            'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" ' +
            'aria-hidden="true">' + d + '</svg>';
    }
    var HEART_PATH = '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>';
    var ICON = {
        heart: svg(HEART_PATH),
        heartFill: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + HEART_PATH + '</svg>',
        cmp: svg('<path d="M3 20h7V10H3z"/><path d="M14 20h7V4h-7z"/>'),
        eye: svg('<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/>'),
        plus: svg('<path d="M12 5v14M5 12h14"/>'),
        close: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
        chevron: svg('<path d="m9 18 6-6-6-6"/>'),
        qv: svg('<path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="9"/>', 15)
    };

    /* ─ Wishlist / compare lookups are cached per render pass ── */
    var WISH_MAP = null;
    var CMP_MAP = null;
    function invalidateCaches() { WISH_MAP = null; CMP_MAP = null; }
    function toMap(ids) {
        var m = {};
        for (var i = 0; i < ids.length; i++) { m[ids[i]] = true; }
        return m;
    }
    function wished(id) {
        if (!WISH_MAP) { WISH_MAP = toMap(wishIds()); }
        return !!WISH_MAP[idStr(id)];
    }
    function compared(id) {
        if (!CMP_MAP) { CMP_MAP = toMap(cmpIds()); }
        return !!CMP_MAP[idStr(id)];
    }

    /* Warranty row straight out of the real spec table */
    function warrantyOf(p) {
        var rows = P.specs(p) || [];
        for (var i = 0; i < rows.length; i++) {
            if (/warranty/i.test(String(rows[i][0]))) { return String(rows[i][1]); }
        }
        return '—';
    }

    /*
     * detailFrame() — the hover "second frame". Only one photo exists per SKU,
     * so the macro view is synthesised: the product's own emoji mark, zoomed
     * and rotated over a technical reticle + grid, tinted from its SKU hue.
     * Rendered as a data-URI SVG: never 404s, never a broken image.
     */
    function detailFrame(p) {
        var id = idNum(p.id);
        var h = hue(id);
        var rot = (id % 9) - 4;
        var svgDoc = '<svg xmlns="http://www.w3.org/2000/svg" width="560" height="400" viewBox="0 0 560 400">' +
            '<defs>' +
            '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
            '<stop offset="0%" stop-color="hsl(' + h + ',95%,60%)" stop-opacity="0.30"/>' +
            '<stop offset="100%" stop-color="hsl(' + ((h + 120) % 360) + ',95%,55%)" stop-opacity="0.28"/>' +
            '</linearGradient>' +
            '<radialGradient id="v" cx="50%" cy="42%" r="62%">' +
            '<stop offset="0%" stop-color="#ffffff" stop-opacity="0.14"/>' +
            '<stop offset="100%" stop-color="#000000" stop-opacity="0.62"/>' +
            '</radialGradient>' +
            '</defs>' +
            '<rect width="560" height="400" fill="#06061e"/>' +
            '<rect width="560" height="400" fill="url(#g)"/>' +
            '<g stroke="hsl(' + h + ',90%,70%)" stroke-opacity="0.22" stroke-width="1">' +
            '<path d="M0 80H560M0 160H560M0 240H560M0 320H560M80 0V400M160 0V400M240 0V400M320 0V400M400 0V400M480 0V400"/>' +
            '</g>' +
            '<circle cx="280" cy="190" r="126" fill="none" stroke="hsl(' + h + ',95%,65%)" stroke-opacity="0.55" stroke-width="1.6" stroke-dasharray="7 9"/>' +
            '<text x="280" y="248" font-size="186" text-anchor="middle" transform="rotate(' + rot + ' 280 200)">' + (p.emoji || '📦') + '</text>' +
            '<rect width="560" height="400" fill="url(#v)"/>' +
            '<g fill="hsl(' + h + ',95%,72%)" font-family="monospace" font-size="13" opacity="0.8">' +
            '<text x="18" y="30">MACRO · ' + sku(p) + '</text>' +
            '<text x="470" y="30">×2.4</text>' +
            '<text x="18" y="386">' + String(p.name || '').slice(0, 26).toUpperCase() + '</text>' +
            '</g>' +
            '<path d="M18 52h64M18 52v52" stroke="hsl(' + h + ',95%,70%)" stroke-opacity="0.6" stroke-width="1.5" fill="none"/>' +
            '<path d="M542 348h-64M542 348v-52" stroke="hsl(' + h + ',95%,70%)" stroke-opacity="0.6" stroke-width="1.5" fill="none"/>' +
            '</svg>';
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgDoc);
    }

    /* Compact inline rating spread (real P.ratingBreakdown percentages) */
    function distInline(p) {
        var rows = P.ratingBreakdown(p) || [];
        var label = 'Rating spread: ';
        var bars = '';
        for (var i = 0; i < rows.length; i++) {
            label += rows[i].stars + '★ ' + rows[i].pct + '%' + (i < rows.length - 1 ? ', ' : '');
            bars += '<i style="height:' + Math.max(8, rows[i].pct) + '%"></i>';
        }
        return '<div class="pc-dist" role="img" aria-label="' + esc(label) + '" title="' + esc(label) + '">' + bars + '</div>';
    }
/* ══════════════════════════════════════════════════════════════════
       ProductCard v2 — markup
       One source of truth for every card on the page (grid, list rail,
       momentum rail, recently viewed, pairs-with-cart). List view is the
       same markup re-arranged by CSS, so nothing can drift out of sync.
       ═════════════════════════════════════════════════════════════════ */

    /* Media stage: photo (or designed tile) on a lit stage + macro frame */
    function cardMedia(p, opts) {
        var id = idStr(p.id);
        var d = discPct(p);
        var saved = wished(id);
        var hs = highlights(p, 3);
        var out = '<div class="pc-media">';

        out += '<a class="pc-stage" href="product.html?id=' + id + '" data-detail="' + id +
            '" aria-label="' + esc(p.name) + ' — full details and specifications">';
        out += '<span class="pc-grid-tex" aria-hidden="true"></span>';
        out += '<span class="pc-spot" aria-hidden="true"></span>';
        out += P.media(p, 'pc-img');
        out += '<span class="pc-detail" aria-hidden="true" style="background-image:url(&quot;' +
            detailFrame(p) + '&quot;)"></span>';
        out += '</a>';

        out += '<span class="pc-shine" aria-hidden="true"></span>';

        out += '<div class="pc-flags">';
        if (opts.rank) { out += '<span class="pc-rank">#' + opts.rank + '</span>'; }
        if (p.badge) { out += '<span class="pc-badge ' + esc(p.badge) + '">' + badgeName(p.badge) + '</span>'; }
        if (d) { out += '<span class="pc-save">−' + d + '% · save ' + money(saveAmt(p)) + '</span>'; }
        out += '</div>';

        out += '<div class="pc-tools">';
        out += '<button type="button" class="pc-tool pc-wish' + (saved ? ' is-on' : '') +
            '" data-wish="' + id + '" aria-pressed="' + (saved ? 'true' : 'false') + '"' +
            ' title="Wishlist" aria-label="' + (saved ? 'Remove from wishlist: ' : 'Save to wishlist: ') +
            esc(p.name) + '">' + (saved ? ICON.heartFill : ICON.heart) + '</button>';
        out += '<button type="button" class="pc-tool pc-cmp' + (compared(id) ? ' is-on' : '') +
            '" data-cmp="' + id + '" aria-pressed="' + (compared(id) ? 'true' : 'false') + '"' +
            ' title="Compare" aria-label="Add to compare: ' + esc(p.name) + '">' + ICON.cmp + '</button>';
        out += '<button type="button" class="pc-tool pc-quick" data-quick="' + id +
            '" title="Quick view" aria-label="Quick view: ' + esc(p.name) + '">' + ICON.eye + '</button>';
        out += '</div>';

        out += '<div class="pc-foot">';
        out += '<span class="pc-chip pc-chip--cat">' + esc(catName(catOf(p))) + '</span>';
        out += isLow(p)
            ? '<span class="pc-chip pc-chip--low">Only a few left</span>'
            : '<span class="pc-chip pc-chip--in">In stock · ' + stockQty(p) + '</span>';
        if (num(p.price) < 400) { out += '<span class="pc-chip pc-chip--fast">Ships in 24h</span>'; }
        out += '<span class="pc-zoomdot" aria-hidden="true"><i></i><i></i></span>';
        out += '</div>';

        if (hs.length) { out += '<div class="pc-specbar">' + esc(hs.join(' · ')) + '</div>'; }
        out += '</div>'; /* /pc-media */

        return out;
    }

    /* One labelled fact cell (rendered as a data grid in list view) */
    function fact(label, value) {
        return '<div class="pc-fact"><b>' + esc(label) + '</b>' + esc(value) + '</div>';
    }
/* Budget band this product belongs to (shown in the list-view fact grid) */
    function bandNameOf(p) {
        for (var i = 0; i < BANDS.length; i++) {
            if (num(p.price) >= BANDS[i].lo && num(p.price) <= BANDS[i].hi) { return BANDS[i].name; }
        }
        return '—';
    }

    /* Card body: identity, value line, spec chips, rating spread, price data */
    function cardBody(p) {
        var id = idStr(p.id);
        var qty = cartQty(id);
        var d = discPct(p);
        var hs = highlights(p, 2);
        var pos = pricePosition(p);
        var avgPos = pricePosition({ price: AVG_PRICE });

        var out = '<div class="pc-body">';

        out += '<div class="pc-eyebrow">' +
            '<span class="pc-cat">' + esc(facetName(facetOf(p))) + '</span>' +
            '<span class="pc-sku">' + sku(p) + '</span>' +
            '<span class="pc-rev">' + num(p.reviews) + ' reviews</span></div>';

        out += '<h3 class="pc-name"><a href="product.html?id=' + id + '">' + esc(p.name) + '</a></h3>';
        out += '<p class="pc-desc">' + esc(p.description) + '</p>';

        if (hs.length) {
            out += '<ul class="pc-highs">';
            for (var i = 0; i < hs.length; i++) { out += '<li class="pc-high">' + esc(hs[i]) + '</li>'; }
            out += '</ul>';
        }

        out += '<div class="pc-rating"><span class="pc-stars">' + P.stars(p.rating) + '</span>' +
            '<b>' + num(p.rating).toFixed(1) + '</b><span>(' + num(p.reviews) + ')</span></div>';
        out += distInline(p);

        out += '<div class="pc-price"><span class="pc-now">' + money(p.price) + '</span>' +
            (d ? '<span class="pc-old">' + money(p.oldPrice) + '</span>' +
                 '<span class="pc-savechip">−' + d + '%</span>' : '') + '</div>';
        out += '<div class="pc-inst">or 3 parts of ' + money(instalment(p)) + ' — illustrative, taxes included</div>';

        /* Price-position meter: where this SKU sits in the live catalogue */
        out += '<div class="pc-meter" title="Price position between the catalogue floor ' + money(FLOOR) +
            ' and ceiling ' + money(CEIL) + ' — catalogue average is ' + money(AVG_PRICE) + '">' +
            '<div class="pc-meter-track"><i class="pc-meter-fill" style="width:' + pos + '%"></i>' +
            '<i class="pc-meter-avg" style="left:' + avgPos + '%"></i></div>' +
            '<div class="pc-meter-lab"><span>' + money(FLOOR) + ' floor</span>' +
            '<span>' + pos + '% up the range</span><span>' + money(CEIL) + '</span></div></div>';

        out += '<div class="pc-stockline' + (isLow(p) ? ' is-low' : '') + '">' +
            (isLow(p) ? 'Low stock — only ' + stockQty(p) + ' left'
                      : 'In stock — ships within 24 hours') + '</div>';

        /* Fact grid — hidden in grid view, becomes the data table in list view */
        out += '<div class="pc-facts">' +
            fact('Category', catName(catOf(p))) +
            fact('Collection', p.badge ? badgeName(p.badge) : 'Core range') +
            fact('SKU', sku(p)) +
            fact('Rating', num(p.rating).toFixed(1) + ' / 5') +
            fact('Reviews', String(num(p.reviews))) +
            fact('Discount', d ? '−' + d + '% · save ' + money(saveAmt(p)) : 'No reduction') +
            fact('Price band', bandNameOf(p)) +
            fact('Dispatch', dispatchDays(p) + ' working days') +
            fact('Warranty', warrantyOf(p)) +
            '</div>';

        out += '<div class="pc-actions">' +
            '<button type="button" class="pc-add' + (qty ? ' is-added' : '') + '" data-add="' + id + '">' +
                (qty ? '✓ In cart · ' + qty : 'Add to Cart') + '</button>' +
            '<div class="pc-qty" role="group" aria-label="Quantity for ' + esc(p.name) + '">' +
                '<button type="button" data-step="-1" aria-label="Decrease quantity">−</button>' +
                '<span data-qty>' + (qty || 1) + '</span>' +
                '<button type="button" data-step="1" aria-label="Increase quantity">+</button>' +
            '</div>' +
            '<button type="button" class="pc-quick" data-quick="' + id + '">Quick View</button>' +
            '<a class="pc-more" href="product.html?id=' + id + '">Details →</a>' +
            '</div>';

        out += '</div>'; /* /pc-body */
        return out;
    }

    /* Full card */
    function cardHTML(p, opts) {
        opts = opts || {};
        var cls = 'pc-card' + (opts.mode === 'rail' ? ' pc-card--rail' : '') +
            (wished(idStr(p.id)) ? ' is-saved' : '') + (cartQty(idStr(p.id)) ? ' is-in-cart' : '');
        return '<article class="' + cls + '" data-id="' + idStr(p.id) + '">' +
            cardMedia(p, opts) + cardBody(p) + '</article>';
    }

    /* Shimmer placeholder used while a filtered view re-renders */
    function skeletonHTML(n) {
        var out = '';
        var widths = ['70%', '92%', '48%', '86%', '60%'];
        for (var i = 0; i < n; i++) {
            out += '<div class="sk-card" aria-hidden="true"><div class="sk-media"></div>';
            for (var j = 0; j < widths.length; j++) {
                out += '<div class="sk-line" style="width:' + widths[(i + j) % widths.length] + '"></div>';
            }
            out += '</div>';
        }
        return out;
    }
/* ═════════════════════════════════════════════════════════════════
       RENDERERS — every section this page ships with
       ══════════════════════════════════════════════════════════════════ */
    function el(id) { return document.getElementById(id); }
    function setHTML(id, html) { var n = el(id); if (n) { n.innerHTML = html; } return n; }

    /* ─ 1 · Control deck: live telemetry computed from the catalogue ── */
    function deckStats() {
        var catLine = CATS.map(function (c) {
            return countIf(function (p) { return catOf(p) === c.id; }) + ' ' + c.name.split(' ')[0].toLowerCase();
        }).join(' · ');

        var bestDisc = SALE_LIST.slice().sort(function (a, b) { return discPct(b) - discPct(a); })[0];
        var maxSave = 0;
        for (var s = 0; s < SALE_LIST.length; s++) { maxSave = Math.max(maxSave, saveAmt(SALE_LIST[s])); }

        var ranked = FACETS.map(function (f) {
            return { f: f, n: countIf(function (p) { return facetOf(p) === f.id; }) };
        }).sort(function (a, b) { return b.n - a.n; });
        var top = ranked[0];
        var topCheap = top ? countIf(function (p) { return facetOf(p) === top.f.id && num(p.price) < 150; }) : 0;

        return [
            { val: ALL.length, lab: 'Live SKUs', sub: catLine },
            {
                val: AVG_RATING.toFixed(2) + ' / 5',
                lab: 'Catalogue rating',
                sub: TOTAL_REVIEWS.toLocaleString('en-US') + ' customer reviews'
            },
            {
                val: money(FLOOR) + ' – ' + money(CEIL),
                lab: 'Price envelope',
                sub: 'median ' + money(MEDIAN) + ' · average ' + money(AVG_PRICE)
            },
            {
                val: Math.round((SALE_LIST.length / ALL.length) * 100) + '%',
                lab: 'On sale now',
                sub: SALE_LIST.length + ' items · biggest drop ' +
                    (bestDisc ? '−' + discPct(bestDisc) + '% (save ' + money(maxSave) + ')' : 'n/a')
            },
            {
                val: top ? top.n : 0,
                lab: 'Deepest facet',
                sub: top ? top.f.name + ' · ' + topCheap + ' of them under $150' : ''
            },
            {
                val: '24 h',
                lab: 'Dispatch promise',
                sub: 'ordered before 3 PM · free shipping over $50 · 30-day returns'
            }
        ];
    }

    /* One-tap preset jumps, each showing how many SKUs it reaches */
    function deckJumpsHTML() {
        var jumps = [
            { key: 'cheap', label: 'Under $50', n: countIf(function (p) { return num(p.price) < 50; }) },
            { key: 'top', label: 'Rated 4.7+', n: countIf(function (p) { return num(p.rating) >= 4.7; }) },
            { key: 'sale', label: 'On sale', n: SALE_LIST.length },
            { key: 'fast', label: 'Ships in 24h', n: countIf(function (p) { return num(p.price) < 400; }) },
            { key: 'low', label: 'Low stock', n: countIf(function (p) { return isLow(p); }) },
            { key: 'photo', label: 'Studio photo', n: PHOTO_LIST.length }
        ];
        var html = '<span class="toolbar-label">Jump to</span>';
        for (var i = 0; i < jumps.length; i++) {
            html += '<button type="button" class="facet-pill" data-jump="' + jumps[i].key + '">' +
                esc(jumps[i].label) + ' <em>' + jumps[i].n + '</em></button>';
        }
        return html;
    }

    function renderDeck() {
        var stats = deckStats();
        var html = '';
        for (var i = 0; i < stats.length; i++) {
            html += '<div class="deck-stat">' +
                '<div class="deck-stat-val">' + esc(stats[i].val) + '</div>' +
                '<div class="deck-stat-lab">' + esc(stats[i].lab) + '</div>' +
                '<div class="deck-stat-sub">' + esc(stats[i].sub) + '</div></div>';
        }
        setHTML('deckStats', html);
        setHTML('deckJumps', deckJumpsHTML());
    }
/* ─ 2 · Category constellation + facet rail (navigation driven by data) ── */
    function renderCategories() {
        var host = el('catGrid');
        if (!host) { return; }
        var total = ALL.length;
        var html = '';
        for (var i = 0; i < CATS.length; i++) {
            var c = CATS[i];
            var list = ALL.filter(function (p) { return catOf(p) === c.id; });
            var prices = list.map(function (p) { return num(p.price); });
            var from = prices.length ? Math.min.apply(null, prices) : 0;
            var best = 0;
            var reviews = 0;
            for (var j = 0; j < list.length; j++) {
                best = Math.max(best, num(list[j].rating));
                reviews += num(list[j].reviews);
            }
            var share = Math.round((list.length / total) * 100);
            var on = S.cat === c.id;
            html += '<button type="button" class="cat-card' + (on ? ' is-on' : '') +
                '" data-cat="' + c.id + '" aria-pressed="' + on + '">' +
                '<div class="cat-top"><span class="cat-ico" aria-hidden="true">' + c.icon + '</span>' +
                '<span><span class="cat-name">' + esc(c.name) + '</span><br>' +
                '<span class="cat-count">' + list.length + ' products · from ' + money(from) + '</span></span></div>' +
                '<div class="cat-meta"><span>Top rated <b>' + best.toFixed(1) + '</b></span>' +
                '<span>Reviews <b>' + reviews.toLocaleString('en-US') + '</b></span></div>' +
                '<div class="cat-bar"><i style="width:' + share + '%"></i></div>' +
                '<div class="cat-bar-lab">' + share + '% of the catalogue · ' + esc(c.blurb) + '</div>' +
                '</button>';
        }
        host.innerHTML = html;
        renderFacets();
    }

    function renderFacets() {
        var host = el('facetRail');
        if (!host) { return; }
        var html = '<span class="toolbar-label">Quick facets</span>' +
            '<button type="button" class="facet-pill' + (S.facet === 'all' ? ' is-on' : '') +
            '" data-facet="all" aria-pressed="' + (S.facet === 'all') + '">All <em>' + ALL.length + '</em></button>';
        for (var i = 0; i < FACETS.length; i++) {
            var f = FACETS[i];
            var n = countIf(function (p) { return facetOf(p) === f.id; });
            html += '<button type="button" class="facet-pill' + (S.facet === f.id ? ' is-on' : '') +
                '" data-facet="' + f.id + '" aria-pressed="' + (S.facet === f.id) + '">' +
                esc(f.name) + ' <em>' + n + '</em></button>';
        }
        host.innerHTML = html;
    }

    /* ─ 3 · Budget bands + dual-thumb range (real filtering, accessible) ── */
    function bandCount(band) {
        return countIf(function (p) { return num(p.price) >= band.lo && num(p.price) <= band.hi; });
    }
    function rangeFraction(v) { return ((num(v) - FLOOR) / (CEIL - FLOOR)) * 100; }

    function renderBands() {
        var host = el('bandGrid');
        if (!host) { return; }
        var maxCount = 0;
        for (var b = 0; b < BANDS.length; b++) { maxCount = Math.max(maxCount, bandCount(BANDS[b])); }

        var html = '';
        for (var i = 0; i < BANDS.length; i++) {
            var band = BANDS[i];
            var list = ALL.filter(function (p) { return num(p.price) >= band.lo && num(p.price) <= band.hi; });
            var n = list.length;
            var on = S.band === band.id;
            var pick = list.slice().sort(function (a, c) {
                return num(c.rating) - num(a.rating) || num(c.reviews) - num(a.reviews);
            })[0];
            html += '<button type="button" class="band-card' + (on ? ' is-on' : '') + (n ? '' : ' is-empty') +
                '" data-band="' + band.id + '" aria-pressed="' + on + '">' +
                '<div class="band-name">' + esc(band.name) + '</div>' +
                '<div class="band-count">' + (n === 1 ? '1 product' : n + ' products') + '</div>' +
                '<div class="band-bar"><i style="width:' +
                    (maxCount ? Math.round((n / maxCount) * 100) : 0) + '%"></i></div>' +
                '<div class="band-pick">' + (pick
                    ? 'Top pick <b>' + esc(pick.name) + '</b> · ' + num(pick.rating).toFixed(1) + '★ · ' + money(pick.price)
                    : 'Nothing in this band yet') + '</div>' +
                '</button>';
        }
        host.innerHTML = html;
        renderRange();
    }

    /* Dual-thumb range + numeric inputs (keyboard friendly, no drag needed) */
    function renderRange() {
        var lo = el('rangeLo');
        var hi = el('rangeHi');
        var loNum = el('rangeLoNum');
        var hiNum = el('rangeHiNum');
        var fill = el('rangeFill');
        var ticks = el('rangeTicks');
        if (lo) { lo.min = FLOOR; lo.max = CEIL; lo.value = S.lo; lo.step = 1; }
        if (hi) { hi.min = FLOOR; hi.max = CEIL; hi.value = S.hi; hi.step = 1; }
        if (loNum) { loNum.min = FLOOR; loNum.max = CEIL; loNum.value = S.lo; }
        if (hiNum) { hiNum.min = FLOOR; hiNum.max = CEIL; hiNum.value = S.hi; }
        if (fill) {
            var a = rangeFraction(S.lo);
            var b = rangeFraction(S.hi);
            fill.style.left = a + '%';
            fill.style.width = Math.max(0, b - a) + '%';
        }
        if (ticks) {
            ticks.innerHTML = '<span>' + money(FLOOR) + '</span><span>median ' + money(MEDIAN) +
                '</span><span>' + money(CEIL) + '</span>';
        }
    }
/* ─ 5 · Refinement rail — one composed filter state, honest counts ── */
    function nameFrom(list, id) {
        for (var i = 0; i < list.length; i++) { if (list[i].id === id) { return list[i].name; } }
        return id;
    }
    function choiceRow(kind, value, label, count, on, extra) {
        var off = (count === 0 && !on);
        return '<label class="f-choice' + (on ? ' is-on' : '') + (off ? ' is-off' : '') + '">' +
            '<input type="radio" name="f-' + kind + '" value="' + esc(value) + '" data-fkind="' + kind + '"' +
            (on ? ' checked' : '') + (off ? ' disabled' : '') + '>' +
            '<span>' + label + (extra || '') + '</span><em>' + count + '</em></label>';
    }
    function toggleRow(key, label, on) {
        return '<label class="f-toggle"><span>' + esc(label) + '</span>' +
            '<input type="checkbox" data-ftoggle="' + key + '"' + (on ? ' checked' : '') + '>' +
            '<span class="f-switch" aria-hidden="true"></span></label>';
    }
    function starGlyphs(v) {
        var out = '';
        for (var i = 1; i <= 5; i++) { out += (i <= Math.floor(v)) ? '★' : '☆'; }
        return out;
    }

    function renderFilters() {
        var host = el('filtersRoot');
        if (!host) { return; }
        var n = results().length;
        var i;
        var html = '<div class="f-live">' +
            '<div><div class="f-live-num">' + n + '</div><div class="f-live-lab">' +
            (n === 1 ? 'product matches' : 'products match') + '</div></div>' +
            '<button type="button" class="f-btn f-btn--ghost" data-reset="all">Reset all</button></div>';

        /* Collection */
        html += '<div class="f-group"><div class="f-group-title"><span>Collection</span></div>';
        for (i = 0; i < COLLECTIONS.length; i++) {
            var col = COLLECTIONS[i];
            var colN = countIf(function (p) {
                if (col.id === 'all') { return true; }
                if (col.id === 'sale') { return discPct(p) > 0; }
                return p.badge === col.id;
            });
            html += choiceRow('col', col.id, esc(col.name), colN, S.col === col.id);
        }
        html += '</div>';

        /* Category */
        html += '<div class="f-group"><div class="f-group-title"><span>Category</span></div>';
        html += choiceRow('cat', 'all', 'All categories', ALL.length, S.cat === 'all');
        for (i = 0; i < CATS.length; i++) {
            html += choiceRow('cat', CATS[i].id, esc(CATS[i].name),
                countIf(function (p) { return catOf(p) === CATS[i].id; }),
                S.cat === CATS[i].id);
        }
        html += '</div>';

        /* Facet */
        html += '<div class="f-group"><div class="f-group-title"><span>Facet</span></div>';
        html += choiceRow('facet', 'all', 'All facets', ALL.length, S.facet === 'all');
        for (i = 0; i < FACETS.length; i++) {
            html += choiceRow('facet', FACETS[i].id, esc(FACETS[i].name),
                countIf(function (p) { return facetOf(p) === FACETS[i].id; }),
                S.facet === FACETS[i].id);
        }
        html += '</div>';

        /* Budget band (mirrors the band cards) */
        html += '<div class="f-group"><div class="f-group-title"><span>Budget band</span></div>';
        html += choiceRow('band', 'all', 'Any budget', ALL.length, S.band === 'all');
        for (i = 0; i < BANDS.length; i++) {
            html += choiceRow('band', BANDS[i].id, esc(BANDS[i].name), bandCount(BANDS[i]), S.band === BANDS[i].id);
        }
        html += '</div>';

        /* Minimum rating */
        html += '<div class="f-group"><div class="f-group-title"><span>Minimum rating</span></div>';
        var ratings = [
            { v: 0, l: 'Any rating' },
            { v: 4, l: '4.0 and up' },
            { v: 4.5, l: '4.5 and up' },
            { v: 4.7, l: '4.7 and up' }
        ];
        for (i = 0; i < ratings.length; i++) {
            var r = ratings[i];
            html += choiceRow('rating', String(r.v),
                esc(r.l) + (r.v ? ' <span class="f-stars">' + starGlyphs(r.v) + '</span>' : ''),
                countIf(function (p) { return num(p.rating) >= r.v; }),
                num(S.rating) === r.v);
        }
        html += '</div>';

        /* Minimum discount */
        html += '<div class="f-group"><div class="f-group-title"><span>Minimum discount</span></div>';
        var discs = [
            { v: 0, l: 'Any discount' },
            { v: 10, l: '10% off and up' },
            { v: 20, l: '20% off and up' },
            { v: 30, l: '30% off and up' }
        ];
        for (i = 0; i < discs.length; i++) {
            var d = discs[i];
            html += choiceRow('disc', String(d.v), esc(d.l),
                countIf(function (p) { return discPct(p) >= d.v; }),
                num(S.disc) === d.v);
        }
        html += '</div>';

        /* Availability */
        html += '<div class="f-group"><div class="f-group-title"><span>Availability</span></div>' +
            toggleRow('sale', 'On sale only (' + SALE_LIST.length + ')', num(S.sale)) +
            toggleRow('photo', 'Has studio photo (' + PHOTO_LIST.length + ')', num(S.photo)) +
            toggleRow('low', 'Low stock only (' + countIf(function (p) { return isLow(p); }) + ')', num(S.low)) +
            '</div>';

        html += '<div class="f-actions">' +
            '<button type="button" class="f-btn" data-reset="all">Clear everything</button>' +
            '<button type="button" class="f-btn f-btn--ghost" data-share="1">Copy filter link</button>' +
            '</div>' +
            '<p class="f-note">Counts react to your other filters, and the money range uses the live ' +
            'catalogue envelope (' + money(FLOOR) + '–' + money(CEIL) + ').</p>';

        host.innerHTML = html;
        renderChips();
    }
/* ─ Active filter chips (each individually removable + clear-all) ── */
    function activeChips() {
        var out = [];
        if (S.q) { out.push({ key: 'q', label: 'Search: "' + S.q + '"' }); }
        if (S.col !== 'all') { out.push({ key: 'col', label: nameFrom(COLLECTIONS, S.col) }); }
        if (S.cat !== 'all') { out.push({ key: 'cat', label: catName(S.cat) }); }
        if (S.facet !== 'all') { out.push({ key: 'facet', label: facetName(S.facet) }); }
        if (S.band !== 'all') { out.push({ key: 'band', label: bandOf(S.band).name }); }
        if (num(S.lo) !== FLOOR || num(S.hi) !== CEIL) { out.push({ key: 'range', label: money(S.lo) + ' – ' + money(S.hi) }); }
        if (num(S.rating)) { out.push({ key: 'rating', label: 'Rated ' + S.rating + '+ ★' }); }
        if (num(S.disc)) { out.push({ key: 'disc', label: 'At least ' + S.disc + '% off' }); }
        if (num(S.sale)) { out.push({ key: 'sale', label: 'On sale only' }); }
        if (num(S.photo)) { out.push({ key: 'photo', label: 'Studio photo only' }); }
        if (num(S.low)) { out.push({ key: 'low', label: 'Low stock only' }); }
        return out;
    }

    function renderChips() {
        var host = el('chipsRoot');
        if (!host) { return; }
        var chips = activeChips();
        if (!chips.length) {
            host.innerHTML = '<span class="chip-rail-empty">No filters applied — the full catalogue is on screen.</span>';
            return;
        }
        var html = '<span class="chip-rail-empty">' + chips.length +
            (chips.length === 1 ? ' filter active:' : ' filters active:') + '</span>';
        for (var i = 0; i < chips.length; i++) {
            html += '<span class="chip">' + esc(chips[i].label) +
                '<button type="button" data-chip="' + chips[i].key +
                '" aria-label="Remove filter: ' + esc(chips[i].label) + '">×</button></span>';
        }
        html += '<button type="button" class="chip-clear" data-reset="all">Clear all filters</button>';
        host.innerHTML = html;
    }

    /*  6 · Results toolbar: honest count, real sort, working view toggle ── */
    function syncSeg(hostId, attr, value) {
        var host = el(hostId);
        if (!host) { return; }
        var btns = host.querySelectorAll('[' + attr + ']');
        for (var i = 0; i < btns.length; i++) {
            var on = btns[i].getAttribute(attr) === value;
            btns[i].classList.toggle('is-on', on);
            btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
        }
    }

    function renderToolbar() {
        var list = results();
        var shown = list.slice(0, num(S.shown));

        var count = el('resultCount');
        if (count) {
            count.innerHTML = '<b>' + list.length + '</b> of <b>' + ALL.length + '</b> products match' +
                (list.length > shown.length ? ' · first <b>' + shown.length + '</b> on screen' : '');
        }

        var sortSel = el('sortSelect');
        if (sortSel) {
            if (sortSel.options.length !== SORTS.length) {
                sortSel.innerHTML = SORTS.map(function (s) {
                    return '<option value="' + s.id + '">' + esc(s.name) + '</option>';
                }).join('');
            }
            sortSel.value = S.sort;
        }

        syncSeg('viewSeg', 'data-view', S.view);
        syncSeg('densitySeg', 'data-density', S.density);

        var grid = el('shopGrid');
        if (grid) {
            grid.classList.toggle('is-list', S.view === 'list');
            grid.classList.toggle('is-compact', S.density === 'compact');
        }

        var info = el('shownInfo');
        if (info) {
            info.textContent = shown.length + ' of ' + list.length + ' matching products rendered' +
                (S.view === 'list' ? ' in list view' : '') +
                (S.density === 'compact' ? ' at compact density' : '');
        }
    }
/* 7 · Product grid — skeletons, cards, pagination, empty state */
    function paintGrid(shown) {
        var grid = el('shopGrid');
        if (!grid) { return; }
        var html = '';
        for (var i = 0; i < shown.length; i++) { html += cardHTML(shown[i], { mode: 'grid' }); }
        grid.innerHTML = html;
    }

    function renderGrid(animate) {
        var grid = el('shopGrid');
        if (!grid) { return; }
        var list = results();
        var shown = list.slice(0, num(S.shown));

        if (!list.length) {
            grid.innerHTML = '<div class="grid-empty-host">' + (UI.emptyState
                ? UI.emptyState({
                    icon: '🔍',
                    title: 'Nothing matches those filters',
                    text: 'The catalogue holds ' + ALL.length + ' products — loosen one filter, or reset everything to see them again.',
                    ctaHref: 'shop.html',
                    ctaText: 'Reset the shop'
                })
                : '<p class="chip-rail-empty">No products match those filters.</p>') + '</div>';
        } else if (animate) {
            /* Shimmer first, then the real cards on the next frame */
            grid.innerHTML = skeletonHTML(Math.min(shown.length, PER_PAGE));
            window.setTimeout(function () {
                paintGrid(results().slice(0, num(S.shown)));
            }, 140);
        } else {
            paintGrid(shown);
        }
        renderGridFoot(list, shown);
    }

    function renderGridFoot(list, shown) {
        var note = el('gridFootNote');
        var more = el('loadMore');
        var all = el('loadAll');
        var remaining = list.length - shown.length;

        if (note) {
            var inView = '';
            if (list.length) {
                var prices = list.map(function (p) { return num(p.price); });
                inView = ' · ' + money(Math.min.apply(null, prices)) + ' to ' + money(Math.max.apply(null, prices)) + ' in this view';
            }
            note.textContent = shown.length + ' of ' + list.length + ' matching products on screen · ' +
                ALL.length + ' in the catalogue' + inView;
        }
        if (more) {
            if (remaining > 0) {
                more.style.display = '';
                more.disabled = false;
                more.textContent = 'Load ' + Math.min(PER_PAGE, remaining) + ' more';
            } else {
                more.style.display = 'none';
                more.disabled = true;
            }
        }
        if (all) {
            if (remaining > 0 && list.length > PER_PAGE) {
                all.style.display = '';
                all.textContent = 'Show all ' + list.length;
            } else {
                all.style.display = 'none';
            }
        }
    }
/* 4 · Price-drops rail — ranked by the real discount, bar scaled to it */
    function renderDrops() {
        var rail = el('dropsRail');
        if (!rail) { return; }
        var list = SALE_LIST.slice().sort(function (a, b) {
            return discPct(b) - discPct(a) || saveAmt(b) - saveAmt(a);
        }).slice(0, 8);
        if (!list.length) {
            var sec = el('drops');
            if (sec) { sec.style.display = 'none'; }
            return;
        }
        var html = '';
        for (var i = 0; i < list.length; i++) {
            var p = list[i];
            html += '<div class="mom-item">' + cardHTML(p, { mode: 'rail' }) +
                '<div class="mom-meta"><span>−' + discPct(p) + '% · save ' + money(saveAmt(p)) + '</span>' +
                '<b>' + money(p.price) + '</b></div>' +
                '<div class="mom-bar" title="' + discPct(p) + '% below the previous price of ' +
                    money(p.oldPrice) + '"><i style="width:' +
                    Math.min(100, Math.round((discPct(p) / 40) * 100)) + '%"></i></div>' +
                '</div>';
        }
        rail.innerHTML = html;
    }

    /* 11 · Momentum rail — ranked, bar = reviews × rating (real fields) */
    function renderMomentum() {
        var rail = el('momentumRail');
        if (!rail) { return; }
        var mx = maxMomentum();
        var list = ALL.slice().sort(function (a, b) { return momentum(b) - momentum(a); }).slice(0, 8);
        var html = '';
        for (var i = 0; i < list.length; i++) {
            var p = list[i];
            var w = Math.max(6, Math.round((momentum(p) / mx) * 100));
            html += '<div class="mom-item">' + cardHTML(p, { mode: 'rail', rank: i + 1 }) +
                '<div class="mom-meta"><span>Momentum ' + w + '%</span>' +
                '<b>' + num(p.reviews) + ' reviews · ' + num(p.rating).toFixed(1) + '★</b></div>' +
                '<div class="mom-bar" title="Momentum score ' + Math.round(momentum(p)) +
                    ' = ' + num(p.reviews) + ' reviews × ' + num(p.rating) + ' rating">' +
                    '<i style="width:' + w + '%"></i></div>' +
                '</div>';
        }
        rail.innerHTML = html;
    }

    /* Generic rail controls (‹ › scroll by one card-width page) */
    function initRailNav() {
        var btns = document.querySelectorAll('[data-rail]');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', function () {
                var rail = el(this.getAttribute('data-rail'));
                if (!rail) { return; }
                var dir = num(this.getAttribute('data-dir')) || 1;
                var step = rail.clientWidth * 0.85;
                rail.scrollBy({ left: dir * step, behavior: 'smooth' });
            });
        }
    }
/* 10 · Catalogue intelligence — aggregates + leaderboards ── */
    function intelItem(p, metric, sub) {
        return '<a class="intel-item" href="product.html?id=' + idStr(p.id) + '">' +
            '<span class="intel-thumb">' + P.media(p) + '</span>' +
            '<span class="intel-txt"><b>' + esc(p.name) + '</b><span>' + esc(sub) + '</span></span>' +
            '<span class="intel-metric">' + esc(metric) + '</span></a>';
    }
    function leaderList(list, metricFn, subFn) {
        var html = '<div class="intel-list">';
        for (var i = 0; i < list.length; i++) {
            html += intelItem(list[i], metricFn(list[i]), subFn(list[i]));
        }
        return html + '</div>';
    }

    function renderIntel() {
        var host = el('intelRoot');
        if (!host) { return; }

        var spread = catalogueRatingSpread();
        var fivePct = spread[0] ? spread[0].pct : 0;
        var fiveCount = spread[0] ? spread[0].n : 0;

        var mostReviewed = ALL.slice().sort(function (a, b) { return num(b.reviews) - num(a.reviews); }).slice(0, 4);
        var topRated = ALL.slice().sort(function (a, b) {
            return num(b.rating) - num(a.rating) || num(b.reviews) - num(a.reviews);
        }).slice(0, 4);
        var bestValue = ALL.slice().sort(function (a, b) { return valueScore(b) - valueScore(a); }).slice(0, 4);
        var byPrice = ALL.slice().sort(function (a, b) { return num(a.price) - num(b.price); });
        var cheapest = byPrice[0];
        var priciest = byPrice[byPrice.length - 1];

        var html = '<div class="intel-card"><h3>Catalogue pulse</h3>' +
            '<div class="intel-big"><b>' + AVG_RATING.toFixed(2) + '</b>' +
            '<span>average rating across all ' + ALL.length + ' products</span></div>' +
            '<div class="intel-stats">' +
                '<div class="intel-stat"><b>' + TOTAL_REVIEWS.toLocaleString('en-US') + '</b>reviews counted</div>' +
                '<div class="intel-stat"><b>' + fivePct + '%</b>of them are 5★</div>' +
                '<div class="intel-stat"><b>' + money(MEDIAN) + '</b>median price</div>' +
                '<div class="intel-stat"><b>' + money(AVG_PRICE) + '</b>average price</div>' +
                '<div class="intel-stat"><b>' + money(cheapest.price) + '</b>entry point · ' + esc(cheapest.name) + '</div>' +
                '<div class="intel-stat"><b>' + money(priciest.price) + '</b>ceiling · ' + esc(priciest.name) + '</div>' +
            '</div>' +
            '<p class="intel-note">Ratings and review counts are the catalogue\'s own fields; the 5★ share is the ' +
            'review-weighted average of every product\'s rating breakdown.</p></div>';

        html += '<div class="intel-card"><h3>Star distribution</h3><div class="intel-bars">';
        for (var i = 0; i < spread.length; i++) {
            html += '<div class="intel-row"><span>' + spread[i].stars + '★</span>' +
                '<i><b style="width:' + spread[i].pct + '%"></b></i>' +
                '<span>' + spread[i].pct + '%</span></div>';
        }
        html += '</div><p class="intel-note">' + fiveCount.toLocaleString('en-US') +
            ' five-star reviews across the range — ' + TOTAL_REVIEWS.toLocaleString('en-US') + ' in total.</p></div>';

        html += '<div class="intel-card"><h3>Most reviewed</h3>' + leaderList(mostReviewed,
            function (p) { return num(p.reviews) + ' rev'; },
            function (p) { return num(p.rating).toFixed(1) + '★ · ' + money(p.price) + ' · ' + facetName(facetOf(p)); }) +
            '<p class="intel-note">Review volume is the clearest signal of what people actually buy.</p></div>';

        html += '<div class="intel-card"><h3>Top rated tier</h3>' + leaderList(topRated,
            function (p) { return num(p.rating).toFixed(1) + '★'; },
            function (p) { return num(p.reviews) + ' reviews · ' + money(p.price); }) + '</div>';

        html += '<div class="intel-card"><h3>Best value · rating per $100</h3>' + leaderList(bestValue,
            function (p) { return valueScore(p).toFixed(1) + ' pts'; },
            function (p) { return money(p.price) + ' · ' + num(p.rating).toFixed(1) + '★ · ' + facetName(facetOf(p)); }) +
            '<p class="intel-note">Value score = rating ÷ (price ÷ 100). It surfaces quiet over-performers rather than ' +
            'simply the cheapest items.</p></div>';

        host.innerHTML = html;
    }
/* 12 · Decision support — guide built from real spec rows ── */
    function specValue(p, labelRe) {
        var rows = P.specs(p) || [];
        for (var i = 0; i < rows.length; i++) {
            if (labelRe.test(String(rows[i][0]))) { return String(rows[i][1]); }
        }
        return '';
    }
    function topInFacet(facetId) {
        var list = ALL.filter(function (p) { return facetOf(p) === facetId; });
        return list.slice().sort(function (a, b) {
            return num(b.rating) - num(a.rating) || num(b.reviews) - num(a.reviews);
        })[0] || null;
    }

    function renderGuide() {
        var host = el('guideRoot');
        if (!host) { return; }

        var blocks = [
            {
                facet: 'audio',
                icon: '🎧',
                title: 'Choosing audio',
                labels: ['Driver / battery', 'Noise control', 'Weight'],
                rows: [/driver|battery/i, /noise/i, /weight/i],
                intro: function (p) {
                    return 'Sound comes down to three numbers: driver size, running time and how much noise it ' +
                        'removes. ' + p.name + ' leads the audio facet at ' + num(p.rating).toFixed(1) + '★ from ' +
                        num(p.reviews) + ' reviews.';
                }
            },
            {
                facet: 'computing',
                icon: '💻',
                title: 'Choosing computing',
                labels: ['Graphics / chip', 'Memory', 'Display'],
                rows: [/gpu|chip|cpu|memory/i, /display|panel/i, /storage/i],
                intro: function (p) {
                    return 'Check the graphics or chip tier first, then memory, then the panel — in that order. ' +
                        p.name + ' is the highest-rated machine here at ' + num(p.rating).toFixed(1) + '★ and ' +
                        num(p.reviews) + ' reviews.';
                }
            },
            {
                facet: 'carry',
                icon: '🎒',
                title: 'Choosing everyday carry',
                labels: ['Capacity', 'Material', 'Security / extras'],
                rows: [/capacity|dimensions/i, /material/i, /extras|laptop|security|card slots/i],
                intro: function (p) {
                    return 'Capacity, materials and locking are what separate a daily carry from a weekend bag. ' +
                        p.name + ' tops the carry facet at ' + num(p.rating).toFixed(1) + '★ from ' +
                        num(p.reviews) + ' reviews.';
                }
            }
        ];

        var html = '';
        for (var i = 0; i < blocks.length; i++) {
            var b = blocks[i];
            var p = topInFacet(b.facet);
            if (!p) { continue; }
            html += '<article class="guide-card">' +
                '<span class="guide-ico" aria-hidden="true">' + b.icon + '</span>' +
                '<h3>' + esc(b.title) + '</h3>' +
                '<p>' + esc(b.intro(p)) + '</p><div class="guide-facts">';
            for (var r = 0; r < b.rows.length; r++) {
                var v = specValue(p, b.rows[r]);
                if (v) {
                    html += '<div class="guide-fact"><span>' + esc(b.labels[r]) + '</span><b>' + esc(v) + '</b></div>';
                }
            }
            html += '</div><a class="guide-link" href="product.html?id=' + idStr(p.id) +
                '">Full spec table on ' + esc(p.name) + ' →</a></article>';
        }
        host.innerHTML = html;
    }
/* FAQ — real policy copy (UI.faq when available, own markup otherwise) */
    function faqHTML(items) {
        if (typeof UI.faq === 'function') { return UI.faq(items, true); }
        var out = '<div class="acc-group">';
        for (var i = 0; i < items.length; i++) {
            out += '<details class="acc"' + (i === 0 ? ' open' : '') + '>' +
                '<summary class="acc-q">' + esc(items[i].q) + '</summary>' +
                '<div class="acc-a">' + esc(items[i].a) + '</div></details>';
        }
        return out + '</div>';
    }

    function renderFaq() {
        var host = el('faqRoot');
        if (!host) { return; }
        /* Lowest-priced SKU: its shipping window (3–5 days) is the typical case,
           and the wording stays the store's own. */
        var ref = ALL.slice().sort(function (a, b) { return num(a.price) - num(b.price); })[0];
        var items = P.shippingInfo(ref).slice();
        items.push({
            q: 'Do you ship worldwide, and what does it cost?',
            a: 'Yes. Orders over $50 ship free inside the standard window; anything below that is quoted at checkout. Express upgrades are offered there too, with a tracked carrier on every parcel.'
        });
        items.push({
            q: 'Who do I talk to if something goes wrong?',
            a: 'A real person. Messages sent from the contact page are answered within 24 hours, and delivery problems are handled by our order team — the Track Order page shows the live status of any parcel.'
        });
        host.innerHTML =
            '<h3 class="sec-title" style="font-size:1.05rem;margin-bottom:1rem">' +
            'Shipping, returns and warranty — in the store\'s own words</h3>' +
            faqHTML(items);
    }

    /* 13 · Service architecture — six linked promises with real numbers */
    function renderServices() {
        var host = el('svcGrid');
        if (!host) { return; }
        function ic(d) { return svg(d, 20); }
        var cards = [
            {
                href: 'shipping.html',
                icon: ic('<path d="M5 18H3c-.6 0-1-.4-1-1V7c0-.6.4-1 1-1h10c.6 0 1 .4 1 1v11"/><path d="M14 9h4l4 4v4c0 .6-.4 1-1 1h-2"/><circle cx="7" cy="18" r="2"/><path d="M15 18H9"/><circle cx="17" cy="18" r="2"/>'),
                title: 'Shipping', num: 'Free over $50',
                text: 'Standard 3–5 working days, or 5–7 on orders above $400. Ordered before 3 PM? It ships the same day.'
            },
            {
                href: 'returns.html',
                icon: ic('<path d="M3 12a9 9 0 1 0 9-9"/><path d="M3 4v5h5"/><path d="M12 7v5l3 3"/>'),
                title: '30-day returns', num: '30 days',
                text: 'Return anything in its original condition. Refunds land 3–5 working days after it reaches our warehouse.'
            },
            {
                href: 'track-order.html',
                icon: ic('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>'),
                title: 'Track order', num: 'Live status',
                text: 'A tracking link is emailed the moment the carrier scans your parcel, and the status page stays live.'
            },
            {
                href: 'size-guide.html',
                icon: ic('<path d="M3 8h18v8H3z"/><path d="M7 8v3M11 8v4M15 8v3M19 8v4"/>'),
                title: 'Size guide', num: 'UK 5 – 13',
                text: 'Footwear sizing with fit notes, plus measurements for bags, eyewear and small leather goods.'
            },
            {
                href: 'help-center.html',
                icon: ic('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
                title: 'Help centre', num: '24 h reply',
                text: 'Searchable answers first, then a direct route to a human that is answered within 24 hours.'
            },
            {
                href: 'rewards.html',
                icon: ic('<path d="m12 17.27 6.18 3.73-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21Z"/>'),
                title: 'Rewards', num: ALL.length + ' SKUs',
                text: 'Ten percent off your first order with WELCOME10, plus early access to drops and restock alerts.'
            }
        ];
        var html = '';
        for (var i = 0; i < cards.length; i++) {
            html += '<a class="svc-card" href="' + cards[i].href + '">' +
                '<span class="svc-ico" aria-hidden="true">' + cards[i].icon + '</span>' +
                '<h3>' + esc(cards[i].title) + '</h3>' +
                '<span class="svc-num">' + esc(cards[i].num) + '</span>' +
                '<p>' + esc(cards[i].text) + '</p>' +
                '<span class="svc-go">Open ' + esc(cards[i].title) + ' →</span></a>';
        }
        host.innerHTML = html;
    }
/* 16 · Rewards — honest guest vs signed-in comparison (no invented tiers) */
    function intelFact(title, sub) {
        return '<span class="intel-item"><span class="intel-txt"><b>' + esc(title) + '</b>' +
            '<span>' + esc(sub) + '</span></span></span>';
    }

    function renderRewards() {
        var left = el('rewardsRoot');
        var right = el('rewardsRight');
        var cheapest = ALL.slice().sort(function (a, b) { return num(a.price) - num(b.price); })[0];

        if (left) {
            left.innerHTML = '<h3>As a guest, right now</h3><div class="intel-list">' +
                intelFact('Browse all ' + ALL.length + ' products', 'Every SKU, spec table and price is public') +
                intelFact('Compare up to ' + CMP_MAX + ' items', 'The tray keeps your shortlist while you browse') +
                intelFact('Wishlist saved locally', 'Stored in this browser, shareable from wishlist.html') +
                intelFact('30-day returns', 'Applies from the moment your order is delivered') +
                intelFact('Entry price ' + money(cheapest.price), esc(cheapest.name) + ' sets the floor of the range') +
                '</div>';
        }
        if (right) {
            right.innerHTML = '<h3>Signing in adds</h3><div class="intel-list">' +
                intelFact('Order history and tracking', 'Every parcel in one place on your account') +
                intelFact('Saved addresses', 'Faster checkout, fewer typos') +
                intelFact('10% welcome code', 'WELCOME10 applies at checkout on your first order') +
                intelFact('Drop and restock alerts', 'Early access to new arrivals and member deals') +
                '</div>' +
                '<div class="f-actions">' +
                '<a class="f-btn" href="register.html">Create an account</a>' +
                '<a class="f-btn f-btn--ghost" href="rewards.html">See the rewards page</a>' +
                '</div>' +
                '<p class="intel-note">Tier names and multipliers stay on the rewards page, so this panel never ' +
                'quotes a number the catalogue cannot back up.</p>';
        }
    }
/* 14a · Recently viewed — localStorage, capped, most recent first ── */
    function rememberViewed(id) {
        var list = recentIds();
        var out = [idStr(id)];
        for (var i = 0; i < list.length && out.length < 8; i++) {
            if (list[i] !== idStr(id)) { out.push(list[i]); }
        }
        writeJSON(K_RECENT, out);
    }

    function renderRecent() {
        var sec = el('recent');
        var rail = el('recentRail');
        if (!sec || !rail) { return; }
        var ids = recentIds();
        var list = [];
        for (var i = 0; i < ids.length; i++) {
            var p = P.find(ids[i]);
            if (p) { list.push(p); }
        }
        if (list.length < 2) { sec.hidden = true; return; }
        sec.hidden = false;
        var html = '';
        for (var j = 0; j < list.length; j++) { html += cardHTML(list[j], { mode: 'rail' }); }
        rail.innerHTML = html;
    }

    /* 14b · Pairs with your cart — same category, not already in the cart ─ */
    function renderPairs() {
        var sec = el('pairs');
        var rail = el('pairsRail');
        if (!sec || !rail) { return; }
        if (typeof CartManager === 'undefined') { sec.hidden = true; return; }
        var cart = CartManager.getCart();
        if (!cart.length) { sec.hidden = true; return; }

        var inCart = {};
        var cats = {};
        var names = [];
        for (var i = 0; i < cart.length; i++) {
            inCart[idStr(cart[i].id)] = true;
            var cp = P.find(cart[i].id);
            if (cp) {
                cats[catOf(cp)] = true;
                names.push(cp.name);
            }
        }

        var picks = ALL.filter(function (p) {
            return !inCart[idStr(p.id)] && cats[catOf(p)];
        }).sort(function (a, b) {
            return num(b.rating) - num(a.rating) || num(b.reviews) - num(a.reviews);
        }).slice(0, 6);
        if (!picks.length) { sec.hidden = true; return; }

        var sub = el('pairsSub');
        if (sub) {
            sub.textContent = names.length === 1
                ? 'Chosen from the same category as ' + names[0] + ', ranked by rating and review volume.'
                : 'Chosen from the same categories as your ' + cart.length + ' cart items — ranked by rating and review volume, and never repeating an item you already added.';
        }
        sec.hidden = false;
        var html = '';
        for (var j = 0; j < picks.length; j++) { html += cardHTML(picks[j], { mode: 'rail' }); }
        rail.innerHTML = html;
    }

    /* 15 · Sticky cart dock — count, subtotal, last added ── */
    function renderDock() {
        var dock = el('cartDock');
        if (!dock) { return; }
        var count = cartCount();
        var items = (typeof CartManager === 'undefined') ? [] : CartManager.getCart();

        var c = el('dockCount');
        var t = el('dockTotal');
        var last = el('dockLast');
        if (c) { c.textContent = count === 1 ? '1 item' : count + ' items'; }
        if (t) { t.textContent = money(cartTotal()); }
        if (last) {
            var lp = items.length ? P.find(items[items.length - 1].id) : null;
            last.textContent = lp ? ('Last added: ' + lp.name) : 'Your cart is empty';
        }
        dock.classList.toggle('is-on', count > 0);
        dock.classList.toggle('is-shifted', cmpIds().length > 0);
    }

    /* SEO · ItemList / Offer structured data from the live catalogue ── */
    function injectJsonLd() {
        var node = el('catalogueJsonLd');
        if (!node) { return; }
        var top = ALL.slice().sort(function (a, b) {
            return num(b.rating) - num(a.rating) || num(b.reviews) - num(a.reviews);
        }).slice(0, 12);

        var data = {
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: 'Trendaryo catalogue',
            numberOfItems: ALL.length,
            itemListElement: top.map(function (p, i) {
                var item = {
                    '@type': 'Product',
                    name: p.name,
                    description: p.description,
                    sku: sku(p),
                    category: catName(catOf(p)),
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
                        url: 'product.html?id=' + idStr(p.id)
                    }
                };
                if (p.image) { item.image = p.image; }
                return { '@type': 'ListItem', position: i + 1, item: item };
            })
        };
        try { node.textContent = JSON.stringify(data); } catch (e) { /* stay silent */ }
    }
/* 9 · Compare model — writes compare.html's own localStorage key ─ */
    function cmpProducts() {
        var ids = cmpIds();
        var out = [];
        for (var i = 0; i < ids.length; i++) {
            var p = P.find(ids[i]);
            if (p) { out.push(p); }
        }
        return out;
    }

    /* compare.html reads exactly these fields (see its own renderer) */
    function cmpRecord(p) {
        return {
            id: idStr(p.id),
            name: p.name,
            price: num(p.price),
            category: catName(catOf(p)),
            rating: num(p.rating),
            reviews: num(p.reviews),
            stock: stockQty(p),
            description: p.description,
            image: p.image || '',
            emoji: p.emoji || ''
        };
    }

    function saveCompare(list) {
        writeJSON(K_CMP, list.map(cmpRecord));
        invalidateCaches();
    }

    function toggleCompare(id, silent) {
        var p = P.find(id);
        if (!p) { return false; }
        var list = cmpProducts();
        var idx = -1;
        for (var i = 0; i < list.length; i++) {
            if (idStr(list[i].id) === idStr(id)) { idx = i; }
        }
        if (idx > -1) {
            list.splice(idx, 1);
            saveCompare(list);
            if (!silent) { toast(p.name + ' removed from compare'); }
            return false;
        }
        if (list.length >= CMP_MAX) {
            toast('Compare holds ' + CMP_MAX + ' products — remove one first');
            return false;
        }
        list.push(p);
        saveCompare(list);
        if (!silent) { toast(p.name + ' added to compare (' + list.length + '/' + CMP_MAX + ')'); }
        return true;
    }

    function clearCompare() {
        saveCompare([]);
        toast('Comparison cleared');
    }

    function removeCompare(id) {
        var list = cmpProducts().filter(function (p) { return idStr(p.id) !== idStr(id); });
        saveCompare(list);
    }
/* 9b · Compare tray rendering + tick sync ── */
    function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    function renderCompare() {
        var tray = el('cmpTray');
        var slots = el('cmpSlots');
        var count = el('cmpCount');
        var list = cmpProducts();

        if (tray) { tray.classList.toggle('is-on', list.length > 0); }
        if (count) {
            count.textContent = list.length ? list.length + ' of ' + CMP_MAX + ' selected' : '0 selected';
        }
        if (slots) {
            var html = '';
            for (var i = 0; i < list.length; i++) {
                html += '<span class="cmp-slot">' + P.media(list[i]) +
                    '<button type="button" data-cmp-remove="' + idStr(list[i].id) +
                    '" aria-label="Remove ' + esc(list[i].name) + ' from comparison">×</button></span>';
            }
            for (var s = list.length; s < CMP_MAX; s++) {
                html += '<span class="cmp-slot cmp-slot--empty" aria-hidden="true">+</span>';
            }
            slots.innerHTML = html;
        }

        /* Keep every visible card tick in sync with the stored list */
        var cards = document.querySelectorAll('[data-cmp]');
        for (var c = 0; c < cards.length; c++) {
            var cid = idStr(cards[c].getAttribute('data-cmp'));
            var on = false;
            for (var k = 0; k < list.length; k++) {
                if (idStr(list[k].id) === cid) { on = true; }
            }
            cards[c].classList.toggle('is-on', on);
            cards[c].setAttribute('aria-pressed', on ? 'true' : 'false');
        }
        renderDock();
    }
/* 9b-2 · Side-by-side comparison board ── */
    function renderCompareBoard() {
        var host = el('cmpBoard');
        if (!host) { return; }
        var list = cmpProducts();
        if (list.length < 2) {
            host.innerHTML = '<p class="chip-rail-empty">Pick at least two products from the grid — the compare ' +
                'tray keeps your shortlist while you browse, then this board lines them up side by side.</p>';
            return;
        }

        var i;
        var bestPrice = Math.min.apply(null, list.map(function (p) { return num(p.price); }));
        var bestRating = Math.max.apply(null, list.map(function (p) { return num(p.rating); }));
        var bestReviews = Math.max.apply(null, list.map(function (p) { return num(p.reviews); }));
        var bestDisc = Math.max.apply(null, list.map(function (p) { return discPct(p); }));
        var bestValue = Math.max.apply(null, list.map(function (p) { return valueScore(p); }));

        var rows = [
            { label: 'Price', value: function (p) { return money(p.price) + (num(p.price) === bestPrice ? ' <span class="cmp-win">lowest</span>' : ''); } },
            { label: 'Discount', value: function (p) { return discPct(p) ? '−' + discPct(p) + '% · save ' + money(saveAmt(p)) + (discPct(p) === bestDisc ? ' <span class="cmp-win">best</span>' : '') : '—'; } },
            { label: 'Rating', value: function (p) { return num(p.rating).toFixed(1) + '★' + (num(p.rating) === bestRating ? ' <span class="cmp-win">highest</span>' : ''); } },
            { label: 'Reviews', value: function (p) { return num(p.reviews) + (num(p.reviews) === bestReviews ? ' <span class="cmp-win">most</span>' : ''); } },
            { label: 'Value score', value: function (p) { return valueScore(p).toFixed(1) + ' pts per $100' + (valueScore(p) === bestValue ? ' <span class="cmp-win">best</span>' : ''); } },
            { label: 'Category', value: function (p) { return esc(catName(catOf(p))); } },
            { label: 'Facet', value: function (p) { return esc(facetName(facetOf(p))); } },
            { label: 'SKU', value: function (p) { return sku(p); } },
            { label: 'Price band', value: function (p) { return esc(bandNameOf(p)); } },
            { label: 'Stock', value: function (p) { return isLow(p) ? 'Only ' + stockQty(p) + ' left' : stockQty(p) + ' units'; } },
            { label: 'Dispatch', value: function (p) { return dispatchDays(p) + ' working days'; } },
            { label: 'Warranty', value: function (p) { return esc(warrantyOf(p)); } }
        ];

        /* Up to four spec rows, taken from the compared products themselves */
        var specLabels = [];
        for (i = 0; i < list.length; i++) {
            var specRows = P.specs(list[i]) || [];
            for (var r = 0; r < specRows.length && specLabels.length < 4; r++) {
                var lab = String(specRows[r][0]);
                if (specLabels.indexOf(lab) === -1) { specLabels.push(lab); }
            }
        }
        for (var s = 0; s < specLabels.length; s++) {
            rows.push({
                label: specLabels[s],
                value: (function (label) {
                    var re = new RegExp(escapeRe(label), 'i');
                    return function (p) { return esc(specValue(p, re) || '—'); };
                })(specLabels[s])
            });
        }

        var html = '<table class="cmp-table"><thead><tr><th scope="col">Attribute</th>';
        for (i = 0; i < list.length; i++) {
            html += '<td><div class="cmp-head">' +
                '<span class="cmp-head-media">' + P.media(list[i]) + '</span>' +
                '<a class="cmp-head-name" href="product.html?id=' + idStr(list[i].id) + '">' +
                    esc(list[i].name) + '</a>' +
                '<span class="cmp-actions">' +
                    '<button type="button" class="cmp-mini" data-quick="' + idStr(list[i].id) + '">Quick view</button>' +
                    '<button type="button" class="cmp-mini" data-add="' + idStr(list[i].id) + '">Add to cart</button>' +
                    '<button type="button" class="cmp-mini" data-cmp-remove="' + idStr(list[i].id) + '">Remove</button>' +
                '</span></div></td>';
        }
        html += '</tr></thead><tbody>';
        for (var row = 0; row < rows.length; row++) {
            html += '<tr><th scope="row">' + esc(rows[row].label) + '</th>';
            for (var c = 0; c < list.length; c++) {
                html += '<td>' + rows[row].value(list[c]) + '</td>';
            }
            html += '</tr>';
        }
        html += '</tbody></table>' +
            '<div class="f-actions" style="margin-top:1rem">' +
            '<a class="f-btn" href="compare.html">Open the full compare page</a>' +
            '<button type="button" class="f-btn f-btn--ghost" data-cmp-clear="1">Clear comparison</button>' +
            '</div>';
        host.innerHTML = html;
    }
/* ═ STATE MUTATION — every control funnels through setState ══ */
    function commit(opts) {
        opts = opts || {};
        pushHash(!!opts.replace);
        renderAll({ animate: !!opts.animate });
    }

    function setState(patch, opts) {
        opts = opts || {};
        var k;
        for (k in patch) {
            if (patch.hasOwnProperty(k) && DEFAULTS.hasOwnProperty(k)) {
                S[k] = (typeof DEFAULTS[k] === 'number') ? num(patch[k]) : patch[k];
            }
        }
        /* Band and numeric range stay consistent: choosing a band sets the
           range, and typing a range clears the band. */
        if (patch.hasOwnProperty('band') && patch.band !== 'all') {
            var b = bandOf(S.band);
            if (b) {
                S.lo = b.lo;
                S.hi = (b.hi === Infinity) ? CEIL : b.hi;
            }
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
        var si = el('deckSearch');
        if (si) { si.value = ''; }
        commit({ animate: true });
    }

    /* Remove one active filter (used by the chips) */
    function resetOne(key) {
        if (key === 'range') {
            S.lo = FLOOR;
            S.hi = CEIL;
            S.band = 'all';
        } else if (key === 'q') {
            S.q = '';
            var si = el('deckSearch');
            if (si) { si.value = ''; }
        } else if (DEFAULTS.hasOwnProperty(key)) {
            S[key] = DEFAULTS[key];
            if (key === 'band') { S.lo = FLOOR; S.hi = CEIL; }
        }
        clampState();
        commit({ animate: true });
    }

    /* One-tap presets from the control deck */
    function applyPreset(key) {
        var patches = {
            cheap: { band: 'b1', rating: 0, disc: 0, sale: 0, photo: 0, low: 0, col: 'all', cat: 'all', facet: 'all' },
            top: { rating: 4.7, band: 'all', lo: FLOOR, hi: CEIL },
            sale: { sale: 1, disc: 0 },
            fast: { hi: 399, band: 'all', lo: FLOOR },
            low: { low: 1 },
            photo: { photo: 1 }
        };
        var patch = patches[key];
        if (!patch) { return; }
        setState(patch, { animate: true });
        scrollToId('grid');
    }

    function scrollToId(id) {
        var node = el(id);
        if (node && node.scrollIntoView) {
            node.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
/* ═ BINDINGS · part 2 — toolbar, price range, pagination, hash ═ */
    function bindToolbar() {
        var sortSel = el('sortSelect');
        if (sortSel) {
            sortSel.addEventListener('change', function () {
                setState({ sort: this.value }, { animate: true });
            });
        }

        var viewSeg = el('viewSeg');
        if (viewSeg) {
            viewSeg.addEventListener('click', function (e) {
                var b = e.target && e.target.closest ? e.target.closest('[data-view]') : null;
                if (!b) { return; }
                setState({ view: b.getAttribute('data-view') }, { animate: false });
            });
        }

        var densSeg = el('densitySeg');
        if (densSeg) {
            densSeg.addEventListener('click', function (e) {
                var b = e.target && e.target.closest ? e.target.closest('[data-density]') : null;
                if (!b) { return; }
                setState({ density: b.getAttribute('data-density') }, { animate: false });
            });
        }
    }

    /* Dual-thumb range: drag updates the visuals, release commits the filter */
    function bindRange() {
        var lo = el('rangeLo');
        var hi = el('rangeHi');
        var loNum = el('rangeLoNum');
        var hiNum = el('rangeHiNum');

        function live() {
            if (lo) { S.lo = num(lo.value); }
            if (hi) { S.hi = num(hi.value); }
            if (S.lo > S.hi) {
                var t = S.lo; S.lo = S.hi; S.hi = t;
                if (lo) { lo.value = S.lo; }
                if (hi) { hi.value = S.hi; }
            }
            renderRange();
        }
        function applyLive() {
            live();
            clampState();
            setState({ lo: S.lo, hi: S.hi }, { animate: true });
        }

        if (lo) {
            lo.addEventListener('input', live);
            lo.addEventListener('change', applyLive);
        }
        if (hi) {
            hi.addEventListener('input', live);
            hi.addEventListener('change', applyLive);
        }
        if (loNum) {
            loNum.addEventListener('change', function () { setState({ lo: num(this.value) }, { animate: true }); });
        }
        if (hiNum) {
            hiNum.addEventListener('change', function () { setState({ hi: num(this.value) }, { animate: true }); });
        }

        var apply = document.querySelector('[data-range-apply]');
        if (apply) {
            apply.addEventListener('click', function () { setState({ lo: num(S.lo), hi: num(S.hi) }, { animate: true }); });
        }
        var reset = document.querySelector('[data-range-reset]');
        if (reset) {
            reset.addEventListener('click', function () {
                setState({ lo: FLOOR, hi: CEIL, band: 'all' }, { animate: true });
            });
        }
    }

    function bindPagination() {
        var more = el('loadMore');
        if (more) {
            more.addEventListener('click', function () {
                var total = results().length;
                var next = Math.min(num(S.shown) + PER_PAGE, Math.max(total, PER_PAGE));
                setState({ shown: next }, { animate: false, keepPaging: true });
            });
        }
        var all = el('loadAll');
        if (all) {
            all.addEventListener('click', function () {
                setState({ shown: ALL.length }, { animate: false, keepPaging: true });
            });
        }
    }

    /*
     * Hash handling. Only hashes that look like filter state are parsed —
     * in-page anchors such as "#intel" must not wipe the user's filters.
     */
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

    function bindHash() {
        window.addEventListener('hashchange', function () {
            if (!looksLikeStateHash(window.location.hash)) { return; }
            var before = stateToHash();
            hashToState(window.location.hash);
            if (stateToHash() === before) { return; }
            var si = el('deckSearch');
            if (si) { si.value = S.q || ''; }
            renderAll({ animate: true });
        });
    }
/*  BINDINGS · part 3 — card actions + quick view internals ═ */
    function cardOf(node) { return (node && node.closest) ? node.closest('.pc-card') : null; }

    function bindCards() {
        document.addEventListener('click', function (e) {
            var t = e.target;
            if (!t || !t.closest) { return; }

            /* Quantity stepper on the card (revealed on hover/focus) */
            var step = t.closest('[data-step]');
            if (step) {
                var out = cardOf(step) ? cardOf(step).querySelector('[data-qty]') : null;
                if (out) {
                    var v = Math.max(1, num(out.textContent) + num(step.getAttribute('data-step')));
                    out.textContent = v;
                }
                return;
            }

            var add = t.closest('[data-add]');
            if (add) {
                var card = cardOf(add);
                var qEl = card ? card.querySelector('[data-qty]') : null;
                var qty = qEl ? Math.max(1, num(qEl.textContent)) : 1;
                addToCart(add.getAttribute('data-add'), qty, add);
                return;
            }

            var wish = t.closest('[data-wish]');
            if (wish) { toggleWish(wish.getAttribute('data-wish')); return; }

            var rm = t.closest('[data-cmp-remove]');
            if (rm) {
                removeCompare(rm.getAttribute('data-cmp-remove'));
                renderCompare();
                var cm = el('cmpModal');
                if (cm && !cm.hidden) { renderCompareBoard(); }
                toast('Removed from the comparison');
                return;
            }

            var cmp = t.closest('[data-cmp]');
            if (cmp) {
                toggleCompare(cmp.getAttribute('data-cmp'));
                renderCompare();
                return;
            }

            var quick = t.closest('[data-quick]');
            if (quick) { openQuickView(quick.getAttribute('data-quick'), quick); return; }

            /* Opening a product detail link feeds the recently-viewed rail */
            var detail = t.closest('[data-detail]');
            if (detail) { rememberViewed(detail.getAttribute('data-detail')); return; }

            var zoom = t.closest('[data-zoom]');
            if (zoom) {
                var zc = cardOf(zoom);
                if (zc) {
                    var on = zc.classList.toggle('is-zoomed');
                    zoom.setAttribute('aria-pressed', on ? 'true' : 'false');
                }
            }
        });
    }

    function bindQuickView() {
        var body = el('qvBody');
        if (!body) { return; }
        body.addEventListener('click', function (e) {
            var t = e.target;
            if (!t || !t.closest) { return; }

            var step = t.closest('[data-qv-step]');
            if (step) {
                QV_STATE.qty = Math.max(1, QV_STATE.qty + num(step.getAttribute('data-qv-step')));
                refreshQuickView();
                return;
            }
            var add = t.closest('[data-qv-add]');
            if (add) {
                addToCart(add.getAttribute('data-qv-add'), QV_STATE.qty, null);
                refreshQuickView();
                return;
            }
            if (t.closest('[data-qv-wish]')) {
                toggleWish(QV_STATE.id);
                refreshQuickView();
            }
        });
    }

    /*
     * Touch devices get an explicit macro-view toggle in the card tool stack,
     * because :hover never fires there. Injected as a progressive enhancement
     * (reuses .pc-tool styling, so no extra CSS is needed).
     */
    function enhanceTouchZoom() {
        if (!window.matchMedia || !window.matchMedia('(hover: none)').matches) { return; }
        var cards = document.querySelectorAll('.pc-card');
        for (var i = 0; i < cards.length; i++) {
            var tools = cards[i].querySelector('.pc-tools');
            if (!tools || tools.querySelector('[data-zoom]')) { continue; }
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'pc-tool pc-zoombtn';
            btn.setAttribute('data-zoom', '1');
            btn.setAttribute('aria-pressed', 'false');
            btn.setAttribute('aria-label', 'Toggle the macro detail view');
            btn.setAttribute('title', 'Macro view');
            btn.innerHTML = ICON.qv;
            tools.appendChild(btn);
        }
    }

    /* Cursor-follow spotlight (--mx/--my drive .pc-card::after) */
    function bindTilt() {
        if (!window.matchMedia) { return; }
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { return; }
        if (window.matchMedia('(hover: none)').matches) { return; }

        var raf = null;
        var target = null;
        document.addEventListener('pointermove', function (e) {
            var card = cardOf(e.target);
            if (!card) { target = null; return; }
            target = card;
            var rect = card.getBoundingClientRect();
            if (!rect.width || !rect.height) { return; }
            var mx = ((e.clientX - rect.left) / rect.width) * 100;
            var my = ((e.clientY - rect.top) / rect.height) * 100;
            if (raf) { return; }
            raf = window.requestAnimationFrame(function () {
                raf = null;
                if (target) {
                    target.style.setProperty('--mx', mx.toFixed(1) + '%');
                    target.style.setProperty('--my', my.toFixed(1) + '%');
                }
            });
        }, { passive: true });
    }
/*  BINDINGS · part 4 — modals, keyboard, cart + storage events ═ */
    function openModal(which) {
        var modal = el(which);
        if (!modal) { return; }
        modal.hidden = false;
        modal.classList.add('is-open');
        document.body.style.overflow = 'hidden';
    }

    function bindModals() {
        document.addEventListener('click', function (e) {
            var t = e.target;
            if (!t || !t.closest) { return; }

            var closeBtn = t.closest('[data-close]');
            if (closeBtn) { closeModal(closeBtn.getAttribute('data-close')); return; }

            if (t.closest('[data-cmp-open]')) {
                if (cmpProducts().length < 2) {
                    toast('Add at least two products to compare');
                    return;
                }
                renderCompareBoard();
                openModal('cmpModal');
                return;
            }
            if (t.closest('[data-cmp-full]')) {
                if (cmpProducts().length < 2) { toast('Add at least two products first'); return; }
                window.location.href = 'compare.html';
                return;
            }
            if (t.closest('[data-cmp-clear]')) {
                clearCompare();
                renderCompare();
                var cm = el('cmpModal');
                if (cm && !cm.hidden) { renderCompareBoard(); }
            }
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                var qv = el('quickView');
                var cm = el('cmpModal');
                if (qv && !qv.hidden) { closeModal('quickView'); return; }
                if (cm && !cm.hidden) { closeModal('cmpModal'); return; }
            }
            /* "/" jumps to the catalogue search, like the big storefronts do */
            if (e.key === '/') {
                var tag = document.activeElement ? document.activeElement.tagName : '';
                if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) { return; }
                var si = el('deckSearch');
                if (si) {
                    e.preventDefault();
                    si.focus();
                }
            }
        });
    }

    function bindCartEvents() {
        /* Same-tab cart changes (CartManager dispatches this on every write) */
        window.addEventListener('cartUpdated', function () {
            invalidateCaches();
            renderDock();
            renderPairs();
        });
        /* Other-tab changes, plus wishlist/compare edits from other pages */
        window.addEventListener('storage', function (e) {
            var key = e ? e.key : '';
            if (!key) {
                invalidateCaches();
                renderDock();
                renderPairs();
                renderRecent();
                return;
            }
            if (key === 'trendaryo_cart' || key === 'trendaryo_cart_products') {
                invalidateCaches();
                renderDock();
                renderPairs();
            } else if (key === K_WISH) {
                invalidateCaches();
                syncWishUI();
            } else if (key === K_CMP) {
                invalidateCaches();
                renderCompare();
            } else if (key === K_RECENT) {
                renderRecent();
            }
        });
    }

    /* Second click on the compare tray's background hides it for this visit */
    function bindTrayDismiss() {
        var tray = el('cmpTray');
        if (!tray) { return; }
        tray.addEventListener('dblclick', function (e) {
            if (e.target === tray && e.detail >= 2) { tray.classList.remove('is-on'); }
        });
    }
/* 8 · Quick view modal — decide without leaving the grid ── */
    var QV_STATE = { id: 0, qty: 1, trigger: null };

    function qvHTML(p) {
        var id = idStr(p.id);
        var d = discPct(p);
        var saved = wished(id);
        var total = num(p.price) * QV_STATE.qty;

        var out = '<h2 class="qv-title" id="qvTitleHost"><a href="product.html?id=' + id + '">' +
            esc(p.name) + '</a></h2>';
        out += '<div class="qv-eyebrow"><span>' + esc(catName(catOf(p))) + '</span>' +
            '<span>' + esc(facetName(facetOf(p))) + '</span><span>' + sku(p) + '</span>' +
            '<span>' + num(p.reviews) + ' reviews</span></div>';
        out += '<p class="qv-desc">' + esc(p.description) + '</p>';
        out += '<div class="qv-price"><span class="qv-now">' + money(p.price) + '</span>' +
            (d ? '<span class="qv-old">' + money(p.oldPrice) + '</span>' +
                 '<span class="qv-savepill">−' + d + '% · save ' + money(saveAmt(p)) + '</span>' : '') + '</div>';
        out += '<div class="qv-inst">or 3 parts of ' + money(instalment(p)) +
            ' — illustrative, taxes included</div>';

        out += '<div class="qv-section"><h3>Key specifications</h3>' +
            (typeof UI.specTable === 'function' ? UI.specTable(P.specs(p) || []) : '') + '</div>';

        out += '<div class="qv-section"><h3>Rating breakdown</h3>' +
            (typeof UI.ratingBars === 'function' ? UI.ratingBars(p) : '') + '</div>';

        out += '<div class="qv-section"><h3>Availability and delivery</h3>' +
            '<p class="qv-dispatch">' +
            (isLow(p) ? 'Low stock — only ' + stockQty(p) + ' left at this price. '
                      : 'In stock — ' + stockQty(p) + ' units available. ') +
            'Dispatched within 24 hours; standard delivery ' + dispatchDays(p) + ' working days. Return ' +
            'window is 30 days from delivery.</p>' +
            (typeof UI.stockLine === 'function' ? UI.stockLine(p) : '') +
            (typeof UI.buyTrust === 'function' ? UI.buyTrust() : '') + '</div>';

        out += '<div class="qv-actions">' +
            '<div class="qv-qty" role="group" aria-label="Quantity">' +
                '<button type="button" data-qv-step="-1" aria-label="Decrease quantity">−</button>' +
                '<span data-qv-qty>' + QV_STATE.qty + '</span>' +
                '<button type="button" data-qv-step="1" aria-label="Increase quantity">+</button>' +
            '</div>' +
            '<button type="button" class="qv-add" data-qv-add="' + id + '">Add to cart · ' + money(total) + '</button>' +
            '<button type="button" class="qv-wish" data-qv-wish="' + id + '" aria-pressed="' +
                (saved ? 'true' : 'false') + '">' + (saved ? 'Saved to wishlist' : 'Add to wishlist') + '</button>' +
            '<a class="qv-link" href="product.html?id=' + id + '">Full product page</a>' +
            '</div>';
        return out;
    }

    function openQuickView(id, trigger) {
        var p = P.find(id);
        if (!p) { return; }
        var modal = el('quickView');
        var media = el('qvMedia');
        var body = el('qvBody');
        if (!modal || !media || !body) { return; }

        QV_STATE.id = idStr(id);
        QV_STATE.qty = 1;
        QV_STATE.trigger = trigger || null;
        rememberViewed(id);
        invalidateCaches();

        media.innerHTML = P.media(p) +
            '<div class="qv-flags">' +
            (p.badge ? '<span class="pc-badge ' + esc(p.badge) + '">' + badgeName(p.badge) + '</span>' : '') +
            (discPct(p) ? '<span class="pc-save">−' + discPct(p) + '% · save ' + money(saveAmt(p)) + '</span>' : '') +
            '</div>';
        body.innerHTML = qvHTML(p);

        modal.hidden = false;
        modal.classList.add('is-open');
        document.body.style.overflow = 'hidden';
        var closeBtn = modal.querySelector('.modal-close');
        if (closeBtn && closeBtn.focus) { closeBtn.focus(); }
        renderDock();
    }

    function closeModal(which) {
        var modal = el(which);
        if (!modal || modal.hidden) { return; }
        modal.classList.remove('is-open');
        modal.hidden = true;
        document.body.style.overflow = '';
        if (which === 'quickView' && QV_STATE.trigger &&
            typeof QV_STATE.trigger.focus === 'function' && document.body.contains(QV_STATE.trigger)) {
            QV_STATE.trigger.focus();
        }
        renderDock();
    }

    function refreshQuickView() {
        var body = el('qvBody');
        var p = P.find(QV_STATE.id);
        if (!body || !p) { return; }
        body.innerHTML = qvHTML(p);
        syncWishUI();
    }

/*  BOOT ═ */
    function init() {
        /*
         * State sources, in order of authority:
         *   1. a filter hash (#cat=audio&sort=rating…) — a shared/back-button view
         *   2. the query string (?q=…&cat=…) — links from search & brand pages
         *   3. the defaults
         * A state hash therefore always wins over a query string.
         */
        resetState();
        if (looksLikeStateHash(window.location.hash) && window.location.hash.length > 1) {
            hashToState(window.location.hash);
        } else {
            seedFromQuery();
        }
        clampState();

        renderAll({ animate: false });

        bindSearch();
        bindFilterRail();
        bindChips();
        bindSpotControls();
        bindToolbar();
        bindRange();
        bindPagination();
        bindCards();
        bindQuickView();
        bindModals();
        bindCartEvents();
        bindTrayDismiss();
        bindHash();
        bindTilt();
        initRailNav();
        enhanceTouchZoom();

        var live = el('deckLiveText');
        if (live) {
            live.textContent = 'Live catalogue · ' + ALL.length + ' SKUs · ' +
                SALE_LIST.length + ' on sale · ' + TOTAL_REVIEWS.toLocaleString('en-US') + ' reviews';
        }
    }

    /* Public API — handy for console checks and future page integrations */
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
        openQuick: openQuickView,
        closeQuick: function () { closeModal('quickView'); },
        addToCart: addToCart,
        toggleWish: toggleWish,
        compare: cmpProducts,
        toggleCompare: function (id) {
            var on = toggleCompare(id);
            renderCompare();
            return on;
        },
        catalogues: {
            floor: FLOOR, ceiling: CEIL, median: MEDIAN, average: AVG_PRICE,
            avgRating: AVG_RATING, reviews: TOTAL_REVIEWS, onSale: SALE_LIST.length,
            withPhoto: PHOTO_LIST.length
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
/* ══ ACTIONS — cart, wishlist, announcement, full repaint ══ */
    function announce(msg) {
        var live = el('liveRegion');
        if (live) { live.textContent = msg; }
    }

    function addToCart(id, qty, btn) {
        var p = P.find(id);
        if (!p) { return; }
        qty = Math.max(1, num(qty) || 1);
        if (typeof CartManager === 'undefined') {
            toast('Cart storage is unavailable in this browser');
            return;
        }
        CartManager.addItem(p.id, qty, {
            id: p.id, name: p.name, price: p.price,
            image: p.image || '', emoji: p.emoji || ''
        });
        var label = p.name + (qty > 1 ? ' ×' + qty : '') + ' added to cart';
        toast(label);
        announce(label);
        invalidateCaches();

        var card = (btn && btn.closest) ? btn.closest('.pc-card') : null;
        if (card) {
            var q = cartQty(p.id);
            card.classList.add('is-in-cart');
            var add = card.querySelector('[data-add]');
            if (add) {
                add.classList.add('is-added');
                add.textContent = '✓ In cart · ' + q;
                window.setTimeout(function () {
                    if (add.parentNode) {
                        add.classList.remove('is-added');
                        add.textContent = q ? '✓ In cart · ' + q : 'Add to Cart';
                    }
                }, 1400);
            }
            var step = card.querySelector('[data-qty]');
            if (step) { step.textContent = q || 1; }
        }
        renderDock();
        renderPairs();
    }

    function toggleWish(id) {
        var p = P.find(id);
        if (!p) { return false; }
        var list = readJSON(K_WISH, []);
        if (!list || typeof list.length !== 'number') { list = []; }
        var at = -1;
        for (var i = 0; i < list.length; i++) {
            if (idStr(list[i] && typeof list[i] === 'object' ? list[i].id : list[i]) === idStr(id)) { at = i; }
        }
        var on;
        if (at > -1) {
            list.splice(at, 1);
            on = false;
            toast(p.name + ' removed from wishlist');
        } else {
            list.push({ id: idStr(p.id), name: p.name, price: num(p.price), emoji: p.emoji || '' });
            on = true;
            toast(p.name + ' saved to wishlist');
        }
        writeJSON(K_WISH, list);
        invalidateCaches();
        syncWishUI();
        announce(on ? p.name + ' saved to your wishlist' : p.name + ' removed from your wishlist');
        return on;
    }

    /* Reflect the stored wishlist onto every heart on the page */
    function syncWishUI() {
        var btns = document.querySelectorAll('[data-wish]');
        for (var i = 0; i < btns.length; i++) {
            var id = idStr(btns[i].getAttribute('data-wish'));
            var on = wished(id);
            var p = P.find(id);
            btns[i].classList.toggle('is-on', on);
            btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
            btns[i].innerHTML = on ? ICON.heartFill : ICON.heart;
            btns[i].setAttribute('aria-label',
                (on ? 'Remove from wishlist: ' : 'Save to wishlist: ') + (p ? p.name : ''));
            var card = btns[i].closest ? btns[i].closest('.pc-card') : null;
            if (card) { card.classList.toggle('is-saved', on); }
        }
        var body = el('qvBody');
        if (body) {
            var w = body.querySelector('[data-qv-wish]');
            if (w) {
                var won = wished(w.getAttribute('data-qv-wish'));
                w.setAttribute('aria-pressed', won ? 'true' : 'false');
                w.textContent = won ? 'Saved to wishlist' : 'Add to wishlist';
            }
        }
    }

    /* One call repaints every data-driven section from the current state */
    function renderAll(opts) {
        opts = opts || {};
        invalidateCaches();
        renderDeck();
        renderCategories();
        renderBands();
        renderFilters();
        renderToolbar();
        renderGrid(!!opts.animate);
        renderDrops();
        renderMomentum();
        renderIntel();
        renderGuide();
        renderFaq();
        renderServices();
        renderRewards();
        renderRecent();
        renderPairs();
        renderCompare();
        renderDock();
        syncWishUI();
        injectJsonLd();
    }
/* ═ CLIPBOARD — share the exact view you built ══ */
    function fallbackCopy(text, done) {
        try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            if (done) { done(); }
        } catch (e) { toast('Copy failed — use the address bar instead'); }
    }

    function shareLink(btn) {
        var hash = stateToHash();
        var url = window.location.href.split('#')[0] + (hash ? '#' + hash : '');
        var done = function () {
            var prev = btn.textContent;
            btn.textContent = 'Link copied';
            toast('Filter link copied to the clipboard');
            window.setTimeout(function () { btn.textContent = prev; }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(done, function () { fallbackCopy(url, done); });
        } else {
            fallbackCopy(url, done);
        }
    }

/* ═ BINDINGS · part 1 — search ═ */
    function bindSearch() {
        var deck = el('deckSearch');
        var clear = el('deckSearchClear');
        var form = el('deckSearchForm');
        var header = el('header-search-input');
        var timer = null;

        function apply(value) {
            var v = String(value || '').trim();
            if (clear) { clear.classList.toggle('is-on', !!v); }
            if (timer) { window.clearTimeout(timer); }
            timer = window.setTimeout(function () {
                setState({ q: v }, { animate: false, replace: true });
            }, 140);
        }

        if (deck) {
            deck.value = S.q || '';
            if (clear) { clear.classList.toggle('is-on', !!deck.value); }
            deck.addEventListener('input', function () { apply(this.value); });
            deck.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') { this.value = ''; apply(''); }
            });
        }
        if (clear) {
            clear.addEventListener('click', function () {
                if (deck) { deck.value = ''; deck.focus(); }
                apply('');
            });
        }
        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();                /* filter in place, never reload */
                if (deck) { apply(deck.value); }
                scrollToId('grid');
            });
        }
        /* The shared header search filters this grid live as well */
        if (header) {
            header.value = S.q || '';
            header.addEventListener('input', function () {
                if (deck) { deck.value = this.value; }
                apply(this.value);
            });
        }
    }
/*  BINDINGS · part 1b — jumps, categories, facets, bands, chips, rail ═ */
    function bindSpotControls() {
        document.addEventListener('click', function (e) {
            var t = e.target;
            if (!t || !t.closest) { return; }

            var jump = t.closest('[data-jump]');
            if (jump) { applyPreset(jump.getAttribute('data-jump')); return; }

            var cat = t.closest('[data-cat]');
            if (cat) {
                var cid = cat.getAttribute('data-cat');
                setState({ cat: S.cat === cid ? 'all' : cid }, { animate: true });
                return;
            }

            var facet = t.closest('[data-facet]');
            if (facet) {
                var fid = facet.getAttribute('data-facet');
                setState({ facet: S.facet === fid ? 'all' : fid }, { animate: true });
                return;
            }

            var band = t.closest('[data-band]');
            if (band) {
                var bid = band.getAttribute('data-band');
                if (S.band === bid) {
                    setState({ band: 'all', lo: FLOOR, hi: CEIL }, { animate: true });
                } else {
                    setState({ band: bid }, { animate: true });
                }
                return;
            }

            var scrollBtn = t.closest('[data-scroll]');
            if (scrollBtn) { scrollToId(scrollBtn.getAttribute('data-scroll')); return; }

            /* In-page anchors scroll smoothly instead of writing the state hash */
            var anchor = t.closest('a[href^="#"]');
            if (anchor) {
                var hid = anchor.getAttribute('href').slice(1);
                if (hid && el(hid)) {
                    e.preventDefault();
                    scrollToId(hid);
                }
            }
        });
    }

    function bindChips() {
        var host = el('chipsRoot');
        if (!host) { return; }
        host.addEventListener('click', function (e) {
            var t = e.target;
            if (!t || !t.closest) { return; }
            if (t.closest('[data-reset]')) { resetFilters(); return; }
            var chip = t.closest('[data-chip]');
            if (chip) { resetOne(chip.getAttribute('data-chip')); }
        });
    }

    function bindFilterRail() {
        var host = el('filtersRoot');
        if (!host) { return; }
        host.addEventListener('change', function (e) {
            var t = e.target;
            if (!t) { return; }

            var kind = t.getAttribute('data-fkind');
            if (kind) {
                var patch = {};
                patch[kind] = (kind === 'rating' || kind === 'disc') ? num(t.value) : t.value;
                setState(patch, { animate: true });
                return;
            }
            var toggle = t.getAttribute('data-ftoggle');
            if (toggle) {
                var p = {};
                p[toggle] = t.checked ? 1 : 0;
                setState(p, { animate: true });
            }
        });
        host.addEventListener('click', function (e) {
            var t = e.target;
            if (!t || !t.closest) { return; }
            var btn = t.closest('[data-reset],[data-share]');
            if (!btn) { return; }
            if (btn.hasAttribute('data-share')) { shareLink(btn); }
            else { resetFilters(); }
        });
    }
})();