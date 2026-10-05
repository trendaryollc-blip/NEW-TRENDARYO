/**
 * TRENDARYO — HOME CONTENT ENGINE
 * ---------------------------------------------------------------------------
 * Every number on the home page is COMPUTED from the live catalogue
 * (products-data.js). Nothing is hard-coded: swap the catalogue for real
 * products and every stat, verdict, rank and bar updates itself.
 *
 * Sections fed by this engine:
 *   · #marketWidget   — hero bestseller widget (top product)
 *   · [data-pipe]     — store stat chips
 *   · #vortex grid    — bestseller cards, ranked by reviews × rating
 *   · .cs-count       — category tiles (count · best rating · entry price)
 *   · [data-stat]     — proof strip stats (count-up reads data-count)
 * ---------------------------------------------------------------------------
 */
(function () {
    'use strict';

    var P = window.TrendaryoProducts;
    if (!P) { return; }

    /* ── 1 · Catalogue aggregates (computed, never stored) ──────────────── */
    var ALL = P.all();
    if (!ALL.length) { return; }

    function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function fmt(n) { return Math.round(n).toLocaleString('en-US'); }

    var PRICES = ALL.map(function (p) { return num(p.price); });
    var MEDIAN = PRICES.slice().sort(function (a, b) { return a - b; })[Math.floor(PRICES.length / 2)];
    var TOTAL_REVIEWS = ALL.reduce(function (s, p) { return s + num(p.reviews); }, 0);
    var AVG_RATING = ALL.reduce(function (s, p) { return s + num(p.rating); }, 0) / ALL.length;
    var DROPS = ALL.filter(function (p) { return num(p.oldPrice) > num(p.price); });

    /* Demand = reviews × rating (same formula as shop.js momentum) */
    function momentum(p) { return num(p.reviews) * num(p.rating); }
    function valueScore(p) { return num(p.price) > 0 ? num(p.rating) / (num(p.price) / 100) : 0; }

    var RANKED = ALL.slice().sort(function (a, b) { return momentum(b) - momentum(a); });
    var VALUE_KING = ALL.slice().sort(function (a, b) { return valueScore(b) - valueScore(a); })[0];

    /* ── 2 · Home category model (order matches the six tiles in the DOM) ─ */
    var CATS = [
        { id: 'audio',     label: 'Headphones & Audio',   re: /headphone|earbud|earphone|speaker/ },
        { id: 'wearables', label: 'Watches & Wearables',  re: /watch|fitness band|tracker/ },
        { id: 'computing', label: 'Laptops & Gaming',     re: /laptop|tablet|monitor|keyboard|mouse|hub|charger|led strip/ },
        { id: 'fashion',   label: 'Fashion & Shoes',      re: /backpack|wallet|sunglasses|sneakers|shoes/ },
        { id: 'living',    label: 'Home & Living',        re: /coffee|bottle|yoga/ },
        { id: 'imaging',   label: 'Cameras & Drones',     re: /camera|drone/ }
    ];
    function catOf(p) {
        var hay = (p.name + ' ' + p.description).toLowerCase();
        for (var i = 0; i < CATS.length; i++) { if (CATS[i].re.test(hay)) { return CATS[i]; } }
        return null;
    }
    var BYCAT = {};
    ALL.forEach(function (p) {
        var c = catOf(p);
        if (c) { (BYCAT[c.id] = BYCAT[c.id] || []).push(p); }
    });

    /* A tag that is always a true, computed statement about the product */
    function verdictTag(p, rank) {
        if (rank === 1) { return 'Bestseller'; }
        if (VALUE_KING && p.id === VALUE_KING.id) { return 'Great value'; }
        var c = catOf(p);
        if (c && BYCAT[c.id]) {
            var best = BYCAT[c.id].slice().sort(function (a, b) {
                return num(b.rating) - num(a.rating) || num(b.reviews) - num(a.reviews);
            })[0];
            if (best && best.id === p.id) { return 'Top rated · ' + c.label; }
        }
        return 'Bestseller #' + rank;
    }

    var CART_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1.6"/><circle cx="19" cy="21" r="1.6"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/><path d="M12 5v6m-3-3h6"/></svg>';

    function safe(fn) {
        try { fn(); } catch (err) { /* one renderer failing must not kill the rest */ }
    }

    /* ── 3 · Hero bestseller widget ───────────────────────────────────── */
    function barRow(label, pct, avgPct, big, small) {
        return '<div class="mw-bar-row">' +
            '<span class="mw-lab">' + label + '</span>' +
            '<div class="mw-bar"><i style="width:' + pct.toFixed(1) + '%"></i>' +
            (avgPct != null ? '<u style="left:' + avgPct.toFixed(1) + '%" title="Catalogue average"></u>' : '') +
            '</div>' +
            '<b class="mw-val">' + big + ' <small>' + small + '</small></b>' +
        '</div>';
    }

    function renderMarket() {
        var host = document.getElementById('marketWidget');
        if (!host) { return; }
        var top = RANKED[0];
        host.innerHTML =
            '<span class="mw-kicker">Bestseller right now</span>' +
            '<div class="mw-row">' +
                '<div class="mw-thumb">' + P.media(top) + '</div>' +
                '<div class="mw-main">' +
                    '<b class="mw-name">' + esc(top.name) + '</b>' +
                    '<span class="mw-sub">#1 most loved of ' + ALL.length + ' products — updated every visit</span>' +
                    barRow('Rating', num(top.rating) / 5 * 100, AVG_RATING / 5 * 100, num(top.rating).toFixed(1) + '★', 'avg ' + AVG_RATING.toFixed(1)) +
                    barRow('Demand', 100, null, '#1', 'of ' + ALL.length) +
                '</div>' +
                '<a class="mw-go" href="product.html?id=' + encodeURIComponent(P.idOf(top)) + '">View product</a>' +
            '</div>';
    }

    /* ── 4 · Pipeline stat chips ────────────────────────────────────────── */
    function renderPipeline() {
        var set = function (id, val) {
            var el = document.querySelector('[data-pipe="' + id + '"]');
            if (el) { el.textContent = val; }
        };
        set('reviews', fmt(TOTAL_REVIEWS));
        set('median', P.price(MEDIAN));
        set('shelf', String(ALL.length));
        set('drops', String(DROPS.length));
    }

    /* ── 5 · Bestseller cards (top 6 by demand, replacing the static grid) ── */
    function cardHTML(p, rank) {
        var save = num(p.oldPrice) > num(p.price) ? Math.round(num(p.oldPrice) - num(p.price)) : 0;
        var img = P.media(p).replace('<img ', '<img onload="this.previousElementSibling.classList.add(\'is-done\')" ');
        var url = 'product.html?id=' + encodeURIComponent(P.idOf(p));
        return '<article class="vortex-card vx-card" data-product="' + P.idOf(p) + '">' +
            '<a class="vx-media-link" href="' + url + '" aria-label="View ' + esc(p.name) + '">' +
            '<div class="vx-media">' +
                '<div class="media-skeleton" aria-hidden="true"></div>' +
                img +
                '<span class="vx-badge">Bestseller #' + rank + '</span>' +
            '</div>' +
            '</a>' +
            '<div class="vx-body">' +
                '<div class="vx-rating">' + P.stars(p.rating) + '<span>' + num(p.rating).toFixed(1) + ' · ' + fmt(num(p.reviews)) + ' reviews</span></div>' +
                '<h3 class="vx-name"><a href="' + url + '">' + esc(p.name) + '</a></h3>' +
                '<div class="vx-tags">' +
                    '<span class="vx-tag">' + esc(verdictTag(p, rank)) + '</span>' +
                    (save ? '<span class="vx-tag vx-tag--save">Save ' + P.price(save) + '</span>' : '') +
                '</div>' +
                '<p class="vx-desc">' + esc(p.description) + '</p>' +
                '<div class="vx-price"><span>' + P.price(p.price) + '</span>' +
                    (save ? '<span class="vx-price-old">' + P.price(p.oldPrice) + '</span>' : '') +
                '</div>' +
                '<button class="vx-btn vx-add" data-add="' + P.idOf(p) + '" data-name="' + esc(p.name) + '" data-price="' + num(p.price) + '">' +
                    CART_SVG + ' Add to Cart</button>' +
            '</div>' +
        '</article>';
    }

    function renderVerdicts() {
        var host = document.querySelector('#vortex .vx-grid');
        if (!host) { return; }
        var html = '';
        for (var i = 0; i < Math.min(6, RANKED.length); i++) { html += cardHTML(RANKED[i], i + 1); }
        host.innerHTML = html;
    }

    /* ── 6 · Category tiles — live count · best rating · entry price ───── */
    function renderTiles() {
        var tiles = document.querySelectorAll('#constellations .cs-count');
        for (var i = 0; i < tiles.length && i < CATS.length; i++) {
            var list = BYCAT[CATS[i].id];
            if (!list || !list.length) { continue; } /* keep the static label */
            var best = list.slice().sort(function (a, b) { return num(b.rating) - num(a.rating); })[0];
            var from = list.slice().sort(function (a, b) { return num(a.price) - num(b.price); })[0];
            tiles[i].textContent = list.length + ' products · best ' + num(best.rating).toFixed(1) + '★ · from ' + P.price(from.price);
        }
    }

    /* ── 7 · Proof strip — the count-up reads these via data-count ─────── */
    function renderStats() {
        var vals = {
            shelf: ALL.length,
            reviews: TOTAL_REVIEWS,
            rating: Math.round(AVG_RATING * 10) / 10,
            drops: DROPS.length
        };
        var nodes = document.querySelectorAll('[data-stat]');
        for (var i = 0; i < nodes.length; i++) {
            var el = nodes[i];
            var v = vals[el.getAttribute('data-stat')];
            if (v == null) { continue; }
            el.setAttribute('data-count', v);
            el.setAttribute('data-dec', el.getAttribute('data-stat') === 'rating' ? '1' : '0');
            el.setAttribute('data-suffix', '');
        }
    }

    /* ── Run ────────────────────────────────────────────────────────────── */
    safe(renderMarket);
    safe(renderPipeline);
    safe(renderVerdicts);
    safe(renderTiles);
    safe(renderStats);

    /* Expose for later phases (budget lanes, momentum rail) + debugging */
    window.TrendaryoHome = {
        all: ALL, ranked: RANKED, median: MEDIAN, avgRating: AVG_RATING,
        totalReviews: TOTAL_REVIEWS, drops: DROPS, byCat: BYCAT, cats: CATS,
        momentum: momentum, valueScore: valueScore
    };
})();
