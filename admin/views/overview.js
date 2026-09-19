/**
 * TRENDARYO ADMIN - Overview views (Dashboard + Analytics)
 * Every number is computed from the live store data on this device.
 */
(function () {
    'use strict';

    var V = window.TrendaryoAdminViews = window.TrendaryoAdminViews || {};

    function app() { return window.TrendaryoAdminApp; }
    function fmt() { return window.TrendaryoAdmin; }

    /* shared helpers for all view files */
    V.util = {
        esc: function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); },
        money: function (v) { return app().money(v); },
        kpi: function (icon, cls, label, value, sub) {
            return '<div class="stat"><div class="stat__top"><span class="stat__icon ' + cls + '">' + fmt().icon(icon, 14) + '</span></div>' +
                '<div class="stat__value">' + value + '</div><div class="stat__label">' + V.util.esc(label) + '</div>' +
                (sub ? '<div class="fs-xs t-mute" style="margin-top:6px;">' + sub + '</div>' : '') + '</div>';
        },
        head: function (title, sub, actions) {
            return '<div class="page-head"><div class="page-head__text"><h2>' + V.util.esc(title) + '</h2><p>' + V.util.esc(sub) + '</p></div>' +
                '<div class="page-head__actions">' + (actions || '') + '</div></div>';
        },
        statusBadge: function (s) {
            var map = { processing: 'badge--warn', packed: 'badge--info', shipped: 'badge--accent', delivered: 'badge--ok', cancelled: 'badge--danger', refunded: 'badge--neutral' };
            return '<span class="badge ' + (map[s] || 'badge--neutral') + '"><span class="badge__dot"></span>' + V.util.esc(s) + '</span>';
        },
        empty: function (icon, title, text) {
            return '<div class="empty"><div class="empty__icon">' + fmt().icon(icon, 20) + '</div><h3>' + V.util.esc(title) + '</h3><p>' + V.util.esc(text) + '</p></div>';
        }
    };

    /* ================================================================
       DASHBOARD
       ================================================================ */
    V.dashboard = {
        title: 'Dashboard',
        icon: 'dashboard',
        sub: 'The store, at a glance - computed live on this device',
        render: function (root, ctx) {
            var S = ctx.S, App = ctx.App, A = ctx.A, U = V.util;
            var k = S.orderKpis();
            var low = S.lowStock();
            var audit = S.seoAudit();
            var customers = S.customers();
            var top = S.topProducts(5);
            var series = S.revenueSeries(14);
            var recent = S.orders().slice(0, 6);
            var stat = ctx.AI.status();
            var insights = buildInsights(S, k, low, audit, top, customers);

            var html = U.head('Dashboard', 'Everything that moves the shelf, on one screen',
                '<button class="btn btn--sm" id="dashRefresh" type="button">' + A.icon('refresh', 13) + 'Refresh</button>' +
                '<a class="btn btn--sm" href="shop.html" target="_blank" rel="noopener">' + A.icon('externalLink', 13) + 'Open store</a>') +

            '<div class="grid grid--5" style="margin-bottom:16px;">' +
                U.kpi('dollar', 'stat__icon--accent', 'Revenue on record', U.money(k.revenue), 'across the whole order ledger') +
                U.kpi('receipt', '', 'Orders total', String(k.total), 'every status included') +
                U.kpi('truck', 'stat__icon--warn', 'Open orders', String(k.open), 'awaiting packing or delivery') +
                U.kpi('chart', '', 'Average order value', U.money(k.aov), 'revenue / fulfilled orders') +
                U.kpi('warehouse', low.length ? 'stat__icon--danger' : 'stat__icon--ok', 'Low stock', String(low.length), 'at or below the threshold') +
            '</div>' +

            '<div class="grid grid--split" style="margin-bottom:16px;">' +
                '<div class="panel"><div class="panel__head"><div><div class="panel__title">Revenue - last 14 days</div><div class="panel__subtitle">From orders on this device, cancellations excluded</div></div></div>' +
                    '<div class="panel__body">' + App.bars(series) + '</div></div>' +
                '<div class="ai-panel"><div class="ai-panel__head">' + A.icon('sparkles', 13) + '<span class="ai-panel__title">Copilot briefing</span><span class="badge ' + (stat.mode === 'live' ? 'badge--ai' : 'badge--neutral') + '" style="margin-left:auto;">' + (stat.mode === 'live' ? 'LIVE' : 'OFFLINE STUDIO') + '</span></div>' +
                    '<div class="ai-panel__body">' + insights +
                    '<div class="ai-actions" style="margin-top:12px;"><button class="ai-chip" id="dashCopilot" type="button">' + A.icon('sparkles', 12) + 'Ask the Copilot</button>' +
                    '<a class="ai-chip" href="#/ai-studio">' + A.icon('wand', 12) + 'Open AI Studio</a></div>' +
                    '</div></div>' +
            '</div>' +

            '<div class="grid grid--split" style="margin-bottom:16px;">' +
                '<div class="panel"><div class="panel__head"><div><div class="panel__title">Fulfilment pipeline</div><div class="panel__subtitle">Click a stage to open the orders board</div></div><div class="panel__actions"><a class="btn btn--sm" href="#/orders">All orders</a></div></div>' +
                    '<div class="panel__body pipeline" id="dashPipeline"></div></div>' +
                '<div class="panel"><div class="panel__head"><div><div class="panel__title">Top products</div><div class="panel__subtitle">By units sold from real order data</div></div></div>' +
                    '<div class="panel__body" id="dashTop"></div></div>' +
            '</div>' +

            '<div class="grid grid--split">' +
                '<div class="panel"><div class="panel__head"><div><div class="panel__title">Recent orders</div></div><div class="panel__actions"><a class="btn btn--sm" href="#/orders">Open orders module</a></div></div>' +
                    '<div class="table-wrap" id="dashRecent"></div></div>' +
                '<div class="panel"><div class="panel__head"><div><div class="panel__title">Low stock watchlist</div><div class="panel__subtitle">Threshold: ' + String(S.settings().lowStock) + ' units - one tap restocks</div></div></div>' +
                    '<div class="panel__body panel__body--flush" id="dashLow"></div></div>' +
            '</div>';

            root.innerHTML = html;

            /* pipeline */
            var pipe = root.querySelector('#dashPipeline');
            var stages = ['processing', 'packed', 'shipped', 'delivered'];
            var pipeHtml = '';
            for (var i = 0; i < stages.length; i++) {
                var c = k.byStatus[stages[i]] || 0;
                pipeHtml += '<a class="pipeline__step' + (c ? ' is-current' : '') + '" href="#/orders" style="text-decoration:none;">' + stages[i] + ' - ' + c + '</a>';
                if (i < stages.length - 1) pipeHtml += '<span class="pipeline__arrow">&#8594;</span>';
            }
            pipeHtml += '<span class="pipeline__arrow" style="margin-left:8px;">|</span>';
            pipeHtml += '<span class="badge badge--danger">cancelled - ' + (k.byStatus.cancelled || 0) + '</span>';
            pipeHtml += '<span class="badge badge--neutral">refunded - ' + (k.byStatus.refunded || 0) + '</span>';
            pipe.innerHTML = pipeHtml;

            /* top products */
            var topEl = root.querySelector('#dashTop');
            if (!top.length) topEl.innerHTML = V.util.empty('package', 'No sales data yet', 'Orders appear here the moment customers start checking out.');
            else {
                var rows = [], maxU = top[0].units || 1;
                for (var t = 0; t < top.length; t++) {
                    rows.push({ label: top[t].name, sub: 'x' + top[t].units, value: V.util.money(top[t].revenue), pct: (top[t].units / maxU) * 100 });
                }
                topEl.innerHTML = App.barList(rows);
            }

            /* recent orders */
            var rec = root.querySelector('#dashRecent');
            if (!recent.length) rec.innerHTML = V.util.empty('receipt', 'No orders yet', 'The storefront seeds two demo orders automatically on first visit.');
            else {
                var rowsHtml = '<table class="table table--compact"><thead><tr><th>Order</th><th>Customer</th><th class="num">Total</th><th>Status</th><th>Placed</th></tr></thead><tbody>';
                for (var r = 0; r < recent.length; r++) {
                    var o = recent[r];
                    rowsHtml += '<tr><td class="mono-id">' + V.util.esc(o.id) + '</td><td>' + V.util.esc((o.shipping && o.shipping.name) || 'Guest') + '</td>' +
                        '<td class="num">' + V.util.money(o.total) + '</td><td>' + V.util.statusBadge(o.status) + '</td><td class="fs-sm t-mute">' + App.ago(o.date) + '</td></tr>';
                }
                rec.innerHTML = rowsHtml + '</tbody></table>';
            }

            /* low stock watchlist */
            var lowEl = root.querySelector('#dashLow');
            if (!low.length) lowEl.innerHTML = '<div class="panel__body"><div class="t-body">Everything is above the threshold. The shelf is healthy.</div></div>';
            else {
                var lh = '<table class="table table--compact"><thead><tr><th>Product</th><th class="num">Stock</th><th></th></tr></thead><tbody>';
                for (var lv = 0; lv < Math.min(6, low.length); lv++) {
                    var pl = low[lv];
                    lh += '<tr><td><div class="table__primary">' + V.util.esc(pl.name) + '</div><div class="table__secondary">#' + pl.id + ' - ' + V.util.money(pl.price) + '</div></td>' +
                        '<td class="num"><span class="badge ' + (pl._stock === 0 ? 'badge--danger' : 'badge--warn') + '">' + pl._stock + '</span></td>' +
                        '<td><div class="cell-actions"><button class="btn btn--sm" data-restock="' + pl.id + '" type="button">+12</button></div></td></tr>';
                }
                lowEl.innerHTML = lh + '</tbody></table>';
                lowEl.addEventListener('click', function (e) {
                    var b = e.target.closest('[data-restock]');
                    if (!b) return;
                    var id = b.getAttribute('data-restock');
                    var p = S.product(id);
                    S.setStock(id, (p._stock || 0) + 12);
                    App.toast(p.name + ' restocked to ' + S.product(id)._stock + ' units', 'ok', 'Inventory');
                    ctx.refresh();
                });
            }

            root.querySelector('#dashCopilot').addEventListener('click', function () { App.copilot(); });
            root.querySelector('#dashRefresh').addEventListener('click', function () { ctx.refresh(); App.toast('Dashboard recomputed from live data', 'ok'); });
        }
    };

    function buildInsights(S, k, low, audit, top, customers) {
        var items = [];
        var fmtI = window.TrendaryoAdmin.icon;
        function note(color, icon, text) {
            return '<div class="ai-note" style="margin-bottom:8px;"><span style="color:' + color + ';flex:0 0 14px;margin-top:2px;">' + fmtI(icon, 14) + '</span><div>' + text + '</div></div>';
        }
        if (k.stuck.length) {
            items.push(note('var(--warn)', 'activity', '<b>' + k.stuck.length + ' order' + (k.stuck.length > 1 ? 's' : '') + ' stuck in Processing</b> for 3+ days. Advance them in the orders board before customers ask.'));
        }
        if (low.length) {
            items.push(note('var(--warn)', 'warehouse', '<b>' + low.length + ' product' + (low.length > 1 ? 's' : '') + ' at or below the stock threshold</b>. The dashboard watchlist restocks in one tap.'));
        }
        if (audit.missing + audit.partial > 0) {
            items.push(note('var(--ai)', 'sparkles', '<b>' + (audit.missing + audit.partial) + ' products lack a full SEO package</b>. AI Studio can autofill the whole shelf in one pass.'));
        }
        if (top.length) {
            var share = k.revenue ? Math.round((top[0].revenue / k.revenue) * 100) : 0;
            items.push(note('var(--ok)', 'check', '<b>' + V.util.esc(top[0].name) + '</b> leads the shelf with ' + top[0].units + ' units' + (share > 50 ? ' and ' + share + '% of all revenue - watch the dependency.' : '.')));
        }
        var lost = (k.byStatus.cancelled || 0) + (k.byStatus.refunded || 0);
        if (k.total && lost / k.total > 0.2) {
            items.push(note('var(--danger)', 'x', '<b>' + Math.round((lost / k.total) * 100) + '% of orders end cancelled or refunded.</b> Worth a look at delivery times and product pages.'));
        }
        if (!items.length) {
            items.push(note('var(--ok)', 'check', 'Nothing needs attention. Stock healthy, pipeline moving, SEO covered. The Copilot is one Ctrl+K away.'));
        }
        return items.join('');
    }

    /* ================================================================
       ANALYTICS
       ================================================================ */
    V.analytics = {
        title: 'Analytics',
        icon: 'chart',
        sub: 'What the ledger says - revenue, mix and momentum',
        render: function (root, ctx) {
            var S = ctx.S, App = ctx.App, A = ctx.A, U = V.util;
            var k = S.orderKpis();
            var series = S.revenueSeries(30);
            var top = S.topProducts(6);
            var customers = S.customers();
            var repeat = 0, ci, totalC = customers.length;
            for (ci = 0; ci < totalC; ci++) if (customers[ci].orders > 1) repeat++;
            var lost = (k.byStatus.cancelled || 0) + (k.byStatus.refunded || 0);
            var lostPct = k.total ? Math.round((lost / k.total) * 100) : 0;
            var catRev = categoryRevenue(S);
            var peak = null, pi;
            for (pi = 0; pi < series.length; pi++) if (!peak || series[pi].value > peak.value) peak = series[pi];

            var html = U.head('Analytics', 'Computed from the order ledger on this device - no sampling, no guessing',
                '<button class="btn btn--sm" id="anExport" type="button">' + A.icon('download', 13) + 'Export orders CSV</button>') +

            '<div class="grid grid--5" style="margin-bottom:16px;">' +
                U.kpi('package', 'stat__icon--accent', 'Units sold', String(k.units), 'cancellations excluded') +
                U.kpi('check', 'stat__icon--ok', 'Delivered', String(k.byStatus.delivered || 0), 'completed journeys') +
                U.kpi('x', lostPct > 20 ? 'stat__icon--danger' : 'stat__icon--warn', 'Lost rate', lostPct + '%', 'cancelled + refunded share') +
                U.kpi('users', '', 'Repeat customers', String(repeat), 'of ' + totalC + ' on the ledger') +
                U.kpi('flame', peak && peak.value ? 'stat__icon--accent' : '', 'Peak day', peak && peak.value ? U.money(peak.value) : '-', peak ? peak.label : 'no sales yet') +
            '</div>' +

            '<div class="grid grid--split" style="margin-bottom:16px;">' +
                '<div class="panel"><div class="panel__head"><div><div class="panel__title">Revenue - last 30 days</div><div class="panel__subtitle">Daily totals from real orders</div></div></div>' +
                    '<div class="panel__body">' + App.bars(series) + '</div></div>' +
                '<div class="panel"><div class="panel__head"><div><div class="panel__title">Order status mix</div><div class="panel__subtitle">Where every order in the ledger sits</div></div></div>' +
                    '<div class="panel__body">' + App.donut(statusSegments(k)) + '</div></div>' +
            '</div>' +

            '<div class="grid grid--split">' +
                '<div class="panel"><div class="panel__head"><div><div class="panel__title">Revenue by category</div><div class="panel__subtitle">From items in fulfilled orders</div></div></div>' +
                    '<div class="panel__body">' + (catRev.length ? categoryBars(App, catRev, k.revenue) : U.empty('tags', 'No sales data yet', 'Category mix appears after the first fulfilled order.')) + '</div></div>' +
                '<div class="panel"><div class="panel__head"><div><div class="panel__title">Top products by revenue</div></div></div>' +
                    '<div class="panel__body">' + (top.length ? productBars(App, top, k.revenue) : U.empty('package', 'No sales data yet', 'Ranking appears after the first fulfilled order.')) + '</div></div>' +
            '</div>' +

            '<div class="ai-note" style="margin-top:16px;"><span style="color:var(--ai);flex:0 0 14px;margin-top:2px;">' + A.icon('sparkles', 14) + '</span><div><b>Make it actionable:</b> ask the Copilot (Ctrl+K) what changed week over week, or open <a href="#/ai-studio" class="text-ai">AI Studio</a> to draft a campaign around the top product.</div></div>';

            root.innerHTML = html;

            root.querySelector('#anExport').addEventListener('click', function () {
                var rows = [];
                var orders = S.orders();
                for (var i = 0; i < orders.length; i++) {
                    var o = orders[i];
                    rows.push({ id: o.id, date: (o.date || '').slice(0, 10), status: o.status, customer: (o.shipping && o.shipping.name) || '', city: (o.shipping && o.shipping.city) || '', country: (o.shipping && o.shipping.country) || '', items: (o.items || []).length, total: o.total });
                }
                if (rows.length) App.csv(rows, 'trendaryo-orders');
                else App.toast('No orders to export yet', 'warn');
            });
        }
    };

    function statusSegments(k) {
        var keys = ['processing', 'packed', 'shipped', 'delivered', 'cancelled', 'refunded'];
        var labels = { processing: 'Processing', packed: 'Packed', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled', refunded: 'Refunded' };
        var out = [];
        for (var i = 0; i < keys.length; i++) {
            var n = k.byStatus[keys[i]] || 0;
            if (n > 0) out.push({ label: labels[keys[i]], value: n });
        }
        if (!out.length) out.push({ label: 'No orders yet', value: 1 });
        return out;
    }

    function categoryRevenue(S) {
        var P = window.TrendaryoProducts;
        var orders = S.orders();
        var map = {}, i, j;
        for (i = 0; i < orders.length; i++) {
            var o = orders[i];
            if (o.status === 'cancelled' || o.status === 'refunded') continue;
            var items = o.items || [];
            for (j = 0; j < items.length; j++) {
                var p = S.product(items[j].id);
                var cat = (p && P && P.categoryOf) ? P.categoryOf(p) : 'Other';
                map[cat] = (map[cat] || 0) + (items[j].price || 0) * (items[j].qty || 1);
            }
        }
        var arr = [], key;
        for (key in map) arr.push({ label: key, revenue: map[key] });
        arr.sort(function (a, b) { return b.revenue - a.revenue; });
        return arr;
    }

    function categoryBars(App, catRev, total) {
        var rows = [], i;
        for (i = 0; i < catRev.length; i++) {
            rows.push({ label: catRev[i].label, value: App.money(catRev[i].revenue), pct: total ? (catRev[i].revenue / total) * 100 : 0 });
        }
        return App.barList(rows);
    }

    function productBars(App, top, total) {
        var rows = [], i;
        for (i = 0; i < top.length; i++) {
            rows.push({ label: top[i].name, sub: 'x' + top[i].units + ' units', value: App.money(top[i].revenue), pct: total ? (top[i].revenue / total) * 100 : 0 });
        }
        return App.barList(rows);
    }

})();
