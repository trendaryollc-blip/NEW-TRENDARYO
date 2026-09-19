/**
 * TRENDARYO ADMIN - Application Shell
 * Sidebar + topbar + hash router + shared UI primitives (toasts, confirms,
 * drawers, charts) + the global Copilot drawer. Views register themselves
 * into window.TrendaryoAdminViews; this file turns them into an app.
 */
(function () {
    'use strict';

    var App = window.TrendaryoAdminApp = {};
    var A = window.TrendaryoAdmin;

    function st() { return window.TrendaryoAdminStore; }
    function ai() { return window.TrendaryoAdminAI; }

    /* ================= small helpers ================= */

    App.esc = function (s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };

    App.uid = function (p) { return (p || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); };

    App.debounce = function (fn, ms) {
        var t = null;
        return function () {
            var args = arguments, self = this;
            clearTimeout(t);
            t = setTimeout(function () { fn.apply(self, args); }, ms || 250);
        };
    };

    App.money = function (v) {
        var cur = 'USD';
        try { cur = (st().settings().currency) || 'USD'; } catch (e) {}
        return A.money(v, cur);
    };
    App.n = function (v) { return A.number(v); };
    App.compact = function (v) { return A.moneyCompact(v); };
    App.ago = function (iso) {
        var d = A.toDate(iso);
        if (!d) return '-';
        var s = Math.floor((Date.now() - d.getTime()) / 1000);
        if (s < 60) return 'just now';
        if (s < 3600) return Math.floor(s / 60) + 'm ago';
        if (s < 86400) return Math.floor(s / 3600) + 'h ago';
        if (s < 2592000) return Math.floor(s / 86400) + 'd ago';
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };
    App.date = function (iso) {
        var d = A.toDate(iso);
        return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
    };
    App.dateTime = function (iso) {
        var d = A.toDate(iso);
        return d ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
    };

    /* ================= toasts ================= */

    App.toast = function (msg, type, title) {
        var stack = document.querySelector('.toast-stack');
        if (!stack) {
            stack = document.createElement('div');
            stack.className = 'toast-stack';
            document.body.appendChild(stack);
        }
        type = type || 'info';
        var iconName = type === 'ok' ? 'check' : type === 'danger' ? 'x' : type === 'warn' ? 'activity' : type === 'ai' ? 'sparkles' : 'circleDot';
        var el = document.createElement('div');
        el.className = 'toast toast--' + type;
        el.innerHTML = A.icon(iconName, 15) +
            '<div class="toast__body"><div class="toast__title">' + App.esc(title || (type === 'ok' ? 'Done' : type === 'ai' ? 'AI Studio' : 'Trendaryo Admin')) + '</div>' +
            '<div class="toast__msg">' + App.esc(msg) + '</div></div>' +
            '<button class="toast__close" type="button" aria-label="Dismiss">' + A.icon('x', 13) + '</button>';
        stack.appendChild(el);
        function kill() {
            el.classList.add('is-leaving');
            setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 200);
        }
        el.querySelector('.toast__close').addEventListener('click', kill);
        setTimeout(kill, 4600);
        return el;
    };

    /* ================= confirm modal =================
       App.confirm({ title, message, okText, danger }) -> Promise<boolean> */

    App.confirm = function (opts) {
        opts = opts || {};
        return new Promise(function (resolve) {
            var wrap = document.createElement('div');
            wrap.className = 'modal is-open';
            wrap.innerHTML = '<div class="modal__dialog modal__dialog--sm">' +
                '<div class="modal__head"><div><div class="modal__title">' + App.esc(opts.title || 'Are you sure?') + '</div></div>' +
                '<button class="modal__close" type="button" data-x aria-label="Close">' + A.icon('x', 15) + '</button></div>' +
                '<div class="modal__body">' + (opts.message || '') + '</div>' +
                '<div class="modal__foot"><span class="spacer"></span>' +
                '<button class="btn" type="button" data-cancel>Cancel</button>' +
                '<button class="btn ' + (opts.danger ? 'btn--danger' : 'btn--primary') + '" type="button" data-ok>' + App.esc(opts.okText || 'Confirm') + '</button>' +
                '</div></div>';
            document.body.appendChild(wrap);
            function done(val) {
                if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
                document.removeEventListener('keydown', onKey);
                resolve(val);
            }
            function onKey(e) { if (e.key === 'Escape') done(false); }
            wrap.addEventListener('click', function (e) {
                if (e.target === wrap) done(false);
                if (e.target.closest('[data-x]') || e.target.closest('[data-cancel]')) done(false);
                if (e.target.closest('[data-ok]')) done(true);
            });
            document.addEventListener('keydown', onKey);
        });
    };

    /* ================= drawer (right side panel) =================
       App.drawer.open({ title, sub, wide, body, foot, onMount }) -> { root, close } */

    var drawerState = null;

    App.drawer = {
        isOpen: function () { return !!drawerState; },
        open: function (opts) {
            opts = opts || {};
            App.drawer.close();
            var overlay = document.createElement('div');
            overlay.className = 'tl-overlay';
            var drawer = document.createElement('aside');
            drawer.className = 'drawer is-open' + (opts.wide ? ' drawer--wide' : '');
            drawer.setAttribute('role', 'dialog');
            drawer.innerHTML = '<div class="modal__head"><div><div class="modal__title">' + App.esc(opts.title || '') + '</div>' +
                (opts.sub ? '<div class="modal__sub">' + App.esc(opts.sub) + '</div>' : '') + '</div>' +
                '<button class="modal__close" type="button" data-dclose aria-label="Close">' + A.icon('x', 15) + '</button></div>' +
                '<div class="modal__body' + (opts.flush ? ' modal__body--flush' : '') + '">' + (opts.body || '') + '</div>' +
                (opts.foot ? '<div class="modal__foot">' + opts.foot + '</div>' : '');
            document.body.appendChild(overlay);
            document.body.appendChild(drawer);
            function close() { App.drawer.close(); }
            overlay.addEventListener('click', close);
            drawer.querySelector('[data-dclose]').addEventListener('click', close);
            function onKey(e) { if (e.key === 'Escape') close(); }
            document.addEventListener('keydown', onKey);
            drawerState = { overlay: overlay, drawer: drawer, onKey: onKey };
            if (opts.onMount) opts.onMount(drawer);
            return { root: drawer, close: close };
        },
        close: function () {
            if (!drawerState) return;
            document.removeEventListener('keydown', drawerState.onKey);
            if (drawerState.overlay.parentNode) drawerState.overlay.parentNode.removeChild(drawerState.overlay);
            if (drawerState.drawer.parentNode) drawerState.drawer.parentNode.removeChild(drawerState.drawer);
            drawerState = null;
        }
    };

    /* ================= CSV ================= */

    App.csv = function (rows, filename) { st().csv(rows, filename); };

    /* ================= charts (pure SVG, no libs) ================= */

    App.sparkline = function (values) {
        var w = 240, h = 44, pad = 3;
        var v = values || [];
        var max = Math.max.apply(null, v.concat([1]));
        var step = v.length > 1 ? (w - pad * 2) / (v.length - 1) : 0;
        var pts = [], i;
        for (i = 0; i < v.length; i++) {
            pts.push([pad + i * step, h - pad - (v[i] / max) * (h - pad * 2)]);
        }
        var line = pts.map(function (p, idx) { return (idx ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
        var area = line + ' L' + (w - pad) + ' ' + (h - pad) + ' L' + pad + ' ' + (h - pad) + ' Z';
        return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">' +
            '<path class="spark-fill" d="' + area + '"/><path d="' + line + '"/></svg>';
    };

    App.bars = function (series, opts) {
        opts = opts || {};
        var W = 720, H = 190, padL = 8, padB = 22, padT = 10;
        var n = series.length || 1;
        var max = 1;
        var i;
        for (i = 0; i < series.length; i++) if (series[i].value > max) max = series[i].value;
        var slot = (W - padL * 2) / n;
        var bw = Math.max(6, Math.min(46, slot * 0.62));
        var out = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img">';
        out += '<line class="chart-grid" x1="' + padL + '" y1="' + (H - padB) + '" x2="' + (W - padL) + '" y2="' + (H - padB) + '"/>';
        out += '<line class="chart-grid" x1="' + padL + '" y1="' + padT + '" x2="' + (W - padL) + '" y2="' + padT + '"/>';
        for (i = 0; i < series.length; i++) {
            var hgt = (series[i].value / max) * (H - padB - padT);
            var x = padL + i * slot + (slot - bw) / 2;
            var y = H - padB - hgt;
            out += '<rect class="chart-bar' + (opts.ai ? ' chart-bar--ai' : '') + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(1, hgt).toFixed(1) + '" rx="2"><title>' + App.esc(series[i].label) + ': ' + App.esc(series[i].tip || App.compact(series[i].value)) + '</title></rect>';
            if (n <= 16 || i % 2 === 0) {
                out += '<text class="chart-axis" x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + App.esc(series[i].label) + '</text>';
            }
        }
        out += '</svg>';
        return out;
    };

    App.donut = function (segs) {
        var total = 0, i;
        for (i = 0; i < segs.length; i++) total += segs[i].value;
        var colors = ['var(--accent)', 'var(--ai)', 'var(--ok)', 'var(--warn)', 'var(--info)', 'var(--text-mute)'];
        var r = 52, c = 2 * Math.PI * r;
        var offset = 0;
        var circles = '';
        var legend = '';
        for (i = 0; i < segs.length; i++) {
            var frac = total ? segs[i].value / total : 0;
            var color = segs[i].color || colors[i % colors.length];
            if (frac > 0) {
                circles += '<circle cx="70" cy="70" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="16" stroke-dasharray="' + (frac * c).toFixed(1) + ' ' + c.toFixed(1) + '" stroke-dashoffset="' + (-offset * c).toFixed(1) + '"><title>' + App.esc(segs[i].label) + ': ' + App.n(segs[i].value) + '</title></circle>';
            }
            offset += frac;
            legend += '<span><i style="background:' + color + '"></i>' + App.esc(segs[i].label) + ' - ' + App.n(segs[i].value) + '</span>';
        }
        return '<div class="row row--wrap" style="gap:24px;">' +
            '<svg viewBox="0 0 140 140" width="140" height="140" role="img"><circle cx="70" cy="70" r="' + r + '" fill="none" stroke="var(--surface-3)" stroke-width="16"/>' + circles + '</svg>' +
            '<div class="chart__legend" style="align-content:center;">' + legend + '</div></div>';
    };

    App.barList = function (rows) {
        var out = '<div class="bar-list">';
        for (var i = 0; i < rows.length; i++) {
            out += '<div class="bar-list__row"><div><div class="bar-list__label">' + App.esc(rows[i].label) + (rows[i].sub ? ' <span class="t-mute fs-xs">' + App.esc(rows[i].sub) + '</span>' : '') + '</div></div>' +
                '<div class="bar-list__value">' + App.esc(rows[i].value) + '</div></div>' +
                '<div class="bar-list__track"><div class="bar-list__fill' + (rows[i].cls ? ' bar-list__fill--' + rows[i].cls : '') + '" style="width:' + Math.max(2, Math.min(100, rows[i].pct || 0)) + '%"></div></div>';
        }
        return out + '</div>';
    };

    /* ================= data snapshot (for the copilot) ================= */

    App.snapshot = function () {
        var S = st();
        var k = S.orderKpis();
        var audit = S.seoAudit();
        var top = S.topProducts(3);
        var lines = [
            'Products: ' + S.products().length,
            'Orders: ' + k.total,
            'Open orders: ' + k.open,
            'Revenue: ' + App.money(k.revenue),
            'Average order value: ' + App.money(k.aov),
            'Units sold: ' + App.n(k.units),
            'Low stock items: ' + S.lowStock().length,
            'SEO coverage: ' + audit.full + ' full, ' + audit.partial + ' partial, ' + audit.missing + ' missing, of ' + audit.total + ' products',
            'Customers: ' + S.customers().length,
            'Newsletter signups: ' + S.newsletter().length,
            'Top products: ' + (top.length ? top.map(function (t) { return t.name + ' x' + t.units; }).join('; ') : 'no order data yet')
        ];
        return lines.join('\n');
    };

    /* ================= shell ================= */

    var ORDER = [
        { id: 'dashboard', group: 'Overview' },
        { id: 'analytics', group: 'Overview' },
        { id: 'products', group: 'Catalog' },
        { id: 'reviews', group: 'Catalog' },
        { id: 'orders', group: 'Sales' },
        { id: 'customers', group: 'Sales' },
        { id: 'marketing', group: 'Growth' },
        { id: 'ai-studio', group: 'Intelligence' },
        { id: 'settings', group: 'System' }
    ];
    App.ORDER = ORDER;

    function views() { return window.TrendaryoAdminViews || {}; }
    function meta(id) {
        var v = views()[id];
        return v || { title: id, icon: 'circleDot', sub: '' };
    }

    App.badges = function () {
        var S = st();
        var b = {};
        try { b.products = S.lowStock().length; } catch (e) { b.products = 0; }
        try { b.orders = S.orderKpis().open; } catch (e) { b.orders = 0; }
        try { b.reviews = S.reviewKpis().low.length; } catch (e) { b.reviews = 0; }
        try { b['ai-studio'] = S.aiHistory().length; } catch (e) { b['ai-studio'] = 0; }
        var items = document.querySelectorAll('.nav-item[data-nav]');
        for (var i = 0; i < items.length; i++) {
            var id = items[i].getAttribute('data-nav');
            var el = items[i].querySelector('.nav-item__badge');
            if (!el) continue;
            var val = b[id] || 0;
            el.textContent = val;
            el.hidden = val === 0;
            el.classList.remove('is-alert', 'is-warn');
            if (id === 'reviews' && val > 0) el.classList.add('is-alert');
            if ((id === 'products' || id === 'orders') && val > 0) el.classList.add('is-warn');
        }
    };

    App.buildShell = function () {
        var email = localStorage.getItem('adminEmail') || 'admin@trendaryo.com';
        var ini = (email.replace(/@.*$/, '').slice(0, 2) || 'AD').toUpperCase();
        var V = views();
        var groups = [], seen = {}, i;
        for (i = 0; i < ORDER.length; i++) {
            var g = ORDER[i].group;
            if (!seen[g]) { seen[g] = []; groups.push({ name: g, items: seen[g] }); }
            seen[g].push(ORDER[i].id);
        }
        var nav = '';
        for (i = 0; i < groups.length; i++) {
            nav += '<div class="sidebar__group"><div class="sidebar__group-label">' + App.esc(groups[i].name) + '</div>';
            for (var j = 0; j < groups[i].items.length; j++) {
                var id = groups[i].items[j];
                var m = meta(id);
                nav += '<a class="nav-item' + (id === 'ai-studio' ? ' nav-item--ai' : '') + '" href="#/' + id + '" data-nav="' + id + '">' + A.icon(m.icon || 'circleDot', 16) + '<span>' + App.esc(m.title || id) + '</span><span class="nav-item__badge" hidden></span></a>';
            }
            nav += '</div>';
        }
        document.body.innerHTML =
            '<div class="app">' +
                '<aside class="sidebar" id="tlSidebar">' +
                    '<div class="sidebar__brand">' + A.icon('crown', 26, 'sidebar__mark') + '<div class="sidebar__wordmark"><b>Trendaryo</b><span>Command Deck</span></div></div>' +
                    '<div class="sidebar__scroll">' + nav + '</div>' +
                    '<div class="sidebar__foot">' +
                        '<a class="nav-item" href="shop.html" target="_blank" rel="noopener">' + A.icon('store', 16) + '<span>View store</span>' + A.icon('externalLink', 13) + '</a>' +
                        '<div class="row" style="padding:10px 12px;gap:10px;"><span class="avatar avatar--accent">' + App.esc(ini) + '</span><div style="min-width:0;flex:1;"><div class="fs-sm fw-600 t-truncate">' + App.esc(email) + '</div><div class="fs-xs t-mute">Administrator</div></div>' +
                        '<button class="icon-btn" id="tlLogout" type="button" title="Log out" aria-label="Log out">' + A.icon('logout', 15) + '</button></div>' +
                    '</div>' +
                '</aside>' +
                '<main class="main">' +
                    '<header class="topbar">' +
                        '<button class="icon-btn tl-hamburger" id="tlHamburger" type="button" aria-label="Menu">' + A.icon('menu', 18) + '</button>' +
                        '<div class="topbar__title"><h1 id="tlTitle">Dashboard</h1><div class="fs-xs t-mute" id="tlSub"></div></div>' +
                        '<div class="topbar__actions"><button class="btn btn--ai btn--sm" id="tlCopilotBtn" type="button">' + A.icon('sparkles', 13) + 'Copilot <span class="kbd">Ctrl K</span></button></div>' +
                    '</header>' +
                    '<div class="tl-view" id="tlView"></div>' +
                '</main>' +
            '</div>' +
            '<div class="tl-scrim" id="tlScrim"></div>';

        document.getElementById('tlSidebar').addEventListener('click', function (e) {
            var link = e.target.closest('[data-nav]');
            if (link) closeMobile();
        });
        document.getElementById('tlLogout').addEventListener('click', function () {
            App.confirm({ title: 'Log out?', message: '<p class="t-body">You will need the admin credentials to sign back in.</p>', okText: 'Log out', danger: true }).then(function (ok) {
                if (ok) App.logout();
            });
        });
        document.getElementById('tlHamburger').addEventListener('click', toggleMobile);
        document.getElementById('tlScrim').addEventListener('click', closeMobile);
        document.getElementById('tlCopilotBtn').addEventListener('click', function () { App.copilot(); });
    };

    function toggleMobile() {
        var sb = document.getElementById('tlSidebar');
        var sc = document.getElementById('tlScrim');
        var open = sb.classList.toggle('is-open');
        if (sc) sc.classList.toggle('is-open', open);
    }
    function closeMobile() {
        var sb = document.getElementById('tlSidebar');
        var sc = document.getElementById('tlScrim');
        if (sb) sb.classList.remove('is-open');
        if (sc) sc.classList.remove('is-open');
    }
    App.closeMobile = closeMobile;

    /* ================= router ================= */

    App.current = 'dashboard';

    App.ctx = function () {
        return { App: App, S: st(), AI: ai(), A: A, refresh: function () { App.route(); } };
    };

    App.route = function () {
        var V = views();
        var id = String(location.hash || '').replace(/^#\/?/, '') || 'dashboard';
        if (!V[id]) id = 'dashboard';
        App.current = id;
        var v = V[id];
        var root = document.getElementById('tlView');
        if (!root) return;
        var title = document.getElementById('tlTitle');
        var sub = document.getElementById('tlSub');
        if (title) title.textContent = v.title || id;
        if (sub) sub.textContent = v.sub || '';
        var items = document.querySelectorAll('.nav-item[data-nav]');
        for (var i = 0; i < items.length; i++) {
            if (items[i].getAttribute('data-nav') === id) items[i].classList.add('is-active');
            else items[i].classList.remove('is-active');
        }
        App.drawer.close();
        root.innerHTML = '';
        try {
            v.render(root, App.ctx());
        } catch (err) {
            root.innerHTML = '<div class="empty"><div class="empty__icon">' + A.icon('activity', 20) + '</div>' +
                '<h3>This view failed to load</h3><p>' + App.esc(String((err && err.message) || err)) + '</p></div>';
        }
        App.badges();
        closeMobile();
        window.scrollTo(0, 0);
    };

    /* ================= auth ================= */

    App.guard = function () {
        var t = localStorage.getItem('adminToken');
        var r = localStorage.getItem('userRole');
        if (!t || r !== 'admin') {
            location.replace('admin-login.html');
            return false;
        }
        return true;
    };

    App.logout = function () {
        var keys = ['adminToken', 'userRole', 'adminEmail', 'adminLoginTime'];
        for (var i = 0; i < keys.length; i++) localStorage.removeItem(keys[i]);
        location.replace('admin-login.html');
    };

    /* ================= copilot (global, Ctrl+K) ================= */

    var CHIPS = [
        'How is revenue doing?',
        'Any low stock to reorder?',
        'Which products sell best?',
        'How is our SEO coverage?',
        'Summarize the open orders'
    ];

    App.copilot = function () {
        var engine = ai();
        var stat = engine ? engine.status() : { mode: 'offline', providerLabel: 'Offline Studio', model: 'trendaryo-studio-v1' };
        var chips = '';
        for (var i = 0; i < CHIPS.length; i++) {
            chips += '<button class="chip" type="button" data-q="' + App.esc(CHIPS[i]) + '">' + App.esc(CHIPS[i]) + '</button>';
        }
        App.drawer.open({
            title: 'Copilot',
            sub: stat.mode === 'live' ? 'Live - ' + stat.providerLabel + ' (' + stat.model + ')' : 'Offline Studio - built-in, answers from live store data',
            body: '<div class="tl-chat" id="tlChat">' +
                    '<div class="tl-msg tl-msg--ai"><div class="tl-msg__text">Ask anything about the store. I answer from the live data on this device' +
                    (stat.mode === 'live' ? ' through ' + App.esc(stat.providerLabel) + '.' : ' - revenue, orders, stock, customers, SEO coverage, top sellers.') + '</div></div>' +
                '</div>' +
                '<div class="chip-row" style="margin-top:12px;">' + chips + '</div>',
            foot: '<input class="input" id="tlChatInput" type="text" placeholder="Ask about revenue, orders, stock, customers, SEO..." aria-label="Ask the copilot">' +
                  '<button class="btn btn--ai" id="tlChatSend" type="button">' + A.icon('sparkles', 14) + 'Ask</button>',
            onMount: function (root) {
                var input = root.querySelector('#tlChatInput');
                var log = root.querySelector('#tlChat');
                function addMsg(kind, html) {
                    var row = document.createElement('div');
                    row.className = 'tl-msg tl-msg--' + kind;
                    row.innerHTML = '<div class="tl-msg__text">' + html + '</div>';
                    log.appendChild(row);
                    log.scrollTop = log.scrollHeight;
                    return row;
                }
                function send(q) {
                    q = String(q || '').trim();
                    if (!q) return;
                    addMsg('admin', App.esc(q));
                    var pending = addMsg('ai', '<span class="spinner spinner--ai"></span> Reading the live data...');
                    engine.run('copilot', { question: q, snapshot: App.snapshot() }, { silent: true }).then(function (res) {
                        if (!log.parentNode) return;
                        var html = App.esc(res.text).replace(/\n/g, '<br>');
                        html += '<div class="ai-meta">' + App.esc(res.provider) + ' - ' + res.ms + 'ms</div>';
                        if (res.fallbackError) html += '<div class="badge badge--warn" style="margin-top:6px;">Live provider failed - Offline Studio answered</div>';
                        pending.querySelector('.tl-msg__text').innerHTML = html;
                        log.scrollTop = log.scrollHeight;
                    }, function (err) {
                        if (!log.parentNode) return;
                        pending.querySelector('.tl-msg__text').innerHTML = '<span class="text-danger">' + App.esc(String((err && err.message) || err)) + '</span>';
                    });
                }
                root.querySelector('#tlChatSend').addEventListener('click', function () { send(input.value); input.value = ''; });
                input.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter') { e.preventDefault(); send(input.value); input.value = ''; }
                });
                var chipBtns = root.querySelectorAll('[data-q]');
                for (var c = 0; c < chipBtns.length; c++) {
                    chipBtns[c].addEventListener('click', function () { send(this.getAttribute('data-q')); });
                }
                input.focus();
            }
        });
    };

    /* ================= boot ================= */

    App.start = function () {
        if (!App.guard()) return;
        App.buildShell();
        window.addEventListener('hashchange', App.route);
        document.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') {
                e.preventDefault();
                App.copilot();
            }
        });
        App.route();
    };

})();
