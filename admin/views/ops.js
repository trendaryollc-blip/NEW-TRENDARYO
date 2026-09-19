/**
 * TRENDARYO ADMIN - Operations views (Orders + Customers)
 * Orders ride the same ledger the storefront checkout writes to.
 * The board supports drag-and-drop between fulfilment stages.
 */
(function () {
    'use strict';

    var V = window.TrendaryoAdminViews;
    var U = V.util;

    function app() { return window.TrendaryoAdminApp; }
    function A() { return window.TrendaryoAdmin; }

    var stO = { q: '', status: '', sort: 'new', mode: 'table' };

    function nextStage(S, s) {
        var i = S.STATUS_FLOW.indexOf(s);
        return (i >= 0 && i < S.STATUS_FLOW.length - 1) ? S.STATUS_FLOW[i + 1] : null;
    }

    /* ================================================================
       ORDERS
       ================================================================ */
    V.orders = {
        title: 'Orders',
        icon: 'receipt',
        sub: 'The fulfilment board - drag cards between stages or work the table',
        render: function (root, ctx) {
            var S = ctx.S, App = ctx.App;
            var k = S.orderKpis();

            root.innerHTML = U.head('Orders', k.total + ' orders on the ledger - ' + k.open + ' open right now',
                '<button class="btn btn--sm" id="orExport" type="button">' + A().icon('download', 13) + 'Export CSV</button>') +

            '<div class="grid grid--5" style="margin-bottom:16px;">' +
                U.kpi('dollar', 'stat__icon--accent', 'Revenue on record', U.money(k.revenue), 'cancellations excluded') +
                U.kpi('truck', 'stat__icon--warn', 'Open', String(k.open), 'in the pipeline') +
                U.kpi('activity', k.stuck.length ? 'stat__icon--danger' : 'stat__icon--ok', 'Stuck 3+ days', String(k.stuck.length), 'processing with no movement') +
                U.kpi('check', 'stat__icon--ok', 'Delivered', String(k.byStatus.delivered || 0), 'completed') +
                U.kpi('package', '', 'Units', String(k.units), 'items across all orders') +
            '</div>' +

            '<div class="panel"><div class="toolbar">' +
                '<div class="search">' + A().icon('search', 14) + '<input id="orQ" type="text" placeholder="Search order id or customer..."></div>' +
                '<div class="chip-row" id="orStatus">' +
                    '<button class="chip is-active" data-st="">All</button>' +
                    '<button class="chip" data-st="processing">Processing</button>' +
                    '<button class="chip" data-st="packed">Packed</button>' +
                    '<button class="chip" data-st="shipped">Shipped</button>' +
                    '<button class="chip" data-st="delivered">Delivered</button>' +
                    '<button class="chip" data-st="cancelled">Cancelled</button>' +
                    '<button class="chip" data-st="refunded">Refunded</button>' +
                '</div>' +
                '<span class="spacer"></span>' +
                '<div class="subtabs"><button type="button" data-mode="table" class="is-active">Table</button><button type="button" data-mode="board">Board</button></div>' +
            '</div>' +
            '<div id="orBulk" class="bulk-bar" style="display:none;"><span class="bulk-bar__count" id="orBulkN"></span><span class="t-dim">selected</span><span class="spacer"></span>' +
                '<button class="btn btn--primary btn--sm" id="orBulkAdvance" type="button">Advance stage</button>' +
                '<button class="btn btn--danger btn--sm" id="orBulkCancel" type="button">Cancel</button></div>' +
            '<div id="orBody"></div></div>';

            var q = root.querySelector('#orQ');
            q.addEventListener('input', App.debounce(function () { stO.q = q.value; draw(root, ctx); }, 220));
            var chips = root.querySelectorAll('#orStatus .chip');
            for (var ci = 0; ci < chips.length; ci++) {
                chips[ci].addEventListener('click', function () {
                    var all = root.querySelectorAll('#orStatus .chip');
                    for (var x = 0; x < all.length; x++) all[x].classList.remove('is-active');
                    this.classList.add('is-active');
                    stO.status = this.getAttribute('data-st');
                    draw(root, ctx);
                });
            }
            var modes = root.querySelectorAll('[data-mode]');
            for (var mi = 0; mi < modes.length; mi++) {
                modes[mi].addEventListener('click', function () {
                    var all = root.querySelectorAll('[data-mode]');
                    for (var x = 0; x < all.length; x++) all[x].classList.remove('is-active');
                    this.classList.add('is-active');
                    stO.mode = this.getAttribute('data-mode');
                    draw(root, ctx);
                });
            }

            root.querySelector('#orExport').addEventListener('click', function () {
                var rows = [];
                var orders = S.orders();
                for (var i = 0; i < orders.length; i++) {
                    var o = orders[i];
                    rows.push({ id: o.id, date: (o.date || '').slice(0, 10), status: o.status, customer: (o.shipping && o.shipping.name) || '', city: (o.shipping && o.shipping.city) || '', country: (o.shipping && o.shipping.country) || '', items: (o.items || []).length, total: o.total });
                }
                if (rows.length) App.csv(rows, 'trendaryo-orders');
                else App.toast('No orders to export yet', 'warn');
            });

            root.querySelector('#orBulkAdvance').addEventListener('click', function () {
                var ids = bulkSel(root);
                if (!ids.length) return;
                var n = 0, skipped = 0, i;
                for (i = 0; i < ids.length; i++) {
                    var o = S.order(ids[i]);
                    var nx = o ? nextStage(S, o.status) : null;
                    if (nx) { S.setOrderStatus(ids[i], nx); n++; } else skipped++;
                }
                App.toast(n + ' order(s) advanced' + (skipped ? ' - ' + skipped + ' already terminal' : ''), 'ok', 'Orders');
                draw(root, ctx);
                app().badges();
            });
            root.querySelector('#orBulkCancel').addEventListener('click', function () {
                var ids = bulkSel(root);
                if (!ids.length) return;
                App.confirm({ title: 'Cancel ' + ids.length + ' order(s)?', message: '<p class="t-body">Cancelled orders leave the revenue totals immediately. Refunds are handled per your payment processor.</p>', okText: 'Cancel orders', danger: true }).then(function (ok) {
                    if (!ok) return;
                    for (var i = 0; i < ids.length; i++) S.setOrderStatus(ids[i], 'cancelled');
                    App.toast(ids.length + ' order(s) cancelled', 'ok', 'Orders');
                    draw(root, ctx);
                    app().badges();
                });
            });

            draw(root, ctx);
        }
    };

    function filteredOrders(S) {
        var list = S.orders();
        var out = [], i;
        var q = stO.q.trim().toLowerCase();
        for (i = 0; i < list.length; i++) {
            var o = list[i];
            if (q && (String(o.id) + ' ' + ((o.shipping && o.shipping.name) || '')).toLowerCase().indexOf(q) < 0) continue;
            if (stO.status && o.status !== stO.status) continue;
            out.push(o);
        }
        if (stO.sort === 'new') out.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
        else if (stO.sort === 'old') out.sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
        else if (stO.sort === 'high') out.sort(function (a, b) { return (b.total || 0) - (a.total || 0); });
        return out;
    }

    function bulkSel(root) {
        var boxes = root.querySelectorAll('[data-osel]');
        var ids = [];
        for (var i = 0; i < boxes.length; i++) if (boxes[i].checked) ids.push(boxes[i].getAttribute('data-osel'));
        return ids;
    }

    function updateBulk(root, ctx) {
        var n = bulkSel(root).length;
        var bar = root.querySelector('#orBulk');
        if (!bar) return;
        bar.style.display = n ? 'flex' : 'none';
        root.querySelector('#orBulkN').textContent = n;
    }

    function draw(root, ctx) {
        var S = ctx.S, App = ctx.App;
        var body = root.querySelector('#orBody');
        var list = filteredOrders(S);

        if (stO.mode === 'board') {
            var stages = ['processing', 'packed', 'shipped', 'delivered', 'cancelled', 'refunded'];
            var bh = '<div class="kanban" style="padding:16px;">';
            for (var si = 0; si < stages.length; si++) {
                var stage = stages[si];
                var colOrders = [];
                for (var oi = 0; oi < list.length; oi++) if (list[oi].status === stage) colOrders.push(list[oi]);
                bh += '<div class="kanban__col" data-stage="' + stage + '"><div class="kanban__head">' + stage + '<span class="kanban__count">' + colOrders.length + '</span></div><div class="kanban__list">';
                for (var ci = 0; ci < colOrders.length; ci++) {
                    var co = colOrders[ci];
                    bh += '<div class="kanban__card" draggable="true" data-oid="' + U.esc(co.id) + '"><div class="mono-id fs-xs">' + U.esc(co.id) + '</div>' +
                        '<div class="fs-sm fw-600 mt-1 t-truncate">' + U.esc((co.shipping && co.shipping.name) || 'Guest') + '</div>' +
                        '<div class="row row--between mt-1"><span class="fs-xs t-mute">' + App.ago(co.date) + '</span><span class="fs-sm fw-600">' + U.money(co.total) + '</span></div></div>';
                }
                bh += '</div></div>';
            }
            bh += '</div>';
            body.innerHTML = bh;

            var cards = body.querySelectorAll('.kanban__card');
            for (var di = 0; di < cards.length; di++) {
                cards[di].addEventListener('dragstart', function (e) {
                    e.dataTransfer.setData('text/plain', this.getAttribute('data-oid'));
                    this.classList.add('is-dragging');
                });
                cards[di].addEventListener('dragend', function () { this.classList.remove('is-dragging'); });
                cards[di].addEventListener('click', function () { openOrder(ctx, this.getAttribute('data-oid')); });
            }
            var cols = body.querySelectorAll('.kanban__col');
            for (var ki = 0; ki < cols.length; ki++) {
                (function (col) {
                    col.addEventListener('dragover', function (e) { e.preventDefault(); col.classList.add('is-over'); });
                    col.addEventListener('dragleave', function () { col.classList.remove('is-over'); });
                    col.addEventListener('drop', function (e) {
                        e.preventDefault();
                        col.classList.remove('is-over');
                        var oid = e.dataTransfer.getData('text/plain');
                        var stage = col.getAttribute('data-stage');
                        var o = S.order(oid);
                        if (!o || o.status === stage) return;
                        S.setOrderStatus(oid, stage);
                        App.toast(o.id + ' moved to ' + stage, 'ok', 'Orders');
                        app().badges();
                        draw(root, ctx);
                    });
                })(cols[ki]);
            }
            return;
        }

        if (!list.length) {
            body.innerHTML = U.empty('receipt', 'No orders match', 'Adjust the filters, or wait for the storefront to write its first order.');
            return;
        }
        var h = '<div class="table-wrap"><table class="table table--compact"><thead><tr>' +
            '<th style="width:26px;"><label class="check"><input type="checkbox" id="orSelAll"></label></th>' +
            '<th>Order</th><th>Customer</th><th class="num">Items</th><th class="num">Total</th><th>Status</th><th>Placed</th><th></th></tr></thead><tbody>';
        for (var i = 0; i < list.length; i++) {
            var o = list[i];
            var nx = nextStage(S, o.status);
            h += '<tr><td><label class="check"><input type="checkbox" data-osel="' + U.esc(o.id) + '"></label></td>' +
                '<td class="mono-id">' + U.esc(o.id) + '</td>' +
                '<td><div class="table__primary">' + U.esc((o.shipping && o.shipping.name) || 'Guest') + '</div><div class="table__secondary">' + U.esc(((o.shipping && o.shipping.city) || '') + ((o.shipping && o.shipping.country) ? ', ' + o.shipping.country : '')) + '</div></td>' +
                '<td class="num">' + (o.items || []).length + '</td>' +
                '<td class="num fw-600">' + U.money(o.total) + '</td>' +
                '<td>' + U.statusBadge(o.status) + '</td>' +
                '<td class="fs-sm t-mute">' + App.ago(o.date) + '</td>' +
                '<td><div class="cell-actions">' +
                    (nx ? '<button class="btn btn--sm" data-adv="' + U.esc(o.id) + '" type="button" title="Advance to ' + nx + '">' + A().icon('zap', 12) + nx + '</button>' : '') +
                    '<button class="icon-btn" data-view="' + U.esc(o.id) + '" type="button" title="Details">' + A().icon('eye', 14) + '</button>' +
                '</div></td></tr>';
        }
        h += '</tbody></table></div>';
        body.innerHTML = h;

        var selAll = body.querySelector('#orSelAll');
        if (selAll) selAll.addEventListener('change', function () {
            var boxes = body.querySelectorAll('[data-osel]');
            for (var b = 0; b < boxes.length; b++) boxes[b].checked = this.checked;
            updateBulk(root, ctx);
        });
        body.addEventListener('change', function (e) {
            if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-osel')) updateBulk(root, ctx);
        });
        body.addEventListener('click', function (e) {
            var t;
            if ((t = e.target.closest('[data-view]'))) { openOrder(ctx, t.getAttribute('data-view')); return; }
            if ((t = e.target.closest('[data-adv]'))) {
                var aid = t.getAttribute('data-adv');
                var ao = S.order(aid);
                var an = nextStage(S, ao.status);
                S.setOrderStatus(aid, an);
                App.toast(ao.id + ' advanced to ' + an, 'ok', 'Orders');
                app().badges();
                draw(root, ctx);
            }
        });
        updateBulk(root, ctx);
    }

    /* ---------- order detail drawer ---------- */

    function openOrder(ctx, oid) {
        var S = ctx.S, App = ctx.App, A2 = A();
        var o = S.order(oid);
        if (!o) { App.toast('Order not found', 'warn'); return; }
        var stages = S.STATUS_FLOW;
        var curIdx = stages.indexOf(o.status);
        var pipe = '';
        for (var i = 0; i < stages.length; i++) {
            var state = (curIdx >= 0 && i <= curIdx) ? ' is-done' : '';
            if (curIdx >= 0 && i === curIdx) state = ' is-current';
            if (curIdx < 0) state = '';
            pipe += '<span class="pipeline__step' + state + '">' + stages[i] + '</span>';
            if (i < stages.length - 1) pipe += '<span class="pipeline__arrow">&#8594;</span>';
        }
        if (curIdx < 0) {
            pipe += ' <span class="badge badge--danger" style="margin-left:8px;">' + U.esc(o.status) + '</span>';
        }
        var items = o.items || [];
        var itemsHtml = '';
        for (var j = 0; j < items.length; j++) {
            var it = items[j];
            var p = S.product(it.id);
            itemsHtml += '<div class="row row--between" style="padding:8px 0;border-bottom:1px solid var(--line-soft);">' +
                '<div style="min-width:0;"><div class="fs-sm fw-600 t-truncate">' + U.esc(it.name || (p ? p.name : 'Item #' + it.id)) + '</div>' +
                '<div class="fs-xs t-mute">x' + (it.qty || 1) + (p ? ' - ' + U.esc(String(p.price)) + ' each' : '') + '</div></div>' +
                '<div class="fs-sm fw-600">' + U.money((it.price || 0) * (it.qty || 1)) + '</div></div>';
        }
        var hist = (o.history || []).slice().reverse();
        var histHtml = '';
        for (var k2 = 0; k2 < hist.length; k2++) {
            histHtml += '<div class="row row--between fs-sm" style="padding:5px 0;"><span>' + U.esc(hist[k2].status) + '</span><span class="t-mute fs-xs">' + App.dateTime(hist[k2].at) + '</span></div>';
        }
        if (!histHtml) histHtml = '<div class="fs-sm t-mute">No status history recorded.</div>';
        var nx = nextStage(S, o.status);
        var sh = o.shipping || {};

        App.drawer.open({
            title: o.id,
            sub: 'Placed ' + App.dateTime(o.date) + (o.eta ? ' - ETA ' + App.date(o.eta) : ''),
            body: '<div class="pipeline" style="margin-bottom:16px;">' + pipe + '</div>' +
                '<div class="grid grid--2" style="margin-bottom:16px;">' +
                    '<div><div class="t-label" style="margin-bottom:6px;">Ship to</div><div class="fs-sm">' + U.esc(sh.name || '-') + '<br>' + U.esc(sh.address || '') + '<br>' + U.esc((sh.city || '') + (sh.country ? ', ' + sh.country : '')) + '</div></div>' +
                    '<div><div class="t-label" style="margin-bottom:6px;">Totals</div><div class="fs-sm">Items: <b>' + items.length + '</b><br>Units: <b>' + (o.items || []).reduce(function (s, x) { return s + (x.qty || 1); }, 0) + '</b><br>Total: <b class="text-accent">' + U.money(o.total) + '</b></div></div>' +
                '</div>' +
                '<div class="t-label" style="margin-bottom:6px;">Items</div>' + itemsHtml +
                '<div class="t-label" style="margin:16px 0 6px;">Status history</div><div class="panel" style="background:var(--surface-2);"><div class="panel__body panel__body--tight">' + histHtml + '</div></div>',
            foot: '<span class="spacer"></span>' +
                (o.status !== 'cancelled' && o.status !== 'refunded' && o.status !== 'delivered' ? '<button class="btn btn--danger btn--sm" data-oc type="button">Cancel</button>' : '') +
                (o.status !== 'cancelled' && o.status !== 'refunded' ? '<button class="btn btn--sm" data-orf type="button">Mark refunded</button>' : '') +
                (nx ? '<button class="btn btn--primary" data-onx type="button">' + A2.icon('zap', 13) + 'Advance to ' + nx + '</button>' : '<span class="badge badge--ok">Journey complete</span>'),
            onMount: function (root) {
                var nxBtn = root.querySelector('[data-onx]');
                if (nxBtn) nxBtn.addEventListener('click', function () {
                    S.setOrderStatus(o.id, nx);
                    App.toast(o.id + ' advanced to ' + nx, 'ok', 'Orders');
                    App.drawer.close();
                    app().badges();
                    if (app().current === 'orders') App.route();
                });
                var cBtn = root.querySelector('[data-oc]');
                if (cBtn) cBtn.addEventListener('click', function () {
                    App.confirm({ title: 'Cancel this order?', message: '<p class="t-body"><b>' + U.esc(o.id) + '</b> leaves the revenue totals immediately.</p>', okText: 'Cancel order', danger: true }).then(function (ok) {
                        if (!ok) return;
                        S.setOrderStatus(o.id, 'cancelled');
                        App.toast(o.id + ' cancelled', 'ok', 'Orders');
                        App.drawer.close();
                        app().badges();
                        if (app().current === 'orders') App.route();
                    });
                });
                var rBtn = root.querySelector('[data-orf]');
                if (rBtn) rBtn.addEventListener('click', function () {
                    App.confirm({ title: 'Mark as refunded?', message: '<p class="t-body">Records the refund on the ledger. Process the actual money in your payment dashboard.</p>', okText: 'Mark refunded' }).then(function (ok) {
                        if (!ok) return;
                        S.setOrderStatus(o.id, 'refunded');
                        App.toast(o.id + ' marked refunded', 'ok', 'Orders');
                        App.drawer.close();
                        if (app().current === 'orders') App.route();
                    });
                });
            }
        });
    }

    /* ================================================================
       CUSTOMERS
       ================================================================ */
    var stC = { q: '', source: '' };

    V.customers = {
        title: 'Customers',
        icon: 'users',
        sub: 'One ledger from every signal - orders, newsletter, accounts and admin contacts',
        render: function (root, ctx) {
            var S = ctx.S, App = ctx.App;
            var list = S.customers();
            var totalSpend = 0, repeat = 0, i;
            for (i = 0; i < list.length; i++) { totalSpend += list[i].spend; if (list[i].orders > 1) repeat++; }
            var avgSpend = list.length ? totalSpend / list.length : 0;

            root.innerHTML = U.head('Customers', list.length + ' contacts on the ledger',
                '<button class="btn btn--sm" id="cuExport" type="button">' + A().icon('download', 13) + 'Export</button>' +
                '<button class="btn btn--primary btn--sm" id="cuAdd" type="button">' + A().icon('plus', 13) + 'Add customer</button>') +

            '<div class="grid grid--5" style="margin-bottom:16px;">' +
                U.kpi('users', 'stat__icon--accent', 'Contacts', String(list.length), 'every source merged') +
                U.kpi('dollar', '', 'Total spend', U.money(totalSpend), 'from matched orders') +
                U.kpi('chart', '', 'Average spend', U.money(avgSpend), 'per contact') +
                U.kpi('award', 'stat__icon--ok', 'Repeat buyers', String(repeat), 'more than one order') +
                U.kpi('mail', '', 'Newsletter', String(S.newsletter().length), 'subscribers on the list') +
            '</div>' +

            '<div class="panel"><div class="toolbar">' +
                '<div class="search">' + A().icon('search', 14) + '<input id="cuQ" type="text" placeholder="Search name, email, city..."></div>' +
                '<select class="filter-select" id="cuSource"><option value="">All sources</option><option value="orders">Has orders</option><option value="newsletter">Newsletter</option><option value="account">Signed-in account</option><option value="demo">Demo contacts</option></select>' +
                '<span class="filter-count" id="cuCount"></span></div>' +
                '<div class="table-wrap" id="cuTable"></div></div>';

            root.querySelector('#cuQ').addEventListener('input', App.debounce(function () { stC.q = this.value; drawC(root, ctx); }, 220));
            root.querySelector('#cuSource').addEventListener('change', function () { stC.source = this.value; drawC(root, ctx); });
            root.querySelector('#cuAdd').addEventListener('click', function () { addCustomerModal(ctx); });
            root.querySelector('#cuExport').addEventListener('click', function () {
                var rows = [];
                var all = S.customers();
                for (var j = 0; j < all.length; j++) {
                    rows.push({ name: all[j].name, email: all[j].email, city: all[j].city, country: all[j].country, orders: all[j].orders, spend: all[j].spend, sources: all[j].sources.join('|'), lastOrder: (all[j].lastAt || '').slice(0, 10) });
                }
                if (rows.length) App.csv(rows, 'trendaryo-customers');
                else App.toast('No contacts yet', 'warn');
            });

            drawC(root, ctx);
        }
    };

    function drawC(root, ctx) {
        var S = ctx.S, App = ctx.App;
        var all = S.customers();
        var list = [], i;
        var q = stC.q.trim().toLowerCase();
        for (i = 0; i < all.length; i++) {
            var c = all[i];
            if (q && (c.name + ' ' + c.email + ' ' + c.city).toLowerCase().indexOf(q) < 0) continue;
            if (stC.source && c.sources.indexOf(stC.source) < 0) continue;
            list.push(c);
        }
        root.querySelector('#cuCount').textContent = list.length + ' of ' + all.length;
        var el = root.querySelector('#cuTable');
        if (!list.length) {
            el.innerHTML = U.empty('users', 'No contacts match', 'Adjust the filters - or wait for the first order to land.');
            return;
        }
        var SRC = { demo: 'badge--neutral', newsletter: 'badge--accent', account: 'badge--info', orders: 'badge--ok', admin: 'badge--accent' };
        var h = '<table class="table table--compact"><thead><tr><th>Contact</th><th>Sources</th><th>Location</th><th class="num">Orders</th><th class="num">Spend</th><th>Last order</th><th></th></tr></thead><tbody>';
        for (i = 0; i < list.length; i++) {
            var c2 = list[i];
            var label = c2.name || c2.email || 'Unknown';
            var ini = (c2.name || c2.email || '?').replace(/@.*$/, '').slice(0, 2).toUpperCase();
            var badges = '';
            for (var j2 = 0; j2 < c2.sources.length; j2++) badges += '<span class="badge ' + (SRC[c2.sources[j2]] || 'badge--neutral') + '" style="margin-right:4px;">' + c2.sources[j2] + '</span>';
            var removable = String(c2.id).indexOf('nl-') !== 0 && String(c2.id).indexOf('buyer-') !== 0 && String(c2.id) !== 'acct';
            h += '<tr><td><div class="table__user"><span class="avatar">' + U.esc(ini) + '</span><div style="min-width:0;"><div class="table__primary t-truncate" style="max-width:220px;">' + U.esc(label) + '</div>' +
                (c2.email ? '<div class="table__secondary">' + U.esc(c2.email) + '</div>' : '') + '</div></div></td>' +
                '<td>' + badges + '</td>' +
                '<td class="fs-sm">' + U.esc((c2.city || '-') + (c2.country ? ', ' + c2.country : '')) + '</td>' +
                '<td class="num">' + c2.orders + '</td>' +
                '<td class="num fw-600">' + U.money(c2.spend) + '</td>' +
                '<td class="fs-sm t-mute">' + (c2.lastAt ? App.ago(c2.lastAt) : '-') + '</td>' +
                '<td><div class="cell-actions">' +
                    '<button class="icon-btn" data-view="' + U.esc(c2.id) + '" type="button" title="Details">' + A().icon('eye', 14) + '</button>' +
                    (removable ? '<button class="icon-btn" data-del="' + U.esc(c2.id) + '" type="button" title="Remove contact">' + A().icon('trash', 14) + '</button>' : '') +
                '</div></td></tr>';
        }
        el.innerHTML = h + '</tbody></table>';

        el.addEventListener('click', function (e) {
            var t;
            if ((t = e.target.closest('[data-del]'))) {
                var del = t.getAttribute('data-del');
                App.confirm({ title: 'Remove contact?', message: '<p class="t-body">The contact leaves the ledger. Order history and newsletter status are untouched.</p>', okText: 'Remove', danger: true }).then(function (ok) {
                    if (!ok) return;
                    S.removeCustomer(del);
                    App.toast('Contact removed', 'ok', 'Customers');
                    drawC(root, ctx);
                });
                return;
            }
            if ((t = e.target.closest('[data-view]'))) {
                var vid = t.getAttribute('data-view');
                for (var k = 0; k < all.length; k++) if (String(all[k].id) === String(vid)) { openCustomer(ctx, all[k]); break; }
            }
        });
    }

    function openCustomer(ctx, c) {
        var S = ctx.S, App = ctx.App, A2 = A();
        var orders = S.customerOrders(c.name, c.city);
        var oh = '';
        for (var i = 0; i < orders.length; i++) {
            var o = orders[i];
            oh += '<div class="row row--between" style="padding:8px 0;border-bottom:1px solid var(--line-soft);cursor:pointer;" data-oid="' + U.esc(o.id) + '">' +
                '<div><div class="mono-id fs-xs">' + U.esc(o.id) + '</div><div class="fs-xs t-mute">' + App.ago(o.date) + '</div></div>' +
                '<div style="text-align:right;">' + U.statusBadge(o.status) + '<div class="fs-sm fw-600 mt-1">' + U.money(o.total) + '</div></div></div>';
        }
        if (!oh) oh = '<div class="fs-sm t-mute">No orders matched to this contact yet.</div>';
        var top = S.topProducts(1);
        var srcBadges = '';
        for (var j = 0; j < c.sources.length; j++) srcBadges += '<span class="badge badge--accent" style="margin-right:4px;">' + c.sources[j] + '</span>';

        App.drawer.open({
            title: c.name || c.email || 'Contact',
            sub: (c.email || 'no email on file') + (c.city ? ' - ' + c.city : ''),
            body: '<div class="row" style="margin-bottom:16px;"><span class="avatar avatar--lg avatar--accent">' + U.esc((c.name || c.email || '?').replace(/@.*$/, '').slice(0, 2).toUpperCase()) + '</span>' +
                '<div>' + srcBadges + (c.note ? '<div class="fs-xs t-mute mt-1">' + U.esc(c.note) + '</div>' : '') + '</div></div>' +
                '<div class="grid grid--3" style="margin-bottom:16px;"><div><div class="t-label">Orders</div><div class="t-title">' + c.orders + '</div></div>' +
                '<div><div class="t-label">Spend</div><div class="t-title">' + U.money(c.spend) + '</div></div>' +
                '<div><div class="t-label">Last order</div><div class="t-title" style="font-size:14px;">' + (c.lastAt ? App.ago(c.lastAt) : '-') + '</div></div></div>' +
                '<div class="t-label" style="margin-bottom:6px;">Matched orders</div><div class="panel" style="background:var(--surface-2);"><div class="panel__body panel__body--tight">' + oh + '</div></div>',
            foot: '<span class="spacer"></span>' +
                (c.email ? '<button class="btn btn--sm" data-nl type="button">' + A2.icon('mail', 13) + 'Add to newsletter</button>' : '') +
                '<button class="ai-chip" type="button" data-outreach>' + A2.icon('sparkles', 12) + 'Draft outreach email</button>',
            onMount: function (root) {
                root.addEventListener('click', function (e) {
                    var t = e.target.closest('[data-oid]');
                    if (t) openOrder(ctx, t.getAttribute('data-oid'));
                });
                var nlBtn = root.querySelector('[data-nl]');
                if (nlBtn) nlBtn.addEventListener('click', function () {
                    if (S.newsletterAdd(c.email)) App.toast(c.email + ' added to the newsletter', 'ok', 'Customers');
                    else App.toast('Already on the list', 'info', 'Customers');
                });
                var outBtn = root.querySelector('[data-outreach]');
                if (outBtn) outBtn.addEventListener('click', function () {
                    outBtn.classList.add('is-busy');
                    ctx.AI.run('emailCampaign', { goal: 're-engage ' + (c.name || c.email) + ' with something worth coming back for', product: top.length ? top[0].name : '' }).then(function (res) {
                        outBtn.classList.remove('is-busy');
                        V.util.aiReview({ title: 'Outreach draft for ' + (c.name || c.email), meta: res.provider + ' - ' + res.ms + 'ms', text: res.text, applyText: 'Copy email', onApply: function () { try { navigator.clipboard.writeText(res.text); App.toast('Email copied', 'ok'); } catch (e2) { App.toast('Copy failed', 'warn'); } }, onRedo: function (done) { ctx.AI.run('emailCampaign', { goal: 're-engage ' + (c.name || c.email) }, { silent: true }).then(function (r2) { done(r2.text); }); } });
                    }, function () { outBtn.classList.remove('is-busy'); App.toast('Generation failed', 'danger', 'AI'); });
                });
            }
        });
    }

    function addCustomerModal(ctx) {
        var App = ctx.App;
        var wrap = document.createElement('div');
        wrap.className = 'modal is-open';
        wrap.innerHTML = '<div class="modal__dialog modal__dialog--sm"><div class="modal__head"><div><div class="modal__title">Add customer</div><div class="modal__sub">A contact on the admin ledger</div></div>' +
            '<button class="modal__close" type="button" data-x>' + A().icon('x', 15) + '</button></div><div class="modal__body">' +
            '<div class="field"><label class="field__label">Name</label><input class="input" id="acName"></div>' +
            '<div class="field"><label class="field__label">Email</label><input class="input input--mono" id="acEmail" type="email"></div>' +
            '<div class="field-row"><div class="field"><label class="field__label">City</label><input class="input" id="acCity"></div><div class="field"><label class="field__label">Country</label><input class="input" id="acCountry"></div></div>' +
            '<div class="field"><label class="field__label">Note</label><input class="input" id="acNote" placeholder="Optional"></div>' +
            '</div><div class="modal__foot"><span class="spacer"></span><button class="btn" type="button" data-dc>Cancel</button><button class="btn btn--primary" type="button" data-ok>Add contact</button></div></div>';
        document.body.appendChild(wrap);
        wrap.addEventListener('click', function (e) {
            if (e.target === wrap || e.target.closest('[data-x]') || e.target.closest('[data-dc]')) { wrap.remove(); return; }
            if (e.target.closest('[data-ok]')) {
                var name = wrap.querySelector('#acName').value.trim();
                var email = wrap.querySelector('#acEmail').value.trim();
                if (!name && !email) { App.toast('Give at least a name or an email', 'warn'); return; }
                ctx.S.addCustomer({ name: name, email: email, city: wrap.querySelector('#acCity').value.trim(), country: wrap.querySelector('#acCountry').value.trim(), note: wrap.querySelector('#acNote').value.trim() });
                App.toast('Contact added', 'ok', 'Customers');
                wrap.remove();
                App.route();
            }
        });
    }

})();
