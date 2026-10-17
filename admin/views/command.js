/**
 * TRENDARYO ADMIN - Content Command Center (Milestone 6)
 * ---------------------------------------------------------------------------
 * One screen for the whole AI content pipeline: every product content draft
 * with its workflow state, brief state, cluster coverage and article count.
 * Route: #/content (sidebar: Growth > Content). Data: GET
 * /api/admin/content-overview, merged with the live catalogue for names.
 */
(function () {
    'use strict';

    var V = window.TrendaryoAdminViews = window.TrendaryoAdminViews || {};
    var U = V.util;

    function A() { return window.TrendaryoAdmin; }
    function app() { return window.TrendaryoAdminApp; }

    var LABELS = {
        draft: 'Draft',
        review_pending: 'Review pending',
        ready_to_publish: 'Ready to publish',
        published: 'Published'
    };

    function statusBadge(status) {
        if (status === 'published') return '<span class="badge badge--ok">Published</span>';
        if (status === 'review_pending') return '<span class="badge badge--warn">Review pending</span>';
        if (status === 'ready_to_publish') return '<span class="badge badge--info">Ready to publish</span>';
        return '<span class="badge badge--neutral">Draft</span>';
    }

    function briefBadge(status) {
        if (!status) return '<span class="badge badge--danger">No brief</span>';
        if (status === 'READY_FOR_GENERATION') return '<span class="badge badge--warn">Ready for generation</span>';
        if (status === 'BRIEF_READY') return '<span class="badge badge--accent">Brief ready</span>';
        return '<span class="badge badge--ok">' + U.esc(String(status).replace(/_/g, ' ')) + '</span>';
    }

    V.content = {
        title: 'Content',
        icon: 'layers',
        sub: 'The whole AI content pipeline - drafts, briefs, clusters and reviews, one screen',
        render: function (root, ctx) {
            var S = ctx.S, App = ctx.App;

            root.innerHTML = U.head('Content Command Center', 'Every product in the pipeline and exactly what it still needs',
                '<button class="btn btn--sm" id="ccRefresh" type="button">' + A().icon('refresh', 13) + 'Refresh</button>' +
                '<a class="btn btn--ai btn--sm" href="#/automations">' + A().icon('sparkles', 13) + 'Automations</a>') +
                '<div class="grid grid--5" style="margin-bottom:16px;" id="ccKpis"></div>' +
                '<div class="panel"><div class="panel__head"><span class="t-label">Pipeline</span><span class="filter-count" id="ccCount"></span></div>' +
                '<div class="cards-wrap" id="ccTable"><div class="bl-empty"><span class="spinner spinner--ai"></span> Loading the pipeline...</div></div></div>';

            root.querySelector('#ccRefresh').addEventListener('click', function () { App.route(); });
            load(ctx);
        }
    };

    function load(ctx) {
        var App = ctx.App;
        if (!window.API) {
            document.getElementById('ccTable').innerHTML = U.empty('layers', 'API unavailable', 'The command center needs the API client.');
            return;
        }
        window.API.request('/admin/content-overview').then(function (res) {
            paint(ctx, (res && res.data) || { items: [], totals: {} });
        }, function (err) {
            var el = document.getElementById('ccTable');
            if (el) el.innerHTML = U.empty('layers', 'Pipeline unreachable', (err && err.message) || 'The overview endpoint did not respond.');
        });
    }

    function paint(ctx, data) {
        var S = ctx.S, App = ctx.App;
        var items = data.items || [];
        var t = data.totals || {};

        var kpis = document.getElementById('ccKpis');
        if (kpis) {
            kpis.innerHTML =
                U.kpi('file', t.drafts ? 'stat__icon--warn' : '', 'Drafts', String(t.drafts || 0), 'being written') +
                U.kpi('send', t.review ? 'stat__icon--warn' : '', 'Awaiting review', String(t.review || 0), 'human click needed') +
                U.kpi('checkCircle', t.ready ? 'stat__icon--accent' : '', 'Ready to publish', String(t.ready || 0), 'approved, not live') +
                U.kpi('book', '', 'Published', String(t.published || 0), 'live on the storefront') +
                U.kpi('alert', t.stalled ? 'stat__icon--danger' : '', 'Stalled', String(t.stalled || 0), 'no update in 5+ days');
        }

        var el = document.getElementById('ccTable');
        if (!el) return;
        var count = document.getElementById('ccCount');
        if (count) count.textContent = items.length + ' in the pipeline - ' + (t.briefs || 0) + ' briefs, ' + (t.articles || 0) + ' linked articles';

        if (!items.length) {
            el.innerHTML = U.empty('layers', 'Nothing in the pipeline yet', 'Generate a product page from any Product Details page - it appears here with its next step.');
            return;
        }

        /* stalled and review rows float to the top */
        var rank = { review_pending: 0, draft: 1, published: 2, ready_to_publish: 3 };
        items.sort(function (a, b) {
            var sa = (a.stalled ? 0 : 10) + (rank[a.contentStatus] != null ? rank[a.contentStatus] : 5);
            var sb = (b.stalled ? 0 : 10) + (rank[b.contentStatus] != null ? rank[b.contentStatus] : 5);
            if (sa !== sb) return sa - sb;
            return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
        });

        var h = '<div class="cards">';
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            var p = S.product(it.productId);
            h += '<div class="card-row"><div class="card-row__main">' +
                '<div class="card-row__topline">' +
                    '<div class="card-row__identity"><div class="card-row__title">' +
                        '<div class="table__primary t-truncate">' + U.esc(it.title || (p && p.name) || '#' + it.productId) + '</div>' +
                        '<div class="table__secondary">#' + U.esc(it.productId) + ' - v' + U.esc(String(it.version || 1)) + ' - updated ' + (it.updatedAt ? App.ago(it.updatedAt) : 'just now') + '</div>' +
                    '</div></div>' +
                    '<div class="card-row__side"><div class="card-row__actions">' +
                        '<a class="icon-btn" href="#/product-detail/' + encodeURIComponent(it.productId) + '" title="Open product details">' + A().icon('package', 14) + '</a>' +
                        '<a class="icon-btn" href="#/blog/generate?product=' + encodeURIComponent(it.productId) + '" title="Generate article">' + A().icon('sparkles', 14) + '</a>' +
                    '</div></div>' +
                '</div>' +
                '<div class="card-row__meta">' +
                    '<span>' + statusBadge(it.contentStatus) + '</span>' +
                    '<span>' + briefBadge(it.briefStatus) + '</span>' +
                    '<span class="fs-xs t-mute">' + (it.blogTypes || []).length + '/8 cluster' + ((it.articles || []).length ? ' - ' + it.articles.length + ' article(s)' : '') + '</span>' +
                    (it.stalled ? '<span class="badge badge--danger">Stalled</span>' : '') +
                '</div>' +
            '</div></div>';
        }
        el.innerHTML = h + '</div>';
    }

})();
