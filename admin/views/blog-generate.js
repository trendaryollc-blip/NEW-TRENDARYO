/**
 * TRENDARYO ADMIN - Blog Generator (Phases 14-17)
 * ---------------------------------------------------------------------------
 * Route: #/blog/generate?product=<id>   (Admin > Blogs > Generate)
 *
 * The generator starts fully loaded from the approved product content and
 * its blog brief - the admin never pastes product data by hand. Controls:
 * blog type (8), article length, tone, custom instructions. Generation runs
 * through the shared AI engine, every result passes a review modal, and the
 * article lands in the Blog Studio as a draft for the publish workflow.
 */
(function () {
    'use strict';

    var V = window.TrendaryoAdminViews = window.TrendaryoAdminViews || {};
    var U = V.util;

    function PC() { return window.TrendaryoProductContext; }
    function A() { return window.TrendaryoAdmin; }
    function app() { return window.TrendaryoAdminApp; }
    function BB() { return window.BlogBlocks || { fromText: function (t) { return [{ type: 'p', text: t }]; }, readMinutes: function () { return 5; } }; }

    var BLOG_TYPES = [
        { id: 'product-review', label: 'Product review' },
        { id: 'buying-guide', label: 'Buying guide' },
        { id: 'comparison', label: 'Comparison' },
        { id: 'best-products', label: 'Best products list' },
        { id: 'trend', label: 'Trend article' },
        { id: 'seo-landing', label: 'SEO landing page' },
        { id: 'problem-solution', label: 'Problem solution article' },
        { id: 'faq-article', label: 'FAQ article' }
    ];
    var LENGTHS = [
        { id: 'short', label: 'Short (600-900 words)' },
        { id: 'medium', label: 'Medium (1200-1800 words)' },
        { id: 'long', label: 'Long (2000-3000 words)' },
        { id: 'custom', label: 'Custom (set in instructions)' }
    ];
    var TONES = ['professional', 'friendly', 'luxury', 'technical', 'conversational'];

    var gen = {
        product: null,
        brief: null,
        approved: null,
        seo: null,
        busy: false
    };

    V.blogGenerate = {
        title: 'Generate article',
        icon: 'sparkles',
        sub: 'AI article studio - brief, controls, review, draft. Nothing publishes without you',
        render: function (root, ctx) {
            var S = ctx.S, App = ctx.App;
            var productId = ctx.route && ctx.route.query ? String(ctx.route.query.product || '') : '';
            var p = productId ? S.product(productId) : null;

            if (!p) {
                root.innerHTML = U.head('Generate article', 'Pick a product to write about',
                    '<a class="btn btn--sm" href="#/blog">' + A().icon('arrowLeft', 13) + 'Back to the studio</a>') +
                    productPicker(ctx);
                bindPicker(root, ctx);
                return;
            }

            gen.product = p;
            gen.brief = null;
            gen.approved = null;
            gen.seo = null;

            root.innerHTML = U.head('Generate article',
                'For ' + p.name + ' - approved content, brief and controls, one click to a reviewable draft',
                '<a class="btn btn--sm" href="#/blog">' + A().icon('arrowLeft', 13) + 'Blog studio</a>' +
                '<a class="btn btn--sm" href="#/product-detail/' + encodeURIComponent(String(p.id)) + '">' + A().icon('package', 13) + 'Product details</a>') +

            '<div class="grid grid--2" style="align-items:start;">' +

                /* ---- product panel (Phase 15) ---- */
                '<div><div class="panel"><div class="panel__head"><span class="t-label">Selected product</span>' +
                    '<button class="btn btn--sm" type="button" data-gen="change">' + A().icon('refresh', 12) + 'Change</button></div>' +
                    '<div class="panel__body">' + productPanel(ctx, p) + '</div></div>' +

                    /* ---- brief panel (Phase 12) ---- */
                    '<div class="panel"><div class="panel__head"><span class="t-label">Blog brief</span><span id="bgBriefStatus"></span></div>' +
                    '<div class="panel__body" id="bgBriefBody"><span class="spinner spinner--ai"></span> Loading the brief...</div>' +
                    '<div class="panel__foot" id="bgBriefFoot"></div></div>' +

                    /* ---- topic cluster (Phase 24) ---- */
                    '<div class="panel"><div class="panel__head"><span class="t-label">Topic cluster</span><span id="bgClusterCount" class="fs-xs t-mute"></span></div>' +
                    '<div class="panel__body" id="bgClusterBody"></div>' +
                    '<div class="panel__foot fs-xs t-mute">Every type adds a different door to the same product - the articles cross-link automatically.</div></div>' +

                    /* ---- source warning ---- */
                    '<div id="bgWarn"></div>' +

                '</div>' +

                /* ---- controls + generate (Phase 16) ---- */
                '<div><div class="panel"><div class="panel__head"><span class="t-label">AI blog controls</span>' +
                    '<span class="fs-xs t-mute" id="bgEngine"></span></div>' +
                    '<div class="panel__body">' +
                        '<div class="field"><label class="field__label">Blog type</label><select class="select" id="bgType">' +
                            typeOpts() + '</select></div>' +
                        '<div class="field"><label class="field__label">Article length</label><select class="select" id="bgLength">' +
                            lengthOpts() + '</select></div>' +
                        '<div class="field"><label class="field__label">Tone</label><select class="select" id="bgTone">' +
                            toneOpts() + '</select></div>' +
                        '<div class="field"><label class="field__label">Additional instructions</label>' +
                            '<textarea class="textarea" id="bgInstr" rows="4" placeholder="Anything the article must cover, or must avoid. Optional."></textarea></div>' +
                        '<div class="row" style="gap:8px;">' +
                            '<button class="btn btn--ai" type="button" data-gen="brief">' + A().icon('list', 13) + 'Generate brief</button>' +
                            '<button class="btn btn--ai" type="button" data-gen="article">' + A().icon('sparkles', 13) + 'Generate article</button>' +
                        '</div>' +
                        '<div class="field__hint">Every generation opens a review modal. The article is saved as a <b>draft</b> in the Blog Studio - publishing stays a separate human step.</div>' +
                    '</div></div>' +

                    '<div class="panel"><div class="panel__head"><span class="t-label">What the AI receives</span></div>' +
                    '<div class="panel__body" id="bgPayload"></div>' +
                    '<div class="panel__foot fs-xs t-mute">Approved content only - briefs and articles never quote the supplier description once approved copy exists (Phase 11).</div></div>' +

                '</div></div>';

            var stat = ctx.AI.status();
            var engineEl = root.querySelector('#bgEngine');
            if (engineEl) engineEl.textContent = stat.mode === 'live' ? 'Live - ' + stat.providerLabel : 'Offline Studio';

            root.addEventListener('click', function (e) {
                var t = e.target.closest('[data-gen]');
                if (!t) return;
                var act = t.getAttribute('data-gen');
                if (act === 'brief') runBrief(ctx, p, t);
                if (act === 'article') runArticle(ctx, p, t);
                if (act === 'change') { location.hash = '#/blog/generate'; }
                if (act.indexOf('type-') === 0) {
                    var sel = root.querySelector('#bgType');
                    if (sel) { sel.value = act.slice(5); }
                    App.toast(typeLabel(act.slice(5)) + ' selected - review the controls, then Generate article', 'ai', 'Cluster');
                    var anchor2 = document.getElementById('bgType');
                    if (anchor2 && anchor2.scrollIntoView) anchor2.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });

            loadApproved(ctx, p);
            paintCluster(ctx, p);
        }
    };

    /* ---------- product picker (no ?product= in the hash) ---------- */

    function productPicker(ctx) {
        var S = ctx.S;
        var all = S.products();
        var h = '<div class="panel"><div class="panel__head"><span class="t-label">Choose a product</span></div>' +
            '<div class="panel__body"><div class="cards">';
        for (var i = 0; i < all.length; i++) {
            var p = all[i];
            h += '<div class="card-row"><div class="card-row__main"><div class="card-row__topline">' +
                '<div class="card-row__identity"><div class="card-row__title"><div class="table__primary t-truncate">' + U.esc(p.name) + '</div>' +
                '<div class="table__secondary">#' + U.esc(p.id) + ' - ' + U.esc(p.category || 'general') + '</div></div></div>' +
                '<div class="card-row__side"><a class="btn btn--ai btn--sm" href="#/blog/generate?product=' + encodeURIComponent(String(p.id)) + '">Write about this</a></div>' +
                '</div></div></div>';
        }
        h += '</div></div></div>';
        return h;
    }

    function bindPicker(root, ctx) {
        root.addEventListener('click', function (e) {
            var t = e.target.closest('a[href^="#/blog/generate?product="]');
            if (t) app().route();
        });
    }

    /* ---------- topic cluster (Phase 24) ---------- */

    function typeLabel(id) {
        for (var i = 0; i < BLOG_TYPES.length; i++) if (BLOG_TYPES[i].id === id) return BLOG_TYPES[i].label;
        return id;
    }

    function paintCluster(ctx, p) {
        var body = document.getElementById('bgClusterBody');
        var count = document.getElementById('bgClusterCount');
        if (!body) return;
        var linked = PC().linkedBlogs(ctx.S.blogPosts(), String(p.id));
        var byType = {};
        for (var i = 0; i < linked.length; i++) {
            var bt = (linked[i].seo && linked[i].seo.blogType) || '';
            if (bt && !byType[bt]) byType[bt] = linked[i];
        }
        var covered = 0;
        var h = '';
        for (var j = 0; j < BLOG_TYPES.length; j++) {
            var t = BLOG_TYPES[j];
            var post = byType[t.id];
            if (post) {
                covered++;
                var stale = post.status !== 'published' ? ' - ' + postState(post) : '';
                h += '<div class="row row--between" style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06);">' +
                    '<div class="fs-sm"><span class="text-ok">' + A().icon('check', 13) + '</span> ' + U.esc(t.label) + '</div>' +
                    '<div class="row" style="gap:8px;"><span class="fs-xs t-mute t-truncate" style="max-width:220px;">' + U.esc(post.title || '') + stale + '</span>' +
                    '<a class="btn btn--sm" href="blog-post.html?slug=' + encodeURIComponent(post.slug || post.id) + '" target="_blank" rel="noopener">View</a></div></div>';
            } else {
                h += '<div class="row row--between" style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06);">' +
                    '<div class="fs-sm t-mute">' + U.esc(t.label) + '</div>' +
                    '<button class="btn btn--ai btn--sm" type="button" data-gen="type-' + U.esc(t.id) + '">' + A().icon('sparkles', 12) + 'Generate</button></div>';
            }
        }
        body.innerHTML = h;
        if (count) count.textContent = covered + ' of ' + BLOG_TYPES.length + ' covered';
    }

    function postState(p) {
        if (p.status === 'published') return 'published';
        if (p.status !== 'published' && p.scheduledFor && new Date(p.scheduledFor) > new Date()) return 'scheduled';
        return 'draft';
    }

    /* ---------- product + brief rendering ---------- */

    function productPanel(ctx, p) {
        var S = ctx.S;
        var c = PC().context(p);
        var seo = PC().analyzeSeo(p);
        var art = c.images.length ? '<img class="table__thumb" style="width:72px;height:72px;border-radius:8px;object-fit:cover;" src="' + U.esc(c.images[0]) + '" alt="">'
            : '<span class="table__thumb" style="width:72px;height:72px;display:flex;align-items:center;justify-content:center;background:rgba(255,0,170,.12);">' + A().icon('image', 18) + '</span>';
        return '<div class="row" style="gap:14px;align-items:flex-start;">' + art +
            '<div style="flex:1;min-width:0;">' +
                '<div class="fw-700">' + U.esc(c.productName) + '</div>' +
                '<div class="fs-xs t-mute" style="margin:2px 0 6px;">' + U.esc(c.category) + ' - ' + U.money(c.price) + '</div>' +
                '<div class="fs-xs t-mute">' + U.esc(c.url) + '</div>' +
            '</div>' +
            '<span class="badge ' + (seo.state === 'full' ? 'badge--ok' : (seo.state === 'partial' ? 'badge--warn' : 'badge--danger')) + '">SEO ' + seo.score + '/100</span>' +
            '</div>' +
            '<div class="fs-sm" style="margin-top:10px;">' + ((p.seo && (p.seo.keywords || []).length)
                ? '<span class="t-label">Keywords:</span> ' + U.esc((p.seo.keywords || []).join(', '))
                : '<span class="t-mute">No SEO keywords on the product yet - the brief will propose them.</span>') + '</div>';
    }

    function loadApproved(ctx, p) {
        var warn = document.getElementById('bgWarn');
        if (!warn) return;
        if (!window.API) { warn.innerHTML = '<div class="bl-empty">The API client is unavailable on this page.</div>'; return; }
        window.API.request('/products/' + encodeURIComponent(String(p.id)) + '/content').then(function (res) {
            var d = (res && res.data) || null;
            if (d && d.status === 'published') {
                gen.approved = d.sections || {};
                gen.seo = d.seo || {};
                warn.innerHTML = '<div class="panel" style="border-color:rgba(0,230,150,.4);"><div class="panel__body fs-sm">' +
                    '<b>Approved content is live.</b> Articles are written from the published snapshot - the source of truth.</div></div>';
            } else if (d) {
                gen.approved = d.sections || {};
                gen.seo = d.seo || {};
                warn.innerHTML = '<div class="panel" style="border-color:rgba(255,180,0,.4);"><div class="panel__body fs-sm">' +
                    '<b>Working draft, not published.</b> Articles will cite the current draft. Publish the product content first for the storefront-ready version.</div></div>';
            } else {
                warn.innerHTML = '<div class="panel" style="border-color:rgba(255,90,90,.4);"><div class="panel__body fs-sm">' +
                    '<b>No approved content yet.</b> The article will be grounded in the product row and its specs only. For best results, generate and publish the product content in Product Details first.</div></div>';
            }
            loadBrief(ctx, p);
            paintPayload();
        }, function () {
            warn.innerHTML = '<div class="panel" style="border-color:rgba(255,90,90,.4);"><div class="panel__body fs-sm">' +
                '<b>No content engine data for this product.</b> The article will be grounded in the product row and its specs only.</div></div>';
            loadBrief(ctx, p);
            paintPayload();
        });
    }

    function loadBrief(ctx, p) {
        var body = document.getElementById('bgBriefBody');
        var foot = document.getElementById('bgBriefFoot');
        var status = document.getElementById('bgBriefStatus');
        if (!body) return;
        if (!window.API) { body.innerHTML = '<div class="bl-empty">The API client is unavailable.</div>'; return; }
        window.API.request('/blog/briefs?productId=' + encodeURIComponent(String(p.id))).then(function (res) {
            var list = (res && res.data) || [];
            gen.brief = list.length ? list[0] : null;
            paintBrief(ctx);
        }, function () {
            gen.brief = null;
            paintBrief(ctx);
        });
    }

    function paintBrief(ctx) {
        var body = document.getElementById('bgBriefBody');
        var foot = document.getElementById('bgBriefFoot');
        var status = document.getElementById('bgBriefStatus');
        if (!body) return;
        var b = gen.brief;
        if (!b) {
            if (status) status.innerHTML = '<span class="badge badge--neutral">No brief</span>';
            body.innerHTML = '<div class="bl-empty">No brief for this product yet. Generate one - the AI plans keywords, titles, H2s and FAQs from the approved content, then the article writes itself from the plan.</div>';
            if (foot) foot.innerHTML = '<span class="fs-xs t-mute">Briefs are created automatically when product content is published.</span>';
            return;
        }
        if (status) status.innerHTML = '<span class="badge ' + (b.status === 'BRIEF_READY' || b.status === 'USED' ? 'badge--ok' : 'badge--warn') + '">' + U.esc(b.status.replace(/_/g, ' ')) + '</span>';
        var h = '';
        function row(label, value) {
            if (!value) return '';
            return '<div class="field"><div class="t-label">' + U.esc(label) + '</div><div class="fs-sm" style="margin-top:2px;">' + U.esc(value) + '</div></div>';
        }
        h += row('Primary keyword', b.primaryKeyword);
        h += row('Secondary keywords', (b.secondaryKeywords || []).join(', '));
        h += row('Long tail', (b.longTailKeywords || []).join(', '));
        h += row('Search intent', b.searchIntent);
        h += row('Suggested titles', (b.suggestedTitles || []).join(' | '));
        h += row('Meta description', b.metaDescription);
        h += row('Recommended slug', b.recommendedSlug);
        var h2s = (b.h2Suggestions || []).map(function (s) { return s.text; });
        h += row('H2 plan', h2s.join(' | '));
        h += row('FAQs planned', String((b.faqs || []).length) + ' questions');
        body.innerHTML = h || '<div class="bl-empty">Brief exists but is empty - regenerate it.</div>';
        if (foot) foot.innerHTML = '<button class="btn btn--ai btn--sm" type="button" data-gen="brief">' + A().icon('refresh', 12) + 'Regenerate brief</button>';
    }

    function paintPayload() {
        var el = document.getElementById('bgPayload');
        if (!el) return;
        var a = gen.approved || {};
        var s = gen.seo || {};
        var items = [
            ['Approved title', a.title || '-'],
            ['Short description', a.shortDescription ? a.shortDescription.slice(0, 120) + (a.shortDescription.length > 120 ? '...' : '') : '-'],
            ['Features', String((a.features || []).length)],
            ['Benefits', String((a.benefits || []).length)],
            ['FAQs', String((a.faqs || []).length)],
            ['SEO keywords', (s.keywords || []).join(', ') || '-'],
            ['Brief', gen.brief ? gen.brief.status : '-']
        ];
        var h = '';
        for (var i = 0; i < items.length; i++) {
            h += '<div class="row row--between" style="padding:5px 0;border-bottom:1px solid rgba(255,255,255,.06);">' +
                '<span class="fs-sm t-mute">' + U.esc(items[i][0]) + '</span><span class="fs-sm">' + U.esc(items[i][1]) + '</span></div>';
        }
        el.innerHTML = h;
    }

    /* ---------- generation ---------- */

    function contentBrief() {
        var a = gen.approved || {};
        return {
            title: a.title || '',
            shortDescription: a.shortDescription || '',
            longDescription: a.longDescription || '',
            features: a.features || [],
            benefits: a.benefits || [],
            useCases: a.useCases || [],
            faqs: a.faqs || [],
            whyChoose: a.whyChoose || ''
        };
    }

    function briefInput() {
        return {
            primaryKeyword: (gen.brief && gen.brief.primaryKeyword) || '',
            secondaryKeywords: (gen.brief && gen.brief.secondaryKeywords) || [],
            longTailKeywords: (gen.brief && gen.brief.longTailKeywords) || [],
            h2Suggestions: (gen.brief && gen.brief.h2Suggestions) || [],
            faqs: (gen.brief && gen.brief.faqs) || [],
            blogType: currentValue('#bgType')
        };
    }

    function currentValue(sel) {
        var el = document.querySelector(sel);
        return el ? el.value : '';
    }

    function runBrief(ctx, p, btn) {
        var App = ctx.App;
        btn.classList.add('is-busy');
        ctx.AI.run('blogBrief', {
            product: p,
            content: contentBrief(),
            seo: gen.seo || {},
            blogType: currentValue('#bgType')
        }, { refId: String(p.id) }).then(function (res) {
            btn.classList.remove('is-busy');
            if (!res.data || !res.data.primaryKeyword) { App.toast('Could not parse the brief - see AI history', 'warn', 'AI brief'); return; }
            V.util.aiReview({
                title: 'Blog brief - ' + (p.name || ''),
                meta: res.provider + ' - ' + res.ms + 'ms',
                text: JSON.stringify(res.data, null, 2),
                fields: {
                    'Primary keyword': res.data.primaryKeyword || '',
                    'Titles': (res.data.suggestedTitles || []).length + ' options',
                    'H2 sections': (res.data.h2Suggestions || []).length,
                    'FAQs': (res.data.faqs || []).length
                },
                applyText: 'Save brief',
                onApply: function () { saveBrief(ctx, p, res.data); },
                onRedo: function (done) {
                    ctx.AI.run('blogBrief', { product: p, content: contentBrief(), seo: gen.seo || {}, blogType: currentValue('#bgType') }, { refId: String(p.id), silent: true })
                        .then(function (r2) { if (r2.data) done(JSON.stringify(r2.data, null, 2)); });
                }
            });
        }, function () {
            btn.classList.remove('is-busy');
            App.toast('Generation failed', 'danger', 'AI brief');
        });
    }

    function saveBrief(ctx, p, data) {
        var App = ctx.App;
        if (!window.API) { App.toast('The API client is unavailable', 'danger', 'Blog brief'); return; }
        window.API.request('/blog/briefs', {
            method: 'POST',
            body: {
                productId: String(p.id),
                productName: p.name || '',
                status: 'BRIEF_READY',
                primaryKeyword: data.primaryKeyword || '',
                secondaryKeywords: data.secondaryKeywords || [],
                longTailKeywords: data.longTailKeywords || [],
                searchIntent: data.searchIntent || '',
                seoOpportunities: data.seoOpportunities || [],
                competitorTopics: data.competitorTopics || [],
                suggestedTitles: data.suggestedTitles || [],
                metaDescription: data.metaDescription || '',
                recommendedSlug: data.recommendedSlug || '',
                h1Suggestions: data.h1Suggestions || [],
                h2Suggestions: data.h2Suggestions || [],
                faqs: data.faqs || [],
                internalLinkingIdeas: data.internalLinkingIdeas || [],
                contentOpportunities: data.contentOpportunities || [],
                blogType: currentValue('#bgType'),
                source: briefSource()
            }
        }).then(function () {
            App.toast('Brief saved - generate the article from it', 'ok', 'Blog brief');
            loadBrief(ctx, p);
        }, function (err) {
            App.toast((err && err.message) || 'Brief save failed', 'danger', 'Blog brief');
        });
    }

    function briefSource() {
        var a = gen.approved || {};
        return {
            contentTitle: a.title || '',
            shortDescription: a.shortDescription || '',
            keywords: (gen.seo && gen.seo.keywords) || [],
            price: (gen.product && gen.product.price) || 0,
            category: (gen.product && gen.product.category) || '',
            publishedAt: ''
        };
    }

    function runArticle(ctx, p, btn) {
        var App = ctx.App;
        btn.classList.add('is-busy');
        var siblings = PC().linkedBlogs(ctx.S.blogPosts(), String(p.id))
            .map(function (post) { return { title: post.title || 'Untitled', slug: post.slug || post.id }; })
            .slice(0, 8);
        ctx.AI.run('blogArticle', {
            product: p,
            content: contentBrief(),
            brief: briefInput(),
            seo: gen.seo || {},
            blogType: currentValue('#bgType'),
            length: currentValue('#bgLength'),
            tone: currentValue('#bgTone'),
            instructions: (document.querySelector('#bgInstr') || {}).value || '',
            productUrl: 'product.html?id=' + encodeURIComponent(String(p.id)),
            existingArticles: siblings
        }, { refId: String(p.id) }).then(function (res) {
            btn.classList.remove('is-busy');
            if (!res.data || !res.data.seoTitle) { App.toast('Could not parse the article - see AI history', 'warn', 'AI article'); return; }
            var analysis = analyzeArticle(res.data);
            V.util.aiReview({
                title: 'Article - ' + (p.name || ''),
                meta: res.provider + ' - ' + res.ms + 'ms' + (res.fallbackError ? ' - live call failed, Offline Studio draft used' : ''),
                text: articleToText(res.data),
                fields: {
                    'SEO title': res.data.seoTitle || '',
                    'Meta description': res.data.metaDescription || '',
                    'Sections': String((res.data.sections || []).length),
                    'FAQs': String((res.data.faqs || []).length),
                    'Words': String(wordCount(res.data)),
                    'Analysis': analysis.score + '/100 (SEO ' + analysis.seoScore + ', readability ' + analysis.readabilityScore + ') - grade ' + analysis.grade,
                    'Top fixes': (analysis.suggestions || []).slice(0, 3).map(function (s) { return s.label; }).join(', ') || 'nothing urgent'
                },
                applyText: 'Save as draft',
                onApply: function () { saveArticle(ctx, p, res.data); },
                onRedo: function (done) {
                    ctx.AI.run('blogArticle', {
                        product: p, content: contentBrief(), brief: briefInput(), seo: gen.seo || {},
                        blogType: currentValue('#bgType'), length: currentValue('#bgLength'), tone: currentValue('#bgTone'),
                        instructions: (document.querySelector('#bgInstr') || {}).value || '',
                        productUrl: 'product.html?id=' + encodeURIComponent(String(p.id)),
                        existingArticles: siblings
                    }, { refId: String(p.id), silent: true }).then(function (r2) {
                        if (r2.data) done(articleToText(r2.data));
                    });
                }
            });
        }, function () {
            btn.classList.remove('is-busy');
            App.toast('Generation failed', 'danger', 'AI article');
        });
    }

    /* Phase 18: score the generated article before it is saved. */
    function analyzeArticle(a) {
        var SEO = window.TrendaryoSeoAnalysis;
        if (!SEO || !a) return { score: 0, grade: '-', suggestions: [] };
        var blocks = articleToBlocks(a);
        return SEO.analyze({
            title: a.seoTitle,
            excerpt: a.excerpt,
            metaTitle: a.metaTitle,
            metaDescription: a.metaDescription,
            keywords: ((gen.brief && gen.brief.secondaryKeywords) || []).concat([(gen.brief && gen.brief.primaryKeyword) || '']).filter(Boolean),
            blocks: blocks,
            faqs: a.faqs || [],
            images: (a.imageAltText || []).map(function (alt) { return { url: 'img', alt: alt }; }),
            internalLinks: a.internalLinks || [],
            schema: null,
            wordTarget: wordTargetFor()
        });
    }

    function wordTargetFor() {
        var len = currentValue('#bgLength');
        if (len === 'short') return 800;
        if (len === 'long') return 2600;
        if (len === 'custom') return 1200;
        return 1500;
    }

    /* ---------- article -> blocks + save (Phase 17/20/22) ---------- */

    function articleToBlocks(a) {
        var blocks = [];
        if (a.introduction) {
            blocks.push({ type: 'p', text: a.introduction });
        }
        var sections = a.sections || [];
        for (var i = 0; i < sections.length; i++) {
            var s = sections[i];
            if (s.h2) blocks.push({ type: 'h2', text: s.h2 });
            var paras = s.paragraphs || [];
            for (var j = 0; j < paras.length; j++) blocks.push({ type: 'p', text: paras[j] });
            var h3s = s.h3s || [];
            for (var k = 0; k < h3s.length; k++) {
                if (h3s[k].h3) blocks.push({ type: 'h3', text: h3s[k].h3 });
                var hp = h3s[k].paragraphs || [];
                for (var m = 0; m < hp.length; m++) blocks.push({ type: 'p', text: hp[m] });
            }
            /* feature highlights ride along the first section */
            if (i === 0 && (a.featureHighlights || []).length) {
                blocks.push({ type: 'ul', items: a.featureHighlights.slice(0, 8) });
            }
            if (i === 0 && (a.benefits || []).length) {
                blocks.push({ type: 'h3', text: 'What that means for you' });
                blocks.push({ type: 'ul', items: a.benefits.slice(0, 8) });
            }
            /* comparison block rides its own section when present */
            if (i === 1 && (a.comparison || []).length) {
                blocks.push({ type: 'h3', text: 'Side by side on what matters' });
                blocks.push({ type: 'ul', items: a.comparison.slice(0, 6).map(function (c) { return c.criterion + ': ' + c.verdict; }) });
            }
        }
        if ((a.faqs || []).length) {
            blocks.push({ type: 'h2', text: 'Questions buyers ask' });
            for (var f = 0; f < a.faqs.length; f++) {
                blocks.push({ type: 'h3', text: a.faqs[f].q });
                blocks.push({ type: 'p', text: a.faqs[f].a });
            }
        }
        if ((a.internalLinks || []).length) {
            blocks.push({ type: 'h2', text: 'Where to go next' });
            blocks.push({ type: 'ul', items: a.internalLinks.map(function (l) { return l.anchor + ' (' + l.path + ') - ' + (l.why || ''); }) });
        }
        if (a.cta && a.cta.title) {
            blocks.push({ type: 'cta', title: a.cta.title, text: a.cta.text || '', href: a.cta.href || 'shop.html', label: a.cta.label || 'Browse the shop' });
        }
        if (a.conclusion) {
            blocks.push({ type: 'h2', text: 'Verdict' });
            blocks.push({ type: 'p', text: a.conclusion });
        }
        return blocks;
    }

    function articleToText(a) {
        var blocks = articleToBlocks(a);
        var lines = [];
        for (var i = 0; i < blocks.length; i++) {
            var b = blocks[i];
            if (b.type === 'h2') lines.push('## ' + b.text);
            else if (b.type === 'h3') lines.push('### ' + b.text);
            else if (b.type === 'ul') { for (var j = 0; j < b.items.length; j++) lines.push('- ' + b.items[j]); }
            else if (b.type === 'cta') lines.push('[CTA] ' + b.title + ' -> ' + b.href);
            else if (b.type === 'p') lines.push(b.text);
            lines.push('');
        }
        return lines.join('\n');
    }

    function wordCount(a) {
        var blocks = articleToBlocks(a);
        var words = 0;
        for (var i = 0; i < blocks.length; i++) {
            var b = blocks[i];
            if (b.type === 'ul') { for (var j = 0; j < b.items.length; j++) words += b.items[j].split(/\s+/).length; }
            else if (b.text) words += b.text.split(/\s+/).length;
        }
        return words;
    }

    function saveArticle(ctx, p, a) {
        var App = ctx.App;
        if (!window.API) { App.toast('The API client is unavailable', 'danger', 'AI article'); return; }
        var blocks = articleToBlocks(a);
        window.API.request('/blog', {
            method: 'POST',
            body: {
                title: a.seoTitle || (p.name + ' review'),
                excerpt: a.excerpt || a.metaDescription || '',
                category: a.category || 'guides',
                tags: a.tags || [],
                blocks: blocks,
                status: 'draft',
                coverImage: (gen.approved && gen.approved.coverImage) || p.image || '',
                coverAlt: (a.imageAltText || [])[0] || p.name || '',
                readMinutes: BB().readMinutes(blocks, ''),
                seo: {
                    metaTitle: a.metaTitle || '',
                    metaDescription: a.metaDescription || '',
                    keywords: ((gen.brief && gen.brief.secondaryKeywords) || []).concat([(gen.brief && gen.brief.primaryKeyword) || '']).filter(Boolean),
                    ogImage: p.image || '',
                    faqs: (a.faqs || []).map(function (f) { return { q: f.q, a: f.a }; }),
                    internalLinks: a.internalLinks || [],
                    blogType: currentValue('#bgType')
                },
                relatedProductIds: [String(p.id)]
            }
        }).then(function (res) {
            var slug = (res && res.data && (res.data.slug || res.data.id)) || '';
            markBriefUsed(p);
            App.toast('Draft saved' + (slug ? ' - /' + slug : '') + ' - open the Blog Studio to review and publish', 'ai', 'AI article');
            location.hash = '#/blog';
        }, function (err) {
            App.toast((err && err.message) || 'Saving the draft failed', 'danger', 'AI article');
        });
    }

    function markBriefUsed(p) {
        if (!gen.brief || !window.API) return;
        window.API.request('/blog/briefs/' + encodeURIComponent(gen.brief.id), {
            method: 'PUT',
            body: { status: 'USED' }
        }).then(function () { }, function () { /* status is best-effort */ });
    }

    /* ---------- controls markup ---------- */

    function typeOpts() {
        var h = '';
        for (var i = 0; i < BLOG_TYPES.length; i++) {
            h += '<option value="' + U.esc(BLOG_TYPES[i].id) + '"' + (BLOG_TYPES[i].id === 'product-review' ? ' selected' : '') + '>' + U.esc(BLOG_TYPES[i].label) + '</option>';
        }
        return h;
    }
    function lengthOpts() {
        var h = '';
        for (var i = 0; i < LENGTHS.length; i++) {
            h += '<option value="' + U.esc(LENGTHS[i].id) + '"' + (LENGTHS[i].id === 'medium' ? ' selected' : '') + '>' + U.esc(LENGTHS[i].label) + '</option>';
        }
        return h;
    }
    function toneOpts() {
        var h = '';
        for (var i = 0; i < TONES.length; i++) {
            h += '<option value="' + U.esc(TONES[i]) + '"' + (TONES[i] === 'professional' ? ' selected' : '') + '>' + U.esc(TONES[i]) + '</option>';
        }
        return h;
    }

})();
