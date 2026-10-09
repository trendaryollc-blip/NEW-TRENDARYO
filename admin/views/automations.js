/**
 * TRENDARYO ADMIN - Automations view
 * The control surface for the automation engine (api/_lib/automations.js).
 * Reads /api/automations, toggles rules, retunes their config, runs them on
 * demand and previews (dry-run) them before switching them on.
 */
(function () {
    'use strict';

    var V = window.TrendaryoAdminViews = window.TrendaryoAdminViews || {};
    var U = V.util;

    function app() { return window.TrendaryoAdminApp; }
    function A() { return window.TrendaryoAdmin; }

    var st = {
        rules: [],
        runs: [],
        alerts: [],
        loading: true,
        error: '',
        busy: {},
        runningAll: false,
        loaded: false
    };

    /* ================= helpers ================= */

    function openAlerts() {
        var n = 0;
        for (var i = 0; i < st.alerts.length; i++) if (!st.alerts[i].resolved) n++;
        return n;
    }

    function activeRules() {
        var n = 0;
        for (var i = 0; i < st.rules.length; i++) if (st.rules[i].enabled) n++;
        return n;
    }

    function last24h() {
        var cut = Date.now() - 86400000;
        var runs = 0, acted = 0;
        for (var i = 0; i < st.runs.length; i++) {
            var r = st.runs[i];
            var at = r.finishedAt ? new Date(r.finishedAt).getTime() : 0;
            if (at >= cut && !r.dryRun) { runs++; acted += (r.acted || 0); }
        }
        return { runs: runs, acted: acted };
    }

    function lastRun() {
        for (var i = 0; i < st.runs.length; i++) {
            if (!st.runs[i].dryRun) return st.runs[i];
        }
        return null;
    }

    function statusBadge(s) {
        var map = { ok: 'badge--ok', partial: 'badge--warn', error: 'badge--danger' };
        return '<span class="badge ' + (map[s] || 'badge--neutral') + '"><span class="badge__dot"></span>' + app().esc(s || 'ok') + '</span>';
    }

    function triggerLabel(t) {
        return { manual: 'manual', cron: 'scheduled', dry: 'preview' }[t] || t || '-';
    }

    function ruleStatusLine(rule) {
        var s = rule.stats || {};
        if (!s.lastRunAt) return '<span class="fs-sm t-mute">Never run yet</span>';
        var err = s.lastError ? ' <span class="text-danger fs-xs">' + app().esc(s.lastError) + '</span>' : '';
        return statusBadge(s.lastStatus) + ' <span class="fs-sm t-mute">' + app().ago(s.lastRunAt) +
            ' - ' + (s.acted || 0) + ' acted, ' + (s.matched || 0) + ' matched (' + (s.runs || 0) + ' runs)</span>' + err;
    }

    function fieldInput(rule, field) {
        var id = 'au-f-' + rule.key + '-' + field.key;
        var value = rule.config[field.key];
        if (field.type === 'boolean') {
            return '<label class="switch"><input type="checkbox" id="' + id + '" data-fld="' + field.key + '"' + (value ? ' checked' : '') + '>' +
                '<span class="switch__track"></span><span class="switch__text">' + app().esc(field.label) + '</span></label>';
        }
        return '<div class="field"><label class="field__label" for="' + id + '">' + app().esc(field.label) + '</label>' +
            '<input class="input" id="' + id + '" data-fld="' + field.key + '" type="number" value="' + value + '"' +
            ' min="' + field.min + '" max="' + field.max + '" step="' + (field.step || 1) + '"' +
            (field.help ? ' title="' + app().esc(field.help) + '"' : '') + '>' +
            (field.help ? '<div class="fs-xs t-mute" style="margin-top:4px;">' + app().esc(field.help) + '</div>' : '') + '</div>';
    }

    function ruleCard(rule) {
        var busy = st.busy[rule.key];
        var icon = A().icon(rule.icon || 'zap', 16);
        var fields = '';
        for (var i = 0; i < rule.fields.length; i++) fields += fieldInput(rule, rule.fields[i]);
        return '<div class="panel" data-rule="' + app().esc(rule.key) + '" style="margin-bottom:16px;">' +
            '<div class="panel__head">' +
                '<div class="row" style="gap:10px;align-items:center;">' + icon +
                    '<div><div class="panel__title">' + app().esc(rule.name) + '</div>' +
                    '<div class="panel__subtitle">' + app().esc(rule.about) + '</div></div></div>' +
                '<div class="panel__actions">' +
                    '<span class="badge ' + (rule.enabled ? 'badge--ok' : 'badge--neutral') + '">' + (rule.enabled ? 'ON' : 'PAUSED') + '</span>' +
                    '<label class="switch"><input type="checkbox" id="au-t-' + app().esc(rule.key) + '"' + (rule.enabled ? ' checked' : '') + '><span class="switch__track"></span><span class="switch__text"></span></label>' +
                '</div>' +
            '</div>' +
            '<div class="panel__body">' +
                '<div class="grid grid--3" style="margin-bottom:14px;">' + fields + '</div>' +
                '<div class="row row--wrap" style="gap:8px;align-items:center;">' +
                    ruleStatusLine(rule) +
                    '<span class="spacer"></span>' +
                    '<button class="btn btn--sm" id="au-dry-' + app().esc(rule.key) + '" type="button"' + (busy ? ' disabled' : '') + '>' + A().icon('eye', 12) + 'Preview</button>' +
                    '<button class="btn btn--primary btn--sm" id="au-run-' + app().esc(rule.key) + '" type="button"' + (busy ? ' disabled' : '') + '>' +
                        (busy ? '<span class="spinner"></span>' : A().icon('zap', 12)) + 'Run now</button>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    function runsTable() {
        if (!st.runs.length) return U.empty('activity', 'No runs yet', 'Enable a rule and hit Run now - every run lands here with its full result.');
        var h = '<div class="table-wrap"><table class="table table--compact"><thead><tr>' +
            '<th>Rule</th><th>Trigger</th><th>Result</th><th class="num">Matched</th><th class="num">Acted</th><th class="num">Skipped</th><th>When</th></tr>' +
            '</thead><tbody>';
        for (var i = 0; i < st.runs.length; i++) {
            var r = st.runs[i];
            var err = (r.errors && r.errors.length) ? ' <span class="badge badge--danger">' + r.errors.length + ' err</span>' : '';
            h += '<tr><td><div class="table__primary">' + app().esc(r.ruleName || r.ruleKey) + '</div></td>' +
                '<td><span class="badge badge--neutral">' + app().esc(triggerLabel(r.trigger)) + '</span>' + (r.dryRun ? ' <span class="badge badge--info">dry-run</span>' : '') + '</td>' +
                '<td>' + statusBadge(r.status) + err + '</td>' +
                '<td class="num">' + (r.matched || 0) + '</td>' +
                '<td class="num fw-600">' + (r.acted || 0) + '</td>' +
                '<td class="num">' + (r.skipped || 0) + '</td>' +
                '<td class="fs-sm t-mute">' + app().ago(r.finishedAt) + '</td></tr>';
        }
        return h + '</tbody></table></div>';
    }

    function alertsList() {
        var open = st.alerts.filter(function (a) { return !a.resolved; });
        if (!open.length) return U.empty('bell', 'No open alerts', 'Low-stock and stuck-order alerts appear here the moment a rule raises one.');
        var h = '';
        for (var i = 0; i < open.length; i++) {
            var a = open[i];
            var icon = a.type === 'low-stock' ? A().icon('warehouse', 14) : A().icon('flag', 14);
            h += '<div class="row row--between" style="padding:9px 0;border-bottom:1px solid var(--line-soft);">' +
                '<div class="row" style="gap:9px;min-width:0;">' + icon +
                    '<div style="min-width:0;"><div class="fs-sm fw-600 t-truncate">' + app().esc(a.name || a.orderId || a.productId) + '</div>' +
                    '<div class="fs-xs t-mute">' + app().esc(a.type === 'low-stock' ? ('stock ' + (a.stock != null ? a.stock : '-')) : (a.reason || '')) + ' - raised ' + app().ago(a.lastAlertedAt) + '</div></div></div>' +
                '<span class="badge badge--warn">' + app().esc(a.type) + '</span></div>';
        }
        return h;
    }

    /* ================= actions ================= */

    function load(root, ctx) {
        st.loading = true;
        st.error = '';
        draw(root, ctx);
        window.API.request('/automations').then(function (res) {
            st.rules = (res.data && res.data.rules) || [];
            st.runs = (res.data && res.data.runs) || [];
            st.alerts = (res.data && res.data.alerts) || [];
            st.loading = false;
            st.loaded = true;
            V.automations.openAlerts = openAlerts();
            draw(root, ctx);
        }, function (err) {
            st.loading = false;
            st.error = (err && err.message) || 'Could not reach the server';
            draw(root, ctx);
        });
    }

    function setBusy(key, val, root, ctx) {
        st.busy[key] = val;
        if (root && ctx) draw(root, ctx);
    }

    function toggleRule(root, ctx, rule) {
        var enable = !rule.enabled;
        window.API.request('/automations/' + encodeURIComponent(rule.key), {
            method: 'PATCH',
            body: { enabled: enable }
        }).then(function () {
            rule.enabled = enable;
            app().toast(rule.name + (enable ? ' enabled' : ' paused'), 'ok', 'Automations');
            draw(root, ctx);
        }, function (err) {
            app().toast((err && err.message) || 'Toggle failed', 'danger', 'Automations');
        });
    }

    function saveConfig(root, ctx, rule, field, value) {
        var patch = {};
        patch[field.key] = value;
        window.API.request('/automations/' + encodeURIComponent(rule.key), {
            method: 'PATCH',
            body: { config: patch }
        }).then(function () {
            app().toast(rule.name + ': ' + field.label + ' saved', 'ok', 'Automations');
        }, function (err) {
            app().toast((err && err.message) || 'Save failed', 'danger', 'Automations');
        });
    }

    function runRule(root, ctx, rule, dry) {
        setBusy(rule.key, true);
        window.API.request('/automations/' + encodeURIComponent(rule.key), {
            method: 'POST',
            body: { action: 'run', dryRun: dry }
        }).then(function (res) {
            setBusy(rule.key, false);
            var d = res.data || {};
            if (dry) {
                app().toast('Preview: ' + (d.matched || 0) + ' match(es), nothing was written', 'info', rule.name);
            } else if (d.status === 'error') {
                app().toast(((d.errors && d.errors[0] && d.errors[0].message)) || 'Run failed', 'danger', rule.name);
            } else {
                app().toast('Acted on ' + (d.acted || 0) + ' of ' + (d.matched || 0) + ' match(es)' + (d.errors && d.errors.length ? ' - ' + d.errors.length + ' error(s)' : ''), d.status === 'partial' ? 'warn' : 'ok', rule.name);
            }
            load(root, ctx);
        }, function (err) {
            setBusy(rule.key, false);
            app().toast((err && err.message) || 'Run failed', 'danger', rule.name);
        });
    }

    function runAll(root, ctx) {
        st.runningAll = true;
        draw(root, ctx);
        window.API.request('/automations', {
            method: 'POST',
            body: { all: true }
        }).then(function (res) {
            st.runningAll = false;
            var runs = (res.data && res.data.runs) || [];
            var acted = 0, errors = 0;
            for (var i = 0; i < runs.length; i++) { acted += (runs[i].acted || 0); errors += (runs[i].errors ? runs[i].errors.length : 0); }
            app().toast(runs.length + ' rule(s) ran - ' + acted + ' action(s)' + (errors ? ', ' + errors + ' error(s)' : ''), errors ? 'warn' : 'ok', 'Automations');
            load(root, ctx);
        }, function (err) {
            st.runningAll = false;
            app().toast((err && err.message) || 'Run failed', 'danger', 'Automations');
            draw(root, ctx);
        });
    }

    /* ================= render ================= */

    function draw(root, ctx) {
        var App = ctx.App;
        var el = root.querySelector('#auBody');
        if (!el) return;

        if (st.loading && !st.loaded) {
            el.innerHTML = '<div class="empty"><span class="spinner"></span><p style="margin-top:12px;">Loading automations...</p></div>';
            return;
        }
        if (st.error) {
            el.innerHTML = '<div class="empty"><div class="empty__icon">' + A().icon('alert', 20) + '</div>' +
                '<h3>Automations unavailable</h3><p>' + App.esc(st.error) + '</p>' +
                '<button class="btn btn--sm" id="auRetry" type="button" style="margin-top:12px;">Retry</button></div>';
            var retry = el.querySelector('#auRetry');
            if (retry) retry.addEventListener('click', function () { load(root, ctx); });
            return;
        }

        var cards = '';
        for (var i = 0; i < st.rules.length; i++) cards += ruleCard(st.rules[i]);
        var last = lastRun();
        var day = last24h();

        el.innerHTML =
            '<div class="grid grid--4" style="margin-bottom:16px;">' +
                U.kpi('zap', 'stat__icon--accent', 'Active rules', activeRules() + ' / ' + st.rules.length, 'paused rules never run') +
                U.kpi('bell', openAlerts() ? 'stat__icon--warn' : '', 'Open alerts', String(openAlerts()), 'low stock and stuck orders') +
                U.kpi('activity', '', 'Actions (24h)', String(day.acted), day.runs + ' completed run(s)') +
                U.kpi('clock', '', 'Last run', last ? App.ago(last.finishedAt) : '-', last ? App.esc(triggerLabel(last.trigger)) : 'waiting for the first run') +
            '</div>' +
            '<div class="grid grid--split" style="align-items:start;">' +
                '<div>' + cards + '</div>' +
                '<div>' +
                    '<div class="panel" style="margin-bottom:16px;"><div class="panel__head"><div><div class="panel__title">Open alerts</div>' +
                        '<div class="panel__subtitle">Auto-resolve when the stock returns or the order moves</div></div></div>' +
                        '<div class="panel__body panel__body--tight">' + alertsList() + '</div></div>' +
                    '<div class="panel"><div class="panel__head"><div><div class="panel__title">Run history</div>' +
                        '<div class="panel__subtitle">Who ran what, and what it did</div></div></div>' +
                        '<div class="panel__body panel__body--flush">' + runsTable() + '</div></div>' +
                '</div>' +
            '</div>';

        wireRules(root, ctx);
    }

    function wireRules(root, ctx) {
        var cards = root.querySelectorAll('[data-rule]');
        for (var i = 0; i < cards.length; i++) {
            (function (card) {
                var key = card.getAttribute('data-rule');
                var rule = null;
                for (var j = 0; j < st.rules.length; j++) if (st.rules[j].key === key) rule = st.rules[j];
                if (!rule) return;

                var toggle = card.querySelector('#au-t-' + key);
                if (toggle) toggle.addEventListener('change', function () { toggleRule(root, ctx, rule); });

                var run = card.querySelector('#au-run-' + key);
                if (run) run.addEventListener('click', function () { runRule(root, ctx, rule, false); });

                var dry = card.querySelector('#au-dry-' + key);
                if (dry) dry.addEventListener('click', function () { runRule(root, ctx, rule, true); });

                var inputs = card.querySelectorAll('[data-fld]');
                for (var f = 0; f < inputs.length; f++) {
                    (function (input) {
                        var fieldKey = input.getAttribute('data-fld');
                        var field = null;
                        for (var k = 0; k < rule.fields.length; k++) if (rule.fields[k].key === fieldKey) field = rule.fields[k];
                        if (!field) return;
                        input.addEventListener('change', function () {
                            var value = field.type === 'boolean' ? !!input.checked : parseInt(input.value, 10);
                            rule.config[field.key] = value;
                            saveConfig(root, ctx, rule, field, value);
                        });
                    })(inputs[f]);
                }
            })(cards[i]);
        }
    }

    V.automations = {
        title: 'Automations',
        icon: 'zap',
        sub: 'Rules that run the store for you - cancel, fulfil, flag and alert',
        openAlerts: 0,
        render: function (root, ctx) {
            var App = ctx.App;

            root.innerHTML = U.head('Automations', 'Hands-free rules for the jobs the admin repeats every day',
                '<button class="btn btn--sm" id="auRefresh" type="button">' + A().icon('refresh', 13) + 'Refresh</button>' +
                '<button class="btn btn--primary btn--sm" id="auRunAll" type="button"' + (st.runningAll ? ' disabled' : '') + '>' +
                (st.runningAll ? '<span class="spinner"></span>' : A().icon('zap', 13)) + 'Run all enabled</button>') +
            '<div id="auBody"></div>';

            root.querySelector('#auRefresh').addEventListener('click', function () { load(root, ctx); });
            root.querySelector('#auRunAll').addEventListener('click', function () { runAll(root, ctx); });

            if (!st.loaded) load(root, ctx);
            else draw(root, ctx);
        }
    };

})();
