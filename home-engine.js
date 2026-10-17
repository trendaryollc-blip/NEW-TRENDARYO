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
 *   · #trendingGrid   — trending now rail (daily-rotating window by demand)
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

    /* ProductCard v2 (shared with shop) — configure the price meter envelope
       once, so every card shows the same floor/ceiling/average as the shop. */
    var CARD = window.TrendaryoProductCard;
    if (CARD) { CARD.configure({ all: ALL }); }

    function safe(fn) {
        try { fn(); } catch (err) { /* one renderer failing must not kill the rest */ }
    }

    /* ── 3 · WINNING PRODUCT OF THE DAY (commerce hero) ─────────────────
       The winner auto-rotates once per calendar day through the top
       products by demand (reviews × rating), so the hero always shows a
       true bestseller. Rank tabs flip between #1..#5 in the hero. */
    function daySeed() {
        var d = new Date();
        var s = new Date(d.getFullYear(), 0, 0);
        return d.getFullYear() * 1000 + Math.floor((d - s) / 864e5);
    }
    function msToMidnight() {
        var n = new Date();
        var m = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 0);
        return m - n;
    }
    function fmtCountdown(ms) {
        var s = Math.max(0, Math.floor(ms / 1000));
        var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
        return 'New winner in ' + h + 'h ' + (m < 10 ? '0' + m : m) + 'm';
    }

    var HERO_POOL = RANKED.slice(0, Math.min(5, RANKED.length));

    function renderWinner() {
        var host = document.getElementById('heroWinner');
        if (!host || !HERO_POOL.length) { return; }
        var $ = function (id) { return document.getElementById(id); };
        var img = $('hwImg'), media = $('hwMedia'), rank = $('hwRank'),
            save = $('hwSave'), rating = $('hwRating'), link = $('hwLink'),
            desc = $('hwDesc'), price = $('hwPrice'), old = $('hwOld'),
            timerEl = $('hwTimer'), add = $('hwAdd'), view = $('hwView'),
            tabs = $('hwTabs');
        if (!img || !link) { return; }
        var heroReviews = document.querySelector('[data-hero-reviews]');
        if (heroReviews) { heroReviews.textContent = fmt(TOTAL_REVIEWS) + '+ verified reviews'; }
        var start = daySeed() % HERO_POOL.length;
        if (tabs && !tabs.children.length) {
            var th = '';
            for (var t = 0; t < HERO_POOL.length; t++) {
                var tp = HERO_POOL[t];
                th += '<button class="hw-tab' + (t === start ? ' is-on' : '') + '" type="button" role="tab" ' +
                    'aria-selected="' + (t === start ? 'true' : 'false') + '" data-hw="' + t + '">' +
                    '<img src="' + (tp.image || '') + '" alt="" loading="lazy" decoding="async">' +
                    '<span>#' + (RANKED.indexOf(tp) + 1) + ' ' + esc(tp.name) + '</span></button>';
            }
            tabs.innerHTML = th;
            tabs.addEventListener('click', function (e) {
                var b = e.target && e.target.closest ? e.target.closest('[data-hw]') : null;
                if (!b) { return; }
                paint(parseInt(b.getAttribute('data-hw'), 10) || 0);
            });
        }
        paint(start);
        if (add && !add.getAttribute('data-hw-bound')) {
            add.setAttribute('data-hw-bound', '1');
            add.addEventListener('click', function () {
                var p = P.find(add.getAttribute('data-id')) || HERO_POOL[start];
                if (!p) { return; }
                try {
                    if (typeof CartManager !== 'undefined') {
                        CartManager.addItem(P.idOf(p), 1, { id: P.idOf(p), name: p.name, price: p.price, image: p.image || '', emoji: p.emoji || '' });
                    }
                    if (typeof window.trendaryoToast === 'function') { window.trendaryoToast(p.name + ' added to cart'); }
                } catch (err) { /* storage unavailable */ }
                add.classList.add('added');
                add.textContent = 'Added ✓';
                setTimeout(function () { add.classList.remove('added'); add.textContent = 'Add to Cart'; }, 1600);
            });
        }
        if (timerEl) {
            timerEl.textContent = fmtCountdown(msToMidnight());
            setInterval(function () { timerEl.textContent = fmtCountdown(msToMidnight()); }, 30000);
        }

        function paint(idx) {
            var p = HERO_POOL[idx];
            if (!p) { return; }
            var url = 'product.html?id=' + encodeURIComponent(P.idOf(p));
            var saveAmt = num(p.oldPrice) > num(p.price) ? Math.round(num(p.oldPrice) - num(p.price)) : 0;
            var tile = (P.tile) ? P.tile(p) : '';
            img.onerror = function () { img.onerror = null; if (tile) { img.src = tile; } };
            img.src = p.image || tile;
            img.alt = p.name || 'Winning product';
            media.href = url;
            rank.textContent = idx === start ? 'Winner of the day' : 'Bestseller #' + (RANKED.indexOf(p) + 1);
            if (saveAmt) { save.textContent = 'Save ' + P.price(saveAmt); save.hidden = false; }
            else { save.hidden = true; }
            rating.innerHTML = P.stars(p.rating) + '<span>' + num(p.rating).toFixed(1) + ' &middot; ' + fmt(num(p.reviews)) + ' reviews</span>';
            link.textContent = p.name;
            link.href = url;
            desc.textContent = p.description || '';
            price.textContent = P.price(p.price);
            if (saveAmt) { old.textContent = P.price(p.oldPrice); old.hidden = false; }
            else { old.hidden = true; }
            view.href = url;
            add.setAttribute('data-id', P.idOf(p));
            add.classList.remove('added');
            add.textContent = 'Add to Cart';
            var cells = tabs ? tabs.children : [];
            for (var i = 0; i < cells.length; i++) {
                if (cells[i].classList) { cells[i].classList.toggle('is-on', i === idx); }
                cells[i].setAttribute('aria-selected', i === idx ? 'true' : 'false');
            }
        }
    }
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

    /* ── 5 · Product cards — ProductCard v2 (shared with shop) ─────────────
       Same markup, same styles (product-card.css) as shop.html, so the home
       grids look identical to the shop grid. Rank is passed so bestseller /
       trending cards keep their #N flag. */
    function cardHTML(p, rank) {
        if (CARD) { return CARD.html(p, { rank: rank }); }
        return ''; /* shared builder missing — grid stays empty rather than diverging */
    }

    function renderVerdicts() {
        var host = document.querySelector('#vortex .vx-grid');
        if (!host) { return; }
        var html = '';
        for (var i = 0; i < Math.min(6, RANKED.length); i++) { html += cardHTML(RANKED[i], i + 1); }
        host.innerHTML = html;
    }

    /* ── 5b · Trending now — a daily-rotating window over the demand ranking ── */
    function renderTrending() {
        var host = document.getElementById('trendingGrid');
        if (!host) { return; }
        var span = Math.min(8, RANKED.length);
        if (!span) { host.innerHTML = ''; return; }
        var start = RANKED.length > span ? daySeed() % (RANKED.length - span + 1) : 0;
        var html = '';
        for (var i = start; i < start + span; i++) { html += cardHTML(RANKED[i], i + 1, true); }
        host.innerHTML = html;
    }

    /* ── 6 · Category tiles — IMAGE ONLY (no emoji / no SVG icon) ───── */
    function renderTiles() {
        var grid = document.querySelector('#constellations .cs-grid');
        if (!grid) { return; }
        var html = '';
        for (var i = 0; i < CATS.length; i++) {
            var list = BYCAT[CATS[i].id];
            if (!list || !list.length) { continue; } /* skip empty categories */
            var best = list.slice().sort(function (a, b) { return num(b.rating) - num(a.rating); })[0];
            var from = list.slice().sort(function (a, b) { return num(a.price) - num(b.price); })[0];
            var img = best.image || (P.tile ? P.tile(best) : '');

            html += '<a class="constellation" href="shop.html?facet=' + encodeURIComponent(CATS[i].id) + '" aria-label="' + esc(CATS[i].label) + '">'
                + '<span class="cs-orb"><img src="' + esc(img) + '" alt="' + esc(CATS[i].label) + ' photo" loading="lazy" decoding="async"></span>'
                + '<span class="cs-name">' + esc(CATS[i].label) + '</span>'
                + '<span class="cs-count">' + list.length + ' products · best ' + num(best.rating).toFixed(1) + '★ · from ' + P.price(from.price) + '</span>'
                + '</a>';
        }
        if (html) { grid.innerHTML = html; }
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
    safe(renderWinner);
    safe(renderMarket);
    safe(renderPipeline);
    safe(renderVerdicts);
    safe(renderTrending);
    safe(renderTiles);
    safe(renderStats);
    if (CARD) { safe(CARD.wire); } /* delegated qty / add-to-cart / wish / compare */

    /* Expose for later phases (budget lanes, momentum rail) + debugging */
    window.TrendaryoHome = {
        all: ALL, ranked: RANKED, median: MEDIAN, avgRating: AVG_RATING,
        totalReviews: TOTAL_REVIEWS, drops: DROPS, byCat: BYCAT, cats: CATS,
        heroPool: HERO_POOL, momentum: momentum, valueScore: valueScore
    };
})();
