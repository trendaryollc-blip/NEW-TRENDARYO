/**
 * TRENDARYO — Shared Product Catalog (static, offline-first)
 * Every page that shows products loads this instead of a backend API.
 * If you later add a backend, swap the data but keep the helper names.
 */
(function () {
    'use strict';

    var RAW1 = [
        { id:1,  name:'Wireless Headphones',    description:'Premium ANC headphones with 30-hour battery and Hi-Res audio.',          price:149,  oldPrice:199, emoji:'🎧', badge:'hot',      rating:4.8, reviews:234, image:'https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=max&w=800' },
        { id:2,  name:'Smart Fitness Band',     description:'Track steps, heart rate, sleep and GPS with 7-day battery life.',        price:79,   oldPrice:129, emoji:'⌚', badge:'trending', rating:4.5, reviews:156, image:'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?auto=format&fit=max&w=800' },
        { id:3,  name:'Designer Backpack',      description:'Water-resistant 30L backpack with USB charging port and laptop sleeve.',  price:199,  oldPrice:299, emoji:'🎒', badge:'premium',  rating:4.7, reviews:189, image:'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=max&w=800' },
        { id:4,  name:'Gaming Laptop',          description:'RTX 4060, 16GB RAM, 1TB SSD — built for high-performance gaming.',       price:1299, oldPrice:1599, emoji:'💻', badge:'premium',  rating:4.9, reviews:312, image:'https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?auto=format&fit=max&w=800' },
        { id:5,  name:'Wireless Earbuds',       description:'True wireless with 28-hour total battery and IPX5 water resistance.',    price:89,   oldPrice:149, emoji:'🎵', badge:'trending', rating:4.6, reviews:267, image:'https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=max&w=800' },
        { id:6,  name:'Smart Watch Pro',        description:'ECG, SpO2, GPS and 5-day battery in a sleek titanium case.',             price:299,  oldPrice:399, emoji:'⌚', badge:'hot',      rating:4.8, reviews:445, image:'https://images.unsplash.com/photo-1523293182086-7651a899d37f?auto=format&fit=max&w=800' },
        { id:7,  name:'Premium Sneakers',       description:'Lightweight foam sole with breathable knit upper for all-day comfort.',  price:159,  oldPrice:229, emoji:'👟', badge:'trending', rating:4.4, reviews:198, image:'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=max&w=800' },
        { id:8,  name:'Portable Speaker',       description:'360° sound, IPX7 waterproof, 20-hour playtime, built-in powerbank.',     price:119,  oldPrice:179, emoji:'🔊', badge:'hot',      rating:4.7, reviews:223, image:'https://images.unsplash.com/photo-1518987048-93e29699e79a?auto=format&fit=max&w=800' },
        { id:9,  name:'4K Action Camera',       description:'4K/60fps, 20MP, HyperSmooth stabilisation and 170° wide lens.',          price:349,  emoji:'📷', badge:'new',      rating:4.8, reviews:98, image:'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=max&w=800' },
        { id:10, name:'Mechanical Keyboard',    description:'RGB per-key lighting, hot-swap switches, aluminium frame.',              price:129,  emoji:'⌨️', badge:'trending', rating:4.6, reviews:142, image:'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?auto=format&fit=max&w=800' },
        { id:11, name:'Gaming Mouse',           description:'25,600 DPI optical sensor, 11 programmable buttons, 70-hour battery.',   price:79,   emoji:'🖱️', badge:'hot',      rating:4.7, reviews:176, image:'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=max&w=800' },
        { id:12, name:'Ultrawide Monitor',      description:'34" 3440×1440 IPS, 144Hz, 1ms, HDR400, USB-C 65W charging.',             price:699,  emoji:'🖥️', badge:'premium',  rating:4.9, reviews:87, image:'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=max&w=800' },
        { id:13, name:'Noise-Cancel Earphones', description:'Hybrid ANC, 10mm drivers, 32-hour battery, multipoint pairing.',         price:199,  emoji:'🎶', badge:'new',      rating:4.5, reviews:64, image:'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=max&w=800' },
        { id:14, name:'Smart Home Hub',         description:'Controls 100+ devices, works with Alexa, Google & HomeKit.',             price:99,   emoji:'🏠', badge:'trending', rating:4.3, reviews:118, image:'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=max&w=800' },
        { id:15, name:'Drone Mini Pro',         description:'4K camera, 34-min flight, obstacle avoidance, foldable design.',         price:599,  emoji:'🚁', badge:'premium',  rating:4.8, reviews:93, image:'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?auto=format&fit=max&w=800' }
    ];

var RAW2 = [
        { id:16, name:'Portable Charger 20K',   description:'20,000mAh, 65W PD, charges laptop + 2 phones simultaneously.',           price:59,   emoji:'🔋', badge:'hot',      rating:4.6, reviews:204, image:'https://images.unsplash.com/photo-1585386959984-a4155224a1ad?auto=format&fit=max&w=800' },
        { id:17, name:'Leather Wallet',         description:'Full-grain leather, RFID blocking, slim profile, 8 card slots.',         price:49,   emoji:'👜', badge:'new',      rating:4.4, reviews:76, image:'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=max&w=800' },
        { id:18, name:'Sunglasses UV400',       description:'Polarised lenses, TR90 frame, 100% UV protection, unisex design.',       price:89,   emoji:'🕶️', badge:'trending', rating:4.5, reviews:132, image:'https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=max&w=800' },
        { id:19, name:'Coffee Maker Pro',       description:'15-bar espresso, built-in grinder, milk frother, 1.8L tank.',            price:249,  emoji:'☕', badge:'premium',  rating:4.7, reviews:85, image:'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=max&w=800' },
        { id:20, name:'Yoga Mat Premium',       description:'6mm thick, non-slip surface, alignment lines, carry strap included.',    price:45,   emoji:'🧘', badge:'new',      rating:4.3, reviews:59, image:'https://images.unsplash.com/photo-1593810450967-f9c42742e326?auto=format&fit=max&w=800' },
        { id:21, name:'Running Shoes X',        description:'Carbon fibre plate, responsive foam, breathable mesh upper.',            price:179,  emoji:'👟', badge:'hot',      rating:4.8, reviews:167, image:'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?auto=format&fit=max&w=800' },
        { id:22, name:'Wireless Charger Pad',   description:'15W fast charge, Qi-certified, works with all Qi devices.',              price:35,   emoji:'⚡', badge:'trending', rating:4.4, reviews:188, image:'https://images.unsplash.com/photo-1544724569-5f546fd6f2b5?auto=format&fit=max&w=800' },
        { id:23, name:'Smart LED Strip 5m',     description:'16M colours, music sync, app control, works with Alexa & Google.',       price:29,   emoji:'💡', badge:'new',      rating:4.2, reviews:71, image:'https://images.unsplash.com/photo-1529641484336-ef35148bab06?auto=format&fit=max&w=800' },
        { id:24, name:'Stainless Steel Bottle', description:'500ml, triple-wall insulated, keeps cold 24h / hot 12h, BPA-free.',      price:39,   emoji:'🍶', badge:'trending', rating:4.6, reviews:149, image:'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=max&w=800' },
        { id:25, name:'Tablet 10.5"',           description:'2K display, 8-core CPU, 8GB RAM, 256GB, 8000mAh, stylus support.',       price:449,  emoji:'📱', badge:'premium',  rating:4.7, reviews:104, image:'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?auto=format&fit=max&w=800' }
    ];

    var RAW = RAW1.concat(RAW2);

    /* Backend-hydrated catalogue cache (written by backend-bridge.js from
       /api/products). When present it fully replaces the built-in demo list so
       the shop renders exactly what Firestore holds. */
    var __backendCatalog = null;
    try {
        var __cache = JSON.parse(localStorage.getItem('trendaryo_catalog_cache') || 'null');
        if (Array.isArray(__cache) && __cache.length) {
            RAW = __cache;
            __backendCatalog = __cache;
        }
    } catch (e) { /* keep built-in list */ }
    window.__CATALOG_VERSION__ = (function () {
        try { return JSON.parse(localStorage.getItem('trendaryo_catalog_version')); }
        catch (e) { return null; }
    })();
    window.__CATALOG_IS_BACKEND__ = !!__backendCatalog;

    /* Product ids are opaque strings — built-in demo ids are numeric, but the
       backend catalogue uses Firestore doc ids / slugs. Identity is therefore
       always compared as a string via idStrOf(); idNumOf() gives a stable
       non-negative integer for purely visual hashing (tile gradient, hue). */
    function idStrOf(v) { return String(v === null || v === undefined ? '' : v); }
    function idNumOf(v) {
        var s = idStrOf(v), h = 0, i;
        for (i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
        return h;
    }

    var Products = {
        all: function () { return RAW.slice(); },

        idOf: function (p) { return idStrOf(p && p.id); },
        idNum: function (p) { return idNumOf(p && p.id); },

        find: function (id) {
            var want = idStrOf(id);
            for (var i = 0; i < RAW.length; i++) {
                if (idStrOf(RAW[i].id) === want) return RAW[i];
            }
            return null;
        },

        search: function (query) {
            var q = (query || '').toLowerCase().trim();
            if (!q) return this.all();
            var words = q.split(/\s+/);
            return RAW.filter(function (p) {
                var hay = (p.name + ' ' + p.description + ' ' + (p.badge || '')).toLowerCase();
                return words.every(function (w) { return hay.indexOf(w) !== -1; });
            });
        },

        byBadge: function (badge) {
            if (!badge || badge === 'all') return this.all();
            return RAW.filter(function (p) { return p.badge === badge; });
        },

        featured: function (n) {
            return RAW.slice().sort(function (a, b) { return b.rating - a.rating; }).slice(0, n || 6);
        },

        price: function (n) {
            return '$' + Number(n).toFixed(2).replace(/\.00$/, '');
        },

        stars: function (r) {
            var full = Math.round(Number(r) || 0);
            var out = '';
            for (var i = 1; i <= 5; i++) {
                out += '<svg width="13" height="13" viewBox="0 0 24 24" fill="' + (i <= full ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m12 17.27 6.18 3.73-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21Z"/></svg>';
            }
            return out;
        },

        /**
         * Local designed tile for products without a photo.
         * A data-URI SVG gradient — never 404s, never shows a broken image,
         * and reads as an intentional design choice rather than a missing asset.
         */
        tile: function (p) {
            var hueA = ['%2300f0ff', '%23ff00aa', '%2300ff88', '%23ff00ff'];
            var a = hueA[idNumOf(p && p.id) % hueA.length];
            var b = hueA[(idNumOf(p && p.id) + 2) % hueA.length];
            /* Single-quoted SVG attributes keep the data URI safe inside the
               double-quoted src / data-tile attributes media() builds — a raw
               double quote would truncate the attribute and break the fallback. */
            var svg =
                "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'>" +
                "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>" +
                "<stop offset='0%' stop-color='" + a.replace('%23', '#') + "' stop-opacity='0.30'/>" +
                "<stop offset='100%' stop-color='" + b.replace('%23', '#') + "' stop-opacity='0.30'/>" +
                "</linearGradient></defs>" +
                "<rect width='400' height='400' fill='#0a0a1e'/>" +
                "<rect width='400' height='400' fill='url(%23g)'/>" +
                "<circle cx='200' cy='175' r='105' fill='rgba(255,255,255,0.05)' stroke='rgba(255,255,255,0.12)'/>" +
                "<text x='200' y='205' font-size='104' text-anchor='middle'>" + (p.emoji || '📦') + "</text>" +
                "</svg>";
            return 'data:image/svg+xml;charset=utf-8,' + svg.replace(/#/g, '%23');
        },

        media: function (p, cssClass) {
            var cls = cssClass ? ' class="' + cssClass + '"' : '';
            var alt = String(p.name || 'Product').replace(/"/g, '&quot;');
            // If a remote photo fails to load, swap in the designed local tile so
            // the card never shows a broken-image icon or collapses.
            var fallback = ' onerror="this.onerror=null;this.src=this.dataset.tile"';
            var tile = this.tile(p);
            if (p.image) {
                return '<img src="' + p.image + '" alt="' + alt + '" loading="lazy" decoding="async" data-tile="' + tile + '"' + cls + fallback + '>';
            }
            return '<img src="' + tile + '" alt="' + alt + '" loading="lazy" decoding="async"' + cls + '>';
        },

        /* Category inferred from name/description keywords (no category field needed) */
        categoryOf: function (p) {
            var hay = (p.name + ' ' + p.description).toLowerCase();
            if (/headphone|earbud|earphone|speaker|audio/.test(hay)) return 'electronics';
            if (/watch|fitness band|tracker/.test(hay)) return 'electronics';
            if (/laptop|tablet|monitor|keyboard|mouse|hub|charger|led strip|computer/.test(hay)) return 'electronics';
            if (/camera|drone/.test(hay)) return 'electronics';
            if (/backpack|wallet|sunglasses|sneakers|shoes|fashion/.test(hay)) return 'fashion';
            if (/coffee|bottle|yoga|home|living/.test(hay)) return 'home';
            return 'electronics';
        },

        /* ─ Specs: real, product-specific rows for the specs table ── */
        specs: function (p) {
            if (Array.isArray(p.specs) && p.specs.length) {
                return p.specs.map(function (row) {
                    return Array.isArray(row) ? row : [row.label || '', row.value || ''];
                });
            }
            var S = {
                1:  [['Driver size', '40mm dynamic'], ['Noise cancelling', 'Hybrid ANC (up to 42dB)'], ['Battery', '30 hours (ANC on)'], ['Connectivity', 'Bluetooth 5.3 + 3.5mm'], ['Weight', '254 g'], ['Warranty', '2 years']],
                2:  [['Display', '1.47" AMOLED'], ['Sensors', 'Heart rate, SpO2, accelerometer'], ['Battery', '7 days typical use'], ['Water resistance', '5 ATM'], ['Compatibility', 'iOS 12+ / Android 8+'], ['Warranty', '1 year']],
                3:  [['Capacity', '30 litres'], ['Material', '900D water-resistant polyester'], ['Laptop sleeve', 'Fits up to 16"'], ['Extras', 'USB charging port, TSA lock'], ['Weight', '1.1 kg'], ['Warranty', '2 years']],
                4:  [['GPU', 'NVIDIA RTX 4060 8GB'], ['CPU', 'Intel Core i7 (13th gen)'], ['Memory', '16GB DDR5'], ['Storage', '1TB NVMe SSD'], ['Display', '15.6" QHD 165Hz'], ['Warranty', '2 years']],
                5:  [['Driver size', '10mm dynamic'], ['Battery', '8h buds + 28h case'], ['Water resistance', 'IPX5'], ['Connectivity', 'Bluetooth 5.3'], ['Charging', 'USB-C + wireless'], ['Warranty', '1 year']],
                6:  [['Case', 'Grade-5 titanium'], ['Health sensors', 'ECG, SpO2, temperature'], ['Battery', '5 days typical use'], ['Display', '1.43" AMOLED always-on'], ['Water resistance', '10 ATM'], ['Warranty', '2 years']],
                7:  [['Upper', 'Breathable engineered knit'], ['Midsole', 'Responsive EVA foam'], ['Drop', '8mm'], ['Weight', '268 g (UK 8)'], ['Sizes', 'UK 5 – 13'], ['Warranty', '6 months']],
                8:  [['Output', '30W stereo, 360° driver'], ['Battery', '20 hours playtime'], ['Water resistance', 'IPX7'], ['Extras', 'Built-in power bank'], ['Connectivity', 'Bluetooth 5.3, dual pairing'], ['Warranty', '1 year']],
                9:  [['Video', '4K 60fps / 1080p 240fps'], ['Sensor', '20MP 1/1.7"'], ['Stabilisation', 'HyperSmooth 6.0'], ['Waterproof', '10 m without housing'], ['Battery', '1720 mAh'], ['Warranty', '1 year']],
                10: [['Switches', 'Hot-swappable mechanical'], ['Layout', 'Full-size (104 keys)'], ['Lighting', 'Per-key RGB'], ['Frame', 'CNC aluminium'], ['Connectivity', 'USB-C detachable'], ['Warranty', '2 years']],
                11: [['Sensor', '25,600 DPI optical'], ['Buttons', '11 programmable'], ['Battery', '70 hours'], ['Polling rate', '1000 Hz'], ['Weight', '89 g'], ['Warranty', '2 years']],
                12: [['Panel', '34" IPS 3440×1440'], ['Refresh rate', '144 Hz / 1ms'], ['Colour', 'HDR400, 99% sRGB'], ['Ports', 'USB-C 65W, 2× HDMI, DP'], ['Stand', 'Height + tilt adjustable'], ['Warranty', '3 years']],
                13: [['Driver size', '10mm dynamic'], ['Noise cancelling', 'Hybrid ANC'], ['Battery', '32 hours'], ['Pairing', 'Multipoint (2 devices)'], ['Water resistance', 'IPX4'], ['Warranty', '1 year']],
                14: [['Compatibility', '100+ devices, Matter'], ['Voice assistants', 'Alexa, Google, HomeKit'], ['Connectivity', 'Wi-Fi, Bluetooth, Zigbee'], ['Power', 'USB-C with battery backup'], ['Setup', 'App-guided, under 5 minutes'], ['Warranty', '2 years']],
                15: [['Camera', '4K 30fps, 3-axis gimbal'], ['Flight time', '34 minutes'], ['Range', '10 km transmission'], ['Obstacle avoidance', 'Omnidirectional'], ['Weight', '249 g (foldable)'], ['Warranty', '1 year']],
                16: [['Capacity', '20,000 mAh'], ['Output', '65W USB-C PD'], ['Ports', '2× USB-C, 1× USB-A'], ['Recharge time', '1.5 hours'], ['Weight', '395 g'], ['Warranty', '18 months']],
                17: [['Material', 'Full-grain leather'], ['Security', 'RFID blocking'], ['Card slots', '8 + 2 note compartments'], ['Dimensions', '11 × 9 × 1.2 cm'], ['Colours', 'Black, Brown, Tan'], ['Warranty', '2 years']],
                18: [['Lens', 'Polarised UV400'], ['Frame', 'TR90 lightweight polymer'], ['Protection', '100% UVA / UVB'], ['Fit', 'Unisex, medium-large'], ['Includes', 'Hard case + microfibre cloth'], ['Warranty', '1 year']],
                19: [['Pressure', '15-bar espresso pump'], ['Grinder', 'Built-in conical burr'], ['Milk', 'Integrated steam frother'], ['Tank', '1.8 litres'], ['Extras', 'Auto shut-off, descaling alert'], ['Warranty', '2 years']],
                20: [['Thickness', '6 mm'], ['Surface', 'Non-slip textured'], ['Material', 'TPE, latex-free'], ['Extras', 'Alignment lines, carry strap'], ['Dimensions', '183 × 61 cm'], ['Warranty', '1 year']],
                21: [['Plate', 'Carbon fibre propulsion plate'], ['Midsole', 'Super-critical responsive foam'], ['Upper', 'Engineered breathable mesh'], ['Weight', '232 g (UK 8)'], ['Sizes', 'UK 5 – 13'], ['Warranty', '6 months']],
                22: [['Output', '15W fast charge'], ['Standard', 'Qi-certified'], ['Compatibility', 'All Qi-enabled devices'], ['Safety', 'Foreign object detection'], ['Cable', '1.2 m USB-C included'], ['Warranty', '1 year']],
                23: [['Length', '5 metres'], ['Colours', '16 million, music sync'], ['Control', 'App, voice or remote'], ['Compatibility', 'Alexa, Google Assistant'], ['Adhesive', '3M strong-bond backing'], ['Warranty', '1 year']],
                24: [['Capacity', '500 ml'], ['Insulation', 'Triple-wall vacuum'], ['Cold / Hot', '24 h cold / 12 h hot'], ['Material', '18/8 stainless steel, BPA-free'], ['Lid', 'Leak-proof twist cap'], ['Warranty', 'Lifetime']],
                25: [['Display', '10.5" 2K (2000×1200)'], ['Chip', '8-core'], ['Memory', '8GB RAM / 256GB storage'], ['Battery', '8000 mAh, ~12 h use'], ['Extras', 'Stylus support, microSD expansion'], ['Warranty', '2 years']]
            };
            return S[p.id] || [];
        },

        /* ─ Rating distribution: deterministic, sums to 100% ── */
        ratingBreakdown: function (p) {
            var r = Number(p.rating) || 4.5;
            var five = Math.round((r - 3.7) * 60 + 40);
            if (five > 88) five = 88;
            if (five < 42) five = 42;
            var remainder = 100 - five;
            var four = Math.round(remainder * 0.58);
            var three = Math.round(remainder * 0.24);
            var two = Math.round(remainder * 0.11);
            var one = 100 - five - four - three - two;
            return [
                { stars: 5, pct: five },
                { stars: 4, pct: four },
                { stars: 3, pct: three },
                { stars: 2, pct: two },
                { stars: 1, pct: one }
            ];
        },

        /* ── Shipping & returns copy (identical policy, per-product ETA) ── */
        shippingInfo: function (p) {
            var days = p && p.price >= 400 ? '5–7' : '3–5';
            return [
                { q: 'When will my order be dispatched?', a: 'Orders placed before 3:00 PM are packed and dispatched the same working day. Anything after that goes out the next working day — you will get a tracking link by email the moment the carrier scans it.' },
                { q: 'How long does delivery take?', a: 'Standard delivery on this item is ' + days + ' working days. Express options are shown at checkout, and orders over $50 ship free within the standard window.' },
                { q: 'Can I return this item?', a: 'Yes. You have 30 days from delivery to return it in its original condition and packaging. We refund to your original payment method within 3–5 working days of the item reaching our warehouse.' },
                { q: 'Is the warranty included?', a: 'Every Trendaryo item includes the manufacturer warranty listed in the Specifications above. Keep your order confirmation email — it doubles as your warranty proof.' }
            ];
        }
    };

    /* ── Admin overrides layer (admin.html Command Deck) ────────────────
       Admin edits live in localStorage 'trendaryo_admin_products'.
       This merges them into the live catalogue on load - rename, reprice,
       rewrite, re-badge, hide, delete and add - so the shop, search and
       rails reflect the admin instantly. Base data above stays the
       source of truth. */
    (function () {
        if (__backendCatalog) return; /* backend catalogue is the source of truth */
        var dump = null;
        try { dump = JSON.parse(localStorage.getItem('trendaryo_admin_products') || 'null'); } catch (e) { dump = null; }
        if (!dump || typeof dump !== 'object') return;
        var del = {}, i, k;
        for (i = 0; i < (dump.deleted || []).length; i++) del[dump.deleted[i]] = 1;
        var ov = dump.overrides || {};
        var merged = [], p, o, copy, kk;
        for (i = 0; i < RAW.length; i++) {
            p = RAW[i];
            if (del[p.id]) continue;
            o = ov[p.id];
            if (o) {
                if (o.hidden) continue;
                for (k in o) { if (k === 'seo' || k === 'stock' || k === 'updatedAt') continue; if (o[k] != null) p[k] = o[k]; }
            }
            merged.push(p);
        }
        for (i = 0; i < (dump.added || []).length; i++) {
            p = dump.added[i];
            if (del[p.id]) continue;
            if (ov[p.id] && ov[p.id].hidden) continue;
            copy = {};
            for (kk in p) copy[kk] = p[kk];
            merged.push(copy);
        }
        RAW.length = 0;
        for (i = 0; i < merged.length; i++) RAW.push(merged[i]);
    })();
    window.TrendaryoProducts = Products;

    /* Swap the live catalogue at runtime (used by admin/backend-sync.js after
       pulling products from Firestore) without a full page reload. */
    Products.setBase = function (list) {
        if (!Array.isArray(list)) return;
        RAW.length = 0;
        for (var __i = 0; __i < list.length; __i++) RAW.push(list[__i]);
        __backendCatalog = list;
        window.__CATALOG_IS_BACKEND__ = true;
        window.dispatchEvent(new CustomEvent('catalog-updated', { detail: { count: list.length } }));
    };
})();

