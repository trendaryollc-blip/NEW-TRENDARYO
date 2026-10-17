/**
 * TRENDARYO ADMIN - Catalog views (Products + Reviews)
 * Product edits write the override layer, which products-data.js merges
 * into the live catalogue - so changes here are on the storefront
 * the moment a customer refreshes.
 */
(function () {
    'use strict';

    var V = window.TrendaryoAdminViews = window.TrendaryoAdminViews || {};
    var U = V.util;

    function app() { return window.TrendaryoAdminApp; }
    function A() { return window.TrendaryoAdmin; }
    function P() { return window.TrendaryoProducts; }

    /* ---------- shared: AI review modal ----------
       Shows what the AI produced; nothing touches real data until Apply. */
    function aiReviewModal(opts) {
        var App = app();
        var wrap = document.createElement('div');
        wrap.className = 'modal is-open';
        wrap.innerHTML = '<div class="modal__dialog modal__dialog--lg">' +
            '<div class="modal__head">' + A().icon('sparkles', 15) + '<div><div class="modal__title">' + U.esc(opts.title) + '</div>' +
            '<div class="modal__sub">' + U.esc(opts.meta || '') + '</div></div>' +
            '<button class="modal__close" type="button" data-x>' + A().icon('x', 15) + '</button></div>' +
            '<div class="modal__body"><div class="ai-out" style="max-height:340px;">' + U.esc(opts.text) + '</div>' +
            (opts.fields ? fieldsHtml(opts.fields) : '') + '</div>' +
            '<div class="modal__foot"><span class="spacer"></span>' +
            '<button class="btn" type="button" data-redo>' + A().icon('refresh', 13) + 'Regenerate</button>' +
            '<button class="btn" type="button" data-discard>Discard</button>' +
            '<button class="btn btn--ai" type="button" data-apply>' + A().icon('check', 13) + (opts.applyText || 'Apply') + '</button></div></div>';
        document.body.appendChild(wrap);
        function close() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
        wrap.addEventListener('click', function (e) {
            if (e.target === wrap || e.target.closest('[data-x]')) { close(); return; }
            if (e.target.closest('[data-discard]')) { close(); return; }
            if (e.target.closest('[data-apply]')) { close(); opts.onApply(); }
            if (e.target.closest('[data-redo]')) {
                var out = wrap.querySelector('.ai-out');
                out.innerHTML = '<span class=\"spinner spinner--ai\"></span> Regenerating...';
                opts.onRedo(function (newText) { out.textContent = newText; });
            }
        });
        function fieldsHtml(f) {
            var h = '<div class="grid grid--2 mt-3">';
            for (var k in f) h += '<div><div class="t-label">' + U.esc(k) + '</div><div class="fs-sm" style="margin-top:2px;">' + U.esc(f[k]) + '</div></div>';
            return h + '</div>';
        }
    }

    V.util.aiReview = aiReviewModal;
    V.util.bulkRunner = bulkRunner;
    V.util.runBulkSeo = runBulkSeo;

    /* ---------- shared: bulk runner (sequential, with progress) ---------- */
    function bulkRunner(items, taskFn, onEach, onDone) {
        var App = app();
        var wrap = document.createElement('div');
        wrap.className = 'modal is-open';
        wrap.innerHTML = '<div class="modal__dialog modal__dialog--sm"><div class="modal__head">' + A().icon('sparkles', 15) +
            '<div><div class="modal__title">AI working on the shelf</div><div class="modal__sub" id="bulkSub">0 / ' + items.length + '</div></div></div>' +
            '<div class="modal__body"><div class="meter"><div class="meter__fill meter__fill--ai" id="bulkBar" style="width:0%"></div></div>' +
            '<div class="fs-sm t-dim mt-3" id="bulkNow">Starting...</div></div>' +
            '<div class="modal__foot"><span class="spacer"></span><button class="btn" type="button" data-min id="bulkHide">Run in background</button></div></div>';
        document.body.appendChild(wrap);
        var closed = false;
        wrap.querySelector('[data-min]').addEventListener('click', function () { closed = true; wrap.remove(); });
        function step(i) {
            if (closed) { /* keep going silently */ }
            else {
                wrap.querySelector('#bulkSub').textContent = i + ' / ' + items.length;
                wrap.querySelector('#bulkBar').style.width = Math.round((i / items.length) * 100) + '%';
            }
            if (i >= items.length) {
                if (!closed) setTimeout(function () { if (wrap.parentNode) wrap.remove(); }, 600);
                onDone();
                return;
            }
            var sub = document.getElementById('bulkNow');
            if (sub) sub.textContent = items[i].name;
            taskFn(items[i], function () { setTimeout(function () { step(i + 1); }, 60); });
        }
        setTimeout(function () { step(0); }, 120);
    }

    /* ================================================================
       PRODUCTS
       ================================================================ */
    var stQ = { q: '', cat: '', badge: '', seo: '', sort: 'name' };

    V.products = {
        title: 'Products',
        icon: 'package',
        sub: 'The live shelf - pricing, ops fields and the reorder report; edits reach the storefront instantly',
        edit: function (id) {
            /* Bridge for the Product Details page: open this module's editor
               drawer for the given product id. */
            var ctx = V.products._ctx || {
                App: app(),
                S: window.TrendaryoAdminStore,
                AI: window.TrendaryoAdminAI
            };
            openEditor(ctx, id);
        },
        render: function (root, ctx) {
            V.products._ctx = ctx;
            var S = ctx.S, App = ctx.App;
            var cats = {};
            var all = S.products();
            var i;
            for (i = 0; i < all.length; i++) {
                var c = P() && P().categoryOf ? P().categoryOf(all[i]) : 'Other';
                cats[c] = 1;
            }
            var catOpts = '';
            for (var ck in cats) catOpts += '<option value="' + U.esc(ck) + '">' + U.esc(ck) + '</option>';

            root.innerHTML = U.head('Products', String(all.length) + ' products on the shelf - overrides and additions included',
                '<button class="btn btn--sm" id="prReorder" type="button">' + A().icon('truck', 13) + 'Reorder report</button>' +
                '<button class="btn btn--ai btn--sm" id="prBulkSeo" type="button">' + A().icon('sparkles', 13) + 'AI SEO audit</button>' +
                '<button class="btn btn--sm" id="prExport" type="button">' + A().icon('download', 13) + 'Export</button>' +
                '<button class="btn btn--primary btn--sm" id="prAdd" type="button">' + A().icon('plus', 13) + 'Add product</button>') +
            '<div class="panel"><div class="toolbar">' +
                '<div class="search">' + A().icon('search', 14) + '<input id="prQ" type="text" placeholder="Search name, description, badge..."></div>' +
                '<select class="filter-select" id="prCat"><option value="">All categories</option>' + catOpts + '</select>' +
                '<select class="filter-select" id="prBadge"><option value="">All badges</option><option value="hot">hot</option><option value="trending">trending</option><option value="new">new</option><option value="premium">premium</option><option value="none">no badge</option></select>' +
                '<select class="filter-select" id="prSeo"><option value="">All SEO states</option><option value="full">Full</option><option value="partial">Partial</option><option value="missing">Missing</option></select>' +
                '<select class="filter-select" id="prSort"><option value="name">Sort: Name</option><option value="price">Sort: Price high-low</option><option value="price-a">Sort: Price low-high</option><option value="rating">Sort: Rating</option><option value="stock">Sort: Stock low-high</option></select>' +
                '<span class="filter-count" id="prCount"></span></div>' +
                '<div id="prBulk" class="bulk-bar" style="display:none;"><span class="bulk-bar__count" id="prBulkN"></span><span class="t-dim">selected</span><span class="spacer"></span>' +
                '<button class="btn btn--ai btn--sm" id="prBulkFill" type="button">' + A().icon('sparkles', 12) + 'AI SEO fill</button>' +
                '<button class="btn btn--ai btn--sm" id="prBulkPack" type="button">' + A().icon('layers', 12) + 'AI content pack</button>' +
                '<button class="btn btn--sm" id="prBulkHide" type="button">Hide</button>' +
                '<button class="btn btn--danger btn--sm" id="prBulkDel" type="button">Delete</button></div>' +
                '<div class="cards-wrap" id="prTable"></div></div>';

            bindToolbar(root, ctx);
            drawRows(root, ctx);
            bindBulk(ctx, root);
            root.querySelector('#prAdd').addEventListener('click', function () { openEditor(ctx, null); });
            root.querySelector('#prExport').addEventListener('click', function () { exportCsv(ctx); });
            root.querySelector('#prReorder').addEventListener('click', function () { openReorderReport(ctx); });
            root.querySelector('#prBulkSeo').addEventListener('click', function () {
                var missing = [];
                var list = S.products();
                for (var j = 0; j < list.length; j++) {
                    var sState = S.seoState(list[j]);
                    if (sState !== 'full') missing.push({ id: list[j].id, name: list[j].name });
                }
                if (!missing.length) { App.toast('Every product already has a full SEO package', 'ok', 'AI SEO'); return; }
                var appId = app();
                appId.confirm({ title: 'AI SEO audit', message: '<p class="t-body">Generate and apply meta titles, descriptions and keywords for <b>' + missing.length + '</b> products. Every draft is stored in AI history, and the shelf updates instantly.</p>', okText: 'Run on ' + missing.length + ' products' }).then(function (ok) {
                    if (!ok) return;
                    runBulkSeo(ctx, missing);
                });
            });
        }
    };

    function bindToolbar(root, ctx) {
        var App = app();
        var q = root.querySelector('#prQ');
        q.addEventListener('input', App.debounce(function () { stQ.q = q.value; drawRows(root, ctx); }, 220));
        var map = { prCat: 'cat', prBadge: 'badge', prSeo: 'seo', prSort: 'sort' };
        var keys = ['prCat', 'prBadge', 'prSeo', 'prSort'];
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
        var list = S.products();
        var out = [], i;
        var q = stQ.q.trim().toLowerCase();
        for (i = 0; i < list.length; i++) {
            var p = list[i];
            if (q && (p.name + ' ' + (p.description || '') + ' ' + (p.badge || '')).toLowerCase().indexOf(q) < 0) continue;
            var cat = P() && P().categoryOf ? P().categoryOf(p) : 'Other';
            if (stQ.cat && cat !== stQ.cat) continue;
            if (stQ.badge === 'none' && p.badge) continue;
            if (stQ.badge && stQ.badge !== 'none' && p.badge !== stQ.badge) continue;
            if (stQ.seo && S.seoState(p) !== stQ.seo) continue;
            out.push(p);
        }
        if (stQ.sort === 'name') out.sort(function (a, b) { return a.name.localeCompare(b.name); });
        else if (stQ.sort === 'price') out.sort(function (a, b) { return b.price - a.price; });
        else if (stQ.sort === 'price-a') out.sort(function (a, b) { return a.price - b.price; });
        else if (stQ.sort === 'rating') out.sort(function (a, b) { return b.rating - a.rating; });
        else if (stQ.sort === 'stock') out.sort(function (a, b) { return a._stock - b._stock; });
        return out;
    }

    function seoBadge(state) {
        if (state === 'full') return '<span class="badge badge--ok">SEO full</span>';
        if (state === 'partial') return '<span class="badge badge--warn">SEO partial</span>';
        return '<span class="badge badge--danger">SEO missing</span>';
    }

    function drawRows(root, ctx) {
        var S = ctx.S, App = ctx.App;
        var list = filtered(S);
        root.querySelector('#prCount').textContent = list.length + ' of ' + S.products().length;
        var el = root.querySelector('#prTable');
        if (!list.length) {
            el.innerHTML = U.empty('search', 'Nothing matches these filters', 'Clear the search or pick a different category.');
            updateBulkBar(root, ctx);
            return;
        }
        var h = '<div class="cards"><div class="cards__selectbar"><label class="check"><input type="checkbox" id="prSelAll"></label><span>Select all</span></div>';
        /* Phase 22/23: how many blog articles reference each product. */
        var posts = S.blogPosts();
        var linkedN = {};
        for (var pi = 0; pi < posts.length; pi++) {
            var rel = posts[pi].relatedProductIds || [];
            for (var ri = 0; ri < rel.length; ri++) {
                var key = String(rel[ri]);
                linkedN[key] = (linkedN[key] || 0) + 1;
            }
        }
        for (var i = 0; i < list.length; i++) {
            var p = list[i];
            var cat = P() && P().categoryOf ? P().categoryOf(p) : 'Other';
            var stockCls = p._stock === 0 ? 'badge--danger' : (p._stock <= S.settings().lowStock ? 'badge--warn' : 'badge--neutral');
            h += '<div class="card-row" data-id="' + p.id + '">' +
                '<div class="card-row__check"><label class="check"><input type="checkbox" data-sel="' + p.id + '"></label></div>' +
                '<div class="card-row__main">' +
                    '<div class="card-row__topline">' +
                        '<div class="card-row__identity">' + (P() ? P().media(p, 'table__thumb') : '') +
                            '<div class="card-row__title"><div class="table__primary t-truncate">' + U.esc(p.name) + '</div>' +
                            '<div class="table__secondary">#' + p.id + ' - ' + U.esc(cat) + (p._overridden ? ' - edited' : '') + (p._added ? ' - added by admin' : '') + (p.badge ? ' - ' + U.esc(p.badge) : '') + '</div></div>' +
                        '</div>' +
                        '<div class="card-row__side"><span class="card-row__price">' + U.money(p.price) + '</span>' +
                        '<div class="card-row__actions">' +
                            '<button class="icon-btn" data-details="' + p.id + '" type="button" title="View product details">' + A().icon('package', 14) + '</button>' +
                            '<button class="icon-btn" data-blog="' + p.id + '" type="button" title="Create SEO blog">' + A().icon('layers', 14) + '</button>' +
                            '<button class="icon-btn" data-linked="' + p.id + '" type="button" title="View linked blogs">' + A().icon('link', 14) + '</button>' +
                            '<button class="icon-btn" data-ai="' + p.id + '" type="button" title="AI SEO package">' + A().icon('sparkles', 14) + '</button>' +
                            '<button class="icon-btn" data-edit="' + p.id + '" type="button" title="Edit">' + A().icon('pencil', 14) + '</button>' +
                            '<button class="icon-btn" data-hide="' + p.id + '" type="button" title="' + (p.hidden ? 'Show on shelf' : 'Hide from shelf') + '">' + A().icon(p.hidden ? 'eye' : 'eyeOff', 14) + '</button>' +
                            '<button class="icon-btn" data-del="' + p.id + '" type="button" title="Delete">' + A().icon('trash', 14) + '</button>' +
                        '</div></div>' +
                    '</div>' +
                    '<div class="card-row__meta">' +
                        '<span class="fs-sm t-mute">' + (P() ? P().stars(p.rating) : '') + ' ' + p.rating + '</span>' +
                        '<span>' + seoBadge(S.seoState(p)) + '</span>' +
                        (linkedN[String(p.id)] ? '<span class="fs-xs t-mute">' + linkedN[String(p.id)] + ' linked article(s)</span>' : '') +
                        '<span class="badge ' + stockCls + '">stock ' + p._stock + '</span>' +
                        '<span>' + (p.hidden ? '<span class="badge badge--neutral">Hidden</span>' : '<span class="badge badge--ok">Live</span>') + '</span>' +
                        (p.oldPrice ? '<span class="fs-xs t-mute" style="text-decoration:line-through;">was ' + U.money(p.oldPrice) + '</span>' : '') +
                    '</div>' +
                '</div></div>';
        }
        h += '</div>';
        el.innerHTML = h;

        var selAll = el.querySelector('#prSelAll');
        if (selAll) selAll.addEventListener('change', function () {
            var boxes = el.querySelectorAll('[data-sel]');
            for (var b = 0; b < boxes.length; b++) boxes[b].checked = this.checked;
            updateBulkBar(root, ctx);
        });
        el.addEventListener('change', function (e) { if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-sel')) updateBulkBar(root, ctx); });
        el.addEventListener('click', function (e) {
            var t;
            if ((t = e.target.closest('[data-details]'))) { location.hash = '#/product-detail/' + encodeURIComponent(t.getAttribute('data-details')); return; }
            if ((t = e.target.closest('[data-blog]'))) { location.hash = '#/blog/generate?product=' + encodeURIComponent(t.getAttribute('data-blog')); return; }
            if ((t = e.target.closest('[data-linked]'))) { location.hash = '#/product-detail/' + encodeURIComponent(t.getAttribute('data-linked')); return; }
            if ((t = e.target.closest('[data-edit]'))) { openEditor(ctx, t.getAttribute('data-edit')); return; }
            if ((t = e.target.closest('[data-hide]'))) {
                var hid = t.getAttribute('data-hide');
                var cur = S.product(hid);
                S.saveProduct(hid, { hidden: !cur.hidden });
                App.toast(cur.name + (cur.hidden ? ' restored to the shelf' : ' hidden from the shelf'), 'ok', 'Catalog');
                drawRows(root, ctx);
                app().badges();
                return;
            }
            if ((t = e.target.closest('[data-del]'))) {
                var del = t.getAttribute('data-del');
                var dp = S.product(del);
                App.confirm({ title: 'Delete product?', message: '<p class="t-body"><b>' + U.esc(dp.name) + '</b> leaves the live shelf immediately. Admin edits stay undoable until the override layer is cleared in Settings.</p>', okText: 'Delete', danger: true }).then(function (ok) {
                    if (!ok) return;
                    S.deleteProduct(del);
                    App.toast(dp.name + ' removed from the shelf', 'ok', 'Catalog');
                    drawRows(root, ctx);
                    app().badges();
                });
                return;
            }
            if ((t = e.target.closest('[data-ai]'))) {
                var aid = t.getAttribute('data-ai');
                var ap = S.product(aid);
                var btn = t;
                btn.classList.add('is-busy');
                ctx.AI.run('seoPackage', { product: ap }, { refId: String(aid) }).then(function (res) {
                    btn.classList.remove('is-busy');
                    if (!res.data) { App.toast('Generation could not be parsed - try again or check AI history', 'warn', 'AI SEO'); return; }
                    aiReviewModal({
                        title: 'SEO package - ' + ap.name,
                        meta: res.provider + ' - ' + res.ms + 'ms',
                        text: JSON.stringify(res.data, null, 2),
                        fields: { 'Meta title': res.data.metaTitle || '', 'Meta description': res.data.metaDescription || '', 'Keywords': (res.data.keywords || []).join(', ') },
                        applyText: 'Apply to product',
                        onApply: function () {
                            S.applySeo(aid, { metaTitle: res.data.metaTitle || '', metaDescription: res.data.metaDescription || '', keywords: res.data.keywords || [] });
                            S.aiUpdate(lastAiIdFor(aid), { applied: 'seo' });
                            App.toast('SEO package applied to ' + ap.name, 'ok', 'AI SEO');
                            drawRows(root, ctx);
                        },
                        onRedo: function (done) {
                            ctx.AI.run('seoPackage', { product: ap }, { refId: String(aid), silent: true }).then(function (r2) {
                                if (r2.data) { res.data = r2.data; done(JSON.stringify(r2.data, null, 2)); }
                            });
                        }
                    });
                }, function () { btn.classList.remove('is-busy'); App.toast('Generation failed', 'danger', 'AI SEO'); });
            }
        });
        updateBulkBar(root, ctx);
    }

    function lastAiIdFor(pid) {
        var h = window.TrendaryoAdminStore.aiHistory();
        for (var i = 0; i < h.length; i++) if (String(h[i].refId) === String(pid) && h[i].task === 'seoPackage') return h[i].id;
        return null;
    }

    /* ---------- Phase 25: bulk content creation (all drafts, never published) ---------- */

    function openBulkPack(ctx, items) {
        var App = ctx.App;
        App.drawer.open({
            title: 'AI content pack',
            sub: 'One content engine run per product - product page drafts, blog briefs, blog drafts. Everything lands as a draft.',
            body: '<div class="field"><label class="field__label">Products</label><div class="fs-sm">' + items.map(function (it) { return U.esc(it.name); }).join(', ') + '</div></div>' +
                '<label class="switch" style="margin-bottom:10px;"><input type="checkbox" id="bpContent" checked><span class="switch__track"></span><span class="switch__text">Product content drafts</span></label>' +
                '<label class="switch" style="margin-bottom:10px;"><input type="checkbox" id="bpBrief" checked><span class="switch__track"></span><span class="switch__text">Blog briefs</span></label>' +
                '<label class="switch" style="margin-bottom:10px;"><input type="checkbox" id="bpBlog"><span class="switch__track"></span><span class="switch__text">Blog drafts (one article per product)</span></label>' +
                '<div class="field-row"><div class="field"><label class="field__label">Blog type</label><select class="select" id="bpType">' +
                    '<option value="product-review" selected>Product review</option><option value="buying-guide">Buying guide</option><option value="comparison">Comparison</option><option value="best-products">Best products list</option><option value="faq-article">FAQ article</option><option value="problem-solution">Problem solution</option><option value="trend">Trend article</option><option value="seo-landing">SEO landing page</option></select></div>' +
                '<div class="field"><label class="field__label">Length</label><select class="select" id="bpLength"><option value="short">Short</option><option value="medium" selected>Medium</option><option value="long">Long</option></select></div></div>' +
                '<div class="field__hint">Runs sequentially with a progress bar - a shop of 10 products takes a few minutes. Nothing here publishes.</div>',
            foot: '<span class="spacer"></span>' +
                '<button class="btn" type="button" data-dc>Cancel</button>' +
                '<button class="btn btn--ai" type="button" data-run>' + A().icon('sparkles', 13) + 'Run the pack</button>',
            onMount: function (root) {
                root.querySelector('[data-dc]').addEventListener('click', function () { App.drawer.close(); });
                root.querySelector('[data-run]').addEventListener('click', function () {
                    var opts = {
                        content: root.querySelector('#bpContent').checked,
                        brief: root.querySelector('#bpBrief').checked,
                        blog: root.querySelector('#bpBlog').checked,
                        blogType: root.querySelector('#bpType').value,
                        length: root.querySelector('#bpLength').value
                    };
                    if (!opts.content && !opts.brief && !opts.blog) {
                        App.toast('Pick at least one asset to generate', 'warn', 'AI content pack');
                        return;
                    }
                    App.drawer.close();
                    runBulkPack(ctx, items, opts);
                });
            }
        });
    }

    function bulkContentFor(product) {
        return {
            title: product.name || '',
            shortDescription: product.description || '',
            longDescription: '',
            features: [],
            benefits: [],
            useCases: [],
            faqs: []
        };
    }

    function runBulkPack(ctx, items, opts) {
        var App = ctx.App, S = ctx.S;
        var okN = 0, failN = 0;
        var made = { content: 0, briefs: 0, blogs: 0 };
        bulkRunner(items, function (it, next) {
            var product = S.product(it.id);
            if (!product) { failN++; return next(); }
            var queue = [];
            if (opts.content) queue.push('content');
            if (opts.brief) queue.push('brief');
            if (opts.blog) queue.push('blog');
            var cache = {};

            (function step() {
                var job = queue.shift();
                if (!job) { okN++; return next(); }
                if (job === 'content') {
                    ctx.AI.run('productPage', { product: product }, { refId: String(product.id) }).then(function (res) {
                        cache.page = splitFaqs(res.data);
                        return apiSave('/products/' + encodeURIComponent(String(product.id)) + '/content', {
                            method: 'POST',
                            body: { sections: cache.page.sections, faqs: cache.page.faqs }
                        });
                    }).then(function () { made.content++; step(); }, function () { step(); });
                    return;
                }
                if (job === 'brief') {
                    var briefInput = {
                        product: product,
                        content: contentOr(cache.page, product),
                        seo: product.seo || {},
                        blogType: opts.blogType
                    };
                    ctx.AI.run('blogBrief', briefInput, { refId: String(product.id) }).then(function (res) {
                        var d = res.data || {};
                        return apiSave('/blog/briefs', {
                            method: 'POST',
                            body: Object.assign({
                                productId: String(product.id),
                                productName: product.name || '',
                                status: 'BRIEF_READY',
                                blogType: opts.blogType,
                                source: { contentTitle: (cache.page && cache.page.sections.title) || product.name || '', shortDescription: product.description || '', keywords: (product.seo && product.seo.keywords) || [], price: product.price || 0, category: product.category || '' }
                            }, d)
                        });
                    }).then(function (saved) {
                        cache.brief = (saved && saved.data) || null;
                        made.briefs++;
                        step();
                    }, function () { step(); });
                    return;
                }
                if (job === 'blog') {
                    var briefBody = cache.brief || minimalBrief(product);
                    var content = contentOr(cache.page, product);
                    ctx.AI.run('blogArticle', {
                        product: product,
                        content: content,
                        brief: briefBody,
                        seo: product.seo || {},
                        blogType: opts.blogType,
                        length: opts.length,
                        tone: 'professional',
                        instructions: '',
                        productUrl: 'product.html?id=' + encodeURIComponent(String(product.id)),
                        existingArticles: []
                    }, { refId: String(product.id) }).then(function (res) {
                        var a = res.data;
                        if (!a || !a.seoTitle) return step();
                        return apiSave('/blog', {
                            method: 'POST',
                            body: articleToPost(a, product, opts)
                        });
                    }).then(function () { made.blogs++; step(); }, function () { step(); });
                    return;
                }
                step();
            })();
        }, null, function () {
            App.toast('Content pack finished: ' + made.content + ' page drafts, ' + made.briefs + ' briefs, ' + made.blogs + ' blog drafts' +
                (failN ? ' - ' + failN + ' skipped (see AI history)' : '') + '. Everything is a draft - review before publishing.', okN ? 'ok' : 'warn', 'AI content pack');
            app().badges();
            if (app().current === 'products') App.route();
        });
    }

    function splitFaqs(data) {
        var d = Object.assign({}, data || {});
        var faqs = d.faqs || [];
        delete d.faqs;
        return { sections: d, faqs: faqs };
    }

    function contentOr(page, product) {
        if (page && page.sections && page.sections.title) return page.sections;
        return bulkContentFor(product);
    }

    function minimalBrief(product) {
        return {
            primaryKeyword: String(product.name || '').toLowerCase(),
            secondaryKeywords: ((product.seo && product.seo.keywords) || []).slice(0, 8),
            longTailKeywords: [],
            h2Suggestions: [],
            faqs: []
        };
    }

    function apiSave(endpoint, opts) {
        if (window.API && typeof window.API.request === 'function') {
            return window.API.request(endpoint, opts).then(function (res) { return res; }, function () { return null; });
        }
        return Promise.resolve(null);
    }

    function articleToPost(a, product, opts) {
        var blocks = [];
        if (a.introduction) blocks.push({ type: 'p', text: a.introduction });
        var sections = a.sections || [];
        for (var i = 0; i < sections.length; i++) {
            var s = sections[i];
            if (s.h2) blocks.push({ type: 'h2', text: s.h2 });
            for (var j = 0; j < (s.paragraphs || []).length; j++) blocks.push({ type: 'p', text: s.paragraphs[j] });
            for (var k = 0; k < (s.h3s || []).length; k++) {
                if (s.h3s[k].h3) blocks.push({ type: 'h3', text: s.h3s[k].h3 });
                for (var m = 0; m < (s.h3s[k].paragraphs || []).length; m++) blocks.push({ type: 'p', text: s.h3s[k].paragraphs[m] });
            }
        }
        if ((a.faqs || []).length) {
            blocks.push({ type: 'h2', text: 'Questions buyers ask' });
            for (var f = 0; f < a.faqs.length; f++) {
                blocks.push({ type: 'h3', text: a.faqs[f].q });
                blocks.push({ type: 'p', text: a.faqs[f].a });
            }
        }
        if (a.conclusion) {
            blocks.push({ type: 'h2', text: 'Verdict' });
            blocks.push({ type: 'p', text: a.conclusion });
        }
        var bb = window.BlogBlocks || { readMinutes: function () { return 5; } };
        return {
            title: a.seoTitle || (product.name + ' review'),
            excerpt: a.excerpt || a.metaDescription || '',
            category: a.category || 'guides',
            tags: a.tags || [],
            blocks: blocks,
            status: 'draft',
            readMinutes: bb.readMinutes(blocks, ''),
            seo: {
                metaTitle: a.metaTitle || '',
                metaDescription: a.metaDescription || '',
                keywords: (a.keywords || []).concat([]),
                ogImage: product.image || '',
                faqs: (a.faqs || []).map(function (q) { return { q: q.q, a: q.a }; }),
                internalLinks: a.internalLinks || [],
                blogType: opts.blogType
            },
            relatedProductIds: [String(product.id)]
        };
    }

    /* ---------- Phase 4: new product -> AI content draft (never published) ---------- */

    function autoDraft(ctx, product) {
        var App = ctx.App, AI = ctx.AI;
        if (!AI || !window.API) return;
        App.toast('AI is drafting the product page for ' + (product.name || 'the new product') + '...', 'ai', 'AI content');
        AI.run('productPage', { product: product }, { refId: String(product.id), silent: true }).then(function (res) {
            var data = (res && res.data) || {};
            var sections = Object.assign({}, data);
            var faqs = sections.faqs || [];
            delete sections.faqs;
            if (!sections.title) { App.toast('AI could not draft the page - retry from Product Details', 'warn', 'AI content'); return; }
            window.API.request('/products/' + encodeURIComponent(String(product.id)) + '/content', {
                method: 'POST',
                body: { sections: sections, faqs: faqs }
            }).then(function () {
                App.toast('AI content draft saved for ' + (product.name || 'the product') + ' - review it in Product Details', 'ai', 'AI content');
            }, function () {
                App.toast('AI drafted the page but saving failed - retry from Product Details', 'warn', 'AI content');
            });
        }, function () {
            App.toast('AI could not draft the page - retry from Product Details', 'warn', 'AI content');
        });
    }

    function updateBulkBar(root, ctx) {
        var S = ctx.S;
        var boxes = root.querySelectorAll('[data-sel]');
        var n = 0, i;
        for (i = 0; i < boxes.length; i++) if (boxes[i].checked) n++;
        var bar = root.querySelector('#prBulk');
        if (!bar) return;
        bar.style.display = n ? 'flex' : 'none';
        root.querySelector('#prBulkN').textContent = n;
    }

    function bulkSelection(root) {
        var boxes = root.querySelectorAll('[data-sel]');
        var ids = [];
        for (var i = 0; i < boxes.length; i++) if (boxes[i].checked) ids.push(boxes[i].getAttribute('data-sel'));
        return ids;
    }

    function runBulkSeo(ctx, items) {
        var S = ctx.S, App = ctx.App;
        var okN = 0, failN = 0;
        bulkRunner(items, function (it, next) {
            ctx.AI.run('seoPackage', { product: S.product(it.id) }, { refId: String(it.id) }).then(function (res) {
                if (res.data && res.data.metaTitle) {
                    S.applySeo(it.id, { metaTitle: res.data.metaTitle || '', metaDescription: res.data.metaDescription || '', keywords: res.data.keywords || [] });
                    okN++;
                } else failN++;
                next();
            }, function () { failN++; next(); });
        }, null, function () {
            App.toast('SEO applied to ' + okN + ' products' + (failN ? ' - ' + failN + ' skipped (see AI history)' : ''), okN ? 'ok' : 'warn', 'AI SEO');
            app().badges();
            if (app().current === 'products') App.route();
        });
    }

    function exportCsv(ctx) {
        var rows = [];
        var list = ctx.S.products();
        for (var i = 0; i < list.length; i++) {
            var p = list[i];
            var cat = P() && P().categoryOf ? P().categoryOf(p) : 'Other';
            rows.push({ id: p.id, name: p.name, category: cat, price: p.price, oldPrice: p.oldPrice || '', rating: p.rating, reviews: p.reviews, stock: p._stock, seo: ctx.S.seoState(p), status: p.hidden ? 'hidden' : 'visible' });
        }
        if (rows.length) app().csv(rows, 'trendaryo-products');
        else app().toast('Nothing to export', 'warn');
    }

    function bindBulk(ctx, root) {
        var bar = root.querySelector('#prBulk');
        if (!bar || bar.getAttribute('data-bound')) return;
        bar.setAttribute('data-bound', '1');
        var S = ctx.S, App = ctx.App;
        bar.querySelector('#prBulkFill').addEventListener('click', function () {
            var ids = bulkSelection(root);
            if (!ids.length) return;
            var items = [];
            for (var i = 0; i < ids.length; i++) { var q = S.product(ids[i]); if (q) items.push({ id: q.id, name: q.name }); }
            App.confirm({ title: 'AI SEO fill', message: '<p class="t-body">Generate and apply full SEO packages for <b>' + items.length + '</b> selected products. Drafts land in AI history before anything is applied.</p>', okText: 'Generate for ' + items.length }).then(function (ok) {
                if (ok) runBulkSeo(ctx, items);
            });
        });
        bar.querySelector('#prBulkPack').addEventListener('click', function () {
            var ids = bulkSelection(root);
            if (!ids.length) return;
            var items = [];
            for (var i = 0; i < ids.length; i++) { var q = S.product(ids[i]); if (q) items.push({ id: q.id, name: q.name }); }
            openBulkPack(ctx, items);
        });
        bar.querySelector('#prBulkHide').addEventListener('click', function () {
            var ids = bulkSelection(root);
            if (!ids.length) return;
            App.confirm({ title: 'Hide products?', message: '<p class="t-body">' + ids.length + ' product(s) leave the public shelf but stay in the catalogue.</p>', okText: 'Hide' }).then(function (ok) {
                if (!ok) return;
                for (var i = 0; i < ids.length; i++) S.saveProduct(ids[i], { hidden: true });
                App.toast(ids.length + ' product(s) hidden', 'ok', 'Catalog');
                App.route();
            });
        });
        bar.querySelector('#prBulkDel').addEventListener('click', function () {
            var ids = bulkSelection(root);
            if (!ids.length) return;
            App.confirm({ title: 'Delete products?', message: '<p class="t-body"><b>' + ids.length + '</b> product(s) leave the live shelf. This is reversible until the override layer is cleared.</p>', okText: 'Delete', danger: true }).then(function (ok) {
                if (!ok) return;
                for (var i = 0; i < ids.length; i++) S.deleteProduct(ids[i]);
                App.toast(ids.length + ' product(s) deleted', 'ok', 'Catalog');
                App.route();
            });
        });
    }

    /* ---------- the editor drawer ---------- */

    function openEditor(ctx, id) {
        var S = ctx.S, App = ctx.App;
        var p = id ? S.product(id) : null;
        var isNew = !p;
        var seo = (p && p.seo) ? p.seo : {};
        var body = '<div class="editor-layout"><div>' +
            '<div class="field"><label class="field__label">Product name <span class="req">*</span></label><div class="input-ai"><input class="input" id="edName" value="' + U.esc(p ? p.name : '') + '"><button class="ai-btn" type="button" data-gen="productTitle">' + A().icon('sparkles', 12) + 'Titles</button></div></div>' +
            '<div class="field"><label class="field__label">Description</label><div class="input-ai input-ai--stack"><textarea class="textarea textarea--tall" id="edDesc">' + U.esc(p ? p.description : '') + '</textarea><button class="ai-btn" type="button" data-gen="productDesc">' + A().icon('sparkles', 12) + 'Generate</button></div><div class="field__hint">Grounded in the real specs - the AI only writes what the catalogue supports.</div></div>' +
            '<div class="field-row field-row--3"><div class="field"><label class="field__label">Price ($) <span class="req">*</span></label><input class="input input--mono" id="edPrice" type="number" min="0" step="0.01" value="' + (p ? p.price : '') + '"></div>' +
            '<div class="field"><label class="field__label">Was price ($)</label><input class="input input--mono" id="edOld" type="number" min="0" step="0.01" value="' + (p && p.oldPrice ? p.oldPrice : '') + '"><div class="field__hint">Empty = no reduction shown.</div></div>' +
            '<div class="field"><label class="field__label">Stock (units)</label><input class="input input--mono" id="edStock" type="number" min="0" value="' + (p ? p._stock : 24) + '"></div></div>' +
            '<div class="field-row"><div class="field"><label class="field__label">Badge</label><select class="select" id="edBadge"><option value="">no badge</option><option value="hot"' + (p && p.badge === 'hot' ? ' selected' : '') + '>hot</option><option value="trending"' + (p && p.badge === 'trending' ? ' selected' : '') + '>trending</option><option value="new"' + (p && p.badge === 'new' ? ' selected' : '') + '>new</option><option value="premium"' + (p && p.badge === 'premium' ? ' selected' : '') + '>premium</option></select></div>' +
            '<div class="field"><label class="field__label">Emoji</label><input class="input" id="edEmoji" maxlength="4" value="' + U.esc(p ? (p.emoji || '') : '') + '" placeholder="e.g. &#127911;"><div class="field__hint">Used as the artwork when no photo is set.</div></div></div>' +
            '<div class="field"><label class="field__label">Image URL</label><input class="input input--mono" id="edImage" value="' + U.esc(p ? (p.image || '') : '') + '" placeholder="https://..."></div>' +
            '<hr class="divider"><div class="row row--between" style="margin-bottom:8px;"><span class="t-label">Operations</span><span class="fs-xs t-mute">Cost powers margin; reorder point drives low-stock alerts and the reorder report.</span></div>' +
            '<div class="field-row field-row--3"><div class="field"><label class="field__label">Cost price ($)</label><input class="input input--mono" id="edCost" type="number" min="0" step="0.01" value="' + (p && p.costPrice != null ? p.costPrice : '') + '"><div class="field__hint" id="edMargin">Margin unknown without cost.</div></div>' +
            '<div class="field"><label class="field__label">Reorder point</label><input class="input input--mono" id="edReorder" type="number" min="0" value="' + (p && p.reorderPoint != null ? p.reorderPoint : '') + '"><div class="field__hint">0/empty = store low-stock setting.</div></div>' +
            '<div class="field"><label class="field__label">Lead time (days)</label><input class="input input--mono" id="edLead" type="number" min="0" value="' + (p && p.leadTimeDays != null ? p.leadTimeDays : '') + '"><div class="field__hint">Supplier SLA clock for this item.</div></div></div>' +
            '<label class="switch" style="margin-bottom:16px;"><input type="checkbox" id="edHidden"' + (p && p.hidden ? ' checked' : '') + '><span class="switch__track"></span><span class="switch__text">Hidden from the public shelf</span></label>' +
            '<hr class="divider"><div class="row row--between" style="margin-bottom:8px;"><span class="t-label">SEO package</span><button class="ai-chip" type="button" data-gen="seoPackage">' + A().icon('sparkles', 12) + 'Generate package</button></div>' +
            '<div class="field"><label class="field__label">Meta title</label><input class="input input--mono" id="edMt" maxlength="70" value="' + U.esc(seo.metaTitle || '') + '"><div class="field__hint">Max 60 characters in search results.</div></div>' +
            '<div class="field"><label class="field__label">Meta description</label><textarea class="textarea" id="edMd" maxlength="180">' + U.esc(seo.metaDescription || '') + '</textarea><div class="field__hint">Max 155 characters.</div></div>' +
            '<div class="field"><label class="field__label">Keywords</label><input class="input input--mono" id="edKw" value="' + U.esc((seo.keywords || []).join(', ')) + '"><div class="field__hint">Comma separated, 8-10 buyer-intent phrases.</div></div>' +
            '</div>' +
            '<div><div class="panel editor-preview"><div class="panel__head panel__head--plain"><span class="t-label">Shelf preview</span></div><div class="panel__body" id="edPrev"></div><div class="panel__foot fs-xs t-mute">' + (isNew ? 'Goes live the moment you save.' : 'Live on the shelf after Save.') + '</div></div></div></div>';

        var d = App.drawer.open({
            title: isNew ? 'Add product' : 'Edit - ' + p.name,
            sub: isNew ? 'A new shelf listing, AI-ready' : 'Product #' + p.id + (p._overridden ? ' - edited by admin' : ' - base catalogue data'),
            wide: true,
            body: body,
            foot: '<span class="spacer"></span><button class="btn" type="button" data-dc>Cancel</button>' +
                  '<button class="btn btn--primary" type="button" data-save>' + A().icon('save', 13) + (isNew ? 'Add to shelf' : 'Save changes') + '</button>',
            onMount: function (root) {
                var q = function (sel) { return root.querySelector(sel); };
                function collect() {
                    function numOrNull(sel) {
                        var v = q(sel).value;
                        return v === '' ? null : (parseFloat(v) >= 0 ? parseFloat(v) : null);
                    }
                    return {
                        id: p ? p.id : null,
                        name: q('#edName').value.trim(),
                        description: q('#edDesc').value.trim(),
                        price: parseFloat(q('#edPrice').value) || 0,
                        oldPrice: q('#edOld').value === '' ? null : (parseFloat(q('#edOld').value) || null),
                        emoji: q('#edEmoji').value.trim(),
                        badge: q('#edBadge').value,
                        image: q('#edImage').value.trim(),
                        stock: parseInt(q('#edStock').value, 10) || 0,
                        hidden: q('#edHidden').checked,
                        rating: p ? p.rating : 4.5,
                        reviews: p ? p.reviews : 0,
                        costPrice: numOrNull('#edCost'),
                        reorderPoint: numOrNull('#edReorder'),
                        leadTimeDays: numOrNull('#edLead'),
                        seo: { metaTitle: q('#edMt').value.trim(), metaDescription: q('#edMd').value.trim(), keywords: q('#edKw').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean) }
                    };
                }
                function preview() {
                    var c = collect();
                    var P2 = P();
                    var margin = (c.costPrice != null && c.price > 0) ? Math.round(((c.price - c.costPrice) / c.price) * 1000) / 10 : null;
                    var marginHint = q('#edMargin');
                    if (marginHint) marginHint.textContent = margin != null ? 'Margin ' + margin + '% at this price.' : 'Margin unknown without cost.';
                    var art = c.image ? '<img class="table__thumb" style="width:120px;height:120px;border-radius:6px;object-fit:cover;" src="' + U.esc(c.image) + '" alt="">' : (P2 ? P2.tile({ id: c.id || 1, emoji: c.emoji || '\uD83D\uDCE6' }).replace('<svg', '<svg style="width:120px;height:120px;border-radius:6px;"') : '');
                    q('#edPrev').innerHTML = '<div style="text-align:center;">' + art + '</div>' +
                        '<div class="fw-700 mt-3" style="text-align:center;">' + U.esc(c.name || 'Untitled product') + '</div>' +
                        '<div style="text-align:center;margin-top:4px;">' + (P2 ? P2.stars(c.rating) : '') + ' <span class="fs-xs t-dim">' + c.rating + '</span></div>' +
                        '<div style="text-align:center;margin-top:6px;"><span class="fw-700" style="font-size:18px;">' + U.money(c.price) + '</span>' + (c.oldPrice ? ' <span class="fs-xs t-mute" style="text-decoration:line-through;">' + U.money(c.oldPrice) + '</span>' : '') + '</div>' +
                        (margin != null ? '<div class="fs-xs ' + (margin < 20 ? 'text-danger' : 'text-ok') + '" style="text-align:center;margin-top:2px;">margin ' + margin + '%</div>' : '') +
                        (c.badge ? '<div style="text-align:center;margin-top:8px;"><span class="badge badge--accent">' + U.esc(c.badge) + '</span></div>' : '') +
                        (c.hidden ? '<div style="text-align:center;margin-top:8px;"><span class="badge badge--neutral">Hidden</span></div>' : '');
                }
                var fields = ['#edName', '#edDesc', '#edPrice', '#edOld', '#edEmoji', '#edBadge', '#edImage', '#edHidden', '#edCost', '#edReorder', '#edLead'];
                for (var fi = 0; fi < fields.length; fi++) {
                    (function (sel) {
                        var el2 = q(sel);
                        if (el2) el2.addEventListener('input', preview);
                        if (el2) el2.addEventListener('change', preview);
                    })(fields[fi]);
                }
                preview();
                root.querySelector('[data-dc]').addEventListener('click', function () { App.drawer.close(); });
                root.querySelector('[data-save]').addEventListener('click', function () {
                    var c = collect();
                    if (!c.name) { App.toast('Give the product a name first', 'warn', 'Catalog'); q('#edName').focus(); return; }
                    if (!(c.price > 0)) { App.toast('Price must be above zero', 'warn', 'Catalog'); q('#edPrice').focus(); return; }
                    if (isNew) { S.addProduct(c); App.toast(c.name + ' added to the live shelf', 'ok', 'Catalog'); autoDraft(ctx, c); }
                    else { S.saveProduct(p.id, c); App.toast(c.name + ' updated - the shelf reflects it now', 'ok', 'Catalog'); }
                    App.badges();
                    App.drawer.close();
                    if (app().current === 'products') App.route();
                });
                var gens = root.querySelectorAll('[data-gen]');
                for (var gi = 0; gi < gens.length; gi++) {
                    gens[gi].addEventListener('click', function () {
                        var task = this.getAttribute('data-gen');
                        var btn = this;
                        btn.classList.add('is-busy');
                        var snap = collect();
                        snap.rating = p ? p.rating : 4.5;
                        snap.reviews = p ? p.reviews : 0;
                        ctx.AI.run(task, { product: snap }).then(function (res) {
                            btn.classList.remove('is-busy');
                            if (task === 'seoPackage') {
                                if (!res.data) { App.toast('Could not parse the package - try again', 'warn', 'AI'); return; }
                                q('#edMt').value = res.data.metaTitle || '';
                                q('#edMd').value = res.data.metaDescription || '';
                                q('#edKw').value = (res.data.keywords || []).join(', ');
                                App.toast('SEO package drafted - review and save', 'ai', 'AI Studio');
                                return;
                            }
                            aiReviewModal({
                                title: task === 'productDesc' ? 'Draft description' : 'Title variants',
                                meta: res.provider + ' - ' + res.ms + 'ms',
                                text: res.text,
                                applyText: task === 'productDesc' ? 'Use description' : 'Keep for reference',
                                onApply: function () {
                                    if (task === 'productDesc') { q('#edDesc').value = res.text.trim(); preview(); App.toast('Description drafted - review and save', 'ai', 'AI Studio'); }
                                },
                                onRedo: function (done) {
                                    ctx.AI.run(task, { product: snap }, { silent: true }).then(function (r2) { done(r2.text); });
                                }
                            });
                        }, function () { btn.classList.remove('is-busy'); App.toast('Generation failed', 'danger', 'AI'); });
                    });
                }
            }
        });
        return d;
    }

    /* ---------- F7: reorder report drawer ---------- */
    function openReorderReport(ctx) {
        var App = ctx.App;
        var d = App.drawer.open({
            title: 'Reorder report',
            sub: 'Active products at or below their effective reorder point',
            wide: true,
            body: '<div class="empty"><span class="spinner"></span><p style="margin-top:12px;">Checking stock against reorder points...</p></div>',
            foot: '<span class="spacer"></span><button class="btn" type="button" data-dc>Close</button>',
            onMount: function (root) {
                root.querySelector('[data-dc]').addEventListener('click', function () { App.drawer.close(); });
            }
        });
        if (!window.API) return d;
        window.API.request('/admin/reorder').then(function (res) {
            var rows = (res && res.data) || [];
            var meta = (res && res.meta) || {};
            var bodyEl = d.root.querySelector('.modal__body');
            if (!bodyEl) return;
            if (!rows.length) {
                bodyEl.innerHTML = '<div class="empty"><div class="empty__icon">' + A().icon('check', 20) + '</div>' +
                    '<p class="fw-600">Nothing to reorder</p>' +
                    '<p class="fs-sm t-mute">Every active product is above its reorder point (store default ' + (meta.storeDefaultThreshold != null ? meta.storeDefaultThreshold : 8) + ').</p></div>';
                return;
            }
            var h = '<div class="row row--wrap" style="gap:8px;margin-bottom:12px;">' +
                '<span class="badge badge--danger">' + rows.length + ' below reorder point</span>' +
                '<span class="badge badge--neutral">' + (meta.outOfStock || 0) + ' out of stock</span>' +
                '<span class="fs-xs t-mute" style="align-self:center;">checked ' + (meta.checkedAt ? App.ago(meta.checkedAt) : 'just now') + '</span></div>' +
                '<div class="table-wrap"><table class="table table--compact"><thead><tr>' +
                '<th>Product</th><th class="num">Stock</th><th class="num">Reorder at</th><th class="num">Lead</th><th class="num">Margin</th><th>Supplier</th>' +
                '</tr></thead><tbody>';
            for (var i = 0; i < rows.length; i++) {
                var r = rows[i];
                h += '<tr>' +
                    '<td><div class="table__primary">' + U.esc(r.name) + '</div><div class="table__secondary">#' + U.esc(r.id) + (r.sku ? ' - ' + U.esc(r.sku) : '') + '</div></td>' +
                    '<td class="num"><span class="badge ' + (r.outOfStock ? 'badge--danger' : 'badge--warn') + '">' + r.stock + '</span></td>' +
                    '<td class="num">' + r.effectiveThreshold + (r.reorderPoint != null ? '' : ' <span class="fs-xs t-mute">(default)</span>') + '</td>' +
                    '<td class="num">' + (r.leadTimeDays != null ? r.leadTimeDays + 'd' : '-') + '</td>' +
                    '<td class="num' + (r.marginPct != null && r.marginPct < 20 ? ' text-danger' : '') + '">' + (r.marginPct != null ? r.marginPct + '%' : '-') + '</td>' +
                    '<td class="fs-sm">' + (r.supplierId ? U.esc(String(r.supplierId)) : '-') + '</td>' +
                    '</tr>';
            }
            h += '</tbody></table></div>' +
                '<div class="fs-xs t-mute" style="margin-top:10px;">Reorder point and lead time are editable in the product editor (Operations section).</div>';
            bodyEl.innerHTML = h;
        }).catch(function (err) {
            var bodyEl = d.root.querySelector('.modal__body');
            if (bodyEl) bodyEl.innerHTML = '<div class="empty"><div class="empty__icon">' + A().icon('alert', 20) + '</div><p class="fw-600">Could not load the report</p><p class="fs-sm t-mute">' + U.esc((err && err.message) || 'Unknown error') + '</p></div>';
        });
        return d;
    }


    /* ================================================================
       REVIEWS
       ================================================================ */

    function rName(r) { return r.name || r.author || 'Guest'; }
    function rText(r) { return r.comment || r.text || r.body || ''; }
    function rDate(r) { return r.timestamp || r.date || r.createdAt || null; }

    V.reviews = {
        title: 'Reviews',
        icon: 'star',
        sub: 'Community feedback - moderation plus AI-assisted replies',
        render: function (root, ctx) {
            var S = ctx.S, App = ctx.App;
            var rk = S.reviewKpis();
            var list = S.reviews();
            list.sort(function (a, b) { return new Date(rDate(b) || 0) - new Date(rDate(a) || 0); });
            var covered = {}, ci;
            for (ci = 0; ci < list.length; ci++) covered[list[ci].productId] = 1;
            var coveredN = 0, key;
            for (key in covered) coveredN++;

            root.innerHTML = U.head('Reviews', rk.total + ' reviews on record - average ' + rk.avg.toFixed(2) + '/5',
                '<button class="btn btn--sm" id="rvExport" type="button">' + A().icon('download', 13) + 'Export</button>' +
                '<button class="btn btn--sm" id="rvSeed" type="button">' + A().icon('plus', 13) + 'Seed samples</button>') +

            '<div class="grid grid--5" style="margin-bottom:16px;">' +
                U.kpi('star', 'stat__icon--accent', 'Total reviews', String(rk.total), 'stored on this device') +
                U.kpi('award', '', 'Average rating', rk.avg ? rk.avg.toFixed(2) + ' / 5' : '-', 'across all products') +
                U.kpi('activity', rk.low.length ? 'stat__icon--danger' : 'stat__icon--ok', 'Needs attention', String(rk.low.length), 'rated 2 stars or lower') +
                U.kpi('package', '', 'Products covered', String(coveredN), 'with at least one review') +
                U.kpi('users', '', 'Reviewers', String(new Set2(list).size), 'unique names on record') +
            '</div>' +
            '<div class="panel"><div class="panel__head"><div><div class="panel__title">Moderation queue</div><div class="panel__subtitle">Reply with AI, delete what breaks the shelf\'s honesty</div></div></div>' +
                '<div class="cards-wrap" id="rvTable"></div></div>';

            function Set2(arr) { var m = {}; var n = 0; for (var i = 0; i < arr.length; i++) { var v2 = String(rName(arr[i])).toLowerCase(); if (!m[v2]) { m[v2] = 1; n++; } } return { size: n }; }

            var el = root.querySelector('#rvTable');
            if (!list.length) {
                el.innerHTML = U.empty('star', 'No reviews yet', 'Reviews appear the moment customers post them on product pages. Seed a few samples to see the workflow.');
            } else {
                var h = '<div class="cards">';
                for (var i = 0; i < list.length; i++) {
                    var r = list[i];
                    var p = S.product(r.productId);
                    h += '<div class="card-row">' +
                        '<div class="card-row__main">' +
                            '<div class="card-row__topline">' +
                                '<div class="card-row__title"><div class="table__primary t-truncate">' + U.esc(p ? p.name : '#' + r.productId) + '</div>' +
                                '<div class="table__secondary">' + U.esc(rName(r)) + ' - ' + (rDate(r) ? App.ago(rDate(r)) : '-') + ' - helpful ' + (r.helpful || 0) + '</div></div>' +
                                '<div class="card-row__side"><span class="fs-sm">' + (P() ? P().stars(r.rating) : '') + ' ' + (r.rating || '-') + '</span>' +
                                '<div class="card-row__actions">' +
                                    '<button class="icon-btn" data-ai="' + U.esc(r.id) + '" type="button" title="AI reply draft">' + A().icon('sparkles', 14) + '</button>' +
                                    '<button class="icon-btn" data-del="' + U.esc(r.id) + '" type="button" title="Delete review">' + A().icon('trash', 14) + '</button>' +
                                '</div></div>' +
                            '</div>' +
                            '<div class="card-row__comment">' + U.esc(rText(r) || '(no text)') + '</div>' +
                        '</div></div>';
                }
                el.innerHTML = h + '</div>';
            }

            el.addEventListener('click', function (e) {
                var t;
                if ((t = e.target.closest('[data-del]'))) {
                    var del = t.getAttribute('data-del');
                    App.confirm({ title: 'Delete review?', message: '<p class="t-body">The review disappears from the product page immediately.</p>', okText: 'Delete', danger: true }).then(function (ok) {
                        if (!ok) return;
                        S.deleteReview(del);
                        App.toast('Review deleted', 'ok', 'Reviews');
                        ctx.refresh();
                    });
                    return;
                }
                if ((t = e.target.closest('[data-ai]'))) {
                    var aid = t.getAttribute('data-ai');
                    var rev = null;
                    for (var j = 0; j < list.length; j++) if (String(list[j].id) === String(aid)) rev = list[j];
                    if (!rev) return;
                    t.classList.add('is-busy');
                    ctx.AI.run('reviewReply', { review: rev, product: S.product(rev.productId) }, { refId: String(aid) }).then(function (res) {
                        t.classList.remove('is-busy');
                        aiReviewModal({
                            title: 'Reply draft',
                            meta: res.provider + ' - ' + res.ms + 'ms',
                            text: res.text,
                            applyText: 'Copy reply',
                            onApply: function () {
                                try { navigator.clipboard.writeText(res.text); App.toast('Reply copied to clipboard', 'ok', 'Reviews'); } catch (e2) { App.toast('Copy failed - select the text manually', 'warn'); }
                            },
                            onRedo: function (done) { ctx.AI.run('reviewReply', { review: rev, product: S.product(rev.productId) }, { silent: true }).then(function (r2) { done(r2.text); }); }
                        });
                    }, function () { t.classList.remove('is-busy'); App.toast('Generation failed', 'danger', 'AI'); });
                }
            });

            root.querySelector('#rvSeed').addEventListener('click', function () {
                App.confirm({ title: 'Seed sample reviews?', message: '<p class="t-body">Adds three clearly-labelled sample reviews so the moderation workflow is testable. Real customer reviews behave exactly the same.</p>', okText: 'Seed 3 samples' }).then(function (ok) {
                    if (!ok) return;
                    var arr = S.read(S.K.reviews, []);
                    var nowIso = S.now();
                    arr.push({ id: S.uid('rev'), productId: 1, name: 'Sample Buyer A', rating: 5, comment: 'Sample review - exactly as described, fast dispatch. Replace with real feedback as it arrives.', timestamp: nowIso, helpful: 2 });
                    arr.push({ id: S.uid('rev'), productId: 6, name: 'Sample Buyer B', rating: 4, comment: 'Sample review - solid pick, battery could be better.', timestamp: nowIso, helpful: 1 });
                    arr.push({ id: S.uid('rev'), productId: 10, name: 'Sample Buyer C', rating: 2, comment: 'Sample review - arrived late and the box was dented. Support is sorting a replacement.', timestamp: nowIso, helpful: 0 });
                    S.write(S.K.reviews, arr);
                    S.log('reviews.seeded', '3 sample reviews');
                    App.toast('3 sample reviews added', 'ok', 'Reviews');
                    ctx.refresh();
                });
            });

            root.querySelector('#rvExport').addEventListener('click', function () {
                var rows = [], i;
                var all2 = S.reviews();
                for (i = 0; i < all2.length; i++) {
                    var p2 = S.product(all2[i].productId);
                    rows.push({ product: p2 ? p2.name : '#' + all2[i].productId, reviewer: rName(all2[i]), rating: all2[i].rating, comment: rText(all2[i]), helpful: all2[i].helpful || 0, date: (rDate(all2[i]) || '').slice(0, 10) });
                }
                if (rows.length) App.csv(rows, 'trendaryo-reviews');
                else App.toast('No reviews to export yet', 'warn');
            });
        }
    };

})();
