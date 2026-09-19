/**
 * TRENDARYO ADMIN - Data Layer (offline-first)
 * Single source of truth for every module in the admin app.
 *
 * Design rules (matching the storefront):
 *  - localStorage is the database; nothing here needs a server.
 *  - products-data.js stays the catalogue source of truth; admin edits
 *    live in an override layer that BOTH this file and products-data.js
 *    read, so changes made here appear on the live shop instantly.
 *  - Orders reuse the storefront OrdersStore key (trendaryo_orders),
 *    plus a status history trail per order.
 *  - Every mutating action is written to the activity log.
 */
(function () {
    'use strict';

    var K = {
        settings: 'trendaryo_admin_settings',
        products: 'trendaryo_admin_products',
        customers: 'trendaryo_admin_customers',
        content: 'trendaryo_admin_content',
        ai: 'trendaryo_admin_ai',
        log: 'trendaryo_admin_log',
        creds: 'trendaryo_admin_creds',
        orders: 'trendaryo_orders',
        newsletter: 'trendaryo_newsletter',
        reviews: 'trendaryo_reviews'
    };

    function read(key, fallback) {
        try {
            var v = JSON.parse(localStorage.getItem(key) || 'null');
            return v == null ? fallback : v;
        } catch (e) { return fallback; }
    }
    function write(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); return true; }
        catch (e) { return false; }
    }
    function uid(prefix) {
        return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    }
    function now() { return new Date().toISOString(); }

    var S = { K: K, uid: uid, now: now, read: read, write: write };
    window.TrendaryoAdminStore = S;

    /* ================= ACTIVITY LOG ================= */

    S.log = function (action, detail) {
        var list = read(K.log, []);
        list.unshift({ id: uid('log'), at: now(), actor: localStorage.getItem('adminEmail') || 'admin', action: action, detail: detail || '' });
        if (list.length > 500) list.length = 500;
        write(K.log, list);
    };

    S.logs = function (limit) {
        var list = read(K.log, []);
        return limit ? list.slice(0, limit) : list;
    };

    S.clearLogs = function () { write(K.log, []); };

    /* ================= SETTINGS ================= */

    var DEFAULTS = {
        storeName: 'Trendaryo',
        lowStock: 8,
        currency: 'USD',
        announcement: '',            /* empty = keep the built-in rotating bar */
        aiProvider: 'offline',       /* offline | openai | openrouter | groq | gemini | anthropic */
        aiKey: '',
        aiModel: '',
        aiTone: 'confident',         /* confident | luxury | technical | friendly */
        seeded: false
    };

    S.settings = function () {
        var s = read(K.settings, {});
        var out = {}, k;
        for (k in DEFAULTS) out[k] = DEFAULTS[k];
        for (k in s) out[k] = s[k];
        return out;
    };

    S.saveSettings = function (patch) {
        var s = read(K.settings, {}), k;
        for (k in patch) s[k] = patch[k];
        write(K.settings, s);
        S.log('settings.updated', Object.keys(patch).join(', '));
        return s;
    };

    /* ================= PRODUCTS =================
       Override layer consumed by products-data.js too. */

    function overrides() {
        var o = read(K.products, null);
        if (!o || typeof o !== 'object') o = { v: 1, overrides: {}, deleted: [], added: [] };
        if (!o.overrides) o.overrides = {};
        if (!o.deleted) o.deleted = [];
        if (!o.added) o.added = [];
        return o;
    }
    function saveOverrides(o) { write(K.products, o); }

    function P() { return window.TrendaryoProducts; }

    /* Stable integer from an opaque string id (cosmetic stock fallback only) */
    function idHash(v) {
        var s = String(v === null || v === undefined ? '' : v), h = 0, i;
        for (i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; }
        return h;
    }

    function decorate(p) {
        var o = overrides();
        var ov = o.overrides[p.id];
        var out = {};
        var k;
        for (k in p) out[k] = p[k];
        if (ov) for (k in ov) out[k] = ov[k];
        out._stock = (ov && ov.stock != null) ? ov.stock : (p.stock != null ? p.stock : ((idHash(p.id) % 5 === 0) ? 3 : 24));
        out._overridden = !!ov;
        out._added = false;
        return out;
    }

    /* Merged catalogue: base products (minus deleted) + admin-added products. */
    S.products = function () {
        var o = overrides();
        var del = {}, i;
        for (i = 0; i < o.deleted.length; i++) del[o.deleted[i]] = 1;
        var list = [];
        var base = P() ? P().all() : [];
        for (i = 0; i < base.length; i++) {
            if (del[base[i].id]) continue;
            list.push(decorate(base[i]));
        }
        for (i = 0; i < o.added.length; i++) {
            var a = {};
            var src = o.added[i], k;
            for (k in src) a[k] = src[k];
            a._stock = (a.stock != null) ? a.stock : 24;
            a._overridden = false;
            a._added = true;
            list.push(a);
        }
        return list;
    };

S.product = function (id) {
        var s = String(id);
        var list = S.products();
        for (var i = 0; i < list.length; i++) if (String(list[i].id) === s) return list[i];
        return null;
    };

    /* ---- product mutations ---- */

    var EDITABLE = ['name', 'description', 'price', 'oldPrice', 'badge', 'emoji', 'image', 'stock', 'hidden', 'seo'];

S.saveProduct = function (id, patch) {
        var o = overrides();
        var sId = String(id);
        var addedIdx = -1, i;
        for (i = 0; i < o.added.length; i++) if (String(o.added[i].id) === sId) addedIdx = i;
        if (addedIdx >= 0) {
            for (var k in patch) if (EDITABLE.indexOf(k) >= 0) o.added[addedIdx][k] = patch[k];
            o.added[addedIdx].updatedAt = now();
        } else {
            var ov = o.overrides[sId] || {};
            for (var k2 in patch) if (EDITABLE.indexOf(k2) >= 0) ov[k2] = patch[k2];
            /* null price restores the base catalogue value */
            if (patch.price === null) delete ov.price;
            if (patch.oldPrice === null) delete ov.oldPrice;
            if (patch.badge === null) delete ov.badge;
            o.overrides[sId] = ov;
        }
        saveOverrides(o);
        S.log('product.updated', '#' + id + ' (' + Object.keys(patch).join(', ') + ')');
        return S.product(id);
    };

    S.addProduct = function (p) {
        var o = overrides();
        var maxId = 100;
        var i;
        for (i = 0; i < o.added.length; i++) if (o.added[i].id > maxId) maxId = o.added[i].id;
        var base = P() ? P().all() : [];
        for (i = 0; i < base.length; i++) if (base[i].id > maxId) maxId = base[i].id;
        p.id = maxId + 1;
        p.rating = p.rating || 4.5;
        p.reviews = p.reviews || 0;
        p.createdAt = now();
        o.added.push(p);
        saveOverrides(o);
        S.log('product.added', '#' + p.id + ' ' + (p.name || ''));
        return p;
    };

S.deleteProduct = function (id) {
        var o = overrides();
        var idx = -1, i;
        for (i = 0; i < o.added.length; i++) if (String(o.added[i].id) === String(id)) idx = i;
        if (idx >= 0) { o.added.splice(idx, 1); }
        else if (o.deleted.indexOf(id) < 0) o.deleted.push(id);
        delete o.overrides[String(id)];
        saveOverrides(o);
        S.log('product.deleted', '#' + id);
    };

    S.setStock = function (id, n) {
        return S.saveProduct(id, { stock: Math.max(0, parseInt(n, 10) || 0) });
    };

    S.resetProducts = function () {
        write(K.products, { v: 1, overrides: {}, deleted: [], added: [] });
        S.log('products.reset', 'override layer cleared');
    };

    S.lowStock = function () {
        var th = S.settings().lowStock;
        var list = [], i;
        var all = S.products();
        for (i = 0; i < all.length; i++) if (all[i]._stock <= th) list.push(all[i]);
        return list;
    };

    S.seoState = function (p) {
        var s = p && p.seo;
        if (!s || (!s.metaTitle && !s.metaDescription)) return 'missing';
        if (s.metaTitle && s.metaDescription && s.keywords && s.keywords.length) return 'full';
        return 'partial';
    };

    S.applySeo = function (id, seo) {
        return S.saveProduct(id, { seo: seo });
    };

    S.seoAudit = function () {
        var all = S.products();
        var full = 0, partial = 0, missing = 0, i;
        for (i = 0; i < all.length; i++) {
            var st = S.seoState(all[i]);
            if (st === 'full') full++; else if (st === 'partial') partial++; else missing++;
        }
        return { full: full, partial: partial, missing: missing, total: all.length };
    };

    /* ================= ORDERS ================= */

    S.STATUS_FLOW = ['processing', 'packed', 'shipped', 'delivered'];

    S.orders = function () {
        var T = window.TrendaryoOrders;
        var list = T ? T.list() : read(K.orders, []);
        var i;
        for (i = 0; i < list.length; i++) {
            if (!list[i].history) list[i].history = [{ status: list[i].status, at: list[i].date || now() }];
        }
        return list;
    };

    S.order = function (id) {
        var q = String(id || '').toUpperCase();
        var list = S.orders();
        for (var i = 0; i < list.length; i++) if (String(list[i].id).toUpperCase() === q) return list[i];
        return null;
    };

    S.setOrderStatus = function (id, status) {
        var list = read(K.orders, []);
        var hit = null, i;
        for (i = 0; i < list.length; i++) {
            if (String(list[i].id).toUpperCase() === String(id).toUpperCase()) { hit = list[i]; break; }
        }
        if (!hit) return null;
        hit.status = status;
        if (!hit.history) hit.history = [];
        hit.history.push({ status: status, at: now() });
        write(K.orders, list);
        S.log('order.status', hit.id + ' -> ' + status);
        return hit;
    };

    S.bulkOrderStatus = function (ids, status) {
        var n = 0, i;
        for (i = 0; i < ids.length; i++) { if (S.setOrderStatus(ids[i], status)) n++; }
        return n;
    };

    S.seedDemoOrders = function () {
        localStorage.removeItem(K.orders);
        var T = window.TrendaryoOrders;
        if (T) T.seedIfEmpty();
        S.log('orders.reseeded', 'demo orders regenerated');
    };

    var DAY = 86400000;

    S.orderKpis = function () {
        var list = S.orders();
        var k = { total: list.length, revenue: 0, units: 0, open: 0, byStatus: {}, stuck: [] };
        var i, j, cut = Date.now() - 3 * DAY;
        for (i = 0; i < list.length; i++) {
            var o = list[i];
            if (o.status !== 'cancelled' && o.status !== 'refunded') {
                k.revenue += (o.total || 0);
                k.units += (o.items || []).reduce(function (s, it) { return s + (it.qty || 1); }, 0);
            }
            k.byStatus[o.status] = (k.byStatus[o.status] || 0) + 1;
            if (S.STATUS_FLOW.indexOf(o.status) >= 0 && S.STATUS_FLOW.indexOf(o.status) < 3) k.open++;
            if (o.status === 'processing' && new Date(o.date).getTime() < cut) k.stuck.push(o);
        }
        k.aov = k.total ? k.revenue / Math.max(1, k.byStatus.delivered || k.total) : 0;
        return k;
    };

    S.revenueSeries = function (days) {
        days = days || 14;
        var list = S.orders();
        var out = [], i, d;
        for (i = days - 1; i >= 0; i--) {
            d = new Date(Date.now() - i * DAY);
            out.push({
                label: (d.getMonth() + 1) + '/' + d.getDate(),
                value: 0
            });
        }
        for (i = 0; i < list.length; i++) {
            if (list[i].status === 'cancelled' || list[i].status === 'refunded') continue;
            var when = new Date(list[i].date).setHours(0, 0, 0, 0);
            for (var j = 0; j < out.length; j++) {
                var slot = new Date(Date.now() - (days - 1 - j) * DAY).setHours(0, 0, 0, 0);
                if (when === slot) out[j].value += list[i].total || 0;
            }
        }
        return out;
    };

    S.topProducts = function (n) {
        var list = S.orders();
        var map = {}, i, j;
        for (i = 0; i < list.length; i++) {
            if (list[i].status === 'cancelled' || list[i].status === 'refunded') continue;
            var items = list[i].items || [];
            for (j = 0; j < items.length; j++) {
                var key = items[j].id;
                if (!map[key]) map[key] = { id: key, name: items[j].name, units: 0, revenue: 0 };
                map[key].units += items[j].qty || 1;
                map[key].revenue += (items[j].price || 0) * (items[j].qty || 1);
            }
        }
        var arr = [];
        for (var k in map) arr.push(map[k]);
        arr.sort(function (a, b) { return b.units - a.units; });
        return arr.slice(0, n || 6);
    };

    /* ================= CUSTOMERS =================
       A ledger assembled from every real signal the storefront leaves:
       admin-added contacts, newsletter emails, signed-in account data and
       order buyers. Demo contacts are seeded once, clearly labelled. */

    function cKey(name, city) {
        return String(name || '').trim().toLowerCase() + '|' + String(city || '').trim().toLowerCase();
    }

    var DEMO_CUSTOMERS = [
        { name: 'Demo Customer', email: 'demo@trendaryo.com', city: 'Muscat', country: 'Oman', source: 'demo' },
        { name: 'Sarah Al Harthy', email: 'sarah.h@example.com', city: 'Muscat', country: 'Oman', source: 'demo' },
        { name: 'Marcus Tan', email: 'marcus.t@example.com', city: 'Singapore', country: 'Singapore', source: 'demo' },
        { name: 'Priya Menon', email: 'priya.m@example.com', city: 'Dubai', country: 'UAE', source: 'demo' },
        { name: 'Jonas Weber', email: 'j.weber@example.com', city: 'Berlin', country: 'Germany', source: 'demo' },
        { name: 'Aisha Rahman', email: 'aisha.r@example.com', city: 'London', country: 'UK', source: 'demo' }
    ];

    function ensureCustomerSeed() {
        var stored = read(K.customers, null);
        if (stored && stored.length) return;
        var list = [], i;
        for (i = 0; i < DEMO_CUSTOMERS.length; i++) {
            var c = DEMO_CUSTOMERS[i];
            list.push({ id: uid('cus'), name: c.name, email: c.email, city: c.city, country: c.country, source: c.source, createdAt: now(), note: 'Seeded sample - replace with real customers as orders arrive' });
        }
        write(K.customers, list);
    }

    S.customers = function () {
        ensureCustomerSeed();
        var stored = read(K.customers, []);
        var list = [], byKey = {}, i, j;
        for (i = 0; i < stored.length; i++) {
            var c = { id: stored[i].id, name: stored[i].name || '', email: stored[i].email || '', city: stored[i].city || '', country: stored[i].country || '', note: stored[i].note || '', createdAt: stored[i].createdAt || null, sources: ['admin'], orders: 0, spend: 0, lastAt: null };
            if (stored[i].source === 'demo') { c.sources = ['demo']; }
            list.push(c);
            byKey[cKey(c.name, c.city)] = c;
        }
        /* newsletter signals */
        var nl = S.newsletter();
        for (i = 0; i < nl.length; i++) {
            var email = String(nl[i] || '').toLowerCase();
            if (!email) continue;
            var hit = null;
            for (j = 0; j < list.length; j++) if ((list[j].email || '').toLowerCase() === email) { hit = list[j]; break; }
            if (hit) { if (hit.sources.indexOf('newsletter') < 0) hit.sources.push('newsletter'); }
            else {
                var nc = { id: 'nl-' + i, name: '', email: email, city: '', country: '', note: '', createdAt: null, sources: ['newsletter'], orders: 0, spend: 0, lastAt: null };
                list.push(nc);
            }
        }
        /* signed-in account (if this browser holds one) */
        var acct = null;
        try { acct = JSON.parse(localStorage.getItem('user') || 'null'); } catch (e) { acct = null; }
        if (acct && acct.email) {
            var found = null;
            for (j = 0; j < list.length; j++) if ((list[j].email || '').toLowerCase() === String(acct.email).toLowerCase()) { found = list[j]; break; }
            if (found && found.sources.indexOf('account') < 0) found.sources.push('account');
            else if (!found) {
                list.push({ id: 'acct', name: acct.displayName || acct.name || '', email: acct.email, city: '', country: '', note: '', createdAt: null, sources: ['account'], orders: 0, spend: 0, lastAt: null });
            }
        }
        /* order buyers */
        var orders = S.orders();
        for (i = 0; i < orders.length; i++) {
            var o = orders[i];
            var sh = o.shipping || {};
            var k = cKey(sh.name, sh.city);
            var c2 = byKey[k];
            if (!c2) {
                c2 = { id: 'buyer-' + i, name: sh.name || 'Guest', email: '', city: sh.city || '', country: sh.country || '', note: '', createdAt: o.date, sources: ['orders'], orders: 0, spend: 0, lastAt: null };
                byKey[k] = c2;
                list.push(c2);
            }
            if (c2.sources.indexOf('orders') < 0) c2.sources.push('orders');
            if (o.status !== 'cancelled' && o.status !== 'refunded') {
                c2.orders += 1;
                c2.spend += (o.total || 0);
            }
            var d = new Date(o.date || now()).getTime();
            if (!c2.lastAt || d > new Date(c2.lastAt).getTime()) c2.lastAt = o.date;
        }
        list.sort(function (a, b) { return b.spend - a.spend || b.orders - a.orders; });
        return list;
    };

    S.addCustomer = function (c) {
        var list = read(K.customers, []);
        list.push({ id: uid('cus'), name: c.name || '', email: c.email || '', city: c.city || '', country: c.country || '', note: c.note || '', source: 'admin', createdAt: now() });
        write(K.customers, list);
        S.log('customer.added', c.name || c.email || '');
    };

    S.removeCustomer = function (id) {
        var list = read(K.customers, []);
        var out = [], i;
        for (i = 0; i < list.length; i++) if (String(list[i].id) !== String(id)) out.push(list[i]);
        write(K.customers, out);
        S.log('customer.removed', String(id));
    };

    S.customerOrders = function (name, city) {
        var k = cKey(name, city);
        var list = S.orders();
        var out = [], i;
        for (i = 0; i < list.length; i++) {
            var sh = list[i].shipping || {};
            if (cKey(sh.name, sh.city) === k) out.push(list[i]);
        }
        return out;
    };

    /* ================= REVIEWS ================= */

    S.reviews = function () { return read(K.reviews, []); };

    S.deleteReview = function (id) {
        var list = read(K.reviews, []);
        var out = [], i;
        for (i = 0; i < list.length; i++) if (String(list[i].id) !== String(id)) out.push(list[i]);
        write(K.reviews, out);
        S.log('review.deleted', String(id));
    };

    S.reviewKpis = function () {
        var list = S.reviews();
        var sum = 0, i, low = [];
        for (i = 0; i < list.length; i++) {
            sum += (list[i].rating || 0);
            if ((list[i].rating || 5) <= 2) low.push(list[i]);
        }
        return { total: list.length, avg: list.length ? sum / list.length : 0, low: low };
    };

    /* ================= NEWSLETTER ================= */

    S.newsletter = function () { return read(K.newsletter, []); };

    S.newsletterAdd = function (email) {
        email = String(email || '').trim().toLowerCase();
        if (!email) return false;
        var list = S.newsletter();
        if (list.indexOf(email) >= 0) return false;
        list.push(email);
        write(K.newsletter, list);
        S.log('newsletter.added', email);
        return true;
    };

    S.newsletterRemove = function (email) {
        var list = S.newsletter();
        var idx = list.indexOf(String(email || '').toLowerCase());
        if (idx < 0) return false;
        list.splice(idx, 1);
        write(K.newsletter, list);
        S.log('newsletter.removed', email);
        return true;
    };

    /* ================= CONTENT DRAFTS ================= */

    S.drafts = function () { return read(K.content, []); };

    S.saveDraft = function (d) {
        var list = S.drafts();
        if (d.id) {
            for (var i = 0; i < list.length; i++) {
                if (list[i].id === d.id) { for (var k in d) list[i][k] = d[k]; list[i].updatedAt = now(); write(K.content, list); return list[i]; }
            }
        }
        d.id = uid('dft');
        d.createdAt = now();
        d.updatedAt = d.createdAt;
        list.unshift(d);
        write(K.content, list);
        S.log('draft.saved', (d.type || 'draft') + ': ' + (d.title || '').slice(0, 60));
        return d;
    };

    S.deleteDraft = function (id) {
        var list = S.drafts();
        var out = [], i;
        for (i = 0; i < list.length; i++) if (list[i].id !== id) out.push(list[i]);
        write(K.content, out);
        S.log('draft.deleted', String(id));
    };

    /* ================= AI HISTORY ================= */

    S.aiHistory = function () { return read(K.ai, []); };

    S.aiAdd = function (e) {
        var list = S.aiHistory();
        e.id = uid('ai');
        e.at = now();
        list.unshift(e);
        if (list.length > 200) list.length = 200;
        write(K.ai, list);
        return e;
    };

    S.aiUpdate = function (id, patch) {
        var list = S.aiHistory();
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === id) { for (var k in patch) list[i][k] = patch[k]; write(K.ai, list); return list[i]; }
        }
        return null;
    };

    S.aiClear = function () { write(K.ai, []); };

    /* ================= CSV EXPORT ================= */

    S.csv = function (rows, filename) {
        if (!rows || !rows.length) return false;
        var cols = Object.keys(rows[0]);
        function cell(v) {
            var s = String(v == null ? '' : v);
            return (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }
        var lines = [cols.join(',')];
        for (var i = 0; i < rows.length; i++) {
            var line = [];
            for (var j = 0; j < cols.length; j++) line.push(cell(rows[i][cols[j]]));
            lines.push(line.join(','));
        }
        var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = (filename || 'export') + '-' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 400);
        S.log('data.exported', filename + ' (' + rows.length + ' rows)');
        return true;
    };

    /* ================= DANGER ZONE ================= */

    S.resetAll = function () {
        localStorage.removeItem(K.settings);
        localStorage.removeItem(K.products);
        localStorage.removeItem(K.customers);
        localStorage.removeItem(K.content);
        localStorage.removeItem(K.ai);
        localStorage.removeItem(K.log);
        localStorage.removeItem(K.creds);
        localStorage.removeItem(K.orders);
    };

})();
