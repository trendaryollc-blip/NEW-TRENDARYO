/**
 * TRENDARYO — PRODUCTCARD v2 (shared builder)
 * ---------------------------------------------------------------------------
 * ONE source of truth for product-card MARKUP, extracted from shop.js so the
 * home page can render cards that are DOM-identical to the shop page.
 *
 * Visual parity: markup here is byte-for-byte the shop card structure, and
 * product-card.css carries the same cascade shop.html ships. Home and shop
 * therefore render the same card.
 *
 * Usage:
 *   TrendaryoProductCard.configure({ all: PRODUCTS });   // once, for the meter
 *   host.innerHTML = TrendaryoProductCard.html(p, { rank: 1 });
 *   TrendaryoProductCard.wire(document);                 // once: qty + add
 *
 * Cart behaviour is delegated (not bound per node), so cards can be injected
 * anywhere at any time and still work — no per-render re-binding.
 */
(function () {
    'use strict';

    var P = window.TrendaryoProducts;

    /* ── Catalogue envelope (for the price-position meter) ── */
    var FLOOR = 0, CEIL = 0, AVG_PRICE = 0;

    /* ── Tiny view helpers (verbatim from shop.js) ── */
    function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
    function idStr(v) { return String(v === null || v === undefined ? '' : v); }
    function idNum(v) { var s = idStr(v), h = 0, i; for (i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; } return h; }
    function hue(id) { return (idNum(id) * 37) % 360; }
    function money(n) { return P ? P.price(n) : ('$' + Number(n).toFixed(2)); }
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
        eye: svg('<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/>')
    };

    /* ── Taxonomy (verbatim from shop.js) ── */
    var CATS = [
        { id: 'electronics', name: 'Electronics' },
        { id: 'fashion', name: 'Fashion & Carry' },
        { id: 'home', name: 'Home & Living' }
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
        { id: 'b1', name: 'Under $50', lo: 0, hi: 49.99 },
        { id: 'b2', name: '$50 – $149', lo: 50, hi: 149 },
        { id: 'b3', name: '$150 – $349', lo: 150, hi: 349 },
        { id: 'b4', name: '$350 – $799', lo: 350, hi: 799 },
        { id: 'b5', name: '$800 +', lo: 800, hi: Infinity }
    ];
    var BADGE_NAME = { hot: 'HOT', trending: 'TRENDING', premium: 'PREMIUM', sale: 'SALE', 'new': 'NEW' };
    var CARRY_RE = /backpack|wallet|sunglasses|sneakers|shoes/;

    /* ── Derived card values ── */
    function discPct(p) {
        var op = num(p.oldPrice);
        return op > num(p.price) ? Math.round((1 - num(p.price) / op) * 100) : 0;
    }
    function saveAmt(p) { return discPct(p) ? Math.round(num(p.oldPrice) - num(p.price)) : 0; }
    function sku(p) {
        var s = String(p.id);
        while (s.length < 4) { s = '0' + s; }
        return 'TRD-' + s;
    }
    function badgeName(b) { return BADGE_NAME[b] || (b ? String(b).toUpperCase() : ''); }
    function facetOf(p) {
        var hay = (p.name + ' ' + p.description).toLowerCase();
        for (var i = 0; i < FACETS.length; i++) { if (FACETS[i].test.test(hay)) { return FACETS[i].id; } }
        return 'other';
    }
    function facetName(id) {
        for (var i = 0; i < FACETS.length; i++) { if (FACETS[i].id === id) { return FACETS[i].name; } }
        return 'Other';
    }
    function catOf(p) {
        var hay = (p.name + ' ' + p.description).toLowerCase();
        if (CARRY_RE.test(hay)) { return 'fashion'; }
        return P ? P.categoryOf(p) : 'electronics';
    }
    function catName(id) {
        for (var i = 0; i < CATS.length; i++) { if (CATS[i].id === id) { return CATS[i].name; } }
        return 'Uncategorised';
    }
    function bandNameOf(p) {
        for (var i = 0; i < BANDS.length; i++) { if (num(p.price) >= BANDS[i].lo && num(p.price) <= BANDS[i].hi) { return BANDS[i].name; } }
        return '—';
    }
    function stockQty(p) { return (idNum(p.id) % 5 === 0) ? 4 : 24; }
    function isLow(p) { return stockQty(p) <= 5; }
    function highlights(p, n) {
        n = n || 3;
        var rows = (P ? P.specs(p) : []) || [];
        var out = [], i;
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
    function pricePosition(p) {
        if (CEIL === FLOOR) { return 50; }
        return Math.round(((num(p.price) - FLOOR) / (CEIL - FLOOR)) * 100);
    }
    function avgPricePosition() {
        if (CEIL === FLOOR) { return 50; }
        return Math.round(((AVG_PRICE - FLOOR) / (CEIL - FLOOR)) * 100);
    }
    function instalment(p) { return (num(p.price) / 3).toFixed(2); }
    function dispatchDays(p) { return num(p.price) >= 400 ? '5–7' : '3–5'; }
    function warrantyOf(p) {
        var rows = (P ? P.specs(p) : []) || [];
        for (var i = 0; i < rows.length; i++) {
            if (/warranty/i.test(String(rows[i][0]))) { return String(rows[i][1]); }
        }
        return '—';
    }
    /* Hover macro frame — synthesised data-URI SVG, never 404s */
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
    function distInline(p) {
        var rows = (P ? P.ratingBreakdown(p) : []) || [];
        var label = 'Rating spread: ';
        var bars = '';
        for (var i = 0; i < rows.length; i++) {
            label += rows[i].stars + '★ ' + rows[i].pct + '%' + (i < rows.length - 1 ? ', ' : '');
            bars += '<i style="height:' + Math.max(8, rows[i].pct) + '%"></i>';
        }
        return '<div class="pc-dist" role="img" aria-label="' + esc(label) + '" title="' + esc(label) + '">' + bars + '</div>';
    }
    function fact(label, value) {
        return '<div class="pc-fact"><b>' + esc(label) + '</b>' + esc(value) + '</div>';
    }

    /* ── Wishlist / compare lookups (localStorage, shared site keys) ── */
    var K_WISH = 'wishlist', K_CMP = 'compare_list';
    function readJSON(key, fallback) {
        try { var raw = JSON.parse(localStorage.getItem(key) || 'null'); return raw == null ? fallback : raw; }
        catch (e) { return fallback; }
    }
    function idList(key) {
        var list = readJSON(key, []);
        if (!list || typeof list.length !== 'number') { return []; }
        var out = [];
        for (var i = 0; i < list.length; i++) {
            var s = idStr(list[i] && typeof list[i] === 'object' ? list[i].id : list[i]);
            if (s !== '') { out.push(s); }
        }
        return out;
    }
    function toMap(ids) { var m = {}; for (var i = 0; i < ids.length; i++) { m[ids[i]] = true; } return m; }
    var WISH_MAP = null, CMP_MAP = null;
    function wished(id) { if (!WISH_MAP) { WISH_MAP = toMap(idList(K_WISH)); } return !!WISH_MAP[idStr(id)]; }
    function compared(id) { if (!CMP_MAP) { CMP_MAP = toMap(idList(K_CMP)); } return !!CMP_MAP[idStr(id)]; }

    /* ── Card markup — lean DTC card: large image + name + price + ATC/View ── */
    function cardMedia(p, opts) {
        var id = idStr(p.id);
        var d = discPct(p);
        var out = '<div class="pc-media">';

        out += '<a class="pc-stage" href="product.html?id=' + id + '" data-detail="' + id +
            '" aria-label="' + esc(p.name) + ' — full details and specifications">';
        out += P.media(p, 'pc-img');
        out += '</a>';

        out += '<div class="pc-flags">';
        if (opts.rank) { out += '<span class="pc-rank">#' + opts.rank + '</span>'; }
        if (d) { out += '<span class="pc-save">−' + d + '%</span>'; }
        out += '</div>';

        out += '</div>'; /* /pc-media */
        return out;
    }

    function cardBody(p) {
        var id = idStr(p.id);
        var d = discPct(p);

        var out = '<div class="pc-body">';

        out += '<h3 class="pc-name"><a href="product.html?id=' + id + '">' + esc(p.name) + '</a></h3>';

        out += '<div class="pc-rating"><span class="pc-stars">' + P.stars(p.rating) + '</span>' +
            '<b>' + num(p.rating).toFixed(1) + '</b><span>(' + num(p.reviews) + ')</span></div>';

        out += '<div class="pc-price"><span class="pc-now">' + money(p.price) + '</span>' +
            (d ? '<span class="pc-old">' + money(p.oldPrice) + '</span>' : '') + '</div>';

        out += '<div class="pc-actions">' +
            '<button type="button" class="pc-add" data-add="' + id + '">Add to Cart</button>' +
            '<a class="pc-more" href="product.html?id=' + id + '">View</a>' +
            '</div>';

        out += '</div>'; /* /pc-body */
        return out;
    }

    function cartQty(id) {
        var list = readJSON('trendaryo_cart', []);
        for (var i = 0; i < list.length; i++) {
            if (idStr(list[i] && list[i].id) === idStr(id)) { return num(list[i].quantity) || 1; }
        }
        return 0;
    }

    function html(p, opts) {
        opts = opts || {};
        var id = idStr(p.id);
        var cls = 'pc-card' + (opts.mode === 'rail' ? ' pc-card--rail' : '') +
            (wished(id) ? ' is-saved' : '') + (cartQty(id) ? ' is-in-cart' : '');
        return '<article class="' + cls + '" data-id="' + id + '" data-product="' + id + '">' +
            cardMedia(p, opts) + cardBody(p) + '</article>';
    }

    /* ── Delegated interactions (one listener per event, bound once) ── */
    function toast(msg) {
        if (typeof window.trendaryoToast === 'function') { window.trendaryoToast(msg); }
    }
    function announce(msg) {
        var live = document.getElementById('a11y-live');
        if (!live) {
            live = document.createElement('div');
            live.id = 'a11y-live';
            live.setAttribute('aria-live', 'polite');
            live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);';
            document.body.appendChild(live);
        }
        live.textContent = msg;
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
        if (typeof Analytics !== 'undefined' && Analytics.trackAddToCart) {
            Analytics.trackAddToCart(p.id, qty, num(p.price));
        }
        WISH_MAP = null; CMP_MAP = null;

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
    }

    function toggleWish(id, btn) {
        var p = P.find(id);
        if (!p) { return; }
        var list = readJSON(K_WISH, []);
        if (!list || typeof list.length !== 'number') { list = []; }
        var at = -1, i;
        for (i = 0; i < list.length; i++) {
            if (idStr(list[i] && typeof list[i] === 'object' ? list[i].id : list[i]) === idStr(id)) { at = i; }
        }
        var on;
        if (at > -1) { list.splice(at, 1); on = false; toast(p.name + ' removed from wishlist'); }
        else { list.push({ id: idStr(p.id), name: p.name, price: num(p.price), emoji: p.emoji || '' }); on = true; toast(p.name + ' saved to wishlist'); }
        try { localStorage.setItem(K_WISH, JSON.stringify(list)); } catch (e) { /* storage unavailable */ }
        WISH_MAP = null;
        var card = btn && btn.closest ? btn.closest('.pc-card') : null;
        if (card) { card.classList.toggle('is-saved', on); }
        if (btn) {
            btn.classList.toggle('is-on', on);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
            btn.innerHTML = on ? ICON.heartFill : ICON.heart;
        }
    }

    function toggleCmp(id, btn) {
        var p = P.find(id);
        if (!p) { return; }
        var list = readJSON(K_CMP, []);
        if (!list || typeof list.length !== 'number') { list = []; }
        var at = -1, i;
        for (i = 0; i < list.length; i++) {
            if (idStr(list[i] && typeof list[i] === 'object' ? list[i].id : list[i]) === idStr(id)) { at = i; }
        }
        var on;
        if (at > -1) { list.splice(at, 1); on = false; toast(p.name + ' removed from compare'); }
        else {
            if (list.length >= 3) { toast('Compare holds up to 3 products'); return; }
            list.push({ id: idStr(p.id), name: p.name, price: num(p.price), emoji: p.emoji || '' });
            on = true; toast(p.name + ' added to compare');
        }
        try { localStorage.setItem(K_CMP, JSON.stringify(list)); } catch (e) { /* storage unavailable */ }
        CMP_MAP = null;
        if (btn) {
            btn.classList.toggle('is-on', on);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
    }

    var WIRED = false;
    function wire() {
        if (WIRED) { return; }
        WIRED = true;

        /* Quantity stepper + Add to Cart + wishlist + compare — all delegated,
           so freshly rendered cards (trending rotation, etc.) work instantly. */
        document.addEventListener('click', function (e) {
            var t = e.target;
            if (!t || !t.closest) { return; }

            var step = t.closest('[data-step]');
            if (step) {
                var qtyEl = step.parentNode.querySelector('[data-qty]');
                if (qtyEl) {
                    var v = num(qtyEl.textContent) || 1;
                    v += num(step.getAttribute('data-step'));
                    if (v < 1) { v = 1; }
                    if (v > 9) { v = 9; }
                    qtyEl.textContent = v;
                }
                return;
            }

            var add = t.closest('[data-add]');
            if (add) {
                var card = add.closest('.pc-card');
                var q = card ? num(card.querySelector('[data-qty]') && card.querySelector('[data-qty]').textContent) || 1 : 1;
                addToCart(add.getAttribute('data-add'), q, add);
                return;
            }

            var wish = t.closest('[data-wish]');
            if (wish) { toggleWish(wish.getAttribute('data-wish'), wish); return; }

            var cmp = t.closest('[data-cmp]');
            if (cmp) { toggleCmp(cmp.getAttribute('data-cmp'), cmp); return; }

            var quick = t.closest('[data-quick]');
            if (quick) {
                var qid = quick.getAttribute('data-quick');
                window.location.href = 'product.html?id=' + encodeURIComponent(qid);
                return;
            }
        });

        /* Cursor-follow spotlight — drives .pc-card::after (--mx/--my) */
        document.addEventListener('mousemove', function (e) {
            var card = e.target && e.target.closest ? e.target.closest('.pc-card') : null;
            if (!card) { return; }
            var r = card.getBoundingClientRect();
            card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
            card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
        });
    }

    function configure(opts) {
        opts = opts || {};
        var all = opts.all || (P ? P.all() : []);
        if (!all.length) { return; }
        var prices = all.map(function (p) { return num(p.price); });
        FLOOR = Math.min.apply(null, prices);
        CEIL = Math.max.apply(null, prices);
        AVG_PRICE = Math.round(prices.reduce(function (s, n) { return s + n; }, 0) / prices.length);
    }

    window.TrendaryoProductCard = {
        configure: configure,
        html: html,
        wire: wire
    };
})();
