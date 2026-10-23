/**
 * TRENDARYO ADMIN - Integrations view
 * Generates linking codes that connect external services (Product Hunter,
 * AdCopilot, custom tools) to this store. Each connection gets a unique
 * code + endpoint list; the full code is shown exactly once at generation.
 * Backed by POST/GET/DELETE /api/admin/integrations (+ /:id in [id].js).
 */
(function () {
    'use strict';

    var V = window.TrendaryoAdminViews = window.TrendaryoAdminViews || {};
    var U = V.util;

    function app() { return window.TrendaryoAdminApp; }
    function A() { return window.TrendaryoAdmin; }

    var st = {
        list: [],
        scopes: [],
        loading: true,
        loaded: false,
        error: ''
    };

    var PRESETS = [
        {
            appId: 'product-hunter', name: 'Product Hunter', icon: 'target',
            desc: 'Finds trending products across platforms and pushes them here - arrivals land as drafts for review',
            scopes: ['products.read', 'products.write']
        },
        {
            appId: 'adcopilot', name: 'AdCopilot', icon: 'megaphone',
            desc: 'Launches ads on every platform from one dashboard - reads the live catalog and order data',
            scopes: ['products.read', 'orders.read']
        },
        {
            appId: 'custom', name: 'Custom service / webhook', icon: 'puzzle',
            desc: 'Any other tool - name it yourself and hand-pick the scopes it receives',
            scopes: ['products.read']
        }
    ];

    /* ================= helpers ================= */

    function baseUrl() { return String(location.origin || '').replace(/\/$/, ''); }

    function scopeLabel(key) {
        for (var i = 0; i < st.scopes.length; i++) if (st.scopes[i].key === key) return st.scopes[i];
        return { key: key, label: key };
    }

    function statusBadge(s) {
        var map = { active: 'badge--ok', revoked: 'badge--neutral' };
        return '<span class="badge ' + (map[s] || 'badge--neutral') + '"><span class="badge__dot"></span>' + app().esc(s || 'active') + '</span>';
    }

    function scopeBadges(scopes) {
        var h = '';
        var list = scopes || [];
        for (var i = 0; i < list.length; i++) {
            var s = scopeLabel(list[i]);
            h += '<span class="badge badge--info" title="' + app().esc(s.desc || s.key) + '">' + app().esc(s.label) + '</span> ';
        }
        return h || '<span class="fs-xs t-mute">no scopes</span>';
    }

    function copyText(text, label) {
        function done() { app().toast('Copied to clipboard', 'ok', label || 'Copy'); }
        function fallback() {
            var ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); done(); } catch (e) { app().toast('Copy failed - select and copy the text manually', 'warn', 'Copy'); }
            document.body.removeChild(ta);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
        else fallback();
    }

    function codeBlock(id, text) {
        return '<div class="code-box" style="position:relative;margin:8px 0;">' +
            '<button class="icon-btn" type="button" data-copy="' + app().esc(text) + '" title="Copy" aria-label="Copy" style="position:absolute;top:6px;right:6px;">' + A().icon('copy', 14) + '</button>' +
            '<pre id="' + app().esc(id) + '" spellcheck="false" style="margin:0;padding:12px;overflow-x:auto;font:12px/1.5 JetBrains Mono,monospace;background:var(--surface-2);border:1px solid var(--line);border-radius:8px;white-space:pre-wrap;word-break:break-all;">' + app().esc(text) + '</pre></div>';
    }

    function curlExample(code) {
        return 'curl -X POST ' + baseUrl() + '/api/integrations/v1/products \\\n' +
            '  -H "Authorization: Bearer ' + code + '" \\\n' +
            '  -H "Content-Type: application/json" \\\n' +
            '  -d \'{"products":[{"name":"Trendy Hoodie","price":39.99,"sku":"TRD-HOOD-01","stock":50}]}\'';
    }

    /* ================= load ================= */

    function load(root, ctx) {
        st.loading = true;
        st.error = '';
        if (root) draw(root, ctx);
        window.API.request('/admin/integrations').then(function (res) {
            st.list = (res.data && Object.prototype.toString.call(res.data) === '[object Array]') ? res.data : ((res.data && res.data.data) || []);
            st.scopes = res.scopes || [];
            st.loading = false;
            st.loaded = true;
            if (root) draw(root, ctx);
        }, function (err) {
            st.loading = false;
            st.error = (err && err.message) || 'Could not reach the server';
            if (root) draw(root, ctx);
        });
    }

    /* ================= actions ================= */

    function openCreator(ctx, preset) {
        preset = preset || PRESETS[2];
        var checks = '';
        for (var i = 0; i < st.scopes.length; i++) {
            var s = st.scopes[i];
            checks += '<label class="row" style="gap:10px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;margin-bottom:8px;cursor:pointer;">' +
                '<input type="checkbox" data-scope="' + app().esc(s.key) + '"' + (preset.scopes.indexOf(s.key) >= 0 ? ' checked' : '') + '>' +
                '<div style="flex:1;"><div class="fs-sm fw-600">' + app().esc(s.label) + '</div>' +
                '<div class="fs-xs t-mute">' + app().esc(s.desc || s.key) + '</div></div></label>';
        }
        app().drawer.open({
            title: 'Connect a service',
            sub: 'Generates a linking code - shown only when you create it',
            body:
                '<div style="margin-bottom:12px;"><label class="fs-sm fw-600" for="inName">Service name</label>' +
                '<input class="input" id="inName" type="text" value="' + app().esc(preset.name) + '" placeholder="e.g. My Product Finder"></div>' +
                '<div style="margin-bottom:12px;"><label class="fs-sm fw-600" style="display:block;margin-bottom:6px;">Permissions (scopes)</label>' + checks + '</div>' +
                '<div><label class="fs-sm fw-600" for="inNote">Note <span class="t-mute">(optional)</span></label>' +
                '<input class="input" id="inNote" type="text" placeholder="What is this connection for?"></div>' +
                '<div style="margin-top:12px;"><label class="fs-sm fw-600" for="inHook">Notify URL <span class="t-mute">(optional - we push new orders here)</span></label>' +
                '<input class="input" id="inHook" type="url" placeholder="https://your-service/api/webhooks/trendaryo">' +
                '<div class="fs-xs t-mute" style="margin-top:6px;">HTTPS only. Every push is signed - the secret is shown after you generate the code.</div></div>',
            foot: '<button class="btn btn--primary" id="inGen" type="button">' + A().icon('key', 14) + 'Generate linking code</button>',
            onMount: function (root2) {
                root2.querySelector('#inGen').addEventListener('click', function () {
                    var btn = this;
                    var scopes = [];
                    var inputs = root2.querySelectorAll('[data-scope]');
                    for (var k = 0; k < inputs.length; k++) if (inputs[k].checked) scopes.push(inputs[k].getAttribute('data-scope'));
                    if (!scopes.length) { app().toast('Pick at least one permission', 'warn', 'Integrations'); return; }
                    btn.disabled = true;
                    btn.innerHTML = '<span class="spinner"></span>Generating...';
                    window.API.request('/admin/integrations', {
                        method: 'POST',
                        body: {
                            appName: root2.querySelector('#inName').value,
                            appId: preset.appId,
                            note: root2.querySelector('#inNote').value,
                            scopes: scopes,
                            webhookUrl: root2.querySelector('#inHook').value
                        }
                    }).then(function (res) {
                        showResult(res.data, preset.name);
                    }, function (err) {
                        btn.disabled = false;
                        btn.innerHTML = A().icon('key', 14) + 'Generate linking code';
                        app().toast((err && err.message) || 'Could not generate the code', 'danger', 'Integrations');
                    });
                });
            }
        });
    }

    function showResult(data, serviceName) {
        var urls = [];
        var b = baseUrl();
        urls.push({ m: 'GET', u: b + '/api/integrations/v1/ping', d: 'Health check' });
        if ((data.scopes || []).indexOf('products.read') >= 0) urls.push({ m: 'GET', u: b + '/api/integrations/v1/products', d: 'Read catalog' });
        if ((data.scopes || []).indexOf('products.write') >= 0) urls.push({ m: 'POST', u: b + '/api/integrations/v1/products', d: 'Push products (drafts)' });
        if ((data.scopes || []).indexOf('orders.read') >= 0) urls.push({ m: 'GET', u: b + '/api/integrations/v1/orders', d: 'Read orders' });

        var rows = '';
        for (var i = 0; i < urls.length; i++) {
            rows += '<div class="row row--between" style="padding:9px 0;border-bottom:1px solid var(--line-soft);">' +
                '<div style="min-width:0;"><span class="badge badge--accent">' + urls[i].m + '</span> <span class="fs-xs t-mute">' + app().esc(urls[i].d) + '</span>' +
                '<div class="fs-xs" style="font-family:JetBrains Mono,monospace;margin-top:4px;word-break:break-all;">' + app().esc(urls[i].u) + '</div></div>' +
                '<button class="icon-btn" type="button" data-copy="' + app().esc(urls[i].u) + '" title="Copy URL">' + A().icon('copy', 13) + '</button></div>';
        }

        var webhookDone = data.webhookUrl !== undefined ? data.webhookUrl : '';
        var webhookBlock = '';
        if (webhookDone) {
            var sample = '{\n  "event": "order.created",\n  "store": "Trendaryo",\n  "order": {\n    "id": "ord_123",\n    "number": "...",\n    "status": "confirmed",\n    "paymentStatus": "paid",\n    "total": 59.90,\n    "items": [{ "id": "...", "name": "...", "qty": 1 }]\n  }\n}';
            webhookBlock =
                '<div class="badge badge--ok" style="margin:14px 0 8px;">' + A().icon('wifi', 13) + 'Outbound webhook active</div>' +
                '<div class="fs-xs t-mute">New orders are signed-pushed to this URL. Verify with the <b>X-Trendaryo-Signature</b> header.</div>' +
                codeBlock('inHookUrl', webhookDone) +
                '<div class="fs-xs t-mute" style="margin-top:8px;">Signing secret (for HMAC verification, t=&lt;ts&gt;,v1=&lt;hmac&gt;):</div>' +
                codeBlock('inHookSecret', data.webhookSecret || '') +
                '<div class="fs-xs t-mute" style="margin-top:8px;">Payload shape (order.created):</div>' +
                codeBlock('inHookSample', sample);
        }

        app().drawer.open({
            title: 'Linking code generated',
            sub: app().esc(serviceName) + ' is ready to connect',
            body:
                '<div class="badge badge--warn" style="margin-bottom:10px;">' + A().icon('shieldCheck', 13) + ' Copy it now - this code is shown once and never again</div>' +
                codeBlock('inCode', data.code) +
                '<div class="panel" style="margin-top:14px;"><div class="panel__head"><div><div class="panel__title">Endpoints the service can call</div>' +
                '<div class="panel__subtitle">Auth header: <b>Authorization: Bearer &lt;linking code&gt;</b> or <b>x-trendaryo-key</b></div></div></div>' +
                '<div class="panel__body panel__body--tight">' + rows + '</div></div>' +
                '<div class="panel" style="margin-top:14px;"><div class="panel__head"><div><div class="panel__title">Example: push a product</div></div></div>' +
                '<div class="panel__body panel__body--flush">' + codeBlock('inCurl', curlExample(data.code)) + '</div></div>' +
                webhookBlock,
            onMount: function (root2) {
                var btns = root2.querySelectorAll('[data-copy]');
                for (var k = 0; k < btns.length; k++) btns[k].addEventListener('click', function () { copyText(this.getAttribute('data-copy')); });
            }
        });
        load(null, ctx);
    }

    function openHookEditor(ctx, row) {
        app().drawer.open({
            title: 'Webhook - ' + row.appName,
            sub: 'Pushes order.created (signed) to this URL the second an order is paid',
            body:
                '<div style="margin-bottom:12px;"><label class="fs-sm fw-600" for="hkUrl">Notify URL <span class="t-mute">(HTTPS only)</span></label>' +
                '<input class="input" id="hkUrl" type="url" value="' + app().esc(row.webhookUrl || '') + '" placeholder="https://your-service/api/webhooks/trendaryo"></div>' +
                (row.webhookStatus ? '<div class="fs-sm">Last push: <b>' + app().esc(row.webhookStatus) + '</b>' +
                    (row.lastWebhookAt ? ' <span class="t-mute">(' + app().ago(row.lastWebhookAt) + ')</span>' : '') +
                    (row.webhookFailCount ? ' <span class="badge badge--danger">' + row.webhookFailCount + ' failed</span>' : '') + '</div>' : '') +
                (row.webhookUrl && row.webhookSecret ? '<div class="fs-xs t-mute" style="margin-top:8px;">Current signing secret (shared, verifiable HMAC):</div>' + codeBlock('hkSecret', row.webhookSecret) : ''),
            foot: '<button class="btn btn--sm" id="hkTest" type="button">' + A().icon('zap', 13) + 'Send test event</button>' +
                  '<button class="btn btn--primary" id="hkSave" type="button">' + A().icon('save', 14) + 'Save webhook</button>',
            onMount: function (root2) {
                root2.querySelector('#hkSave').addEventListener('click', function () {
                    window.API.request('/admin/integrations/' + encodeURIComponent(row.id), {
                        method: 'PATCH',
                        body: { webhookUrl: root2.querySelector('#hkUrl').value }
                    }).then(function () {
                        app().toast('Webhook saved', 'ok', 'Integrations');
                        app().drawer.close();
                        load(null, ctx);
                    }, function (err) { app().toast((err && err.message) || 'Save failed', 'danger', 'Integrations'); });
                });
                root2.querySelector('#hkTest').addEventListener('click', function () {
                    var btn = this;
                    btn.disabled = true;
                    window.API.request('/admin/integrations/' + encodeURIComponent(row.id), {
                        method: 'POST',
                        body: { action: 'test' }
                    }).then(function () {
                        btn.disabled = false;
                        app().toast('Sample order.created sent - check the receiver logs', 'ok', 'Integrations');
                    }, function (err) {
                        btn.disabled = false;
                        app().toast((err && err.message) || 'Test failed', 'danger', 'Integrations');
                    });
                });
            }
        });
    }

    function rotate(ctx, row) {
        app().confirm({
            title: 'Rotate the linking code?',
            message: '<p class="t-body">The current code for <b>' + app().esc(row.appName) + '</b> stops working immediately and a new one is generated. Any service still using the old code must be updated.</p>',
            okText: 'Rotate code'
        }).then(function (ok) {
            if (!ok) return;
            window.API.request('/admin/integrations/' + encodeURIComponent(row.id), { method: 'POST' })
                .then(function (res) { showResult(res.data, row.appName); },
                    function (err) { app().toast((err && err.message) || 'Rotate failed', 'danger', 'Integrations'); });
        });
    }

    function setStatus(ctx, row, status) {
        var revoke = status === 'revoked';
        var go = function () {
            window.API.request('/admin/integrations/' + encodeURIComponent(row.id), {
                method: 'PATCH',
                body: { status: status }
            }).then(function () {
                app().toast(row.appName + (revoke ? ' disconnected' : ' reconnected'), revoke ? 'warn' : 'ok', 'Integrations');
                load(null, ctx);
            }, function (err) { app().toast((err && err.message) || 'Update failed', 'danger', 'Integrations'); });
        };
        if (revoke) {
            app().confirm({
                title: 'Disconnect ' + row.appName + '?',
                message: '<p class="t-body">Its linking code stops working right away. You can reconnect it later, but the service must be updated with an existing active code.</p>',
                okText: 'Disconnect',
                danger: true
            }).then(function (ok) { if (ok) go(); });
        } else go();
    }

    /* ================= render ================= */

    function draw(root, ctx) {
        var el = root.querySelector('#itBody');
        if (!el) return;

        if (st.loading && !st.loaded) {
            el.innerHTML = '<div class="empty"><span class="spinner"></span><p style="margin-top:12px;">Loading connections...</p></div>';
            return;
        }
        if (st.error) {
            el.innerHTML = '<div class="empty"><div class="empty__icon">' + A().icon('alert', 20) + '</div>' +
                '<h3>Integrations unavailable</h3><p>' + app().esc(st.error) + '</p>' +
                '<button class="btn btn--sm" id="itRetry" type="button" style="margin-top:12px;">Retry</button></div>';
            var retry = el.querySelector('#itRetry');
            if (retry) retry.addEventListener('click', function () { load(root, ctx); });
            return;
        }

        var rows = st.list.filter(function (r) { return r.status === 'active'; });
        var revoked = st.list.length - rows.length;
        var calls = 0, lastUsed = null;
        for (var i = 0; i < st.list.length; i++) {
            calls += (st.list[i].callCount || 0);
            if (st.list[i].lastUsedAt && (!lastUsed || st.list[i].lastUsedAt > lastUsed)) lastUsed = st.list[i].lastUsedAt;
        }

        var presets = '';
        for (i = 0; i < PRESETS.length; i++) {
            var p = PRESETS[i];
            presets += '<div class="panel" style="display:flex;flex-direction:column;gap:10px;">' +
                '<div class="row" style="gap:10px;"><span class="stat__icon stat__icon--accent" style="height:30px;width:30px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;">' + A().icon(p.icon, 15) + '</span>' +
                '<div><div class="fw-600">' + app().esc(p.name) + '</div><div class="fs-xs t-mute">' + app().esc(scopeBadges(p.scopes)) + '</div></div></div>' +
                '<div class="fs-sm t-mute" style="flex:1;">' + app().esc(p.desc) + '</div>' +
                '<button class="btn btn--sm btn--primary" data-connect="' + p.appId + '" type="button">' + A().icon('key', 13) + 'Generate code</button></div>';
        }

        var table = '<div class="table-wrap"><table class="table table--compact"><thead><tr>' +
            '<th>Service</th><th>Linking code</th><th>Permissions</th><th>Status</th><th class="num">Calls</th><th>Last used</th><th style="text-align:right;">Actions</th></tr></thead><tbody>';
        if (!st.list.length) {
            table += '<tr><td colspan="7" style="padding:22px 0;">' + U.empty('link', 'No connections yet', 'Pick a service above or create a custom one - the store generates its linking code in one click.') + '</td></tr>';
        } else {
            for (i = 0; i < st.list.length; i++) {
                var r = st.list[i];
                table += '<tr><td><div class="table__primary">' + app().esc(r.appName) + '</div>' + (r.note ? '<div class="fs-xs t-mute">' + app().esc(r.note) + '</div>' : '') + '</td>' +
                    '<td><code class="fs-xs" style="font-family:JetBrains Mono,monospace;">' + app().esc(r.keyPreview || '-') + '</code></td>' +
                    '<td>' + scopeBadges(r.scopes) + '</td>' +
                    '<td>' + statusBadge(r.status) + '</td>' +
                    '<td class="num">' + app().n(r.callCount || 0) + '</td>' +
                    '<td class="fs-sm t-mute">' + (r.lastUsedAt ? app().ago(r.lastUsedAt) : 'never') + '</td>' +
                    '<td style="text-align:right;white-space:nowrap;">' +
                        '<button class="icon-btn" data-id="' + app().esc(r.id) + '" data-act="hook" title="Webhook">' + A().icon('wifi', 13) + '</button> ' +
                        '<button class="icon-btn" data-id="' + app().esc(r.id) + '" data-act="rot" title="Rotate code">' + A().icon('refresh', 13) + '</button> ';

                if (r.status === 'active') {
                    table += '<button class="icon-btn" data-id="' + app().esc(r.id) + '" data-act="revoke" title="Disconnect">' + A().icon('power', 13) + '</button>';
                } else {
                    table += '<button class="icon-btn" data-id="' + app().esc(r.id) + '" data-act="activate" title="Reconnect">' + A().icon('check', 13) + '</button>';
                }
                table += '</td></tr>';
            }
        }
        table += '</tbody></table></div>';

        el.innerHTML =
            '<div class="grid grid--4" style="margin-bottom:16px;">' +
                U.kpi('link', 'stat__icon--accent', 'Active connections', String(rows.length), 'services holding a valid linking code') +
                U.kpi('puzzle', '', 'Total connections', String(st.list.length), revoked + ' disconnected') +
                U.kpi('activity', '', 'API calls', app().n(calls), 'total call count across services') +
                U.kpi('clock', '', 'Last activity', lastUsed ? app().ago(lastUsed) : '-', lastUsed ? 'most recent authenticated call' : 'no authenticated calls yet') +
            '</div>' +
            '<div class="grid grid--3" style="margin-bottom:16px;">' + presets + '</div>' +
            '<div class="panel"><div class="panel__head"><div><div class="panel__title">Connections</div>' +
                '<div class="panel__subtitle">Codes are hashed server-side - the full code is only ever shown at generation</div></div></div>' +
                '<div class="panel__body panel__body--flush">' + table + '</div></div>';

        var connect = el.querySelectorAll('[data-connect]');
        for (i = 0; i < connect.length; i++) {
            (function (btn) {
                btn.addEventListener('click', function () { openCreator(ctx, presetById(btn.getAttribute('data-connect'))); });
            })(connect[i]);
        }

        var acts = el.querySelectorAll('[data-act]');
        for (i = 0; i < acts.length; i++) {
            (function (btn) {
                btn.addEventListener('click', function () {
                    var act = btn.getAttribute('data-act');
                    var id = btn.getAttribute('data-id');
                    var row = null;
                    for (var k = 0; k < st.list.length; k++) if (st.list[k].id === id) row = st.list[k];
                    if (!row) return;
                    if (act === 'rot') rotate(ctx, row);
                    else if (act === 'hook') openHookEditor(ctx, row);
                    else if (act === 'revoke') setStatus(ctx, row, 'revoked');
                    else if (act === 'activate') setStatus(ctx, row, 'active');
                });
            })(acts[i]);
        }
    }

    function presetById(appId) {
        for (var k = 0; k < PRESETS.length; k++) if (PRESETS[k].appId === appId) return PRESETS[k];
        return PRESETS[2];
    }

    V.integrations = {
        title: 'Integrations',
        icon: 'link',
        sub: 'Linking codes that connect other services - product finds push themselves in, ad tools read out',
        render: function (root, ctx) {
            root.innerHTML = U.head('Integrations', 'Generate a linking code, share it with any service, and it can connect to this store over the API',
                '<button class="btn btn--sm" id="itRefresh" type="button">' + A().icon('refresh', 13) + 'Refresh</button>' +
                '<button class="btn btn--primary btn--sm" id="itNew" type="button">' + A().icon('plus', 13) + 'New connection</button>') +
                '<div id="itBody"></div>';
            root.querySelector('#itRefresh').addEventListener('click', function () { load(root, ctx); });
            root.querySelector('#itNew').addEventListener('click', function () { openCreator(ctx, PRESETS[2]); });
            if (!st.loaded) load(root, ctx);
            else draw(root, ctx);
        }
    };
})();
