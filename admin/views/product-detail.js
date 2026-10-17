/**
 * TRENDARYO ADMIN - Product Details
 * ---------------------------------------------------------------------------
 * Phase 2 of the AI Content Engine. The dedicated source-of-truth page for a
 * single product (Admin > Products > Product Details). Every downstream AI
 * module - SEO, content, images, blog briefs, blog articles - reads the
 * product through the Product Context Engine, and the approved content
 * stored here wins over the supplier description (Phase 11).
 *
 * Route: #/product-detail/<id> (see App.parseHash in core/app.js)
 * Writes: POST/PUT/DELETE /api/products/<id>/content - admin-only, the
 * review workflow (draft -> review -> ready -> published) is enforced
 * server-side, so this UI only offers the legal moves for the current state.
 */
(function () {
    'use strict';

    var V = window.TrendaryoAdminViews = window.TrendaryoAdminViews || {};
    var U = V.util;

    function PC() { return window.TrendaryoProductContext; }
    function A() { return window.TrendaryoAdmin; }
    function app() { return window.TrendaryoAdminApp; }

    var WORKFLOW_LABELS = {
        draft: 'Draft',
        review_pending: 'Review pending',
        ready_to_publish: 'Ready to publish',
        published: 'Published'
    };

    function seoBadge(state) {
        if (state === 'full') return '<span class="badge badge--ok">SEO full</span>';
        if (state === 'partial') return '<span class="badge badge--warn">SEO partial</span>';
        return '<span class="badge badge--danger">SEO missing</span>';
    }

    function statusBadge(status) {
        if (status === 'published') return '<span class="badge badge--ok">' + WORKFLOW_LABELS.published + '</span>';
        if (status === 'review_pending') return '<span class="badge badge--warn">' + WORKFLOW_LABELS.review_pending + '</span>';
        if (status === 'ready_to_publish') return '<span class="badge badge--info">' + WORKFLOW_LABELS.ready_to_publish + '</span>';
        return '<span class="badge badge--neutral">' + WORKFLOW_LABELS.draft + '</span>';
    }

    function contentBadge(state) {
        if (state === 'published') return '<span class="badge badge--ok">Approved content</span>';
        if (state === 'draft') return '<span class="badge badge--warn">Content draft</span>';
        return '<span class="badge badge--neutral">No AI content yet</span>';
    }

    function postState(p) {
        if (p.status === 'published') return 'published';
        if (p.status !== 'published' && p.scheduledFor && new Date(p.scheduledFor) > new Date()) return 'scheduled';
        return 'draft';
    }

    V['product-detail'] = {
        title: 'Product details',
        icon: 'package',
        sub: 'Source of truth for every AI content module - SEO, content drafts, images, briefs and articles',
        render: function (root, ctx) {
            var S = ctx.S, App = ctx.App, P = PC();
            var id = ctx.route && ctx.route.param ? String(ctx.route.param) : '';
            var p = id ? S.product(id) : null;

            if (!p) {
                root.innerHTML = U.head('Product details', 'No product with that id in the catalogue',
                    '<a class="btn btn--sm" href="#/products">' + A().icon('arrowLeft', 13) + 'Back to products</a>') +
                    U.empty('package', 'Product not found', 'It may have been removed from the shelf. Reopen it from the Products module.');
                return;
            }

            var c = P.context(p);
            var seo = P.analyzeSeo(p);
            var status = P.contentStatus(p);
            var linked = P.linkedBlogs(S.blogPosts(), c.productId);
            var margin = (p.costPrice != null && c.price > 0)
                ? Math.round(((c.price - Number(p.costPrice)) / c.price) * 1000) / 10
                : null;

            root.innerHTML = U.head(c.productName || 'Product details',
                '#' + c.productId + ' - ' + c.category + (c.brand ? ' - ' + c.brand : ''),
                '<a class="btn btn--sm" href="#/products">' + A().icon('arrowLeft', 13) + 'Products</a>' +
                '<button class="btn btn--sm" type="button" data-act="analyze">' + A().icon('search', 13) + 'Analyze SEO</button>' +
                '<button class="btn btn--ai btn--sm" type="button" data-act="blog">' + A().icon('sparkles', 13) + 'Create SEO blog</button>' +
                '<button class="btn btn--sm" type="button" data-act="edit">' + A().icon('pencil', 13) + 'Edit</button>' +
                '<a class="btn btn--sm" href="' + U.esc(c.url) + '" target="_blank" rel="noopener">' + A().icon('externalLink', 13) + 'Storefront</a>') +

            '<div class="grid grid--5" style="margin-bottom:16px;">' +
                U.kpi('search', seo.state === 'full' ? 'stat__icon--ok' : (seo.state === 'missing' ? 'stat__icon--danger' : 'stat__icon--warn'), 'SEO score', String(seo.score) + '/100', seo.state + ' package') +
                U.kpi('dollar', '', 'Price', U.money(c.price), margin != null ? 'margin ' + margin + '%' : (c.compareAtPrice ? 'was ' + U.money(c.compareAtPrice) : 'live shelf price')) +
                U.kpi('box', c.stock <= S.settings().lowStock ? 'stat__icon--warn' : '', 'Stock', String(c.stock), c.stock <= S.settings().lowStock ? 'at or below reorder level' : 'units on hand') +
                U.kpi('star', '', 'Rating', c.rating + '/5', c.reviewCount + ' verified buyers') +
                U.kpi('book', linked.length ? '' : 'stat__icon--warn', 'Linked articles', String(linked.length), 'blogs referencing this product') +
            '</div>' +

            '<div class="grid grid--2" style="align-items:start;">' +

                '<div>' +
                    '<div class="panel"><div class="panel__head"><span class="t-label">Product</span>' +
                        '<span>' + (c.hidden ? '<span class="badge badge--neutral">Hidden</span>' : '<span class="badge badge--ok">Live</span>') + '</span></div>' +
                        '<div class="panel__body">' +
                            '<div class="row" style="gap:16px;align-items:flex-start;">' +
                                (c.images.length ? '<img class="table__thumb" style="width:96px;height:96px;border-radius:8px;object-fit:cover;" src="' + U.esc(c.images[0]) + '" alt="">'
                                    : '<span class="table__thumb" style="width:96px;height:96px;display:flex;align-items:center;justify-content:center;background:rgba(255,0,170,.12);">' + A().icon('image', 20) + '</span>') +
                                '<div style="flex:1;min-width:0;">' +
                                    '<div class="fw-700">' + U.esc(c.productName) + '</div>' +
                                    '<div class="fs-xs t-mute" style="margin:4px 0 8px;">' + U.money(c.price) + (c.compareAtPrice ? ' <span style="text-decoration:line-through;">' + U.money(c.compareAtPrice) + '</span>' : '') + '</div>' +
                                    '<div>' + (c.tags || []).map(function (t) { return '<span class="badge badge--neutral">' + U.esc(t) + '</span>'; }).join(' ') + '</div>' +
                                '</div>' +
                            '</div>' +
                            '<div class="t-body" style="margin-top:12px;">' + (c.description ? U.esc(c.description) : '<span class="t-mute">No description yet - the description field feeds every AI draft.</span>') + '</div>' +
                        '</div></div>' +

                    '<div class="panel" id="pdPanel">' +
                        '<div class="panel__head"><span class="t-label">AI content engine</span><span id="pdStatus"></span></div>' +
                        '<div class="panel__body" id="pdBody"><span class="spinner spinner--ai"></span> Loading the content engine...</div>' +
                        '<div class="panel__foot" id="pdFoot"></div>' +
                    '</div>' +

                    '<div class="panel"><div class="panel__head"><span class="t-label">Linked articles</span><span class="fs-xs t-mute">' + linked.length + ' on the blog</span></div>' +
                        '<div class="panel__body">' + linkedHtml(linked) + '</div>' +
                        (linked.length ? '' : '<div class="panel__foot"><button class="btn btn--ai btn--sm" type="button" data-act="blog">' + A().icon('sparkles', 12) + 'Create the first SEO blog for this product</button></div>') +
                    '</div></div>' +

                '<div>' +
                    '<div class="panel"><div class="panel__head"><span class="t-label">SEO package</span>' + seoBadge(seo.state) + '</div>' +
                        '<div class="panel__body">' +
                            '<div class="field"><div class="t-label">Meta title</div><div class="fs-sm">' + (p.seo && p.seo.metaTitle ? U.esc(p.seo.metaTitle) : '<span class="t-mute">missing</span>') + '</div></div>' +
                            '<div class="field"><div class="t-label">Meta description</div><div class="fs-sm">' + (p.seo && p.seo.metaDescription ? U.esc(p.seo.metaDescription) : '<span class="t-mute">missing</span>') + '</div></div>' +
                            '<div class="field"><div class="t-label">Keywords</div><div class="fs-sm">' + (p.seo && (p.seo.keywords || []).length ? U.esc((p.seo.keywords || []).join(', ')) : '<span class="t-mute">missing</span>') + '</div></div>' +
                            '<div class="row" style="gap:8px;"><button class="btn btn--ai btn--sm" type="button" data-act="seo">' + A().icon('sparkles', 12) + 'Generate package</button>' +
                            '<button class="btn btn--sm" type="button" data-act="analyze">' + A().icon('search', 12) + 'Analyze</button></div>' +
                        '</div></div>' +

                    '<div class="panel"><div class="panel__head"><span class="t-label">Specifications</span><span class="fs-xs t-mute">' + c.specifications.length + ' rows</span></div>' +
                        '<div class="panel__body">' + specsHtml(c) + '</div>' +
                        '<div class="panel__foot fs-xs t-mute">Every AI section and benefit statement is grounded in these rows - the model is never allowed to invent specs.</div></div>' +

                    '<div class="panel"><div class="panel__head"><span class="t-label">Media</span><span class="fs-xs t-mute">' + c.images.length + ' image(s)</span></div>' +
                        '<div class="panel__body">' + mediaHtml(c, p) + '</div></div>' +

                    '<div class="panel"><div class="panel__head"><span class="t-label">Operations</span><span class="badge badge--neutral">internal</span></div>' +
                        '<div class="panel__body">' + opsHtml(c, p, margin) + '</div>' +
                        '<div class="panel__foot fs-xs t-mute">Internal fields never leave the dashboard - prompts receive product context only.</div></div>' +

                '</div></div>';

            root.addEventListener('click', function (e) {
                var t = e.target.closest('[data-act]');
                if (!t) return;
                var act = t.getAttribute('data-act');
                if (act === 'edit') V.products.edit(c.productId);
                if (act === 'blog') location.hash = '#/blog/generate?product=' + encodeURIComponent(c.productId);
                if (act === 'analyze') openAnalyze(ctx, p);
                if (act === 'seo') runSeo(ctx, p, t);
                if (act === 'genPage') genPage(ctx, p, t);
                if (act === 'genSeo') genSeoFull(ctx, p, t);
                if (act === 'genImages') genImages(ctx, p, t);
                if (act === 'editDraft') openContentEditor(ctx, p);
                if (act === 'deleteDraft') deleteDraft(ctx, p);
                if (act === 'submit' || act === 'approve' || act === 'reject' || act === 'publish' || act === 'unpublish') workflow(ctx, p, act);
            });

            loadContent(ctx, p);
        }
    };

    /* ================================================================
       CONTENT ENGINE - load, generate, workflow
       ================================================================ */

    var state = { content: null, loading: false };

    function api() { return window.API; }

    function loadContent(ctx, p) {
        var body = document.getElementById('pdBody');
        if (!body) return;
        state.loading = true;
        body.innerHTML = '<span class="spinner spinner--ai"></span> Loading the content engine...';
        api().request('/products/' + encodeURIComponent(String(p.id)) + '/content').then(function (res) {
            state.loading = false;
            state.content = res && res.data ? res.data : null;
            paintContent(ctx, p);
        }, function (err) {
            state.loading = false;
            if (err && err.response && err.response.status === 404) {
                state.content = null;
                paintContent(ctx, p);
                return;
            }
            body.innerHTML = '<div class="bl-empty">The content engine could not be reached: ' + U.esc((err && err.message) || 'unknown error') + '</div>';
        });
    }

    function paintContent(ctx, p) {
        var body = document.getElementById('pdBody');
        var foot = document.getElementById('pdFoot');
        var status = document.getElementById('pdStatus');
        if (!body) return;
        var d = state.content;
        var aiStat = ctx.AI.status();

        if (!d) {
            if (status) status.innerHTML = contentBadge('none');
            body.innerHTML =
                '<div class="t-body">No AI content yet. Generate the full product page - SEO title, short and long descriptions, features, benefits, use cases, why-choose, specifications, FAQ, shipping, returns and summary - and it lands here as a <b>draft</b> for review. Nothing goes live until you publish it.</div>' +
                '<div class="fs-xs t-mute" style="margin-top:8px;">Engine: ' + U.esc(aiStat.mode === 'live' ? 'Live - ' + aiStat.providerLabel + ' (' + aiStat.model + ')' : 'Offline Studio - deterministic drafts from the catalogue specs') + '</div>' +
                '<div class="row" style="gap:8px;margin-top:12px;">' +
                    '<button class="btn btn--ai" type="button" data-act="genPage">' + A().icon('sparkles', 13) + 'Generate product page</button>' +
                    '<button class="btn btn--sm" type="button" data-act="genSeo" disabled title="Generate the product page first">' + A().icon('search', 13) + 'SEO package</button>' +
                    '<button class="btn btn--sm" type="button" data-act="genImages" disabled title="Generate the product page first">' + A().icon('image', 13) + 'Image SEO</button>' +
                '</div>';
            if (foot) foot.innerHTML = '';
            return;
        }

        if (status) status.innerHTML = statusBadge(d.status);
        var s = d.sections || {};
        var counts = [
            (s.features || []).length + ' features',
            (s.benefits || []).length + ' benefits',
            (s.useCases || []).length + ' use cases',
            (d.faqs || []).length + ' FAQs',
            (d.images || []).length + ' image entries'
        ].join(' - ');
        var analysis = analyzeDraft(s, d);

        var liveNote = (d.live && d.status !== 'published')
            ? '<div class="fs-xs t-mute" style="margin-top:6px;">Live on the storefront: version ' + U.esc(String(d.live.version)) + ' published ' + app().dateTime(d.live.publishedAt) + '. Saving this draft does not touch the live copy until you publish again.</div>'
            : '';

        body.innerHTML =
            '<div class="row row--between" style="margin-bottom:8px;">' +
                '<div><div class="t-label">Working draft</div>' +
                '<div class="fs-sm fw-600" style="margin-top:2px;">' + U.esc(s.title || 'Untitled draft') + '</div></div>' +
                '<span class="fs-xs t-mute">v' + U.esc(String(d.version || 1)) + '</span>' +
            '</div>' +
            (s.shortDescription ? '<div class="t-body" style="margin-bottom:8px;">' + U.esc(s.shortDescription.slice(0, 240)) + (s.shortDescription.length > 240 ? '...' : '') + '</div>' : '') +
            '<div class="fs-xs t-mute">' + U.esc(counts) + '</div>' +
            (analysis ? analysisHtml(analysis) : '') +
            (d.publishedAt && d.status === 'published' ? '<div class="fs-xs t-mute" style="margin-top:4px;">Published ' + app().dateTime(d.publishedAt) + (d.approvedBy ? ' by ' + U.esc(d.approvedBy) : '') + ' - live on the storefront.</div>' : '') +
            liveNote +
            '<div class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap;">' +
                '<button class="btn btn--ai btn--sm" type="button" data-act="genPage">' + A().icon('refresh', 12) + 'Regenerate</button>' +
                '<button class="btn btn--sm" type="button" data-act="genSeo">' + A().icon('search', 12) + 'SEO package</button>' +
                '<button class="btn btn--sm" type="button" data-act="genImages">' + A().icon('image', 12) + 'Image SEO</button>' +
                '<button class="btn btn--sm" type="button" data-act="editDraft">' + A().icon('pencil', 12) + 'Edit draft</button>' +
            '</div>';

        if (foot) {
            var moves = workflowButtons(d.status, p);
            foot.innerHTML = moves +
                '<span class="spacer"></span>' +
                '<button class="btn btn--danger btn--sm" type="button" data-act="deleteDraft">' + A().icon('trash', 12) + 'Delete</button>';
        }
    }

    /* Only the legal moves for the current state are ever offered - the
       server enforces the same table, this just avoids dead buttons. */
    function workflowButtons(status, p) {
        var h = '';
        if (status === 'draft') {
            h += '<button class="btn btn--sm" type="button" data-act="submit">' + A().icon('send', 12) + 'Submit for review</button>';
        }
        if (status === 'review_pending') {
            h += '<button class="btn btn--ai btn--sm" type="button" data-act="approve">' + A().icon('check', 12) + 'Approve</button>' +
                '<button class="btn btn--sm" type="button" data-act="reject">Send back</button>';
        }
        if (status === 'ready_to_publish') {
            h += '<button class="btn btn--primary btn--sm" type="button" data-act="publish">' + A().icon('externalLink', 12) + 'Publish to store</button>' +
                '<button class="btn btn--sm" type="button" data-act="reject">Send back</button>';
        }
        if (status === 'published') {
            h += '<button class="btn btn--sm" type="button" data-act="unpublish">' + A().icon('eyeOff', 12) + 'Unpublish</button>';
        }
        return h;
    }

    /* ---------- generation ---------- */

    /* Phase 18 for product drafts: the same scoring engine the blog uses. */
    function analyzeDraft(s, d) {
        var SEO = window.TrendaryoSeoAnalysis;
        if (!SEO || !s) return null;
        var blocks = [];
        if (s.longDescription) blocks.push({ type: 'p', text: s.longDescription });
        if ((s.features || []).length) blocks.push({ type: 'ul', items: s.features });
        if ((s.benefits || []).length) blocks.push({ type: 'ul', items: s.benefits });
        if ((s.useCases || []).length) blocks.push({ type: 'ul', items: s.useCases });
        blocks.push({ type: 'h2', text: s.title || 'Product' });
        try {
            return SEO.analyze({
                title: s.title,
                excerpt: s.shortDescription,
                metaTitle: (d.seo || {}).metaTitle,
                metaDescription: (d.seo || {}).metaDescription,
                keywords: (d.seo || {}).keywords,
                blocks: blocks,
                faqs: d.faqs || [],
                images: d.images || [],
                schema: (d.seo || {}).schema || null,
                wordTarget: 800
            });
        } catch (e) { return null; }
    }

    function analysisHtml(a) {
        var h = '<div class="row row--between" style="margin-top:10px;">' +
            '<span class="fs-sm fw-600">Content analysis</span>' +
            '<span class="badge ' + (a.score >= 85 ? 'badge--ok' : (a.score >= 70 ? 'badge--warn' : 'badge--danger')) + '">' + a.score + '/100 - ' + U.esc(a.grade) + '</span></div>' +
            '<div class="meter" style="margin:6px 0;"><div class="meter__fill" style="width:' + a.score + '%;"></div></div>' +
            '<div class="fs-xs t-mute">SEO ' + a.seoScore + ' - readability ' + a.readabilityScore + ' (' + U.esc(a.readability.level) + ') - ' + a.wordCount + ' words</div>';
        var weakest = a.metrics.slice().sort(function (x, y) { return x.score - y.score; }).slice(0, 2);
        if (weakest.length && weakest[0].score < 100) {
            h += '<div class="fs-xs t-mute" style="margin-top:4px;">Weakest: ' + weakest.map(function (m) { return U.esc(m.label) + ' (' + m.score + ')'; }).join(', ') + '</div>';
        }
        return h + '</div>';
    }

    function splitPage(res) {
        var data = (res && res.data) || {};
        var sections = Object.assign({}, data);
        var faqs = sections.faqs || [];
        delete sections.faqs;
        return { sections: sections, faqs: faqs, raw: res };
    }

    function genPage(ctx, p, btn) {
        var App = ctx.App;
        btn.classList.add('is-busy');
        ctx.AI.run('productPage', { product: p }, { refId: String(p.id) }).then(function (res) {
            btn.classList.remove('is-busy');
            var parts = splitPage(res);
            if (!parts.sections.title) { App.toast('Could not parse the generated page - see AI history', 'warn', 'AI content'); return; }
            V.util.aiReview({
                title: 'Product page - ' + (p.name || ''),
                meta: res.provider + ' - ' + res.ms + 'ms' + (res.fallbackError ? ' - live call failed, Offline Studio draft used' : ''),
                text: JSON.stringify(Object.assign({}, parts.sections, { faqs: parts.faqs }), null, 2),
                fields: {
                    'Title': parts.sections.title || '',
                    'Short description': (parts.sections.shortDescription || '').slice(0, 180),
                    'Contents': [(parts.sections.features || []).length + ' features', (parts.sections.benefits || []).length + ' benefits', (parts.sections.useCases || []).length + ' use cases', parts.faqs.length + ' FAQs'].join(', ')
                },
                applyText: 'Save as draft',
                onApply: function () {
                    saveDraft(ctx, p, { sections: parts.sections, faqs: parts.faqs }, 'Product page saved as a draft');
                },
                onRedo: function (done) {
                    ctx.AI.run('productPage', { product: p }, { refId: String(p.id), silent: true }).then(function (r2) {
                        var again = splitPage(r2);
                        if (again.sections.title) done(JSON.stringify(Object.assign({}, again.sections, { faqs: again.faqs }), null, 2));
                    });
                }
            });
        }, function () {
            btn.classList.remove('is-busy');
            App.toast('Generation failed', 'danger', 'AI content');
        });
    }

    function genSeoFull(ctx, p, btn) {
        var App = ctx.App;
        var d = state.content;
        if (!d) { App.toast('Generate the product page first', 'warn', 'AI content'); return; }
        btn.classList.add('is-busy');
        ctx.AI.run('productSeoFull', { product: p }, { refId: String(p.id) }).then(function (res) {
            btn.classList.remove('is-busy');
            if (!res.data || !res.data.metaTitle) { App.toast('Could not parse the SEO package - see AI history', 'warn', 'AI SEO'); return; }
            V.util.aiReview({
                title: 'SEO package - ' + (p.name || ''),
                meta: res.provider + ' - ' + res.ms + 'ms',
                text: JSON.stringify(res.data, null, 2),
                fields: {
                    'Meta title': res.data.metaTitle || '',
                    'Meta description': res.data.metaDescription || '',
                    'Search intent': res.data.searchIntent || '',
                    'Long tail': (res.data.longTailKeywords || []).join(', ')
                },
                applyText: 'Save SEO package',
                onApply: function () {
                    saveDraft(ctx, p, {
                        sections: d.sections || {},
                        faqs: d.faqs || [],
                        images: d.images || [],
                        seo: res.data
                    }, 'SEO package saved');
                },
                onRedo: function (done) {
                    ctx.AI.run('productSeoFull', { product: p }, { refId: String(p.id), silent: true }).then(function (r2) {
                        if (r2.data) done(JSON.stringify(r2.data, null, 2));
                    });
                }
            });
        }, function () {
            btn.classList.remove('is-busy');
            App.toast('Generation failed', 'danger', 'AI SEO');
        });
    }

    function genImages(ctx, p, btn) {
        var App = ctx.App;
        var d = state.content;
        if (!d) { App.toast('Generate the product page first', 'warn', 'AI content'); return; }
        var P = PC();
        var c = P.context(p);
        if (!c.images.length) { App.toast('This product has no images to optimise', 'warn', 'Image SEO'); return; }
        btn.classList.add('is-busy');
        ctx.AI.run('imageSeo', { context: c, images: c.images }, { refId: String(p.id) }).then(function (res) {
            btn.classList.remove('is-busy');
            if (!res.data || !res.data.images || !res.data.images.length) { App.toast('Could not parse the image SEO output - see AI history', 'warn', 'Image SEO'); return; }
            V.util.aiReview({
                title: 'Image SEO - ' + (p.name || ''),
                meta: res.provider + ' - ' + res.ms + 'ms',
                text: JSON.stringify(res.data, null, 2),
                fields: {
                    'Images': String(res.data.images.length),
                    'First alt': (res.data.images[0] || {}).alt || '',
                    'First caption': (res.data.images[0] || {}).caption || ''
                },
                applyText: 'Save image SEO',
                onApply: function () {
                    saveDraft(ctx, p, {
                        sections: d.sections || {},
                        faqs: d.faqs || [],
                        images: res.data.images,
                        seo: draftSeo(d)
                    }, 'Image SEO saved');
                },
                onRedo: function (done) {
                    ctx.AI.run('imageSeo', { context: c, images: c.images }, { refId: String(p.id), silent: true }).then(function (r2) {
                        if (r2.data) done(JSON.stringify(r2.data, null, 2));
                    });
                }
            });
        }, function () {
            btn.classList.remove('is-busy');
            App.toast('Generation failed', 'danger', 'Image SEO');
        });
    }

    function draftSeo(d) {
        var s = d.seo || {};
        return {
            metaTitle: s.metaTitle || '', metaDescription: s.metaDescription || '',
            keywords: s.keywords || [], longTailKeywords: s.longTailKeywords || [],
            searchIntent: s.searchIntent || '', canonicalUrl: s.canonicalUrl || '',
            ogTitle: s.ogTitle || '', ogDescription: s.ogDescription || '',
            twitter: s.twitter || {}
        };
    }

    /* ---------- persistence + workflow ---------- */

    function saveDraft(ctx, p, patch, okMsg) {
        var App = ctx.App;
        api().request('/products/' + encodeURIComponent(String(p.id)) + '/content', {
            method: 'POST',
            body: patch
        }).then(function () {
            App.toast(okMsg, 'ok', 'AI content');
            loadContent(ctx, p);
        }, function (err) {
            App.toast((err && err.message) || 'Save failed', 'danger', 'AI content');
        });
    }

    function workflow(ctx, p, action) {
        var App = ctx.App;
        api().request('/products/' + encodeURIComponent(String(p.id)) + '/content', {
            method: 'PUT',
            body: { action: action }
        }).then(function () {
            var msgs = {
                submit: 'Submitted for review',
                approve: 'Approved - ready to publish',
                reject: 'Sent back to draft',
                publish: 'Published - live on the storefront',
                unpublish: 'Unpublished - back to draft'
            };
            App.toast(msgs[action] || 'Status updated', 'ok', 'AI content');
            loadContent(ctx, p);
        }, function (err) {
            App.toast((err && err.message) || 'Workflow move rejected', 'danger', 'AI content');
        });
    }

    function deleteDraft(ctx, p) {
        var App = ctx.App;
        App.confirm({
            title: 'Delete generated content?',
            message: '<p class="t-body">The draft, FAQs, image SEO and SEO package for <b>' + U.esc(p.name) + '</b> are removed. A published snapshot stops being served to the storefront.</p>',
            okText: 'Delete', danger: true
        }).then(function (ok) {
            if (!ok) return;
            api().request('/products/' + encodeURIComponent(String(p.id)) + '/content', { method: 'DELETE' })
                .then(function () {
                    state.content = null;
                    App.toast('Generated content removed', 'ok', 'AI content');
                    paintContent(ctx, p);
                }, function (err) {
                    App.toast((err && err.message) || 'Delete failed', 'danger', 'AI content');
                });
        });
    }

    /* ---------- manual editor for the working draft ---------- */

    function openContentEditor(ctx, p) {
        var App = ctx.App;
        var d = state.content;
        if (!d) return;
        var s = d.sections || {};
        var faqs = (d.faqs || []).map(function (f) { return { q: f.q, a: f.a }; });
        var images = (d.images || []).map(function (i) { return { url: i.url, alt: i.alt, seoAlt: i.seoAlt, caption: i.caption, description: i.description }; });

        function textarea(id, label, value, rows, hint) {
            return '<div class="field"><label class="field__label">' + U.esc(label) + '</label>' +
                '<textarea class="textarea" id="' + id + '" rows="' + (rows || 3) + '">' + U.esc(value) + '</textarea>' +
                (hint ? '<div class="field__hint">' + U.esc(hint) + '</div>' : '') + '</div>';
        }

        var body = '<div class="editor-layout"><div>' +
            '<div class="field"><label class="field__label">Title</label><input class="input" id="ceTitle" value="' + U.esc(s.title || '') + '"></div>' +
            textarea('ceShort', 'Short description (50-150 words)', s.shortDescription || '', 4) +
            textarea('ceLong', 'Long description (500-1500 words)', s.longDescription || '', 10) +
            textarea('ceFeatures', 'Features (one per line)', (s.features || []).join('\n'), 4) +
            textarea('ceBenefits', 'Benefits (one per line)', (s.benefits || []).join('\n'), 4) +
            textarea('ceUseCases', 'Use cases (one per line)', (s.useCases || []).join('\n'), 3) +
            textarea('ceWhy', 'Why choose this product', s.whyChoose || '', 4) +
            textarea('ceShipping', 'Shipping', s.shipping || '', 3) +
            textarea('ceReturns', 'Returns', s.returns || '', 3) +
            textarea('ceSummary', 'Summary', s.summary || '', 3) +
            '</div><div>' +
            '<div class="panel"><div class="panel__head"><span class="t-label">FAQs</span><button class="btn btn--sm" type="button" id="ceAddFaq">' + A().icon('plus', 12) + 'Add</button></div>' +
            '<div class="panel__body" id="ceFaqs"></div></div>' +
            '<div class="panel"><div class="panel__head"><span class="t-label">Image SEO</span></div>' +
            '<div class="panel__body" id="ceImages"></div></div>' +
            '</div></div>';

        App.drawer.open({
            title: 'Edit draft - ' + (p.name || ''),
            sub: 'Changes are saved back to the draft; publishing stays a separate human step',
            wide: true,
            body: body,
            foot: '<span class="spacer"></span>' +
                '<button class="btn" type="button" data-dc>Cancel</button>' +
                '<button class="btn btn--primary" type="button" data-save>' + A().icon('save', 13) + 'Save draft</button>',
            onMount: function (root) {
                var q = function (sel) { return root.querySelector(sel); };

                function lines(id) {
                    return q('#' + id).value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
                }

                function drawFaqs() {
                    var h = '';
                    for (var i = 0; i < faqs.length; i++) {
                        h += '<div class="blk" data-faq="' + i + '" style="margin-bottom:8px;">' +
                            '<div class="blk__head"><span class="blk__n">' + (i + 1) + '</span><span class="spacer"></span>' +
                            '<button class="icon-btn" type="button" data-faqdel="' + i + '" title="Remove">' + A().icon('trash', 13) + '</button></div>' +
                            '<div class="blk__body">' +
                            '<input class="input" data-faqq="' + i + '" value="' + U.esc(faqs[i].q) + '" placeholder="Question">' +
                            '<textarea class="textarea" data-faqa="' + i + '" rows="2" placeholder="Answer">' + U.esc(faqs[i].a) + '</textarea>' +
                            '</div></div>';
                    }
                    h += faqs.length ? '' : '<div class="bl-empty">No FAQs yet.</div>';
                    q('#ceFaqs').innerHTML = h;
                }

                function drawImages() {
                    var h = '';
                    for (var j = 0; j < images.length; j++) {
                        var im = images[j];
                        h += '<div class="blk" data-img="' + j + '" style="margin-bottom:8px;">' +
                            '<div class="blk__head"><img class="table__thumb" style="width:28px;height:28px;" src="' + U.esc(im.url) + '" alt=""><span class="spacer"></span>' +
                            '<button class="icon-btn" type="button" data-imgdel="' + j + '" title="Remove">' + A().icon('trash', 13) + '</button></div>' +
                            '<div class="blk__body">' +
                            '<input class="input" data-imgalt="' + j + '" value="' + U.esc(im.alt) + '" placeholder="Alt text">' +
                            '<input class="input" data-imgseo="' + j + '" value="' + U.esc(im.seoAlt) + '" placeholder="SEO alt text">' +
                            '<input class="input" data-imgcap="' + j + '" value="' + U.esc(im.caption) + '" placeholder="Caption">' +
                            '<textarea class="textarea" data-imgdesc="' + j + '" rows="2" placeholder="Description">' + U.esc(im.description) + '</textarea>' +
                            '</div></div>';
                    }
                    h += images.length ? '' : '<div class="bl-empty">No image entries yet - run Image SEO.</div>';
                    q('#ceImages').innerHTML = h;
                }

                drawFaqs();
                drawImages();

                q('#ceAddFaq').addEventListener('click', function () {
                    faqs.push({ q: '', a: '' });
                    drawFaqs();
                });

                root.addEventListener('click', function (e) {
                    var t;
                    if ((t = e.target.closest('[data-faqdel]'))) {
                        faqs.splice(Number(t.getAttribute('data-faqdel')), 1);
                        drawFaqs();
                        return;
                    }
                    if ((t = e.target.closest('[data-imgdel]'))) {
                        images.splice(Number(t.getAttribute('data-imgdel')), 1);
                        drawImages();
                    }
                });
                root.addEventListener('input', function (e) {
                    var t = e.target;
                    if (!t.hasAttribute || !t.hasAttribute('data-faqq')) {
                        if (t.hasAttribute && t.hasAttribute('data-faqa')) {
                            faqs[Number(t.getAttribute('data-faqa'))].a = t.value;
                        } else if (t.hasAttribute && t.hasAttribute('data-imgalt')) {
                            images[Number(t.getAttribute('data-imgalt'))].alt = t.value;
                        } else if (t.hasAttribute && t.hasAttribute('data-imgseo')) {
                            images[Number(t.getAttribute('data-imgseo'))].seoAlt = t.value;
                        } else if (t.hasAttribute && t.hasAttribute('data-imgcap')) {
                            images[Number(t.getAttribute('data-imgcap'))].caption = t.value;
                        } else if (t.hasAttribute && t.hasAttribute('data-imgdesc')) {
                            images[Number(t.getAttribute('data-imgdesc'))].description = t.value;
                        }
                        return;
                    }
                    faqs[Number(t.getAttribute('data-faqq'))].q = t.value;
                });

                q('[data-dc]').addEventListener('click', function () { App.drawer.close(); });
                q('[data-save]').addEventListener('click', function () {
                    var sections = Object.assign({}, s, {
                        title: q('#ceTitle').value.trim(),
                        shortDescription: q('#ceShort').value.trim(),
                        longDescription: q('#ceLong').value.trim(),
                        features: lines('ceFeatures'),
                        benefits: lines('ceBenefits'),
                        useCases: lines('ceUseCases'),
                        whyChoose: q('#ceWhy').value.trim(),
                        shipping: q('#ceShipping').value.trim(),
                        returns: q('#ceReturns').value.trim(),
                        summary: q('#ceSummary').value.trim(),
                        specifications: (s.specifications || []).map(function (r) { return { label: r.label, value: r.value }; })
                    });
                    if (!sections.title) { App.toast('Give the draft a title', 'warn', 'AI content'); return; }
                    saveDraft(ctx, p, {
                        sections: sections,
                        faqs: faqs.filter(function (f) { return f.q && f.a; }),
                        images: images,
                        seo: draftSeo(d)
                    }, 'Draft updated');
                    App.drawer.close();
                });
            }
        });
    }

    /* ---------- shared panels ---------- */

    function linkedHtml(linked) {
        if (!linked.length) {
            return '<div class="bl-empty">No articles reference this product yet. A blog generated from this product links back automatically, and its product cards render on the storefront article.</div>';
        }
        var h = '';
        for (var i = 0; i < linked.length; i++) {
            var b = linked[i];
            var st = postState(b);
            var badge = st === 'published' ? '<span class="badge badge--ok">Published</span>'
                : st === 'scheduled' ? '<span class="badge badge--warn">Scheduled</span>'
                : '<span class="badge badge--neutral">Draft</span>';
            h += '<div class="row" style="gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06);">' +
                '<div style="flex:1;min-width:0;"><div class="table__primary t-truncate">' + U.esc(b.title || 'Untitled') + '</div>' +
                '<div class="table__secondary">/' + U.esc(b.slug || b.id) + ' - ' + (b.views || 0) + ' views</div></div>' + badge +
                '<a class="btn btn--sm" href="blog-post.html?slug=' + encodeURIComponent(b.slug || b.id) + '" target="_blank" rel="noopener">View</a></div>';
        }
        return h;
    }

    function specsHtml(c) {
        if (!c.specifications.length) {
            return '<div class="bl-empty">No specification rows yet. Add specs to the product so AI sections can quote real numbers instead of placeholders.</div>';
        }
        var h = '<div class="table-wrap"><table class="table table--compact"><tbody>';
        for (var i = 0; i < c.specifications.length; i++) {
            h += '<tr><td class="t-label" style="width:40%;">' + U.esc(c.specifications[i].label) + '</td>' +
                '<td class="fs-sm">' + (c.specifications[i].value ? U.esc(c.specifications[i].value) : '<span class="t-mute">-</span>') + '</td></tr>';
        }
        return h + '</tbody></table></div>';
    }

    function mediaHtml(c, p) {
        if (!c.images.length) {
            return '<div class="bl-empty">No images on file. Add a cover image in the product editor - alt text, captions and OG images all depend on it.</div>';
        }
        var h = '';
        for (var i = 0; i < c.images.length; i++) {
            var alt = p.imageAlt || (Array.isArray(p.imageAlts) ? p.imageAlts[i] : '');
            h += '<div class="row" style="gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06);">' +
                '<img class="table__thumb" style="width:44px;height:44px;" src="' + U.esc(c.images[i]) + '" alt="">' +
                '<div style="flex:1;min-width:0;"><div class="fs-sm t-truncate">' + (alt ? U.esc(alt) : '<span class="t-mute">no alt text</span>') + '</div>' +
                '<div class="fs-xs t-mute">' + (alt ? 'alt text on file' : 'image SEO engine will write alt, caption and description') + '</div></div>' +
                '<span class="badge ' + (alt ? 'badge--ok' : 'badge--warn') + '">' + (alt ? 'alt ok' : 'alt missing') + '</span></div>';
        }
        return h;
    }

    function opsHtml(c, p, margin) {
        function row(label, value) {
            return '<div><div class="t-label">' + U.esc(label) + '</div><div class="fs-sm" style="margin-top:2px;">' + value + '</div></div>';
        }
        return '<div class="grid grid--2">' +
            row('Stock', String(c.stock) + ' units' + (c.hidden ? ' (hidden)' : '')) +
            row('SKU', c.sku ? U.esc(c.sku) : '<span class="t-mute">-</span>') +
            row('Cost price', p.costPrice != null ? U.money(Number(p.costPrice)) : '<span class="t-mute">not set</span>') +
            row('Margin', margin != null ? margin + '%' : '<span class="t-mute">needs cost</span>') +
            row('Reorder point', p.reorderPoint != null ? String(p.reorderPoint) : '<span class="t-mute">store default</span>') +
            row('Supplier', (c.supplier.supplierId ? U.esc(c.supplier.supplierId) : '<span class="t-mute">-</span>') + (c.supplier.leadTimeDays != null ? ' - ' + c.supplier.leadTimeDays + 'd lead' : '')) +
            '</div>';
    }

    /* ---------- Analyze SEO drawer (Phase 13) ---------- */

    function openAnalyze(ctx, p) {
        var App = ctx.App, seo = PC().analyzeSeo(p);
        var rows = '';
        for (var i = 0; i < seo.checks.length; i++) {
            var ch = seo.checks[i];
            rows += '<div class="row" style="gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06);">' +
                '<span class="' + (ch.ok ? 'text-ok' : 'text-danger') + '">' + A().icon(ch.ok ? 'check' : 'x', 15) + '</span>' +
                '<div style="flex:1;min-width:0;"><div class="fs-sm fw-600">' + U.esc(ch.label) + '</div>' +
                '<div class="fs-xs t-mute">' + U.esc(ch.hint) + '</div></div>' +
                '<span class="badge ' + (ch.ok ? 'badge--ok' : 'badge--warn') + '">' + ch.weight + ' pts</span></div>';
        }
        App.drawer.open({
            title: 'SEO analysis - ' + p.name,
            sub: 'What the storefront has to work with today',
            wide: true,
            body: '<div class="row" style="gap:16px;align-items:center;margin-bottom:6px;">' +
                '<div style="font-family:Orbitron,sans-serif;font-size:2rem;font-weight:700;">' + seo.score + '<span class="fs-sm t-mute">/100</span></div>' +
                '<div>' + seoBadge(seo.state) + '<div class="fs-xs t-mute" style="margin-top:4px;">Every check green = a full SEO package.</div></div></div>' + rows,
            foot: '<span class="spacer"></span>' +
                '<button class="btn" type="button" data-dc>Close</button>' +
                '<button class="btn btn--ai" type="button" data-gen>' + A().icon('sparkles', 13) + 'Generate SEO package</button>',
            onMount: function (root) {
                root.querySelector('[data-dc]').addEventListener('click', function () { App.drawer.close(); });
                root.querySelector('[data-gen]').addEventListener('click', function () { runSeo(ctx, p, this); });
            }
        });
    }

    /* ---------- AI SEO package (existing product.seo task) ---------- */

    function runSeo(ctx, p, btn) {
        var App = ctx.App, S = ctx.S;
        if (btn) btn.classList.add('is-busy');
        ctx.AI.run('seoPackage', { product: p }, { refId: String(p.id) }).then(function (res) {
            if (btn) btn.classList.remove('is-busy');
            if (!res.data) { App.toast('Generation could not be parsed - see AI history', 'warn', 'AI SEO'); return; }
            V.util.aiReview({
                title: 'SEO package - ' + p.name,
                meta: res.provider + ' - ' + res.ms + 'ms',
                text: JSON.stringify(res.data, null, 2),
                fields: {
                    'Meta title': res.data.metaTitle || '',
                    'Meta description': res.data.metaDescription || '',
                    'Keywords': (res.data.keywords || []).join(', ')
                },
                applyText: 'Apply to product',
                onApply: function () {
                    S.applySeo(p.id, {
                        metaTitle: res.data.metaTitle || '',
                        metaDescription: res.data.metaDescription || '',
                        keywords: res.data.keywords || []
                    });
                    S.aiUpdate(lastAiId(p.id, 'seoPackage'), { applied: 'seo' });
                    App.toast('SEO package applied to ' + p.name, 'ok', 'AI SEO');
                    App.drawer.close();
                    App.route();
                },
                onRedo: function (done) {
                    ctx.AI.run('seoPackage', { product: p }, { refId: String(p.id), silent: true }).then(function (r2) {
                        if (r2.data) { res.data = r2.data; done(JSON.stringify(r2.data, null, 2)); }
                    });
                }
            });
        }, function () {
            if (btn) btn.classList.remove('is-busy');
            App.toast('Generation failed', 'danger', 'AI SEO');
        });
    }

    function lastAiId(pid, task) {
        var h = window.TrendaryoAdminStore.aiHistory();
        for (var i = 0; i < h.length; i++) {
            if (String(h[i].refId) === String(pid) && (!task || h[i].task === task)) return h[i].id;
        }
        return null;
    }

})();
