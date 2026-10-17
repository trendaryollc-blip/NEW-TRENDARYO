/**
 * TRENDARYO ADMIN - Suppliers (CJ Dropshipping)
 * Import products from CJ and forward paid orders for fulfillment.
 */
(function () {
    'use strict';

    var V = window.TrendaryoAdminViews;
    var U = V.util;

    function app() { return window.TrendaryoAdminApp; }
    function A() { return window.TrendaryoAdmin; }

    var st = { configured: false, email: '', markup: 2, autoFulfill: false, q: '', results: [], loading: false, searching: false, err: '', syncMsg: '' };

    function loadSettings(root) {
        window.API.request('/admin/supplier').then(function (res) {
            var d = (res && res.data) || {};
            st.configured = !!d.configured;
            st.email = d.email || '';
            st.markup = d.markup || 2;
            st.autoFulfill = !!d.autoFulfill;
            draw(root);
        }, function () { /* keep defaults */ });
    }

    function saveSettings(root) {
        var email = root.querySelector('#cjEmail').value.trim();
        var apiKey = root.querySelector('#cjKey').value.trim();
        var markup = parseFloat(root.querySelector('#cjMarkup').value) || 2;
        var autoFulfill = root.querySelector('#cjAuto').checked;
        window.API.request('/admin/supplier', { method: 'PUT', body: { email: email, apiKey: apiKey || undefined, markup: markup, autoFulfill: autoFulfill } }).then(function () {
            st.configured = true;
            app().toast('CJ settings saved', 'ok', 'Suppliers');
            draw(root);
        }, function (err) {
            app().toast((err && err.message) || 'Save failed', 'danger', 'Suppliers');
        });
    }

    function search(root) {
        var q = root.querySelector('#cjQ').value.trim();
        if (!q) return;
        st.searching = true; st.q = q; st.err = ''; drawResults(root);
        window.API.request('/admin/supplier-products?q=' + encodeURIComponent(q)).then(function (res) {
            st.results = (res && res.data && res.data.products) || [];
            st.searching = false;
            drawResults(root);
        }, function (err) {
            st.searching = false;
            st.err = (err && err.message) || 'Search failed';
            drawResults(root);
        });
    }

    function importProduct(root, p) {
        window.API.request('/admin/supplier-products', { method: 'POST', body: { pid: p.pid, name: p.name, image: p.image, price: p.price, vid: p.vid, category: p.category, markup: st.markup } }).then(function () {
            app().toast('Imported: ' + p.name, 'ok', 'Suppliers');
        }, function (err) {
            app().toast((err && err.message) || 'Import failed', 'danger', 'Suppliers');
        });
    }

    function syncTracking(root) {
        st.syncMsg = 'Syncing...'; drawResults(root);
        window.API.request('/admin/supplier-sync', { method: 'POST' }).then(function (res) {
            var d = (res && res.data) || {};
            st.syncMsg = 'Updated ' + (d.updated || 0) + ' order(s)';
            app().toast(st.syncMsg, 'ok', 'Suppliers');
            drawResults(root);
        }, function (err) {
            st.syncMsg = (err && err.message) || 'Sync failed';
            drawResults(root);
        });
    }

    function drawResults(root) {
        var el = root.querySelector('#cjResults');
        if (!el) return;
        if (st.searching) { el.innerHTML = '<div class="t-dim" style="padding:16px;">Searching CJ...</div>'; return; }
        if (st.err) { el.innerHTML = '<div class="t-dim" style="padding:16px;color:var(--danger,#f66);">' + U.esc(st.err) + '</div>'; return; }
        if (!st.results.length) { el.innerHTML = '<div class="t-dim" style="padding:16px;">No results yet - search above.</div>'; return; }
        var html = '<div class="table-wrap"><table class="table table--compact"><thead><tr><th></th><th>Product</th><th>CJ price</th><th>Your price (x' + st.markup + ')</th><th></th></tr></thead><tbody>';
        for (var i = 0; i < st.results.length; i++) {
            var p = st.results[i];
            var yours = Math.round((p.price || 0) * st.markup * 100) / 100;
            html += '<tr><td><img src="' + U.esc(p.image || '') + '" style="width:44px;height:44px;object-fit:cover;border-radius:6px;"></td>' +
                '<td>' + U.esc(p.name || '') + '</td>' +
                '<td>$' + (p.price || 0).toFixed(2) + '</td>' +
                '<td>$' + yours.toFixed(2) + '</td>' +
                '<td><button class="btn btn--primary btn--sm" data-imp="' + i + '" type="button">Import</button></td></tr>';
        }
        el.innerHTML = html + '</tbody></table></div>';
        el.querySelectorAll('[data-imp]').forEach(function (b) {
            b.addEventListener('click', function () { importProduct(root, st.results[parseInt(b.getAttribute('data-imp'), 10)]); });
        });
    }

    /* ---------- F9: supplier SLA report ---------- */
    var sla = { loading: false, data: null, err: '' };

    function loadSla(root) {
        sla.loading = true; sla.err = ''; drawSla(root);
        window.API.request('/admin/supplier-sla').then(function (res) {
            sla.loading = false;
            sla.data = (res && res.data) || null;
            drawSla(root);
        }, function (err) {
            sla.loading = false;
            sla.err = (err && err.message) || 'Could not load the SLA report';
            drawSla(root);
        });
    }

    function pct(v) { return v == null ? '-' : v + '%'; }
    function day(v) { return v == null ? '-' : v + 'd'; }

    function drawSla(root) {
        var el = root.querySelector('#slaBody');
        if (!el) return;
        if (sla.loading) { el.innerHTML = '<div class="t-dim" style="padding:14px;">Loading SLA report...</div>'; return; }
        if (sla.err) { el.innerHTML = '<div style="padding:14px;color:var(--danger,#f66);">' + U.esc(sla.err) + '</div>'; return; }
        if (!sla.data) { el.innerHTML = '<div class="t-dim" style="padding:14px;">No report yet.</div>'; return; }
        var d = sla.data, t = d.totals || {};
        var h = '<div class="row row--wrap" style="gap:8px;margin-bottom:12px;">' +
            '<span class="badge ' + (t.onTimePct == null ? 'badge--neutral' : (t.onTimePct >= 90 ? 'badge--ok' : (t.onTimePct >= 70 ? 'badge--warn' : 'badge--danger'))) + '">on time ' + pct(t.onTimePct) + '</span>' +
            '<span class="badge badge--neutral">avg ship ' + day(t.avgShipDays) + '</span>' +
            '<span class="badge ' + (t.openBreaches ? 'badge--danger' : 'badge--ok') + '">' + (t.openBreaches || 0) + ' breached</span>' +
            '<span class="badge badge--neutral">lead ' + day(d.defaultLeadDays) + '</span>' +
            '<span class="fs-xs t-mute" style="align-self:center;">' + (t.submitted || 0) + ' forwarded - checked ' + (d.checkedAt ? app().ago(d.checkedAt) : 'just now') + '</span></div>';

        var sups = d.suppliers || [];
        h += '<div class="table-wrap"><table class="table table--compact"><thead><tr><th>Supplier</th><th class="num">Forwarded</th><th class="num">Shipped</th><th class="num">On time</th><th class="num">Avg ship</th><th class="num">Open breaches</th></tr></thead><tbody>';
        if (!sups.length) {
            h += '<tr><td colspan="6" class="t-dim" style="padding:12px;">No forwarded orders yet - nothing to score.</td></tr>';
        }
        for (var i = 0; i < sups.length; i++) {
            var s = sups[i];
            var p = s.onTimePct;
            h += '<tr><td class="fw-600">' + U.esc(s.supplierId === 'unassigned' ? 'Unassigned' : String(s.supplierId)) + '</td>' +
                '<td class="num">' + s.submitted + '</td>' +
                '<td class="num">' + s.shipped + '</td>' +
                '<td class="num">' + (p == null ? '-' : '<span class="badge ' + (p >= 90 ? 'badge--ok' : (p >= 70 ? 'badge--warn' : 'badge--danger')) + '">' + p + '%</span>') + '</td>' +
                '<td class="num">' + day(s.avgShipDays) + '</td>' +
                '<td class="num">' + (s.openBreaches ? '<span class="badge badge--danger">' + s.openBreaches + '</span>' : '0') + '</td></tr>';
        }
        h += '</tbody></table></div>';

        var br = d.openBreaches || [];
        if (br.length) {
            h += '<div class="t-label" style="margin:16px 0 6px;">Breached now</div>' +
                '<div class="table-wrap"><table class="table table--compact"><thead><tr><th>Order</th><th>Status</th><th class="num">Days over</th><th>Deadline</th></tr></thead><tbody>';
            for (var j = 0; j < br.length; j++) {
                var b = br[j];
                h += '<tr><td class="mono-id">' + U.esc(b.orderNumber) + '</td>' +
                    '<td>' + U.statusBadge(b.status) + '</td>' +
                    '<td class="num"><span class="badge badge--danger">' + b.daysOver + 'd over</span></td>' +
                    '<td class="fs-sm t-mute">' + U.esc(b.deadline || '-') + '</td></tr>';
            }
            h += '</tbody></table></div>';
        }
        h += '<div class="fs-xs t-mute" style="margin-top:10px;">Lead time precedence: product lead time, then the supplier-sla-watch rule, then Settings → supplier lead.</div>';
        el.innerHTML = h;
    }

    function draw(root) {
        root.querySelector('#cjEmail').value = st.email;
        root.querySelector('#cjMarkup').value = st.markup;
        root.querySelector('#cjAuto').checked = st.autoFulfill;
        root.querySelector('#cjStatus').innerHTML = st.configured
            ? '<span class="badge badge--ok"><span class="badge__dot"></span>connected</span>'
            : '<span class="badge badge--neutral"><span class="badge__dot"></span>not connected</span>';
        drawResults(root);
    }

    V.suppliers = {
        title: 'Suppliers',
        icon: 'truck',
        sub: 'CJ Dropshipping - import, auto-fulfil, tracking sync and the supplier SLA scorecard',
        render: function (root, ctx) {
            root.innerHTML = U.head('Suppliers', 'CJ Dropshipping integration',
                '<button class="btn btn--sm" id="cjSync" type="button">' + A().icon('refresh', 13) + 'Sync tracking</button>') +

                '<div class="panel" style="margin-bottom:16px;"><div class="panel__head"><h3>CJ account</h3></div><div class="panel__body">' +
                '<p class="t-dim">Get a free API key at <b>CJ Dropshipping → My CJ → Authorization</b>.</p>' +
                '<div class="field"><label class="field__label">Status</label><div id="cjStatus"></div></div>' +
                '<div class="grid grid--3">' +
                '<div class="field"><label class="field__label">CJ email</label><input class="input" id="cjEmail" type="email"></div>' +
                '<div class="field"><label class="field__label">API key</label><input class="input" id="cjKey" type="password" placeholder="leave blank to keep saved key"></div>' +
                '<div class="field"><label class="field__label">Price markup x</label><input class="input" id="cjMarkup" type="number" step="0.1" min="1" value="2"></div>' +
                '</div>' +
                '<label style="display:flex;gap:8px;align-items:center;margin:8px 0;"><input type="checkbox" id="cjAuto"> Auto-forward new paid orders to CJ</label>' +
                '<button class="btn btn--primary btn--sm" id="cjSave" type="button">Save settings</button>' +
                '<span class="t-dim" id="cjSyncMsg" style="margin-left:12px;"></span>' +
                '</div></div>' +

                '<div class="panel" style="margin-bottom:16px;"><div class="panel__head"><h3>Supplier SLA</h3><span class="fs-xs t-mute">lead-time performance across forwarded orders</span></div>' +
                '<div class="panel__body"><div id="slaBody"></div>' +
                '<div style="margin-top:10px;"><button class="btn btn--sm" id="slaReload" type="button">' + A().icon('refresh', 13) + 'Refresh report</button></div>' +
                '</div></div>' +

                '<div class="panel"><div class="panel__head"><h3>Import products from CJ</h3></div><div class="panel__body">' +
                '<div class="toolbar"><div class="search">' + A().icon('search', 14) + '<input id="cjQ" type="text" placeholder="Search CJ catalog..."></div>' +
                '<button class="btn btn--sm" id="cjSearch" type="button">Search</button></div>' +
                '<div id="cjResults" style="margin-top:12px;"></div>' +
                '</div></div>';

            root.querySelector('#cjSave').addEventListener('click', function () { saveSettings(root); });
            root.querySelector('#cjSearch').addEventListener('click', function () { search(root); });
            root.querySelector('#cjQ').addEventListener('keydown', function (e) { if (e.key === 'Enter') search(root); });
            root.querySelector('#cjSync').addEventListener('click', function () { syncTracking(root); root.querySelector('#cjSyncMsg').textContent = st.syncMsg; });
            root.querySelector('#slaReload').addEventListener('click', function () { loadSla(root); });

            loadSettings(root);
            loadSla(root);
        },
    };
})();
