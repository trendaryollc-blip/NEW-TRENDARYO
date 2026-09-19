/**
 * TRENDARYO — Shared Page Helpers
 * OrdersStore (offline order data), mini product cards, empty states,
 * breadcrumbs. Load AFTER products-data.js on any page that needs them.
 */
(function () {
    'use strict';

    var ORDERS_KEY = 'trendaryo_orders';

    function readAll() {
        try {
            var raw = JSON.parse(localStorage.getItem(ORDERS_KEY) || '[]');
            return Array.isArray(raw) ? raw : [];
        } catch (e) { return []; }
    }

    function writeAll(list) {
        try { localStorage.setItem(ORDERS_KEY, JSON.stringify(list)); } catch (e) { /* storage full/blocked */ }
    }

    function makeId() {
        var d = new Date();
        var stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        var rand = Math.floor(1000 + Math.random() * 9000);
        return 'TRD-' + stamp + '-' + rand;
    }

    /**
     * OrdersStore — create / list / find / status.
     * If no orders exist yet, seeds 2 realistic sample orders so that
     * pages never look broken to a first-time visitor.
     */
    var OrdersStore = {
        KEY: ORDERS_KEY,

        seedIfEmpty: function () {
            if (readAll().length > 0) return;
            var now = Date.now();
            var day = 86400000;
            writeAll([
                {
                    id: 'TRD-DEMO-4821',
                    date: new Date(now - 3 * day).toISOString(),
                    status: 'shipped',
                    items: [
                        { id: 1, name: 'Wireless Headphones', price: 149, qty: 1 },
                        { id: 22, name: 'Wireless Charger Pad', price: 35, qty: 1 }
                    ],
                    total: 184,
                    shipping: { name: 'Demo Customer', address: 'Demo address — replace with your saved address', city: 'Muscat', country: 'Oman' },
                    eta: new Date(now + 2 * day).toISOString()
                },
                {
                    id: 'TRD-DEMO-1044',
                    date: new Date(now - 12 * day).toISOString(),
                    status: 'delivered',
                    items: [{ id: 24, name: 'Stainless Steel Bottle', price: 39, qty: 2 }],
                    total: 78,
                    shipping: { name: 'Demo Customer', address: 'Demo address — replace with your saved address', city: 'Muscat', country: 'Oman' },
                    eta: new Date(now - 8 * day).toISOString()
                }
            ]);
        },

        list: function () {
            this.seedIfEmpty();
            return readAll().sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
        },

        find: function (id) {
            var q = String(id || '').toUpperCase().trim();
            var list = this.list();
            for (var i = 0; i < list.length; i++) {
                if (list[i].id.toUpperCase() === q) return list[i];
            }
            return null;
        },

        create: function (items, total, shipping) {
            var order = {
                id: makeId(),
                date: new Date().toISOString(),
                status: 'processing',
                items: items || [],
                total: total || 0,
                shipping: shipping || {},
                eta: new Date(Date.now() + 5 * 86400000).toISOString()
            };
            var list = readAll();
            list.push(order);
            writeAll(list);
            return order;
        },

        updateStatus: function (id, status) {
            var list = readAll();
            for (var i = 0; i < list.length; i++) {
                if (list[i].id === id) { list[i].status = status; break; }
            }
            writeAll(list);
        }
    };

/* ── UI helpers appended to the TrendaryoHelpers namespace ── */
    var UI = window.TrendaryoUI = {};
    window.TrendaryoOrders = OrdersStore;

    /* Mini product card — powers cross-sell, related, blog CTAs, brand pages */
    UI.productMini = function (p) {
        if (!p) return '';
        var P = window.TrendaryoProducts;
        var img = P.media(p, 'pm-img');
        var badge = p.badge ? '<span class="pm-badge pm-badge--' + p.badge + '">' + p.badge.toUpperCase() + '</span>' : '';
        var old = p.oldPrice ? '<span class="pm-old">' + P.price(p.oldPrice) + '</span>' : '';
        return '' +
        '<a class="pm-card" href="product.html?id=' + p.id + '" aria-label="' + p.name + '">' +
            '<div class="pm-media">' + img + badge + '</div>' +
            '<div class="pm-body">' +
                '<div class="pm-rating">' + P.stars(p.rating) + '<span>' + p.rating + '</span></div>' +
                '<div class="pm-name">' + p.name + '</div>' +
                '<div class="pm-price"><span>' + P.price(p.price) + '</span>' + old + '</div>' +
                '<button class="pm-add" type="button" data-pm-add="' + p.id + '">Add to Cart</button>' +
            '</div>' +
        '</a>';
    };

    /* Bind add-to-cart for every mini card on the page (call once after render) */
    UI.bindMiniCards = function (root) {
        var scope = root || document;
        var btns = scope.querySelectorAll('[data-pm-add]');
        for (var i = 0; i < btns.length; i++) {
            btns[i].addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var id = this.getAttribute('data-pm-add');
                var p = window.TrendaryoProducts.find(id);
                if (!p) return;
                try {
                    if (typeof CartManager !== 'undefined') {
                        CartManager.addItem(p.id, 1, { id: p.id, name: p.name, price: p.price, image: p.image || '', emoji: p.emoji || '' });
                    }
                    if (typeof window.trendaryoToast === 'function') window.trendaryoToast(p.name + ' added to cart');
                } catch (err) { /* storage unavailable */ }
                var self = this;
                var prev = this.textContent;
                this.textContent = '✓ Added';
                setTimeout(function () { self.textContent = prev; }, 1600);
            });
        }
    };

    /* Consistent empty state */
    UI.emptyState = function (opts) {
        opts = opts || {};
        return '' +
        '<div class="t-empty">' +
            '<div class="t-empty-icon">' + (opts.icon || '🛒') + '</div>' +
            '<h3>' + (opts.title || 'Nothing here yet') + '</h3>' +
            '<p>' + (opts.text || '') + '</p>' +
            (opts.ctaHref ? '<a class="t-empty-cta" href="' + opts.ctaHref + '">' + (opts.ctaText || 'Continue Shopping') + '</a>' : '') +
        '</div>';
    };

    /* Breadcrumbs */
    UI.breadcrumbs = function (items) {
        var out = '<nav class="t-crumbs" aria-label="Breadcrumb">';
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (i < items.length - 1 && it.href) {
                out += '<a href="' + it.href + '">' + it.label + '</a><span class="t-crumbs-sep">/</span>';
            } else {
                out += '<span class="t-crumbs-here" aria-current="page">' + it.label + '</span>';
            }
        }
        return out + '</nav>';
    };

    /* Trust strip — the 4 pillars, reused on shop / product / cart / checkout */
    UI.trustStrip = function () {
        function ic(d) { return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; }
        var truck = ic('<path d="M14 18V6a1 1 0 0 0-1-1H2v12h12Z"/><path d="M14 9h4l4 4v5h-8"/><circle cx="6.5" cy="18.5" r="1.6"/><circle cx="17.5" cy="18.5" r="1.6"/>');
        var rotate = ic('<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>');
        var lock = ic('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>');
        var shield = ic('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>');
        return '<div class="trust-strip">' +
            '<div class="trust-item">' + truck + '<div><b>Free Shipping</b><span>On all orders over $50</span></div></div>' +
            '<div class="trust-item">' + rotate + '<div><b>30-Day Returns</b><span>Changed your mind? No problem</span></div></div>' +
            '<div class="trust-item">' + lock + '<div><b>Secure Checkout</b><span>256-bit SSL encryption</span></div></div>' +
            '<div class="trust-item">' + shield + '<div><b>Quality Guarantee</b><span>Authentic products, full warranty</span></div></div>' +
        '</div>';
    };

    /* FAQ accordion from a data array: [{q, a}] */
    UI.faq = function (items, openFirst) {
        var out = '<div class="acc-group">';
        for (var i = 0; i < items.length; i++) {
            var open = (openFirst && i === 0) ? ' open' : '';
            out += '<details class="acc"' + open + '>' +
                '<summary class="acc-q">' + items[i].q + '</summary>' +
                '<div class="acc-a">' + items[i].a + '</div>' +
            '</details>';
        }
        return out + '</div>';
    };

    /* Rating breakdown bars for a product */
    UI.ratingBars = function (p) {
        var P = window.TrendaryoProducts;
        var rows = P.ratingBreakdown(p);
        var out = '<div class="rate-summary"><div class="rate-score"><b>' + p.rating.toFixed(1) + '</b>' +
            '<div class="pd-stars">' + P.stars(p.rating) + '</div>' +
            '<span>' + (p.reviews || 0) + ' reviews</span></div><div class="rate-bars">';
        for (var i = 0; i < rows.length; i++) {
            out += '<div class="rate-bar"><span>' + rows[i].stars + ' star</span><i><b style="width:' + rows[i].pct + '%"></b></i><span>' + rows[i].pct + '%</span></div>';
        }
        return out + '</div></div>';
    };

    /* Buy-trust row under Add to Cart */
    UI.buyTrust = function () {
        function ic(d) { return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; }
        return '<div class="buy-trust">' +
            '<span>' + ic('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>') + 'Secure checkout</span>' +
            '<span>' + ic('<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>') + '30-day returns</span>' +
            '<span>' + ic('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>') + 'Warranty included</span>' +
        '</div>';
    };

    /* Stock / urgency pill */
    UI.stockLine = function (p) {
        var sid = String(p && p.id !== null && p.id !== undefined ? p.id : ''), h = 0, i;
        for (i = 0; i < sid.length; i++) { h = (h * 31 + sid.charCodeAt(i)) >>> 0; }
        var low = h % 5 === 0;
        return low
            ? '<span class="stock-line low">Low stock — only a few left</span>'
            : '<span class="stock-line in">In stock — ships within 24 hours</span>';
    };

    /* CTA band for the bottom of content pages */
    UI.ctaBand = function (opts) {
        opts = opts || {};
        return '<div class="cta-band">' +
            '<h2>' + (opts.title || 'Ready to explore?') + '</h2>' +
            '<p>' + (opts.text || 'Browse the collection and find something worth keeping.') + '</p>' +
            '<a class="btn-band" href="' + (opts.href || 'shop.html') + '">' + (opts.cta || 'Shop the Collection') + '</a>' +
        '</div>';
    };

    /* How-it-works steps: [{title, text}] */
    UI.steps = function (items) {
        var out = '<div class="steps-grid">';
        for (var i = 0; i < items.length; i++) {
            out += '<div class="step-card"><div class="step-num">' + (i + 1) + '</div>' +
                '<h3>' + items[i].title + '</h3><p>' + items[i].text + '</p></div>';
        }
        return out + '</div>';
    };

    /* Order progress timeline — used by track-order / order-success / order-details.
       steps: [{title, sub, icon}]  state: 'done' | 'current' | 'todo' */
    UI.orderTimeline = function (steps, currentIndex) {
        var out = '<div class="ord-timeline">';
        for (var i = 0; i < steps.length; i++) {
            var cls = i < currentIndex ? 'is-done' : (i === currentIndex ? 'is-current' : '');
            out += '<div class="ord-step ' + cls + '">' +
                '<div class="ord-step-dot">' + (steps[i].icon || (i + 1)) + '</div>' +
                '<div class="ord-step-title">' + steps[i].title + '</div>' +
                '<div class="ord-step-sub">' + (steps[i].sub || '') + '</div>' +
            '</div>';
        }
        return out + '</div>';
    };

    /* Status -> timeline index map, shared by order pages */
    UI.statusIndex = function (status) {
        var map = { processing: 0, confirmed: 0, packed: 1, shipped: 2, 'out-for-delivery': 2, delivered: 3, cancelled: 0 };
        return map[String(status || 'processing').toLowerCase()] || 0;
    };

    /* Tier table (rewards / loyalty): [{name, mult, perks:[], featured:bool}] */
    UI.tiers = function (items) {
        var out = '<div class="tier-grid">';
        for (var i = 0; i < items.length; i++) {
            var t = items[i];
            var perks = '';
            for (var j = 0; j < (t.perks || []).length; j++) perks += '<li>' + t.perks[j] + '</li>';
            out += '<div class="tier-card' + (t.featured ? ' is-featured' : '') + '">' +
                '<div class="tier-name">' + t.name + '</div>' +
                '<div class="tier-mult">' + t.mult + '</div>' +
                '<ul>' + perks + '</ul>' +
            '</div>';
        }
        return out + '</div>';
    };

    /* Spec table rows for a product: [[label, value], ...] */
    UI.specTable = function (rows) {
        if (!rows || !rows.length) return '';
        var out = '<table class="spec-table">';
        for (var i = 0; i < rows.length; i++) {
            out += '<tr><th>' + rows[i][0] + '</th><td>' + rows[i][1] + '</td></tr>';
        }
        return out + '</table>';
    };

    /* Blog card: {id, title, excerpt, tag, image, date, read, author} */
    UI.blogCard = function (post) {
        var meta = [];
        if (post.date) meta.push(post.date);
        if (post.read) meta.push(post.read);
        if (post.author) meta.push(post.author);
        return '' +
        '<a class="blog-card" href="blog-post.html?id=' + (post.id || '') + '">' +
            '<div class="blog-media"><img src="' + (post.image || '') + '" alt="" loading="lazy"></div>' +
            '<div class="blog-body">' +
                (post.tag ? '<span class="blog-tag">' + post.tag + '</span>' : '') +
                '<h3>' + post.title + '</h3>' +
                '<p class="blog-excerpt">' + post.excerpt + '</p>' +
                '<div class="blog-meta">' + meta.map(function (m) { return '<span>' + m + '</span>'; }).join('<span>•</span>') + '</div>' +
            '</div>' +
        '</a>';
    };
})();

