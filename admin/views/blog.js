/**
 * TRENDARYO ADMIN - Blog Studio
 * ---------------------------------------------------------------------------
 * Block-based article editor with per-section AI, a scheduled-publish queue,
 * bulk SEO runs and a live preview that renders through the exact same
 * BlogBlocks renderer the storefront uses - preview and shop can never drift.
 *
 * Writes go through S.addBlogPost / S.saveBlogPost / S.deleteBlogPost, which
 * backend-sync.js hooks to POST/PUT/DELETE /api/blog.
 */
(function () {
    'use strict';

    var V = window.TrendaryoAdminViews = window.TrendaryoAdminViews || {};
    var U = V.util;

    function app() { return window.TrendaryoAdminApp; }
    function A() { return window.TrendaryoAdmin; }
    function BB() { return window.BlogBlocks || { render: function () { return ''; }, text: function () { return ''; }, fromText: function () { return []; }, readMinutes: function () { return 1; } }; }

    var BASE_CATS = ['guides', 'tech', 'fashion', 'lifestyle'];
    var stQ = { q: '', cat: '', status: '', seo: '', sort: 'newest' };

    /* Product anchor (Phase 14): #/blog?product=<id> carries the product
       context from the Product Details page into every AI brief. */
    var anchor = null;

    function anchoredProducts(S, snap) {
        var P = window.TrendaryoProductContext;
        var all = S.products();
        var out = [];
        if (anchor) out.push(anchor);
        if (!P || !P.matchProducts) return out.concat(all);
        var q = (snap && snap.title ? snap.title + ' ' : '') + (anchor ? anchor.name + ' ' + anchor.category : '');
        var matched = P.matchProducts(all, q, {
            category: anchor ? anchor.category : '',
            includeHidden: true,
            limit: 8
        });
        for (var i = 0; i < matched.length; i++) {
            if (!anchor || String(matched[i].id) !== String(anchor.id)) out.push(matched[i]);
            if (out.length >= 8) break;
        }
        return out;
    }

    function anchorBrief(p) {
        return { id: String(p.id), name: p.name, price: p.price, rating: p.rating, description: p.description || '' };
    }

    function anchorBanner() {
        if (!anchor) return '';
        var P = window.TrendaryoProductContext;
        var analysis = (P && P.analyzeSeo) ? P.analyzeSeo(anchor) : null;
        return '<div class="panel" style="margin-bottom:16px;border-color:rgba(255,0,170,.45);">' +
            '<div class="panel__body row" style="gap:14px;align-items:center;">' +
                '<span class="stat__icon stat__icon--accent">' + A().icon('sparkles', 16) + '</span>' +
                '<div style="flex:1;min-width:0;">' +
                    '<div class="fw-700">AI anchor: ' + U.esc(anchor.name) + '</div>' +
                    '<div class="fs-xs t-mute">Drafts generated here start from this product\'s approved content and real specs - prices, quotes and product links come from the catalogue, never invented' +
                    (analysis ? '. Current SEO score ' + analysis.score + '/100' : '') + '.</div>' +
                '</div>' +
                '<a class="btn btn--sm" href="#/product-detail/' + encodeURIComponent(String(anchor.id)) + '">' + A().icon('package', 13) + 'Product details</a>' +
                '<button class="btn btn--sm" type="button" data-anchor-clear>' + A().icon('x', 13) + 'Clear anchor</button>' +
            '</div></div>';
    }

    /* ---------- post helpers ---------- */

    function isScheduled(p) {
        return p.status !== 'published' && !!p.scheduledFor && new Date(p.scheduledFor) > new Date();
    }
    function stateOf(p) {
        if (p.status === 'published') return 'published';
        if (p.status === 'review_pending') return 'review';
        if (p.status === 'ready_to_publish') return 'ready';
        return isScheduled(p) ? 'scheduled' : 'draft';
    }
    function seoBadge(state) {
        if (state === 'full') return '<span class="badge badge--ok">SEO full</span>';
        if (state === 'partial') return '<span class="badge badge--warn">SEO partial</span>';
        return '<span class="badge badge--danger">SEO missing</span>';
    }
    function categories(S) {
        var seen = {}, i, list = S.blogPosts();
        var out = BASE_CATS.slice();
        for (i = 0; i < list.length; i++) {
            var c = String(list[i].category || '').toLowerCase();
            if (c && !seen[c]) { seen[c] = 1; if (out.indexOf(c) < 0) out.push(c); }
        }
        return out;
    }
    function productBrief(S) {
        var list = S.products(), out = [], i;
        for (i = 0; i < list.length; i++) {
            out.push({ id: String(list[i].id), name: list[i].name, price: list[i].price, description: list[i].description || '' });
        }
        return out;
    }
    function postBrief(p) {
        return {
            title: p.title || '',
            excerpt: p.excerpt || '',
            content: BB().text(p.blocks, p.content || '').slice(0, 2000)
        };
    }
    function lastAiIdFor(pid, task) {
        var h = window.TrendaryoAdminStore.aiHistory();
        for (var i = 0; i < h.length; i++) {
            if (String(h[i].refId) === String(pid) && (!task || h[i].task === task)) return h[i].id;
        }
        return null;
    }

    /* ================================================================
       LIST VIEW
       ================================================================ */

    V.blog = {
        title: 'Blog',
        icon: 'book',
        sub: 'AI-native content studio - drafts, scheduled queue and SEO on every article',
        render: function (root, ctx) {
            /* #/blog/generate?product=<id> renders the AI article generator. */
            if (ctx.route && ctx.route.param === 'generate' && V.blogGenerate) {
                V.blogGenerate.render(root, ctx);
                return;
            }
            var S = ctx.S, App = ctx.App;
            var anchorId = ctx.route && ctx.route.query ? String(ctx.route.query.product || '') : '';
            anchor = anchorId ? S.product(anchorId) : null;
            var all = S.blogPosts();
            var audit = S.blogAudit();
            var pub = 0, drafts = 0, sched = 0, views = 0, i;
            for (i = 0; i < all.length; i++) {
                views += Number(all[i].views) || 0;
                var st = stateOf(all[i]);
                if (st === 'published') pub++;
                else if (st === 'scheduled') sched++;
                else drafts++;
            }

            root.innerHTML = U.head('Blog Studio', all.length + ' articles - ' + pub + ' published, ' + drafts + ' drafts, ' + sched + ' scheduled',
                '<button class="btn btn--sm" id="blQueue" type="button">' + A().icon('clock', 13) + 'Publish queue</button>' +
                '<button class="btn btn--ai btn--sm" id="blBulkSeo" type="button">' + A().icon('sparkles', 13) + 'AI SEO audit</button>' +
                '<button class="btn btn--sm" id="blExport" type="button">' + A().icon('download', 13) + 'Export</button>' +
                '<button class="btn btn--primary btn--sm" id="blAdd" type="button">' + A().icon('plus', 13) + 'New post</button>') +

            '<div class="grid grid--5" style="margin-bottom:16px;">' +
                U.kpi('book', '', 'Articles', String(all.length), 'in the studio') +
                U.kpi('checkCircle', 'stat__icon--ok', 'Published', String(pub), 'live on the blog') +
                U.kpi('file', drafts ? 'stat__icon--warn' : '', 'In progress', String(drafts) + (sched ? ' + ' + sched : ''), 'drafts and scheduled') +
                U.kpi('eye', '', 'Total views', String(views), 'across all articles') +
                U.kpi('search', audit.missing ? 'stat__icon--danger' : 'stat__icon--ok', 'SEO coverage', audit.full + '/' + audit.total, 'full packages') +
            '</div>' +

            anchorBanner() +

            '<div class="panel"><div class="toolbar">' +
                '<div class="search">' + A().icon('search', 14) + '<input id="blQ" type="text" placeholder="Search title, excerpt, tags..."></div>' +
                '<select class="filter-select" id="blStatus"><option value="">All states</option><option value="published">Published</option><option value="draft">Draft</option><option value="review">Review pending</option><option value="ready">Ready to publish</option><option value="scheduled">Scheduled</option></select>' +
                '<select class="filter-select" id="blCat"><option value="">All categories</option>' + catOpts(S) + '</select>' +
                '<select class="filter-select" id="blSeo"><option value="">All SEO states</option><option value="full">Full</option><option value="partial">Partial</option><option value="missing">Missing</option></select>' +
                '<select class="filter-select" id="blSort"><option value="newest">Sort: Newest</option><option value="oldest">Sort: Oldest</option><option value="popular">Sort: Most views</option><option value="title">Sort: Title A-Z</option></select>' +
                '<span class="filter-count" id="blCount"></span></div>' +
                '<div id="blBulk" class="bulk-bar" style="display:none;"><span class="bulk-bar__count" id="blBulkN"></span><span class="t-dim">selected</span><span class="spacer"></span>' +
                '<button class="btn btn--ai btn--sm" id="blBulkFill" type="button">' + A().icon('sparkles', 12) + 'AI SEO + tags</button>' +
                '<button class="btn btn--sm" id="blBulkPub" type="button">' + A().icon('send', 12) + 'Publish</button>' +
                '<button class="btn btn--danger btn--sm" id="blBulkDel" type="button">Delete</button></div>' +
                '<div class="cards-wrap" id="blTable"></div></div>';

            bindToolbar(root, ctx);
            drawRows(root, ctx);

            var anchorClear = root.querySelector('[data-anchor-clear]');
            if (anchorClear) anchorClear.addEventListener('click', function () { location.hash = '#/blog'; });

            root.querySelector('#blAdd').addEventListener('click', function () { openEditor(ctx, null); });
            root.querySelector('#blExport').addEventListener('click', function () { exportCsv(ctx); });
            root.querySelector('#blQueue').addEventListener('click', function () { openQueue(ctx); });
            root.querySelector('#blBulkSeo').addEventListener('click', function () {
                var missing = [];
                var list = S.blogPosts();
                for (var j = 0; j < list.length; j++) if (S.blogSeoState(list[j]) !== 'full') missing.push({ id: list[j].id, name: list[j].title || list[j].slug });
                if (!missing.length) { App.toast('Every article already has a full SEO package', 'ok', 'AI SEO'); return; }
                App.confirm({
                    title: 'AI SEO audit',
                    message: '<p class="t-body">Generate and apply meta titles, descriptions, keywords, tags and related-product links for <b>' + missing.length + '</b> articles. Every draft lands in AI history before it is applied.</p>',
                    okText: 'Run on ' + missing.length + ' articles'
                }).then(function (ok) { if (ok) runBulkSeo(ctx, missing); });
            });
            bindBulk(ctx, root);
        }
    };

    function catOpts(S) {
        var cats = categories(S), h = '', i;
        for (i = 0; i < cats.length; i++) h += '<option value="' + U.esc(cats[i]) + '">' + U.esc(cats[i]) + '</option>';
        return h;
    }

    function bindToolbar(root, ctx) {
        var App = app();
        var q = root.querySelector('#blQ');
        q.addEventListener('input', App.debounce(function () { stQ.q = q.value; drawRows(root, ctx); }, 220));
        var map = { blStatus: 'status', blCat: 'cat', blSeo: 'seo', blSort: 'sort' };
        var keys = ['blStatus', 'blCat', 'blSeo', 'blSort'];
        for (var i = 0; i < keys.length; i++) {
            (function (id) {
                root.querySelector('#' + id).addEventListener('change', function () {
                    stQ[map[id]] = this.value;
                    drawRows(root, ctx);
                });
            })(keys[i]);
        }
    }

    function filtered(S) {
        var list = S.blogPosts(), out = [], i;
        var q = stQ.q.trim().toLowerCase();
        for (i = 0; i < list.length; i++) {
            var p = list[i];
            var hay = (p.title || '') + ' ' + (p.excerpt || '') + ' ' + (p.category || '') + ' ' + (p.tags || []).join(' ');
            if (q && hay.toLowerCase().indexOf(q) < 0) continue;
            if (stQ.cat && String(p.category) !== stQ.cat) continue;
            if (stQ.status && stateOf(p) !== stQ.status) continue;
            if (stQ.seo && S.blogSeoState(p) !== stQ.seo) continue;
            out.push(p);
        }
        if (stQ.sort === 'oldest') out.sort(function (a, b) { return new Date(a.createdAt || 0) - new Date(b.createdAt || 0); });
        else if (stQ.sort === 'popular') out.sort(function (a, b) { return (b.views || 0) - (a.views || 0); });
        else if (stQ.sort === 'title') out.sort(function (a, b) { return String(a.title || '').localeCompare(String(b.title || '')); });
        else out.sort(function (a, b) { return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); });
        return out;
    }

    function drawRows(root, ctx) {
        var S = ctx.S, App = ctx.App;
        var list = filtered(S);
        root.querySelector('#blCount').textContent = list.length + ' of ' + S.blogPosts().length;
        var el = root.querySelector('#blTable');

        if (!list.length) {
            el.innerHTML = U.empty('book', 'No articles here yet', 'Write your first post with the AI outline, or clear the filters to see the full shelf.');
            updateBulkBar(root);
            return;
        }

        var h = '<div class="cards"><div class="cards__selectbar"><label class="check"><input type="checkbox" id="blSelAll"></label><span>Select all</span></div>';
        for (var i = 0; i < list.length; i++) {
            var p = list[i];
            var st = stateOf(p);
            var stBadge = st === 'published' ? '<span class="badge badge--ok">Published</span>'
                : st === 'scheduled' ? '<span class="badge badge--warn">Scheduled</span>'
                : st === 'review' ? '<span class="badge badge--warn">Review pending</span>'
                : st === 'ready' ? '<span class="badge badge--info">Ready to publish</span>'
                : '<span class="badge badge--neutral">Draft</span>';
            var thumb = p.coverImage
                ? '<img class="table__thumb" src="' + U.esc(p.coverImage) + '" alt="">'
                : '<span class="table__thumb" style="display:flex;align-items:center;justify-content:center;background:rgba(255,0,170,.12);">' + A().icon('book', 15) + '</span>';
            h += '<div class="card-row" data-id="' + U.esc(p.id) + '">' +
                '<div class="card-row__check"><label class="check"><input type="checkbox" data-sel="' + U.esc(p.id) + '"></label></div>' +
                '<div class="card-row__main">' +
                    '<div class="card-row__topline">' +
                        '<div class="card-row__identity">' + thumb +
                            '<div class="card-row__title"><div class="table__primary t-truncate">' + U.esc(p.title || 'Untitled') + '</div>' +
                            '<div class="table__secondary">/' + U.esc(p.slug || p.id) + ' - ' + U.esc(p.category || 'general') + ' - ' + U.esc(p.author || 'Trendaryo Editorial') + ' - updated ' + (p.updatedAt ? App.ago(p.updatedAt) : 'just now') + '</div></div>' +
                        '</div>' +
                        '<div class="card-row__side"><span class="fs-sm t-mute">' + (p.views || 0) + ' views</span>' +
                        '<div class="card-row__actions">' +
                            '<button class="icon-btn" data-ai="' + U.esc(p.id) + '" type="button" title="AI SEO package">' + A().icon('sparkles', 14) + '</button>' +
                            '<button class="icon-btn" data-edit="' + U.esc(p.id) + '" type="button" title="Edit article">' + A().icon('pencil', 14) + '</button>' +
                            '<button class="icon-btn" data-view="' + U.esc(p.slug || p.id) + '" type="button" title="Open on the storefront">' + A().icon('externalLink', 14) + '</button>' +
                            '<button class="icon-btn" data-dup="' + U.esc(p.id) + '" type="button" title="Duplicate as draft">' + A().icon('copy', 14) + '</button>' +
                            '<button class="icon-btn" data-del="' + U.esc(p.id) + '" type="button" title="Delete">' + A().icon('trash', 14) + '</button>' +
                        '</div></div>' +
                    '</div>' +
                    '<div class="card-row__meta">' +
                        '<span>' + stBadge + '</span>' +
                        '<span>' + seoBadge(S.blogSeoState(p)) + '</span>' +
                        (p.featured ? '<span class="badge badge--accent">Featured</span>' : '') +
                        '<span class="badge badge--neutral">' + U.esc(p.category || 'general') + '</span>' +
                        '<span class="fs-xs t-mute">' + (p.readMinutes || BB().readMinutes(p.blocks, p.content)) + ' min read</span>' +
                        (isScheduled(p) ? '<span class="fs-xs t-mute">auto-publishes ' + new Date(p.scheduledFor).toLocaleString() + '</span>' : '') +
                        ((p.tags || []).length ? '<span class="fs-xs t-mute">' + (p.tags || []).slice(0, 4).map(U.esc).join(', ') + '</span>' : '') +
                    '</div>' +
                '</div></div>';
        }
        h += '</div>';
        el.innerHTML = h;

        if (!el.getAttribute('data-bound')) {
            el.setAttribute('data-bound', '1');
            el.addEventListener('change', function (e) {
                if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-sel')) updateBulkBar(root);
            });
            el.addEventListener('click', function (e) {
                var t;
                if ((t = e.target.closest('[data-edit]'))) { openEditor(ctx, t.getAttribute('data-edit')); return; }
            if ((t = e.target.closest('[data-view]'))) {
                window.open('blog-post.html?slug=' + encodeURIComponent(t.getAttribute('data-view')), '_blank', 'noopener');
                return;
            }
            if ((t = e.target.closest('[data-dup]'))) {
                var src = S.blogPost(t.getAttribute('data-dup'));
                if (!src) return;
                var copy = JSON.parse(JSON.stringify(src));
                delete copy.id; delete copy.slug; delete copy.views;
                copy.title = (copy.title || 'Untitled') + ' (Copy)';
                copy.status = 'draft'; copy.scheduledFor = null; copy.featured = false;
                S.addBlogPost(copy);
                App.toast('Duplicated as a draft', 'ok', 'Blog');
                app().badges();
                App.route();
                return;
            }
            if ((t = e.target.closest('[data-del]'))) {
                var del = t.getAttribute('data-del');
                var dp = S.blogPost(del);
                App.confirm({
                    title: 'Delete article?',
                    message: '<p class="t-body"><b>' + U.esc(dp ? dp.title : '') + '</b> is removed from the studio and, if published, stops being served at /blog.</p>',
                    okText: 'Delete', danger: true
                }).then(function (ok) {
                    if (!ok) return;
                    S.deleteBlogPost(del);
                    App.toast('Article deleted', 'ok', 'Blog');
                    drawRows(root, ctx);
                    app().badges();
                });
                return;
            }
            if ((t = e.target.closest('[data-ai]'))) {
                var aid = t.getAttribute('data-ai');
                var post = S.blogPost(aid);
                if (!post) return;
                var btn = t;
                btn.classList.add('is-busy');
                ctx.AI.run('blogMeta', postBrief(post), { refId: String(post.id) }).then(function (res) {
                    btn.classList.remove('is-busy');
                    if (!res.data) { App.toast('Could not parse the SEO package - see AI history', 'warn', 'AI SEO'); return; }
                    U.aiReview({
                        title: 'SEO package - ' + (post.title || ''),
                        meta: res.provider + ' - ' + res.ms + 'ms',
                        text: JSON.stringify(res.data, null, 2),
                        fields: {
                            'Meta title': res.data.metaTitle || '',
                            'Meta description': res.data.metaDescription || '',
                            'Keywords': (res.data.keywords || []).join(', ')
                        },
                        applyText: 'Apply to article',
                        onApply: function () {
                            S.applyBlogSeo(post.id, {
                                metaTitle: res.data.metaTitle || '',
                                metaDescription: res.data.metaDescription || '',
                                keywords: res.data.keywords || [],
                                ogImage: res.data.ogImage || post.seo && post.seo.ogImage || ''
                            });
                            S.aiUpdate(lastAiIdFor(post.id, 'blogMeta'), { applied: 'seo' });
                            App.toast('SEO package applied', 'ok', 'AI SEO');
                            drawRows(root, ctx);
                            app().badges();
                        },
                        onRedo: function (done) {
                            ctx.AI.run('blogMeta', postBrief(post), { refId: String(post.id), silent: true }).then(function (r2) {
                                if (r2.data) { res.data = r2.data; done(JSON.stringify(r2.data, null, 2)); }
                            });
                        }
                    });
                }, function () { btn.classList.remove('is-busy'); App.toast('Generation failed', 'danger', 'AI SEO'); });
            }
            });
        }

        var selAll = el.querySelector('#blSelAll');
        if (selAll) selAll.addEventListener('change', function () {
            var boxes = el.querySelectorAll('[data-sel]');
            for (var b = 0; b < boxes.length; b++) boxes[b].checked = this.checked;
            updateBulkBar(root);
        });

        updateBulkBar(root);
    }

    function updateBulkBar(root) {
        var boxes = root.querySelectorAll('[data-sel]');
        var n = 0, i;
        for (i = 0; i < boxes.length; i++) if (boxes[i].checked) n++;
        var bar = root.querySelector('#blBulk');
        if (!bar) return;
        bar.style.display = n ? 'flex' : 'none';
        root.querySelector('#blBulkN').textContent = n;
    }

    function bulkSelection(root) {
        var boxes = root.querySelectorAll('[data-sel]');
        var ids = [];
        for (var i = 0; i < boxes.length; i++) if (boxes[i].checked) ids.push(boxes[i].getAttribute('data-sel'));
        return ids;
    }

    function bindBulk(ctx, root) {
        var bar = root.querySelector('#blBulk');
        if (!bar || bar.getAttribute('data-bound')) return;
        bar.setAttribute('data-bound', '1');
        var S = ctx.S, App = ctx.App;

        bar.querySelector('#blBulkFill').addEventListener('click', function () {
            var ids = bulkSelection(root);
            if (!ids.length) return;
            var items = [];
            for (var i = 0; i < ids.length; i++) { var q = S.blogPost(ids[i]); if (q) items.push({ id: q.id, name: q.title || q.slug }); }
            App.confirm({
                title: 'AI SEO + tags',
                message: '<p class="t-body">Generate SEO meta, tags/category and related-product links for <b>' + items.length + '</b> selected articles. Each run is logged to AI history.</p>',
                okText: 'Run on ' + items.length
            }).then(function (ok) { if (ok) runBulkSeo(ctx, items); });
        });

        bar.querySelector('#blBulkPub').addEventListener('click', function () {
            var ids = bulkSelection(root);
            if (!ids.length) return;
            App.confirm({
                title: 'Publish now?',
                message: '<p class="t-body"><b>' + ids.length + '</b> article(s) go live immediately (any schedule is ignored).</p>',
                okText: 'Publish'
            }).then(function (ok) {
                if (!ok) return;
                for (var i = 0; i < ids.length; i++) S.saveBlogPost(ids[i], { status: 'published', scheduledFor: null });
                App.toast(ids.length + ' article(s) published', 'ok', 'Blog');
                app().badges();
                App.route();
            });
        });

        bar.querySelector('#blBulkDel').addEventListener('click', function () {
            var ids = bulkSelection(root);
            if (!ids.length) return;
            App.confirm({
                title: 'Delete articles?',
                message: '<p class="t-body"><b>' + ids.length + '</b> article(s) leave the studio and the blog.</p>',
                okText: 'Delete', danger: true
            }).then(function (ok) {
                if (!ok) return;
                for (var i = 0; i < ids.length; i++) S.deleteBlogPost(ids[i]);
                App.toast(ids.length + ' article(s) deleted', 'ok', 'Blog');
                app().badges();
                App.route();
            });
        });
    }

    /** Sequential AI helper - each step calls next() when it is done. */
    function runSeq(steps, done) {
        var i = 0;
        (function step() {
            if (i >= steps.length) return done();
            steps[i++](step);
        })();
    }

    function runBulkSeo(ctx, items) {
        var S = ctx.S, App = ctx.App;
        var okN = 0, failN = 0;
        U.bulkRunner(items, function (it, next) {
            var post = S.blogPost(it.id);
            if (!post) { failN++; return next(); }
            var brief = postBrief(post);
            runSeq([
                function (n) {
                    ctx.AI.run('blogMeta', brief, { refId: String(post.id) }).then(function (res) {
                        if (res.data && res.data.metaTitle) {
                            var cur = S.blogPost(post.id);
                            var seo = (cur && cur.seo) || {};
                            S.applyBlogSeo(post.id, {
                                metaTitle: res.data.metaTitle || '',
                                metaDescription: res.data.metaDescription || '',
                                keywords: res.data.keywords || [],
                                ogImage: seo.ogImage || ''
                            });
                        }
                        n();
                    }, function () { n(); });
                },
                function (n) {
                    ctx.AI.run('blogTags', brief, { refId: String(post.id) }).then(function (res) {
                        if (res.data && res.data.tags) {
                            S.saveBlogPost(post.id, {
                                tags: res.data.tags,
                                category: res.data.category || (S.blogPost(post.id) || {}).category
                            });
                        }
                        n();
                    }, function () { n(); });
                },
                function (n) {
                    ctx.AI.run('blogRelatedProducts', brief, { refId: String(post.id) }).then(function (res) {
                        if (res.data && res.data.productIds && res.data.productIds.length) {
                            S.saveBlogPost(post.id, { relatedProductIds: res.data.productIds });
                        }
                        n();
                    }, function () { n(); });
                }
            ], function () {
                okN++;
                next();
            });
        }, null, function () {
            App.toast('AI pass finished on ' + okN + ' articles' + (failN ? ' - ' + failN + ' skipped' : ''), okN ? 'ok' : 'warn', 'AI SEO');
            app().badges();
            if (app().current === 'blog') App.route();
        });
    }

    function exportCsv(ctx) {
        var rows = [], list = ctx.S.blogPosts(), i;
        for (i = 0; i < list.length; i++) {
            var p = list[i];
            rows.push({
                slug: p.slug || p.id, title: p.title || '', category: p.category || '',
                state: stateOf(p), seo: ctx.S.blogSeoState(p), views: p.views || 0,
                tags: (p.tags || []).join('|'), readMinutes: p.readMinutes || '',
                author: p.author || '', publishedAt: p.publishedAt || '', updatedAt: p.updatedAt || ''
            });
        }
        if (rows.length) app().csv(rows, 'trendaryo-blog');
        else app().toast('Nothing to export yet', 'warn');
    }

    /* ---------- scheduled publish queue ---------- */

    function openQueue(ctx) {
        var App = ctx.App, S = ctx.S;
        var list = S.blogPosts().filter(isScheduled)
            .sort(function (a, b) { return new Date(a.scheduledFor) - new Date(b.scheduledFor); });

        var body = list.length ? '' : U.empty('clock', 'Nothing scheduled', 'Set a future date in the editor\'s Publishing section and the cron job will flip it live.');
        if (list.length) {
            body = '<div class="table-wrap"><table class="table table--compact"><thead><tr><th>Article</th><th>Goes live</th><th>State</th><th></th></tr></thead><tbody>';
            for (var i = 0; i < list.length; i++) {
                body += '<tr>' +
                    '<td><div class="table__primary t-truncate">' + U.esc(list[i].title) + '</div><div class="table__secondary">/' + U.esc(list[i].slug) + '</div></td>' +
                    '<td class="fs-sm">' + new Date(list[i].scheduledFor).toLocaleString() + '</td>' +
                    '<td><span class="badge badge--warn">' + App.ago(list[i].scheduledFor) + '</span></td>' +
                    '<td class="num"><button class="btn btn--sm" type="button" data-now="' + U.esc(list[i].id) + '">Publish now</button> ' +
                    '<button class="btn btn--sm" type="button" data-clear="' + U.esc(list[i].id) + '">Unschedule</button></td>' +
                    '</tr>';
            }
            body += '</tbody></table></div><div class="fs-xs t-mute" style="margin-top:10px;">The publish cron (/api/cron/publish-posts) flips these automatically; publish now is instant.</div>';
        }

        App.drawer.open({
            title: 'Scheduled publish queue',
            sub: list.length + ' article(s) waiting on a future date',
            wide: true,
            body: body,
            foot: '<span class="spacer"></span><button class="btn" type="button" data-dc>Close</button>',
            onMount: function (root) {
                root.querySelector('[data-dc]').addEventListener('click', function () { App.drawer.close(); });
                root.addEventListener('click', function (e) {
                    var t;
                    if ((t = e.target.closest('[data-now]'))) {
                        S.saveBlogPost(t.getAttribute('data-now'), { status: 'published', scheduledFor: null });
                        App.toast('Published now', 'ok', 'Blog');
                        app().badges(); App.drawer.close(); App.route();
                    }
                    if ((t = e.target.closest('[data-clear]'))) {
                        S.saveBlogPost(t.getAttribute('data-clear'), { scheduledFor: null });
                        App.toast('Schedule cleared - stays a draft', 'ok', 'Blog');
                        App.drawer.close(); App.route();
                    }
                });
            }
        });
    }

    /* ================================================================
       EDITOR DRAWER
       ================================================================ */

    function openEditor(ctx, id) {
        var S = ctx.S, App = ctx.App;
        var p = id ? S.blogPost(id) : null;
        var isNew = !p;
        var seo = (p && p.seo) || {};
        var edBlocks = p ? JSON.parse(JSON.stringify(p.blocks || [])) : [];
        var related = p ? (p.relatedProductIds || []).slice() : [];

        var body = '<div class="editor-layout"><div>' +
            '<div class="field"><label class="field__label">Title <span class="req">*</span></label><div class="input-ai">' +
                '<input class="input" id="edTitle" value="' + U.esc(p ? p.title : '') + '" placeholder="How to choose ...">' +
                '<button class="ai-btn" type="button" data-gen="blogTitleVariants">' + A().icon('sparkles', 12) + 'Titles</button></div></div>' +

            '<div class="field-row field-row--3">' +
                '<div class="field"><label class="field__label">Category</label><input class="input" id="edCat" list="edCatList" value="' + U.esc(p ? p.category : 'guides') + '">' +
                    '<datalist id="edCatList">' + catListHtml(S) + '</datalist></div>' +
                '<div class="field"><label class="field__label">Author</label><input class="input" id="edAuthor" value="' + U.esc(p ? (p.author || '') : 'Trendaryo Editorial') + '"></div>' +
                '<div class="field"><label class="field__label">Read time</label><input class="input input--mono" id="edRead" value="' + (p ? (p.readMinutes || 5) : 5) + '" readonly></div>' +
            '</div>' +

            '<div class="field"><label class="field__label">Excerpt</label><div class="input-ai input-ai--stack">' +
                '<textarea class="textarea" id="edExcerpt" maxlength="240" placeholder="Card summary - one hook sentence">' + U.esc(p ? p.excerpt : '') + '</textarea>' +
                '<button class="ai-btn" type="button" data-gen="blogExcerpt">' + A().icon('sparkles', 12) + 'Write excerpt</button></div></div>' +

            '<div class="field-row"><div class="field"><label class="field__label">Cover image URL</label><input class="input input--mono" id="edCover" value="' + U.esc(p ? p.coverImage : '') + '" placeholder="https://..."></div>' +
            '<div class="field"><label class="field__label">Cover alt text</label><input class="input" id="edAlt" value="' + U.esc(p ? p.coverAlt : '') + '"><div class="field__hint">Required for accessibility and OG images.</div></div></div>' +

            '<div class="field"><label class="field__label">Tags</label><div class="input-ai">' +
                '<input class="input" id="edTags" value="' + U.esc(p ? (p.tags || []).join(', ') : '') + '" placeholder="headphones, buying-guide, audio">' +
                '<button class="ai-btn" type="button" data-gen="blogTags">' + A().icon('sparkles', 12) + 'Tags</button></div></div>' +

            '<hr class="divider">' +
            '<div class="row row--between" style="margin-bottom:8px;"><span class="t-label">Article body</span>' +
                '<div class="row" style="gap:6px;">' +
                    '<button class="ai-chip" type="button" data-gen="blogOutline">' + A().icon('sparkles', 12) + 'Outline</button>' +
                    '<button class="ai-chip" type="button" data-gen="blogDraft">' + A().icon('sparkles', 12) + 'Full draft</button>' +
                    '<button class="ai-chip" type="button" id="edAiSection">' + A().icon('wand', 12) + 'AI section</button>' +
                '</div></div>' +
            '<div class="blk-list" id="edBlocks"></div>' +
            '<button class="btn btn--sm blk-add" type="button" id="edAddBlk">' + A().icon('plus', 13) + 'Add block</button>' +

            '<hr class="divider">' +
            '<div class="row row--between" style="margin-bottom:8px;"><span class="t-label">Publishing</span>' +
                '<span class="fs-xs t-mute">Scheduled posts go live via the publish cron.</span></div>' +
            '<div class="field-row field-row--3">' +
                '<div class="field"><label class="field__label">Status</label><select class="select" id="edStatus">' +
                    '<option value="draft"' + (p && p.status === 'draft' ? ' selected' : '') + '>Draft</option>' +
                    '<option value="review_pending"' + (p && p.status === 'review_pending' ? ' selected' : '') + '>Review pending</option>' +
                    '<option value="ready_to_publish"' + (p && p.status === 'ready_to_publish' ? ' selected' : '') + '>Ready to publish</option>' +
                    '<option value="published"' + (p && p.status === 'published' ? ' selected' : '') + '>Published</option></select></div>' +
                '<div class="field"><label class="field__label">Auto-publish at</label><input class="input" id="edSched" type="datetime-local" value="' + U.esc(toLocalInput(p && p.scheduledFor)) + '"><div class="field__hint">Leave empty for manual publish.</div></div>' +
                '<div class="field"><label class="field__label">Featured</label><label class="check" style="padding-top:8px;"><input type="checkbox" id="edFeat"' + (p && p.featured ? ' checked' : '') + '> Show as featured slot</label></div>' +
            '</div>' +
            '<div class="row" style="gap:6px;margin-top:6px;" id="edWorkflow">' +
                '<button class="btn btn--sm" type="button" data-move="draft">Back to draft</button>' +
                '<button class="btn btn--sm" type="button" data-move="review_pending">' + A().icon('send', 12) + 'Submit for review</button>' +
                '<button class="btn btn--ai btn--sm" type="button" data-move="ready_to_publish">' + A().icon('check', 12) + 'Approve</button>' +
                '<button class="btn btn--primary btn--sm" type="button" data-move="published">' + A().icon('externalLink', 12) + 'Publish now</button>' +
            '</div>' +

            '<hr class="divider">' +
            '<div class="row row--between" style="margin-bottom:8px;"><span class="t-label">SEO package</span>' +
                '<button class="ai-chip" type="button" data-gen="blogMeta">' + A().icon('sparkles', 12) + 'Generate meta</button></div>' +
            '<div class="field"><label class="field__label">Meta title</label><input class="input input--mono" id="edMt" maxlength="70" value="' + U.esc(seo.metaTitle || '') + '"><div class="field__hint">Max 60 characters in search results.</div></div>' +
            '<div class="field"><label class="field__label">Meta description</label><textarea class="textarea" id="edMd" maxlength="180">' + U.esc(seo.metaDescription || '') + '</textarea><div class="field__hint">Max 155 characters.</div></div>' +
            '<div class="field"><label class="field__label">Keywords</label><input class="input input--mono" id="edKw" value="' + U.esc((seo.keywords || []).join(', ')) + '"></div>' +
            '<div class="field"><label class="field__label">Related products</label>' +
                '<button class="btn btn--ai btn--sm" type="button" data-gen="blogRelatedProducts">' + A().icon('sparkles', 12) + 'Match from catalogue</button>' +
                '<div class="bl-chips" id="edRel"></div>' +
                '<div class="field__hint">Rendered as live product cards under the article.</div></div>' +

            '<hr class="divider">' +
            '<div class="panel"><div class="panel__head panel__head--plain"><span class="t-label">SEO analysis</span><span id="edSeoScore"></span></div>' +
                '<div class="panel__body" id="edAnalysis"></div>' +
                '<div class="panel__foot" id="edRevise" style="display:none;flex-wrap:wrap;gap:6px;"></div></div>' +
            '</div>' +

            '<div><div class="panel editor-preview"><div class="panel__head panel__head--plain"><span class="t-label">Storefront preview</span>' +
                '<span class="fs-xs t-mute">Same renderer as the live page</span></div>' +
                '<div class="panel__body bl-preview" id="edPrev"></div>' +
                '<div class="panel__foot fs-xs t-mute">' + (isNew ? 'Publish from the Publishing section to make it live.' : 'Changes reach the storefront on save.') + '</div></div></div></div>';

        App.drawer.open({
            title: isNew ? 'New article' : 'Edit - ' + (p.title || ''),
            sub: isNew ? 'Block-based draft with AI in every section' : '/' + (p.slug || p.id) + (p.status === 'published' ? ' - live' : ' - not published'),
            wide: true,
            body: body,
            foot: '<span class="spacer"></span>' +
                '<button class="btn" type="button" data-dc>Cancel</button>' +
                (isNew ? '' : '<button class="btn" type="button" data-preview>' + A().icon('externalLink', 13) + 'Open live</button>') +
                '<button class="btn btn--primary" type="button" data-save>' + A().icon('save', 13) + (isNew ? 'Create draft' : 'Save changes') + '</button>',
            onMount: function (root) {
                var q = function (sel) { return root.querySelector(sel); };

                function collect() {
                    var sched = q('#edSched').value;
                    var tags = q('#edTags').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
                    return {
                        title: q('#edTitle').value.trim(),
                        excerpt: q('#edExcerpt').value.trim(),
                        coverImage: q('#edCover').value.trim(),
                        coverAlt: q('#edAlt').value.trim(),
                        category: (q('#edCat').value.trim() || 'guides').toLowerCase(),
                        author: q('#edAuthor').value.trim() || 'Trendaryo Editorial',
                        tags: tags,
                        blocks: JSON.parse(JSON.stringify(edBlocks)),
                        content: BB().text(edBlocks, ''),
                        readMinutes: BB().readMinutes(edBlocks, ''),
                        status: q('#edStatus').value,
                        featured: q('#edFeat').checked,
                        scheduledFor: (q('#edStatus').value !== 'published' && sched) ? new Date(sched).toISOString() : null,
                        seo: {
                            metaTitle: q('#edMt').value.trim(),
                            metaDescription: q('#edMd').value.trim(),
                            keywords: q('#edKw').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
                            ogImage: (seo.ogImage || '')
                        },
                        relatedProductIds: related.slice()
                    };
                }

                function paint() {
                    var c = collect();
                    var readEl = q('#edRead');
                    if (readEl) readEl.value = c.readMinutes + ' min';
                    var h = '';
                    if (c.coverImage) h += '<img class="bp-cover" src="' + U.esc(c.coverImage) + '" alt="' + U.esc(c.coverAlt) + '">';
                    h += '<span class="badge badge--accent">' + U.esc(c.category) + '</span>';
                    h += '<h1 class="bp-title" style="font-family:Orbitron,sans-serif;font-size:1.3rem;margin:10px 0 6px;">' + U.esc(c.title || 'Untitled article') + '</h1>';
                    h += '<div class="fs-xs t-mute" style="margin-bottom:10px;">' + U.esc(c.author) + ' - ' + c.readMinutes + ' min read' + (c.scheduledFor ? ' - auto-publishes ' + new Date(c.scheduledFor).toLocaleString() : '') + '</div>';
                    if (c.excerpt) h += '<p class="t-body" style="font-style:italic;color:var(--text-dim);">' + U.esc(c.excerpt) + '</p>';
                    var rendered = BB().render(c.blocks, {
                        content: c.content,
                        productCard: function (pid) {
                            var pr = S.product(pid);
                            if (!pr) return '<div class="bp-prod bp-prod--empty">Product #' + U.esc(pid) + ' not found</div>';
                            return '<div class="bp-prod"><b>' + U.esc(pr.name) + '</b><span class="spacer"></span><span>' + U.money(pr.price) + '</span></div>';
                        }
                    });
                    h += rendered || '<div class="bl-empty">No body yet - add a block or ask AI for an outline.</div>';
                    q('#edPrev').innerHTML = h;
                    paintRelated();
                    paintAnalysis();
                }

                /* ---------- Phase 18/19: SEO analysis + improvement tools ---------- */

                function analysisInput() {
                    var c = collect();
                    return {
                        title: c.title,
                        excerpt: c.excerpt,
                        metaTitle: c.seo.metaTitle,
                        metaDescription: c.seo.metaDescription,
                        keywords: c.seo.keywords,
                        primaryKeyword: (c.seo.keywords || [])[0] || '',
                        blocks: edBlocks,
                        faqs: (p && p.seo && p.seo.faqs) || [],
                        images: c.coverImage ? [{ url: c.coverImage, alt: c.coverAlt }] : [],
                        internalLinks: [],
                        schema: (p && p.seo && p.seo.schema) || null,
                        wordTarget: 1200
                    };
                }

                function paintAnalysis() {
                    var box = q('#edAnalysis');
                    if (!box) return;
                    var SEO = window.TrendaryoSeoAnalysis;
                    if (!SEO) { box.innerHTML = '<div class="bl-empty">The analysis engine is not loaded.</div>'; return; }
                    var a = SEO.analyze(analysisInput());
                    var scoreEl = q('#edSeoScore');
                    if (scoreEl) {
                        scoreEl.innerHTML = '<span class="badge ' + (a.score >= 85 ? 'badge--ok' : (a.score >= 70 ? 'badge--warn' : 'badge--danger')) + '">' +
                            a.score + '/100 - grade ' + a.grade + '</span>';
                    }
                    var h = '';
                    for (var i = 0; i < a.metrics.length; i++) {
                        var m = a.metrics[i];
                        h += '<div style="margin-bottom:10px;">' +
                            '<div class="row row--between"><span class="fs-sm fw-600">' + U.esc(m.label) + '</span>' +
                            '<span class="fs-xs t-mute">' + m.score + '/100 x' + m.weight + '</span></div>' +
                            '<div class="meter" style="margin:4px 0;"><div class="meter__fill" style="width:' + m.score + '%;' + (m.score >= 70 ? 'background:linear-gradient(90deg,#0f0,#0c6);' : m.score >= 40 ? 'background:linear-gradient(90deg,#fc0,#f90);' : 'background:linear-gradient(90deg,#f33,#c00);') + '"></div></div>' +
                            '<div class="fs-xs t-mute">' + U.esc(m.value) + ' - ' + U.esc(m.hint) + '</div>' +
                            '</div>';
                    }
                    h += '<div class="row" style="gap:16px;margin-top:4px;">' +
                        '<span class="fs-xs t-mute">SEO score <b>' + a.seoScore + '</b></span>' +
                        '<span class="fs-xs t-mute">Readability <b>' + a.readabilityScore + '</b> (' + U.esc(a.readability.level) + ', ' + a.readability.avgSentenceWords + ' words/sentence)</span>' +
                        '<span class="fs-xs t-mute">' + a.wordCount + ' words</span></div>';
                    box.innerHTML = h;

                    var rev = q('#edRevise');
                    if (rev) {
                        var b = '';
                        for (var j = 0; j < a.suggestions.length; j++) {
                            b += '<button class="btn btn--ai btn--sm" type="button" data-revise="' + U.esc(a.suggestions[j].action) + '" title="' + U.esc(a.suggestions[j].hint) + '">' +
                                A().icon('wand', 12) + U.esc(a.suggestions[j].label) + '</button>';
                        }
                        rev.innerHTML = b;
                        rev.style.display = a.suggestions.length ? 'flex' : 'none';
                    }
                }

                /* Article JSON for the revise task: sections rebuilt from blocks. */
                function articleFromEditor() {
                    var c = collect();
                    var sections = [];
                    var current = null;
                    for (var i = 0; i < edBlocks.length; i++) {
                        var b = edBlocks[i];
                        if (b.type === 'h2') {
                            current = { h2: b.text, paragraphs: [], h3s: [] };
                            sections.push(current);
                        } else if (b.type === 'h3') {
                            if (!current) { current = { h2: '', paragraphs: [], h3s: [] }; sections.push(current); }
                            current.h3s.push({ h3: b.text, paragraphs: [] });
                        } else if (b.type === 'p') {
                            if (!current) { current = { h2: '', paragraphs: [], h3s: [] }; sections.push(current); }
                            if (current.h3s.length && !b.text) continue;
                            var target = current.h3s.length ? current.h3s[current.h3s.length - 1] : current;
                            target.paragraphs.push(b.text);
                        } else if (b.type === 'ul') {
                            if (!current) { current = { h2: '', paragraphs: [], h3s: [] }; sections.push(current); }
                            var t2 = current.h3s.length ? current.h3s[current.h3s.length - 1] : current;
                            t2.paragraphs.push((b.items || []).join('. '));
                        }
                    }
                    return {
                        seoTitle: c.title,
                        metaTitle: c.seo.metaTitle,
                        metaDescription: c.seo.metaDescription,
                        excerpt: c.excerpt,
                        sections: sections,
                        faqs: (p && p.seo && p.seo.faqs) || []
                    };
                }

                function sectionsToBlocks(article) {
                    var blocks = [];
                    if (article.introduction) blocks.push({ type: 'p', text: article.introduction });
                    var sections = article.sections || [];
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
                    }
                    if (article.conclusion) blocks.push({ type: 'p', text: article.conclusion });
                    return blocks;
                }

                function replaceBody(article) {
                    /* keep the structural blocks (product cards, CTA, images) */
                    var keep = edBlocks.filter(function (b) { return b.type === 'product' || b.type === 'cta' || b.type === 'img'; });
                    edBlocks = sectionsToBlocks(article).concat(keep);
                    drawBlocks();
                }

                function appendFaqs(faqs) {
                    var hasHead = edBlocks.some(function (b) { return b.type === 'h2' && /question|faq/i.test(b.text); });
                    /* drop the old question h3 blocks and the paragraph after each */
                    var filtered = [];
                    for (var n = 0; n < edBlocks.length; n++) {
                        if (edBlocks[n].type === 'h3' && /\?$/.test(edBlocks[n].text)) {
                            n++;
                            continue;
                        }
                        filtered.push(edBlocks[n]);
                    }
                    if (!hasHead) filtered.push({ type: 'h2', text: 'Questions buyers ask' });
                    for (var f = 0; f < faqs.length; f++) {
                        filtered.push({ type: 'h3', text: faqs[f].q });
                        filtered.push({ type: 'p', text: faqs[f].a });
                    }
                    edBlocks = filtered;
                    drawBlocks();
                }

                function runRevise(action, btn) {
                    var App2 = app();
                    btn.classList.add('is-busy');
                    var input = {
                        action: action,
                        article: articleFromEditor(),
                        keywords: collect().seo.keywords || [],
                        primaryKeyword: (collect().seo.keywords || [])[0] || '',
                        wordTarget: 1200,
                        availablePages: ['shop.html', 'blog.html', 'product.html?id=' + String(p ? p.id : '')]
                    };
                    if (anchor) {
                        input.product = { id: anchor.id, name: anchor.name, price: anchor.price, description: anchor.description || '' };
                        input.productUrl = 'product.html?id=' + encodeURIComponent(String(anchor.id));
                    }
                    ctx.AI.run('articleRevise', input, { refId: p ? String(p.id) : 'new' }).then(function (res) {
                        btn.classList.remove('is-busy');
                        var label = action.replace(/^tone-/, 'rewrite: ');
                        V.util.aiReview({
                            title: 'Revision - ' + label,
                            meta: res.provider + ' - ' + res.ms + 'ms',
                            text: revisionPreview(action, res.data),
                            fields: { 'Result': revisionSummary(action, res.data) },
                            applyText: 'Apply revision',
                            onApply: function () { applyRevision(action, res.data); },
                            onRedo: function (done) {
                                ctx.AI.run('articleRevise', input, { refId: p ? String(p.id) : 'new', silent: true }).then(function (r2) {
                                    if (r2.data) done(revisionPreview(action, r2.data));
                                });
                            }
                        });
                    }, function () {
                        btn.classList.remove('is-busy');
                        App2.toast('Revision failed', 'danger', 'AI');
                    });
                }

                function revisionPreview(action, data) {
                    if (!data) return '';
                    if (action === 'improve-seo') return JSON.stringify(data, null, 2);
                    if (action === 'faqs') return (data.faqs || []).map(function (f) { return 'Q: ' + f.q + '\nA: ' + f.a; }).join('\n\n');
                    if (action === 'keywords') return JSON.stringify(data.keywords || []) + '\n\n' + JSON.stringify(data.longTailKeywords || []);
                    if (action === 'links') return (data.internalLinks || []).map(function (l) { return l.anchor + ' -> ' + l.path + ' (' + (l.why || '') + ')'; }).join('\n');
                    if (action === 'comparison') return (data.section ? data.section.h2 + '\n\n' + (data.section.paragraphs || []).join('\n\n') + '\n\n' : '') + (data.comparison || []).map(function (c) { return '- ' + c.criterion + ': ' + c.verdict; }).join('\n');
                    var blocks = sectionsToBlocks(data);
                    return blocks.map(function (b) {
                        if (b.type === 'h2') return '## ' + b.text;
                        if (b.type === 'h3') return '### ' + b.text;
                        return b.text || '';
                    }).filter(Boolean).join('\n\n');
                }

                function revisionSummary(action, data) {
                    if (!data) return 'nothing';
                    if (action === 'improve-seo') return data.seoTitle || 'meta only';
                    if (action === 'faqs') return (data.faqs || []).length + ' FAQs';
                    if (action === 'keywords') return (data.keywords || []).length + ' keywords';
                    if (action === 'links') return (data.internalLinks || []).length + ' links';
                    if (action === 'comparison') return (data.comparison || []).length + ' comparison rows';
                    return ((data.sections || []).length) + ' sections';
                }

                function applyRevision(action, data) {
                    if (!data) return;
                    var App2 = app();
                    if (action === 'improve-seo') {
                        if (data.seoTitle) q('#edTitle').value = data.seoTitle.slice(0, 70);
                        if (data.metaTitle) q('#edMt').value = data.metaTitle;
                        if (data.metaDescription) q('#edMd').value = data.metaDescription;
                        if ((data.keywords || []).length) q('#edKw').value = data.keywords.join(', ');
                        App2.toast('SEO fields tightened - review and save', 'ai', 'Blog');
                        return;
                    }
                    if (action === 'keywords') {
                        if ((data.keywords || []).length) q('#edKw').value = data.keywords.join(', ');
                        App2.toast('Keywords added', 'ai', 'Blog');
                        return;
                    }
                    if (action === 'faqs') {
                        appendFaqs(data.faqs || []);
                        App2.toast((data.faqs || []).length + ' FAQs rebuilt', 'ai', 'Blog');
                        return;
                    }
                    if (action === 'links') {
                        var hasLinks = edBlocks.some(function (b) { return b.type === 'h2' && /where to go next/i.test(b.text); });
                        if (!hasLinks) edBlocks.push({ type: 'h2', text: 'Where to go next' });
                        edBlocks.push({ type: 'ul', items: (data.internalLinks || []).map(function (l) { return l.anchor + ' (' + l.path + ') - ' + (l.why || ''); }) });
                        drawBlocks();
                        App2.toast((data.internalLinks || []).length + ' internal links added', 'ai', 'Blog');
                        return;
                    }
                    if (action === 'comparison') {
                        var blocks = [];
                        if (data.section && data.section.h2) {
                            blocks.push({ type: 'h2', text: data.section.h2 });
                            for (var i = 0; i < (data.section.paragraphs || []).length; i++) blocks.push({ type: 'p', text: data.section.paragraphs[i] });
                        }
                        blocks.push({ type: 'ul', items: (data.comparison || []).map(function (c) { return c.criterion + ': ' + c.verdict; }) });
                        edBlocks = edBlocks.concat(blocks);
                        drawBlocks();
                        App2.toast('Comparison block added', 'ai', 'Blog');
                        return;
                    }
                    if (action === 'expand') {
                        var extra = sectionsToBlocks({ sections: data.sections || [] });
                        edBlocks = edBlocks.concat(extra);
                        drawBlocks();
                        App2.toast((data.sections || []).length + ' sections added', 'ai', 'Blog');
                        return;
                    }
                    /* shorten / readability / tone-* */
                    replaceBody(data);
                    if (action === 'shorten') App2.toast('Body tightened', 'ai', 'Blog');
                    else if (action === 'readability') App2.toast('Body rewritten for readability', 'ai', 'Blog');
                    else App2.toast('Body rewritten in the requested voice', 'ai', 'Blog');
                }

                var reviseBar = q('#edRevise');
                if (reviseBar) {
                    reviseBar.addEventListener('click', function (e) {
                        var t = e.target.closest('[data-revise]');
                        if (!t) return;
                        runRevise(t.getAttribute('data-revise'), t);
                    });
                }

                function paintRelated() {
                    var el = q('#edRel');
                    if (!el) return;
                    if (!related.length) { el.innerHTML = '<span class="fs-xs t-mute">No related products yet.</span>'; return; }
                    var out = '';
                    for (var i = 0; i < related.length; i++) {
                        var pr = S.product(related[i]);
                        out += '<span class="badge badge--neutral" data-rel="' + U.esc(related[i]) + '">' + U.esc(pr ? pr.name : '#' + related[i]) + ' <button type="button" class="rel-x" data-relx="' + U.esc(related[i]) + '" style="border:0;background:none;color:inherit;cursor:pointer;padding:0 0 0 4px;">x</button></span>';
                    }
                    el.innerHTML = out;
                }

                /* ---------- block editor ---------- */

                function blockLabel(b) {
                    var v = b.type === 'ul' ? (b.items || []).join(' ') : (b.text || b.src || b.productId || '');
                    v = String(v).replace(/\s+/g, ' ').trim();
                    return v ? v.slice(0, 70) : 'empty';
                }

                function blockBodyHtml(b, i) {
                    if (b.type === 'img') {
                        return '<div class="blk-row">' +
                            '<input class="input input--mono" data-i="' + i + '" data-f="src" value="' + U.esc(b.src || '') + '" placeholder="https://image-url">' +
                            '<input class="input" data-i="' + i + '" data-f="alt" value="' + U.esc(b.alt || '') + '" placeholder="alt text"></div>';
                    }
                    if (b.type === 'cta') {
                        return '<div class="blk-row">' +
                            '<input class="input" data-i="' + i + '" data-f="title" value="' + U.esc(b.title || '') + '" placeholder="CTA title">' +
                            '<input class="input" data-i="' + i + '" data-f="href" value="' + U.esc(b.href || '') + '" placeholder="shop.html"></div>' +
                            '<input class="input" data-i="' + i + '" data-f="label" value="' + U.esc(b.label || '') + '" placeholder="Button label">';
                    }
                    if (b.type === 'product') {
                        var pr = S.product(b.productId);
                        return '<input class="input input--mono" data-i="' + i + '" data-f="productId" value="' + U.esc(b.productId || '') + '" placeholder="product id">' +
                            '<div class="fs-xs t-mute">' + (pr ? U.esc(pr.name) + ' - ' + U.money(pr.price) : 'No product with that id') + '</div>';
                    }
                    if (b.type === 'quote') {
                        return '<textarea class="textarea" data-i="' + i + '" data-f="text" placeholder="Pull quote">' + U.esc(b.text || '') + '</textarea>' +
                            '<input class="input" data-i="' + i + '" data-f="cite" value="' + U.esc(b.cite || '') + '" placeholder="source (optional)">';
                    }
                    var val = b.type === 'ul' ? (b.items || []).join('\n') : (b.text || '');
                    var ph = b.type === 'ul' ? 'One bullet per line' : (b.type === 'h2' ? 'Section heading' : (b.type === 'h3' ? 'Sub-heading' : 'Paragraph'));
                    return '<textarea class="textarea" data-i="' + i + '" data-f="main" rows="' + (b.type === 'p' ? 4 : 2) + '" placeholder="' + ph + '">' + U.esc(val) + '</textarea>';
                }

                function rowsHtml() {
                    if (!edBlocks.length) return '<div class="bl-empty">No blocks yet. Start from an outline, drop in an AI section, or add a block by hand.</div>';
                    var h = '';
                    for (var i = 0; i < edBlocks.length; i++) {
                        var b = edBlocks[i];
                        h += '<div class="blk" data-i="' + i + '">' +
                            '<div class="blk__head">' +
                                '<span class="blk__n">' + (i + 1) + '</span>' +
                                '<select class="blk__type" data-btype="' + i + '">' +
                                    typeOpt('h2', b.type) + typeOpt('h3', b.type) + typeOpt('p', b.type) + typeOpt('ul', b.type) +
                                    typeOpt('quote', b.type) + typeOpt('img', b.type) + typeOpt('cta', b.type) + typeOpt('product', b.type) +
                                '</select>' +
                                '<span class="blk__label">' + U.esc(blockLabel(b)) + '</span>' +
                                '<span class="blk__tools">' +
                                    '<button class="icon-btn" type="button" data-bup="' + i + '" title="Move up" ' + (i === 0 ? 'disabled' : '') + '>' + A().icon('chevronUp', 13) + '</button>' +
                                    '<button class="icon-btn" type="button" data-bdown="' + i + '" title="Move down" ' + (i === edBlocks.length - 1 ? 'disabled' : '') + '>' + A().icon('chevronDown', 13) + '</button>' +
                                    '<button class="icon-btn" type="button" data-bdel="' + i + '" title="Remove block">' + A().icon('trash', 13) + '</button>' +
                                '</span>' +
                            '</div>' +
                            '<div class="blk__body">' + blockBodyHtml(b, i) + '</div>' +
                            '<div class="blk__ai">' +
                                (b.type === 'h2' || b.type === 'h3' ? '<button class="btn btn--ai btn--sm" type="button" data-bwrite="' + i + '">' + A().icon('sparkles', 12) + 'Write section</button>' : '') +
                                (b.type !== 'product' && b.type !== 'img' && b.type !== 'cta' ? '<button class="btn btn--sm" type="button" data-brewrite="' + i + '">' + A().icon('refresh', 12) + 'Rewrite</button>' : '') +
                            '</div>' +
                        '</div>';
                    }
                    return h;
                }
                function typeOpt(val, cur) { return '<option value="' + val + '"' + (cur === val ? ' selected' : '') + '>' + val + '</option>'; }

                function drawBlocks() {
                    q('#edBlocks').innerHTML = rowsHtml();
                    paint();
                }

                function coerceType(b, type) {
                    var val = b.type === 'ul' ? (b.items || []).join('\n') : (b.text || '');
                    var next = { type: type };
                    if (type === 'ul') next.items = val ? val.split('\n').map(function (s) { return s.trim(); }).filter(Boolean) : [];
                    else if (type === 'img') { next.src = ''; next.alt = ''; }
                    else if (type === 'cta') { next.title = b.title || 'Shop the guide'; next.label = b.label || 'Browse the shop'; next.href = b.href || 'shop.html'; }
                    else if (type === 'product') { next.productId = ''; }
                    else { next.text = val; if (type === 'quote') next.cite = b.cite || ''; }
                    return next;
                }

                var blkWrap = q('#edBlocks');
                blkWrap.addEventListener('input', function (e) {
                    var t = e.target;
                    if (!t.hasAttribute || !t.hasAttribute('data-i')) return;
                    var i = Number(t.getAttribute('data-i'));
                    var f = t.getAttribute('data-f');
                    var b = edBlocks[i];
                    if (!b) return;
                    if (f === 'main') {
                        if (b.type === 'ul') b.items = t.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
                        else b.text = t.value;
                    } else {
                        b[f] = t.value;
                    }
                    var lbl = t.closest('.blk').querySelector('.blk__label');
                    if (lbl) lbl.textContent = blockLabel(b);
                    paint();
                });
                blkWrap.addEventListener('change', function (e) {
                    var t = e.target;
                    if (!t.hasAttribute || !t.hasAttribute('data-btype')) return;
                    var i = Number(t.getAttribute('data-btype'));
                    edBlocks[i] = coerceType(edBlocks[i], t.value);
                    drawBlocks();
                });
                blkWrap.addEventListener('click', function (e) {
                    var t, i;
                    if ((t = e.target.closest('[data-bup]'))) {
                        i = Number(t.getAttribute('data-bup'));
                        if (i > 0) { var a = edBlocks[i - 1]; edBlocks[i - 1] = edBlocks[i]; edBlocks[i] = a; drawBlocks(); }
                        return;
                    }
                    if ((t = e.target.closest('[data-bdown]'))) {
                        i = Number(t.getAttribute('data-bdown'));
                        if (i < edBlocks.length - 1) { var a2 = edBlocks[i + 1]; edBlocks[i + 1] = edBlocks[i]; edBlocks[i] = a2; drawBlocks(); }
                        return;
                    }
                    if ((t = e.target.closest('[data-bdel]'))) {
                        i = Number(t.getAttribute('data-bdel'));
                        edBlocks.splice(i, 1);
                        drawBlocks();
                        return;
                    }
                    if ((t = e.target.closest('[data-bwrite]'))) { writeSection(ctx, root, edBlocks, Number(t.getAttribute('data-bwrite')), t, drawBlocks, collect); return; }
                    if ((t = e.target.closest('[data-brewrite]'))) { rewriteSection(ctx, edBlocks, Number(t.getAttribute('data-brewrite')), t, drawBlocks, collect); return; }
                });

                q('#edAddBlk').addEventListener('click', function () {
                    edBlocks.push({ type: 'p', text: '' });
                    drawBlocks();
                    var rows = blkWrap.querySelectorAll('.blk');
                    if (rows.length) {
                        var ta = rows[rows.length - 1].querySelector('textarea');
                        if (ta) ta.focus();
                    }
                });

                q('#edAiSection').addEventListener('click', function () {
                    U.promptModal({
                        title: 'AI section',
                        sub: 'The model writes this H2 and its paragraphs; you review before it lands.',
                        fields: [
                            { id: 'heading', label: 'Section heading', placeholder: 'Battery life decides the winner' },
                            { id: 'context', label: 'Context (optional)', type: 'textarea', placeholder: 'What this section must cover, in one or two lines' }
                        ],
                        okText: 'Draft section'
                    }).then(function (vals) {
                        if (!vals || !vals.heading) return;
                        var btn = q('#edAiSection');
                        btn.classList.add('is-busy');
                        var c = collect();
                        ctx.AI.run('blogSection', {
                            heading: vals.heading,
                            context: vals.context || '',
                            products: anchoredProducts(S, { title: vals.heading }),
                            anchor: anchor ? anchorBrief(anchor) : null,
                            existing: c.content.slice(0, 800)
                        }, { refId: p ? String(p.id) : 'new' }).then(function (res) {
                            btn.classList.remove('is-busy');
                            U.aiReview({
                                title: vals.heading,
                                meta: res.provider + ' - ' + res.ms + 'ms',
                                text: res.text,
                                applyText: 'Add to article',
                                onApply: function () {
                                    var made = BB().fromText(res.text);
                                    var h2 = { type: 'h2', text: vals.heading };
                                    var rest = made.filter(function (b) { return !(b.type === 'h2' && b.text === vals.heading); });
                                    edBlocks.push(h2);
                                    for (var k = 0; k < rest.length; k++) edBlocks.push(rest[k]);
                                    drawBlocks();
                                    App.toast('Section added - review the preview', 'ai', 'Blog');
                                },
                                onRedo: function (done) {
                                    ctx.AI.run('blogSection', { heading: vals.heading, context: vals.context || '', products: productBrief(S) }, { silent: true })
                                        .then(function (r2) { done(r2.text); });
                                }
                            });
                        }, function () { btn.classList.remove('is-busy'); App.toast('Generation failed', 'danger', 'AI'); });
                    });
                });

                /* ---------- post-level AI ---------- */

                var gens = root.querySelectorAll('[data-gen]');
                for (var gi = 0; gi < gens.length; gi++) {
                    gens[gi].addEventListener('click', function () {
                        runPostAi(this.getAttribute('data-gen'), this, collect, function (next) { edBlocks = next; drawBlocks(); }, collect, paint);
                    });
                }

                /* Phase 20: one click per workflow move - the save below persists it. */
                var wf = root.querySelector('#edWorkflow');
                if (wf) {
                    wf.addEventListener('click', function (e) {
                        var t = e.target.closest('[data-move]');
                        if (!t) return;
                        q('#edStatus').value = t.getAttribute('data-move');
                        root.querySelector('[data-save]').click();
                    });
                }

                q('#edRel').addEventListener('click', function (e) {
                    var x = e.target.closest('[data-relx]');
                    if (!x) return;
                    var rid = x.getAttribute('data-relx');
                    related = related.filter(function (r) { return String(r) !== String(rid); });
                    paintRelated();
                });

                /* ---------- save ---------- */

                root.querySelector('[data-dc]').addEventListener('click', function () { App.drawer.close(); });
                var prevBtn = root.querySelector('[data-preview]');
                if (prevBtn) prevBtn.addEventListener('click', function () {
                    window.open('blog-post.html?slug=' + encodeURIComponent(p.slug || p.id), '_blank', 'noopener');
                });
                root.querySelector('[data-save]').addEventListener('click', function () {
                    var c = collect();
                    if (!c.title) { App.toast('Give the article a title first', 'warn', 'Blog'); q('#edTitle').focus(); return; }
                    if (!c.blocks.length && !c.content) { App.toast('The article has no body yet', 'warn', 'Blog'); return; }
                    if (isNew) {
                        S.addBlogPost(c);
                        App.toast('Draft created' + (c.status === 'published' ? ' and published' : ''), 'ok', 'Blog');
                    } else {
                        S.saveBlogPost(p.id, c);
                        App.toast('Article saved' + (c.status === 'published' ? ' - live on the blog' : ''), 'ok', 'Blog');
                    }
                    app().badges();
                    App.drawer.close();
                    if (app().current === 'blog') App.route();
                });

                /* store the live reference so AI callbacks can swap blocks */
                openEditor._setBlocks = function (arr) { edBlocks = arr; drawBlocks(); };
                openEditor._setRelated = function (arr) { related = arr; paintRelated(); };
                openEditor._setSeo = function (s) { seo = s; };
                openEditor._current = { id: p ? p.id : null, post: p };

                drawBlocks();

                /* ---------- post-level AI dispatcher ---------- */

                function runPostAi(task, btn, collectFn, setBlocks, collectNow, repaint) {
                    var snap = collectFn();
                    var brief = { title: snap.title, excerpt: snap.excerpt, content: snap.content, keyword: (snap.seo.keywords || [])[0] || '' };

                    /* Phase 14: the product anchor plus catalogue matches ride
                       along with every brief, so drafts are grounded in real
                       products. Matching needs the whole shelf. */
                    if (anchor) brief.anchor = anchorBrief(anchor);
                    brief.products = task === 'blogRelatedProducts' ? productBrief(S) : anchoredProducts(S, snap);

                    btn.classList.add('is-busy');
                    ctx.AI.run(task, brief, { refId: p ? String(p.id) : 'new' }).then(function (res) {
                        btn.classList.remove('is-busy');

                        if (task === 'blogOutline') {
                            if (!res.data || !res.data.sections) { App.toast('Could not parse the outline', 'warn', 'AI'); return; }
                            var made = outlineToBlocks(res.data);
                            App.confirm({
                                title: 'Apply outline?',
                                message: '<p class="t-body">Replaces the current body with <b>' + res.data.sections.length + '</b> sections from the outline. You can undo by closing without saving.</p>',
                                okText: 'Replace body'
                            }).then(function (ok) {
                                if (!ok) return;
                                setBlocks(made);
                                if (res.data.title && !snap.title) q('#edTitle').value = res.data.title;
                                App.toast('Outline applied - write each section with AI or by hand', 'ai', 'Blog');
                            });
                            return;
                        }

                        if (task === 'blogDraft') {
                            App.confirm({
                                title: 'Replace body with this draft?',
                                message: '<p class="t-body">The generated draft becomes the article body. Nothing is saved until you press Save.</p>',
                                okText: 'Use draft'
                            }).then(function (ok) {
                                if (!ok) return;
                                setBlocks(BB().fromText(res.text));
                                App.toast('Draft loaded into the editor', 'ai', 'Blog');
                            });
                            return;
                        }

                        if (task === 'blogTags') {
                            if (!res.data) { App.toast('Could not parse tags', 'warn', 'AI'); return; }
                            if (res.data.tags) q('#edTags').value = (res.data.tags || []).join(', ');
                            if (res.data.category) q('#edCat').value = res.data.category;
                            App.toast('Tags and category filled in', 'ai', 'AI Studio');
                            repaint();
                            return;
                        }

                        if (task === 'blogMeta') {
                            if (!res.data) { App.toast('Could not parse the meta package', 'warn', 'AI'); return; }
                            q('#edMt').value = res.data.metaTitle || '';
                            q('#edMd').value = res.data.metaDescription || '';
                            q('#edKw').value = (res.data.keywords || []).join(', ');
                            seo = { metaTitle: res.data.metaTitle || '', metaDescription: res.data.metaDescription || '', keywords: res.data.keywords || [], ogImage: res.data.ogImageSuggestion || '' };
                            App.toast('SEO package drafted - review and save', 'ai', 'AI Studio');
                            return;
                        }

                        if (task === 'blogRelatedProducts') {
                            if (!res.data || !res.data.productIds) { App.toast('Could not parse product matches', 'warn', 'AI'); return; }
                            openEditor._setRelated(res.data.productIds || []);
                            App.toast((res.data.productIds || []).length + ' products linked', 'ai', 'AI Studio');
                            return;
                        }

                        /* text tasks -> review modal */
                        U.aiReview({
                            title: task === 'blogTitleVariants' ? 'Title variants' : (task === 'blogExcerpt' ? 'Card excerpt' : 'AI suggestion'),
                            meta: res.provider + ' - ' + res.ms + 'ms',
                            text: res.text,
                            applyText: task === 'blogExcerpt' ? 'Use excerpt' : 'Apply',
                            onApply: function () {
                                if (task === 'blogExcerpt') q('#edExcerpt').value = firstLine(res.text, 240);
                                if (task === 'blogTitleVariants') q('#edTitle').value = firstLine(res.text, 60).replace(/^\d+[.)]\s*/, '');
                                repaint();
                                App.toast('Applied - review and save', 'ai', 'AI Studio');
                            },
                            onRedo: function (done) {
                                ctx.AI.run(task, brief, { silent: true }).then(function (r2) { done(r2.text); });
                            }
                        });
                    }, function () { btn.classList.remove('is-busy'); App.toast('Generation failed', 'danger', 'AI'); });
                }
            }
        });
    }

    function firstLine(text, max) {
        var line = String(text || '').split('\n').filter(function (l) { return l.trim(); })[0] || '';
        line = line.replace(/^\d+[.)]\s*/, '').trim();
        if (max && line.length > max) line = line.slice(0, max).replace(/\s+\S*$/, '');
        return line;
    }

    function catListHtml(S) {
        var cats = categories(S), h = '', i;
        for (i = 0; i < cats.length; i++) h += '<option value="' + U.esc(cats[i]) + '"></option>';
        return h;
    }

    function toLocalInput(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        function pad(n) { return (n < 10 ? '0' : '') + n; }
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    function outlineToBlocks(data) {
        var out = [], i, j;
        var secs = data.sections || [];
        if (data.title) out.push({ type: 'h2', text: data.title });
        for (i = 0; i < secs.length; i++) {
            out.push({ type: 'h2', text: secs[i].h2 || 'Section' });
            if (secs[i].bullets && secs[i].bullets.length) {
                out.push({ type: 'ul', items: secs[i].bullets.slice() });
            }
        }
        return out;
    }

    /* ---------- per-block AI ---------- */

    function writeSection(ctx, root, blocks, i, btn, redraw, collectFn) {
        var App = app(), S = ctx.S;
        var b = blocks[i];
        if (!b) return;
        var heading = String(b.text || '').trim();
        if (!heading) { App.toast('Write the section heading first, then ask AI to fill it', 'warn', 'Blog'); return; }
        var snap = collectFn();
        btn.classList.add('is-busy');
        ctx.AI.run('blogSection', {
            heading: heading,
            context: snap.excerpt || '',
            products: anchoredProducts(S, { title: heading }),
            anchor: anchor ? anchorBrief(anchor) : null,
            existing: snap.content.slice(0, 800)
        }, { refId: (openEditor._current && openEditor._current.id) ? String(openEditor._current.id) : 'new' }).then(function (res) {
            btn.classList.remove('is-busy');
            U.aiReview({
                title: heading,
                meta: res.provider + ' - ' + res.ms + 'ms',
                text: res.text,
                applyText: 'Fill this section',
                onApply: function () {
                    var made = BB().fromText(res.text).filter(function (x) { return !(x.type === 'h2' || x.type === 'h3'); });
                    if (!made.length) made = [{ type: 'p', text: res.text }];
                    var insertAt = i + 1;
                    for (var k = made.length - 1; k >= 0; k--) blocks.splice(insertAt, 0, made[k]);
                    redraw();
                    App.toast('Section written - check the preview', 'ai', 'Blog');
                },
                onRedo: function (done) {
                    ctx.AI.run('blogSection', { heading: heading, products: productBrief(S) }, { silent: true }).then(function (r2) { done(r2.text); });
                }
            });
        }, function () { btn.classList.remove('is-busy'); App.toast('Generation failed', 'danger', 'AI'); });
    }

    function rewriteSection(ctx, blocks, i, btn, redraw, collectFn) {
        var App = app();
        var b = blocks[i];
        if (!b) return;
        var current = b.type === 'ul' ? (b.items || []).join('\n') : String(b.text || '');
        if (!current.trim()) { App.toast('Nothing to rewrite yet', 'warn', 'Blog'); return; }

        U.promptModal({
            title: 'Rewrite this block',
            sub: 'Keep the facts, change the style.',
            fields: [{ id: 'instruction', label: 'Instruction', value: 'Tighten this - shorter, more direct, no fluff' }],
            okText: 'Rewrite'
        }).then(function (vals) {
            if (!vals) return;
            btn.classList.add('is-busy');
            ctx.AI.run('blogRewrite', { text: current, instruction: vals.instruction }, {}).then(function (res) {
                btn.classList.remove('is-busy');
                U.aiReview({
                    title: 'Rewritten block',
                    meta: res.provider + ' - ' + res.ms + 'ms',
                    text: res.text,
                    applyText: 'Replace block',
                    onApply: function () {
                        if (b.type === 'ul') {
                            b.items = res.text.split('\n').map(function (s) { return s.replace(/^(?:[-*+]|\d+\.)\s*/, '').trim(); }).filter(Boolean);
                        } else {
                            b.text = res.text.trim();
                        }
                        redraw();
                        App.toast('Block replaced', 'ok', 'Blog');
                    },
                    onRedo: function (done) {
                        ctx.AI.run('blogRewrite', { text: current, instruction: vals.instruction }, { silent: true }).then(function (r2) { done(r2.text); });
                    }
                });
            }, function () { btn.classList.remove('is-busy'); App.toast('Generation failed', 'danger', 'AI'); });
        });
    }

})();
