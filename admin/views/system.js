/**
 * TRENDARYO ADMIN - System views (Marketing + AI Studio + Settings)
 * Marketing speaks to customers; AI Studio is the automation engine;
 * Settings holds identity, AI keys and the danger zone.
 */
(function () {
    'use strict';

    var V = window.TrendaryoAdminViews;
    var U = V.util;

    function app() { return window.TrendaryoAdminApp; }
    function A() { return window.TrendaryoAdmin; }

    /* small form-prompt modal -> Promise<values|null> */
    function promptModal(opts) {
        return new Promise(function (resolve) {
            var wrap = document.createElement('div');
            wrap.className = 'modal is-open';
            var fh = '';
            for (var i = 0; i < opts.fields.length; i++) {
                var f = opts.fields[i];
                if (f.type === 'textarea') {
                    fh += '<div class="field"><label class="field__label">' + U.esc(f.label) + '</label><textarea class="textarea" id="' + f.id + '" placeholder="' + U.esc(f.placeholder || '') + '">' + U.esc(f.value || '') + '</textarea></div>';
                } else {
                    fh += '<div class="field"><label class="field__label">' + U.esc(f.label) + '</label><input class="input" id="' + f.id + '" type="text" placeholder="' + U.esc(f.placeholder || '') + '" value="' + U.esc(f.value || '') + '"></div>';
                }
            }
            wrap.innerHTML = '<div class="modal__dialog modal__dialog--sm"><div class="modal__head"><div><div class="modal__title">' + U.esc(opts.title) + '</div>' + (opts.sub ? '<div class="modal__sub">' + U.esc(opts.sub) + '</div>' : '') + '</div><button class="modal__close" type="button" data-x>' + A().icon('x', 15) + '</button></div><div class="modal__body">' + fh + '</div><div class="modal__foot"><span class="spacer"></span><button class="btn" type="button" data-dc>Cancel</button><button class="btn btn--ai" type="button" data-ok>' + A().icon('sparkles', 13) + (opts.okText || 'Generate') + '</button></div></div>';
            document.body.appendChild(wrap);
            wrap.addEventListener('click', function (e) {
                if (e.target === wrap || e.target.closest('[data-x]') || e.target.closest('[data-dc]')) { wrap.remove(); resolve(null); return; }
                if (e.target.closest('[data-ok]')) {
                    var out = {};
                    for (var j = 0; j < opts.fields.length; j++) out[opts.fields[j].id] = wrap.querySelector('#' + opts.fields[j].id).value.trim();
                    wrap.remove();
                    resolve(out);
                }
            });
        });
    }
    V.util.promptModal = promptModal;

    /* draft editor drawer */
    function draftEditor(ctx, draft) {
        var App = ctx.App;
        App.drawer.open({
            title: draft && draft.id ? 'Edit draft' : 'New draft',
            sub: draft && draft.updatedAt ? 'Updated ' + app().ago(draft.updatedAt) : 'Not saved yet',
            body: '<div class="field"><label class="field__label">Title</label><input class="input" id="dftTitle" value="' + U.esc(draft ? (draft.title || '') : '') + '"></div>' +
                '<div class="field"><label class="field__label">Body</label><textarea class="textarea" id="dftBody" style="min-height:300px;">' + U.esc(draft ? (draft.body || '') : '') + '</textarea></div>',
            foot: '<span class="spacer"></span><button class="btn" type="button" data-copy>' + A().icon('copy', 13) + 'Copy</button>' +
                '<button class="btn btn--primary" type="button" data-save>' + A().icon('save', 13) + 'Save draft</button>',
            onMount: function (root) {
                root.querySelector('[data-save]').addEventListener('click', function () {
                    var obj = draft || { type: 'note' };
                    obj.title = root.querySelector('#dftTitle').value.trim() || 'Untitled draft';
                    obj.body = root.querySelector('#dftBody').value;
                    ctx.S.saveDraft(obj);
                    app().toast('Draft saved', 'ok', 'Marketing');
                    App.drawer.close();
                    App.route();
                });
                root.querySelector('[data-copy]').addEventListener('click', function () {
                    try { navigator.clipboard.writeText(root.querySelector('#dftBody').value); app().toast('Copied to clipboard', 'ok'); } catch (e) { app().toast('Copy failed - select the text manually', 'warn'); }
                });
            }
        });
    }

    /* ================================================================
       MARKETING
       ================================================================ */
    V.marketing = {
        title: 'Marketing',
        icon: 'megaphone',
        sub: 'Newsletter, the storefront announcement and AI-drafted content',
        render: function (root, ctx) {
            var S = ctx.S, App = ctx.App;
            var s = S.settings();
            var nl = S.newsletter();
            var drafts = S.drafts();

            root.innerHTML = U.head('Marketing', 'Everything that speaks to customers before and after the sale', '') +
                '<div class="grid grid--5" style="margin-bottom:16px;">' +
                    U.kpi('mail', 'stat__icon--accent', 'Subscribers', String(nl.length), 'newsletter list on this device') +
                    U.kpi('file', '', 'Drafts', String(drafts.length), 'blog, email and notes') +
                    U.kpi('megaphone', s.announcement ? 'stat__icon--warn' : '', 'Announcement', s.announcement ? 'Custom' : 'Auto', s.announcement ? 'override live on the store' : 'built-in rotating messages') +
                    U.kpi('sparkles', 'stat__icon--ai', 'AI generations', String(S.aiHistory().length), 'stored in history') +
                    U.kpi('gift', '', 'Promo code', 'WELCOME10', 'wired into storefront messaging') +
                '</div>' +

                '<div class="grid grid--split" style="margin-bottom:16px;">' +
                    '<div class="panel"><div class="panel__head"><div><div class="panel__title">Newsletter list</div><div class="panel__subtitle">The storefront footer form writes here</div></div><div class="panel__actions"><button class="btn btn--sm" id="mkCopyAll" type="button">Copy all</button></div></div>' +
                        '<div class="toolbar"><div class="input-group" style="flex:1 1 240px;"><input class="input" id="mkNlAdd" type="email" placeholder="add@email.com"><button class="btn btn--primary" id="mkNlBtn" type="button">Add</button></div></div>' +
                        '<div class="table-wrap" id="mkNlList" style="max-height:300px;overflow-y:auto;"></div>' +
                        '<div class="panel__foot"><span class="fs-xs t-mute" id="mkNlCount"></span><span class="spacer"></span><button class="btn btn--sm" id="mkNlExport" type="button">Export CSV</button></div></div>' +

                    '<div class="panel"><div class="panel__head"><div><div class="panel__title">Storefront announcement</div><div class="panel__subtitle">Overrides the rotating bar on every page</div></div></div>' +
                        '<div class="panel__body"><div class="field"><textarea class="textarea" id="mkAnn" placeholder="FREE SHIPPING ON ORDERS OVER $50">' + U.esc(s.announcement || '') + '</textarea>' +
                        '<div class="field__hint">Empty = the built-in rotating messages. Saved text goes live on the storefront instantly.</div></div>' +
                        '<div class="row" style="margin-top:12px;"><button class="btn btn--primary btn--sm" id="mkAnnSave" type="button">' + A().icon('save', 13) + 'Save and go live</button>' +
                        '<button class="btn btn--sm" id="mkAnnClear" type="button">Reset to auto</button></div></div></div>' +
                '</div>' +

                '<div class="panel"><div class="panel__head"><div><div class="panel__title">Content drafts</div><div class="panel__subtitle">AI writes, you approve - nothing publishes without you</div></div><div class="panel__actions">' +
                    '<button class="btn btn--ai btn--sm" id="mkNewBlog" type="button">' + A().icon('sparkles', 12) + 'Blog article</button>' +
                    '<button class="btn btn--ai btn--sm" id="mkNewEmail" type="button">' + A().icon('sparkles', 12) + 'Email campaign</button>' +
                    '<button class="btn btn--sm" id="mkNewBlank" type="button">' + A().icon('plus', 12) + 'Blank</button></div></div>' +
                '<div class="table-wrap" id="mkDrafts"></div></div>';

            /* newsletter list */
            function drawNl() {
                var list = S.newsletter();
                var el = root.querySelector('#mkNlList');
                root.querySelector('#mkNlCount').textContent = list.length + ' subscriber(s)';
                if (!list.length) { el.innerHTML = U.empty('mail', 'No subscribers yet', 'The footer form on the storefront adds emails here.'); return; }
                var h = '<table class="table table--compact"><tbody>';
                for (var i = 0; i < list.length; i++) {
                    h += '<tr><td class="fs-sm">' + U.esc(list[i]) + '</td><td style="width:40px;"><button class="icon-btn" data-nlrm="' + U.esc(list[i]) + '" type="button" title="Remove">' + A().icon('trash', 13) + '</button></td></tr>';
                }
                el.innerHTML = h + '</tbody></table>';
            }
            drawNl();
            root.querySelector('#mkNlBtn').addEventListener('click', function () {
                var inp = root.querySelector('#mkNlAdd');
                if (!inp.value.trim()) return;
                if (S.newsletterAdd(inp.value)) { App.toast('Added to the newsletter', 'ok', 'Marketing'); inp.value = ''; drawNl(); app().badges(); }
                else App.toast('That email is already on the list', 'info', 'Marketing');
            });
            root.querySelector('#mkNlList').addEventListener('click', function (e) {
                var t = e.target.closest('[data-nlrm]');
                if (!t) return;
                S.newsletterRemove(t.getAttribute('data-nlrm'));
                App.toast('Removed', 'ok', 'Marketing');
                drawNl();
                app().badges();
            });
            root.querySelector('#mkCopyAll').addEventListener('click', function () {
                var list = S.newsletter();
                if (!list.length) { App.toast('Nothing to copy yet', 'warn'); return; }
                try { navigator.clipboard.writeText(list.join('\n')); App.toast(list.length + ' emails copied', 'ok', 'Marketing'); } catch (e) { App.toast('Copy failed', 'warn'); }
            });
            root.querySelector('#mkNlExport').addEventListener('click', function () {
                var list = S.newsletter();
                var rows = [];
                for (var i = 0; i < list.length; i++) rows.push({ email: list[i] });
                if (rows.length) App.csv(rows, 'trendaryo-newsletter');
                else App.toast('Nothing to export yet', 'warn');
            });

            /* announcement */
            root.querySelector('#mkAnnSave').addEventListener('click', function () {
                var v = root.querySelector('#mkAnn').value;
                S.saveSettings({ announcement: v });
                try { if (v.trim()) localStorage.setItem('trendaryo_announcement', v.trim()); else localStorage.removeItem('trendaryo_announcement'); } catch (e) {}
                App.toast(v.trim() ? 'Announcement live on the storefront' : 'Empty - storefront returns to auto', 'ok', 'Marketing');
                ctx.refresh();
            });
            root.querySelector('#mkAnnClear').addEventListener('click', function () {
                root.querySelector('#mkAnn').value = '';
                S.saveSettings({ announcement: '' });
                try { localStorage.removeItem('trendaryo_announcement'); } catch (e) {}
                App.toast('Announcement reset to the rotating bar', 'ok', 'Marketing');
                ctx.refresh();
            });

            /* drafts table */
            function drawDrafts() {
                var el = root.querySelector('#mkDrafts');
                var list = S.drafts();
                if (!list.length) { el.innerHTML = U.empty('file', 'No drafts yet', 'Generate a blog article or an email campaign with one click above.'); return; }
                var TYPE = { blog: 'badge--accent', email: 'badge--ai', note: 'badge--neutral' };
                var h = '<table class="table table--compact"><thead><tr><th>Title</th><th>Type</th><th>Updated</th><th></th></tr></thead><tbody>';
                for (var i = 0; i < list.length; i++) {
                    var d = list[i];
                    h += '<tr><td><div class="table__primary">' + U.esc(d.title || 'Untitled') + '</div><div class="table__secondary t-truncate" style="max-width:420px;">' + U.esc((d.body || '').slice(0, 90)) + '</div></td>' +
                        '<td><span class="badge ' + (TYPE[d.type] || 'badge--neutral') + '">' + U.esc(d.type || 'note') + '</span></td>' +
                        '<td class="fs-sm t-mute">' + app().ago(d.updatedAt || d.createdAt) + '</td>' +
                        '<td><div class="cell-actions"><button class="icon-btn" data-open="' + U.esc(d.id) + '" type="button" title="Open">' + A().icon('pencil', 14) + '</button>' +
                        '<button class="icon-btn" data-deldft="' + U.esc(d.id) + '" type="button" title="Delete">' + A().icon('trash', 14) + '</button></div></td></tr>';
                }
                el.innerHTML = h + '</tbody></table>';
            }
            drawDrafts();
            root.querySelector('#mkDrafts').addEventListener('click', function (e) {
                var t;
                if ((t = e.target.closest('[data-open]'))) {
                    var oid = t.getAttribute('data-open');
                    var list = S.drafts();
                    for (var i = 0; i < list.length; i++) if (list[i].id === oid) { draftEditor(ctx, list[i]); return; }
                    return;
                }
                if ((t = e.target.closest('[data-deldft]'))) {
                    var did = t.getAttribute('data-deldft');
                    App.confirm({ title: 'Delete draft?', message: '<p class="t-body">This draft is removed permanently.</p>', okText: 'Delete', danger: true }).then(function (ok) {
                        if (!ok) return;
                        S.deleteDraft(did);
                        App.toast('Draft deleted', 'ok', 'Marketing');
                        drawDrafts();
                    });
                }
            });
            root.querySelector('#mkNewBlank').addEventListener('click', function () { draftEditor(ctx, { type: 'note', title: '', body: '' }); });

            root.querySelector('#mkNewBlog').addEventListener('click', function () {
                promptModal({ title: 'Draft a blog article', sub: 'The AI researches the topic against your live catalogue', okText: 'Draft article', fields: [
                    { id: 'mkbTopic', label: 'Topic', type: 'text', placeholder: 'e.g. Best wireless headphones under $150' }
                ] }).then(function (v) {
                    if (!v || !v.mkbTopic) return;
                    var tops = S.topProducts(5);
                    var prods = [];
                    for (var i = 0; i < tops.length; i++) { var pp = S.product(tops[i].id); if (pp) prods.push(pp); }
                    App.toast('Drafting in the background...', 'ai', 'AI Studio');
                    ctx.AI.run('blogDraft', { topic: v.mkbTopic, products: prods }).then(function (res) {
                        var title = (res.text.split('\n')[0] || 'Blog draft').replace(/^H1:\s*/i, '').replace(/^#+\s*/, '');
                        V.util.aiReview({
                            title: 'Blog draft ready', meta: res.provider + ' - ' + res.ms + 'ms', text: res.text, applyText: 'Save as draft',
                            onApply: function () { S.saveDraft({ type: 'blog', title: title, body: res.text }); App.toast('Saved to drafts', 'ok', 'Marketing'); App.route(); },
                            onRedo: function (done) { ctx.AI.run('blogDraft', { topic: v.mkbTopic, products: prods }, { silent: true }).then(function (r2) { done(r2.text); }); }
                        });
                    }, function (err) { App.toast('Generation failed: ' + String((err && err.message) || err), 'danger', 'AI Studio'); });
                });
            });

            root.querySelector('#mkNewEmail').addEventListener('click', function () {
                promptModal({ title: 'Draft an email campaign', sub: 'Subject options, a preview line and the body', okText: 'Draft email', fields: [
                    { id: 'mkeGoal', label: 'Goal', type: 'text', placeholder: 'e.g. announce the new arrivals' },
                    { id: 'mkeOffer', label: 'Offer (optional)', type: 'text', placeholder: 'e.g. WELCOME10 - 10% off the first order' }
                ] }).then(function (v) {
                    if (!v) return;
                    var tops = S.topProducts(1);
                    App.toast('Drafting in the background...', 'ai', 'AI Studio');
                    ctx.AI.run('emailCampaign', { goal: v.mkeGoal || 'introduce the store', offer: v.mkeOffer || '', product: tops.length ? tops[0].name : '' }).then(function (res) {
                        V.util.aiReview({
                            title: 'Email draft ready', meta: res.provider + ' - ' + res.ms + 'ms', text: res.text, applyText: 'Save as draft',
                            onApply: function () { S.saveDraft({ type: 'email', title: 'Email: ' + (v.mkeGoal || 'campaign'), body: res.text }); App.toast('Saved to drafts', 'ok', 'Marketing'); App.route(); },
                            onRedo: function (done) { ctx.AI.run('emailCampaign', { goal: v.mkeGoal, offer: v.mkeOffer, product: tops.length ? tops[0].name : '' }, { silent: true }).then(function (r2) { done(r2.text); }); }
                        });
                    }, function (err) { App.toast('Generation failed: ' + String((err && err.message) || err), 'danger', 'AI Studio'); });
                });
            });
        }
    };

    /* ================================================================
       AI STUDIO
       ================================================================ */

    var TASK_META = [
        { key: 'productDesc', icon: 'file', label: 'Product description', hint: 'SEO-rich description grounded in the real specs.' },
        { key: 'productTitle', icon: 'pencil', label: 'Title variants', hint: 'Five sharper listing titles, each under 60 characters.' },
        { key: 'seoPackage', icon: 'search', label: 'SEO package', hint: 'Meta title, meta description and keywords as one package.' },
        { key: 'tags', icon: 'tags', label: 'Tags & attributes', hint: 'Merch tags, price band and audience in one pass.' },
        { key: 'faq', icon: 'inbox', label: 'Product FAQ', hint: 'Four buyer questions answered from the real specs.' },
        { key: 'reviewReply', icon: 'star', label: 'Review reply', hint: 'A human reply to any review - praise or complaint.' },
        { key: 'blogDraft', icon: 'layers', label: 'Blog article', hint: 'A research-first buying guide draft.' },
        { key: 'emailCampaign', icon: 'mail', label: 'Email campaign', hint: 'Subjects, preview line and a plain-text body.' },
        { key: 'freeform', icon: 'wand', label: 'Free-form', hint: 'Anything else - your prompt, the house voice.' }
    ];

    function applyTextFor(task) {
        if (task === 'productDesc') return 'Apply description';
        if (task === 'seoPackage') return 'Apply SEO package';
        if (task === 'blogDraft') return 'Save as draft';
        if (task === 'emailCampaign') return 'Save as draft';
        return 'Copy to clipboard';
    }

    function runTask(ctx, taskKey) {
        var S = ctx.S, App = ctx.App, engine = ctx.AI;
        var t = engine.TASKS[taskKey];
        if (!t) return;
        var fields = [];
        var input = {};
        if (taskKey === 'reviewReply') {
            var revs = S.reviews();
            if (!revs.length) { App.toast('Generate needs a review - seed samples in the Reviews module first', 'warn', 'AI Studio'); return; }
            var opts = '';
            for (var i = 0; i < Math.min(20, revs.length); i++) {
                var p = S.product(revs[i].productId);
                opts += '<option value="' + i + '">' + U.esc((p ? p.name : '#' + revs[i].productId) + ' - ' + (revs[i].rating || '?') + '/5 - ' + U.esc(rNameSafe(revs[i])).slice(0, 24)) + '</option>';
            }
            fields.push({ id: 'asRevIdx', label: 'Which review?', type: 'select', options: opts });
        } else if (['productDesc', 'productTitle', 'seoPackage', 'tags', 'faq'].indexOf(taskKey) >= 0) {
            var list = S.products();
            var popts = '';
            for (var j = 0; j < list.length; j++) popts += '<option value="' + list[j].id + '">' + U.esc(list[j].name) + '</option>';
            fields.push({ id: 'asProd', label: 'Product', type: 'select', options: popts });
        } else if (taskKey === 'blogDraft') {
            fields.push({ id: 'asTopic', label: 'Topic', type: 'text', placeholder: 'e.g. Best budget earbuds for commuters' });
        } else if (taskKey === 'emailCampaign') {
            fields.push({ id: 'asGoal', label: 'Goal', type: 'text', placeholder: 'e.g. announce the weekend drop' });
            fields.push({ id: 'asOffer', label: 'Offer (optional)', type: 'text', placeholder: 'e.g. WELCOME10 - 10% off' });
        } else {
            fields.push({ id: 'asPrompt', label: 'Your prompt', type: 'textarea', placeholder: 'What should the AI write or do?' });
        }
        var selectField = fields.length && fields[0].type === 'select';
        promptSelectModal({ title: t.label, sub: t.hint, okText: 'Generate', fields: fields }).then(function (v) {
            if (!v) return;
            var product = null, review = null;
            if (selectField) {
                if (taskKey === 'reviewReply') {
                    var revs2 = S.reviews();
                    review = revs2[parseInt(v[fields[0].id], 10)] || revs2[0];
                } else {
                    product = S.product(v[fields[0].id]);
                }
            }
            if (taskKey === 'blogDraft') input.topic = v.asTopic || 'How to choose well';
            if (taskKey === 'emailCampaign') { input.goal = v.asGoal || 'introduce the store'; input.offer = v.asOffer || ''; var tp = S.topProducts(1); input.product = tp.length ? tp[0].name : ''; }
            if (taskKey === 'freeform') { if (!v.asPrompt) { App.toast('Write a prompt first', 'warn', 'AI Studio'); return; } input.prompt = v.asPrompt; }
            input.product = product || input.product;
            input.review = review;
            App.toast('Generating...', 'ai', 'AI Studio');
            engine.run(taskKey, input).then(function (res) {
                var fieldData = null;
                if (res.data) {
                    fieldData = {};
                    var k2;
                    for (k2 in res.data) {
                        if (k2 === 'keywords' || k2 === 'tags') fieldData[k2] = (res.data[k2] || []).join(', ');
                        else fieldData[k2] = res.data[k2];
                    }
                }
                V.util.aiReview({
                    title: t.label + ' - result',
                    meta: res.provider + ' - ' + res.model + ' - ' + res.ms + 'ms' + (res.fallbackError ? ' - live provider failed, offline draft used' : ''),
                    text: res.text,
                    fields: fieldData,
                    applyText: applyTextFor(taskKey),
                    onApply: function () {
                        if (taskKey === 'productDesc' && product) { S.saveProduct(product.id, { description: res.text.trim() }); App.toast('Description applied to ' + product.name, 'ok', 'AI Studio'); app().badges(); }
                        else if (taskKey === 'seoPackage' && product && res.data) { S.applySeo(product.id, { metaTitle: res.data.metaTitle || '', metaDescription: res.data.metaDescription || '', keywords: res.data.keywords || [] }); App.toast('SEO package applied to ' + product.name, 'ok', 'AI Studio'); }
                        else if (taskKey === 'tags' && product && res.data) { S.saveProduct(product.id, { seo: { metaTitle: (product.seo && product.seo.metaTitle) || '', metaDescription: (product.seo && product.seo.metaDescription) || '', keywords: res.data.tags || [] } }); App.toast('Tags stored on ' + product.name, 'ok', 'AI Studio'); }
                        else if (taskKey === 'blogDraft') { var t1 = (res.text.split('\n')[0] || 'Blog draft').replace(/^H1:\s*/i, '').replace(/^#+\s*/, ''); S.saveDraft({ type: 'blog', title: t1, body: res.text }); App.toast('Saved to drafts - find it in Marketing', 'ok', 'AI Studio'); }
                        else if (taskKey === 'emailCampaign') { S.saveDraft({ type: 'email', title: 'Email: ' + (input.goal || 'campaign'), body: res.text }); App.toast('Saved to drafts - find it in Marketing', 'ok', 'AI Studio'); }
                        else { try { navigator.clipboard.writeText(res.text); App.toast('Copied to clipboard', 'ok', 'AI Studio'); } catch (e3) { App.toast('Copy failed - select the text manually', 'warn'); } }
                    },
                    onRedo: function (done) { engine.run(taskKey, input, { silent: true }).then(function (r2) { done(r2.text); }); }
                });
            }, function (err) { App.toast('Generation failed: ' + String((err && err.message) || err), 'danger', 'AI Studio'); });
        });
    }

    function rNameSafe(r) { return r.name || r.author || 'Guest'; }

    /* select-flavoured prompt modal */
    function promptSelectModal(opts) {
        return new Promise(function (resolve) {
            var wrap = document.createElement('div');
            wrap.className = 'modal is-open';
            var fh = '';
            for (var i = 0; i < opts.fields.length; i++) {
                var f = opts.fields[i];
                if (f.type === 'select') {
                    fh += '<div class="field"><label class="field__label">' + U.esc(f.label) + '</label><select class="select" id="' + f.id + '">' + f.options + '</select></div>';
                } else if (f.type === 'textarea') {
                    fh += '<div class="field"><label class="field__label">' + U.esc(f.label) + '</label><textarea class="textarea" id="' + f.id + '"></textarea></div>';
                } else {
                    fh += '<div class="field"><label class="field__label">' + U.esc(f.label) + '</label><input class="input" id="' + f.id + '" type="text" placeholder="' + U.esc(f.placeholder || '') + '"></div>';
                }
            }
            wrap.innerHTML = '<div class="modal__dialog modal__dialog--sm"><div class="modal__head"><div><div class="modal__title">' + U.esc(opts.title) + '</div><div class="modal__sub">' + U.esc(opts.sub || '') + '</div></div><button class="modal__close" type="button" data-x>' + A().icon('x', 15) + '</button></div><div class="modal__body">' + fh + '</div><div class="modal__foot"><span class="spacer"></span><button class="btn" type="button" data-dc>Cancel</button><button class="btn btn--ai" type="button" data-ok>' + A().icon('sparkles', 13) + U.esc(opts.okText || 'Generate') + '</button></div></div>';
            document.body.appendChild(wrap);
            wrap.addEventListener('click', function (e) {
                if (e.target === wrap || e.target.closest('[data-x]') || e.target.closest('[data-dc]')) { wrap.remove(); resolve(null); return; }
                if (e.target.closest('[data-ok]')) {
                    var out = {};
                    for (var j = 0; j < opts.fields.length; j++) out[opts.fields[j].id] = wrap.querySelector('#' + opts.fields[j].id).value;
                    wrap.remove();
                    resolve(out);
                }
            });
        });
    }

    V['ai-studio'] = {
        title: 'AI Studio',
        icon: 'sparkles',
        sub: 'Prompt-driven automation for the whole shelf - an apply step on everything',
        render: function (root, ctx) {
            var S = ctx.S, App = ctx.App, engine = ctx.AI;
            var stat = engine.status();
            var audit = S.seoAudit();
            var pct = audit.total ? Math.round((audit.full / audit.total) * 100) : 0;
            var hist = S.aiHistory();

            root.innerHTML = U.head('AI Studio', 'Nine writing tasks, one review step, zero manual copywriting',
                '<button class="btn btn--sm" id="asTest" type="button">' + A().icon('wifi', 13) + 'Test connection</button>' +
                '<a class="btn btn--sm" href="#/settings">' + A().icon('settings', 13) + 'Configure AI</a>') +

            '<div class="ai-panel" style="margin-bottom:16px;"><div class="ai-panel__head">' + A().icon('sparkles', 13) + '<span class="ai-panel__title">Engine status</span><span class="badge ' + (stat.mode === 'live' ? 'badge--ai' : 'badge--neutral') + '" style="margin-left:auto;">' + (stat.mode === 'live' ? 'LIVE - ' + U.esc(stat.providerLabel) + ' (' + U.esc(stat.model) + ')' : 'OFFLINE STUDIO - built-in') + '</span></div>' +
                '<div class="ai-panel__body"><div class="t-body">' + (stat.mode === 'live' ? 'Generations call ' + U.esc(stat.providerLabel) + ' directly from this browser. The key never leaves this device, and every draft lands in history before it is applied.' : 'The built-in Offline Studio drafts copy from catalogue data - no key, no network, fully honest about what it is. Connect a live provider in Settings for open-ended generation.') + '</div>' +
                '<div class="ai-meta" id="asTestOut"></div></div></div>' +

            '<div class="grid grid--split" style="margin-bottom:16px;">' +
                '<div class="panel"><div class="panel__head"><div><div class="panel__title">Automation center</div><div class="panel__subtitle">SEO coverage across the shelf</div></div></div>' +
                    '<div class="panel__body">' +
                        '<div class="row row--between fs-sm"><span>' + audit.full + ' full</span><span class="t-mute">' + audit.partial + ' partial</span><span class="text-danger">' + audit.missing + ' missing</span></div>' +
                        '<div class="meter mt-2"><div class="meter__fill meter__fill--ai" style="width:' + pct + '%"></div></div>' +
                        '<div class="fs-xs t-mute mt-1">' + pct + '% of ' + audit.total + ' products carry a complete package.</div>' +
                        '<div class="ai-actions mt-4"><button class="ai-chip" id="asAutofill" type="button">' + A().icon('sparkles', 12) + 'Autofill every gap</button>' +
                        '<button class="ai-chip" id="asDescAll" type="button">' + A().icon('wand', 12) + 'Rewrite all descriptions</button></div>' +
                        '<div class="ai-note mt-3">' + A().icon('sparkles', 14) + '<div>Both run sequentially with live progress. Every draft is stored in history - applied items are marked, nothing is silent.</div></div>' +
                    '</div></div>' +
                '<div class="panel"><div class="panel__head"><div><div class="panel__title">Task library</div><div class="panel__subtitle">Pick a task, give it context, review the draft</div></div></div>' +
                    '<div class="panel__body panel__body--flush"><div class="grid grid--3" style="padding:16px;">' + TASK_CARDS + '</div></div></div>' +
            '</div>' +

            '<div class="panel"><div class="panel__head"><div><div class="panel__title">Generation history</div><div class="panel__subtitle">The last ' + hist.length + ' drafts - applied ones are marked</div></div><div class="panel__actions"><button class="btn btn--sm" id="asClear" type="button">Clear history</button></div></div>' +
                '<div class="table-wrap" id="asHist"></div></div>';

            var TASK_CARDS2 = root.querySelectorAll('[data-task]');
            for (var ti = 0; ti < TASK_CARDS2.length; ti++) {
                TASK_CARDS2[ti].addEventListener('click', function () { runTask(ctx, this.getAttribute('data-task')); });
            }

            root.querySelector('#asTest').addEventListener('click', function () {
                var out = root.querySelector('#asTestOut');
                out.textContent = 'Testing...';
                ctx.AI.test().then(function (r) {
                    out.textContent = r.ok ? ('OK - ' + r.label + (r.ms ? ' (' + r.ms + 'ms)' : '')) : ('FAILED - ' + (r.error || 'unknown'));
                    App.toast(r.ok ? 'AI connection OK - ' + r.label : 'Connection failed: ' + (r.error || 'unknown'), r.ok ? 'ok' : 'danger', 'AI Studio');
                });
            });

            root.querySelector('#asAutofill').addEventListener('click', function () {
                var missing = [];
                var list = S.products();
                for (var i = 0; i < list.length; i++) if (S.seoState(list[i]) !== 'full') missing.push({ id: list[i].id, name: list[i].name });
                if (!missing.length) { App.toast('Every product already carries a full package', 'ok', 'AI Studio'); return; }
                App.confirm({ title: 'Autofill SEO packages', message: '<p class="t-body">Generate and apply meta titles, descriptions and keywords for <b>' + missing.length + '</b> products. Applied drafts are marked in history.</p>', okText: 'Run on ' + missing.length }).then(function (ok) {
                    if (ok) V.util.runBulkSeo(ctx, missing);
                });
            });

            root.querySelector('#asDescAll').addEventListener('click', function () {
                var list = S.products();
                var items = [];
                for (var i = 0; i < list.length; i++) items.push({ id: list[i].id, name: list[i].name });
                App.confirm({ title: 'Rewrite every description?', message: '<p class="t-body"><b>' + items.length + '</b> descriptions will be regenerated with AI and applied to the live shelf. History keeps every before-draft reference.</p>', okText: 'Rewrite ' + items.length, danger: true }).then(function (ok) {
                    if (!ok) return;
                    var n = 0;
                    V.util.bulkRunner(items, function (it, next) {
                        ctx.AI.run('productDesc', { product: S.product(it.id) }, { refId: String(it.id) }).then(function (res) {
                            if (res.text) { S.saveProduct(it.id, { description: res.text.trim() }); n++; }
                            next();
                        }, function () { next(); });
                    }, null, function () {
                        App.toast(n + ' descriptions rewritten on the live shelf', 'ok', 'AI Studio');
                        App.route();
                    });
                });
            });

            function drawHist() {
                var el = root.querySelector('#asHist');
                var list2 = S.aiHistory();
                if (!list2.length) { el.innerHTML = U.empty('sparkles', 'No generations yet', 'Run a task from the library above - everything lands here with provider and timing.'); return; }
                var h = '<table class="table table--compact"><thead><tr><th>When</th><th>Task</th><th>Provider</th><th>Applied</th><th></th></tr></thead><tbody>';
                for (var i = 0; i < list2.length; i++) {
                    var e2 = list2[i];
                    h += '<tr><td class="fs-sm t-mute">' + App.ago(e2.at) + '</td><td class="fs-sm">' + U.esc(e2.label || e2.task) + '</td><td class="fs-sm">' + U.esc(e2.provider || '-') + '</td>' +
                        '<td>' + (e2.applied ? '<span class="badge badge--ok">' + U.esc(e2.applied) + '</span>' : '<span class="badge badge--neutral">draft</span>') + '</td>' +
                        '<td><div class="cell-actions"><button class="icon-btn" data-view="' + U.esc(e2.id) + '" type="button" title="View draft">' + A().icon('eye', 14) + '</button></div></td></tr>';
                }
                el.innerHTML = h + '</tbody></table>';
                el.addEventListener('click', function (e) {
                    var t = e.target.closest('[data-view]');
                    if (!t) return;
                    var id = t.getAttribute('data-view');
                    var arr = S.aiHistory();
                    for (var j = 0; j < arr.length; j++) {
                        if (arr[j].id === id) {
                            App.drawer.open({ title: arr[j].label || arr[j].task, sub: (arr[j].provider || '-') + ' - ' + App.ago(arr[j].at), body: '<div class="t-label" style="margin-bottom:6px;">Prompt</div><div class="ai-out">' + U.esc(arr[j].prompt || '') + '</div><div class="t-label" style="margin:14px 0 6px;">Output</div><div class="ai-out" style="max-height:none;">' + U.esc(arr[j].output || '') + '</div>' + (arr[j].applied ? '<div class="badge badge--ok mt-3">Applied: ' + U.esc(arr[j].applied) + '</div>' : '') });
                            return;
                        }
                    }
                });
            }
            drawHist();
            root.querySelector('#asClear').addEventListener('click', function () {
                App.confirm({ title: 'Clear AI history?', message: '<p class="t-body">Removes all stored generation drafts. Applied changes on products and drafts are not touched.</p>', okText: 'Clear', danger: true }).then(function (ok) {
                    if (!ok) return;
                    S.aiClear();
                    App.toast('History cleared', 'ok', 'AI Studio');
                    App.route();
                });
            });
        }
    };

    var TASK_CARDS = '';
    for (var _tci = 0; _tci < TASK_META.length; _tci++) {
        var _t = TASK_META[_tci];
        TASK_CARDS += '<div class="panel" style="padding:14px;"><div class="row" style="margin-bottom:6px;"><span class="stat__icon stat__icon--ai">' + A().icon(_t.icon, 14) + '</span><b class="fs-sm">' + U.esc(_t.label) + '</b></div>' +
            '<p class="fs-xs t-mute" style="line-height:1.5;margin-bottom:10px;">' + U.esc(_t.hint) + '</p>' +
            '<button class="ai-chip" type="button" data-task="' + _t.key + '">' + A().icon('sparkles', 12) + 'Run</button></div>';
    }

    /* ================================================================
       SETTINGS
       ================================================================ */
    V.settings = {
        title: 'Settings',
        icon: 'settings',
        sub: 'Store identity, AI keys, security and the maintenance bench',
        render: function (root, ctx) {
            var S = ctx.S, App = ctx.App, engine = ctx.AI;
            var s = S.settings();
            var provs = engine.PROVIDERS;
            var popts = '';
            for (var pk in provs) popts += '<option value="' + pk + '"' + (s.aiProvider === pk ? ' selected' : '') + '>' + U.esc(provs[pk].label) + '</option>';
            var modelHint = { openai: 'e.g. gpt-4o-mini', openrouter: 'e.g. openai/gpt-4o-mini', groq: 'e.g. llama-3.3-70b-versatile', gemini: 'e.g. gemini-2.0-flash', anthropic: 'e.g. claude-3-5-sonnet-latest', offline: 'built-in - no model needed' };

            root.innerHTML = U.head('Settings', 'Identity, intelligence and the maintenance bench', '') +

            '<div class="grid grid--split" style="margin-bottom:16px;">' +
                '<div class="panel"><div class="panel__head"><div><div class="panel__title">Store identity</div></div></div><div class="panel__body">' +
                    '<div class="field"><label class="field__label">Store name</label><input class="input" id="stName" value="' + U.esc(s.storeName) + '"></div>' +
                    '<div class="field__hint">The storefront announcement bar is configured in <a href="#/marketing" class="text-accent">Marketing</a> - it overrides the rotating messages instantly.</div>' +
                    '<div class="row mt-4"><button class="btn btn--primary btn--sm" id="stIdSave" type="button">' + A().icon('save', 13) + 'Save identity</button></div></div></div>' +

                '<div class="panel"><div class="panel__head"><div><div class="panel__title">Commerce</div></div></div><div class="panel__body">' +
                    '<div class="field-row"><div class="field"><label class="field__label">Low stock threshold</label><input class="input input--mono" id="stLow" type="number" min="0" value="' + s.lowStock + '"><div class="field__hint">Watchlists and badges key off this number.</div></div>' +
                    '<div class="field"><label class="field__label">Display currency</label><select class="select" id="stCur"><option value="USD"' + (s.currency === 'USD' ? ' selected' : '') + '>USD</option><option value="EUR"' + (s.currency === 'EUR' ? ' selected' : '') + '>EUR</option><option value="GBP"' + (s.currency === 'GBP' ? ' selected' : '') + '>GBP</option></select><div class="field__hint">Display only - prices stay as listed.</div></div></div>' +
                    '<div class="row mt-4"><button class="btn btn--primary btn--sm" id="stCoSave" type="button">' + A().icon('save', 13) + 'Save commerce</button></div></div></div>' +
            '</div>' +

            '<div class="panel" style="margin-bottom:16px;"><div class="panel__head"><div><div class="panel__title">AI configuration</div><div class="panel__subtitle">Bring your own key - it stays in this browser and is never sent anywhere except the provider</div></div></div><div class="panel__body">' +
                '<div class="field-row"><div class="field"><label class="field__label">Provider</label><select class="select" id="stProv">' + popts + '</select><div class="field__hint">Offline Studio works with no key at all.</div></div>' +
                '<div class="field"><label class="field__label">API key</label><div class="input-ai"><input class="input input--mono" id="stKey" type="password" value="' + U.esc(s.aiKey) + '" placeholder="sk-..."><button class="ai-btn" type="button" id="stKeyEye">' + A().icon('eye', 13) + '</button></div></div></div>' +
                '<div class="field-row"><div class="field"><label class="field__label">Model</label><input class="input input--mono" id="stModel" value="' + U.esc(s.aiModel) + '" placeholder="' + U.esc(modelHint[s.aiProvider] || '') + '"><div class="field__hint" id="stModelHint">' + U.esc(modelHint[s.aiProvider] || '') + '</div></div>' +
                '<div class="field"><label class="field__label">Writing tone</label><select class="select" id="stTone"><option value="confident"' + (s.aiTone === 'confident' ? ' selected' : '') + '>Confident (default)</option><option value="luxury"' + (s.aiTone === 'luxury' ? ' selected' : '') + '>Luxury</option><option value="technical"' + (s.aiTone === 'technical' ? ' selected' : '') + '>Technical</option><option value="friendly"' + (s.aiTone === 'friendly' ? ' selected' : '') + '>Friendly</option></select></div></div>' +
                '<div class="row mt-4"><button class="btn btn--primary btn--sm" id="stAiSave" type="button">' + A().icon('save', 13) + 'Save AI settings</button>' +
                '<button class="btn btn--ai btn--sm" id="stAiTest" type="button">' + A().icon('wifi', 13) + 'Test connection</button><span class="fs-xs t-dim" id="stTestOut"></span></div></div></div>' +

            '<div class="grid grid--split" style="margin-bottom:16px;">' +
                '<div class="panel"><div class="panel__head"><div><div class="panel__title">Security</div><div class="panel__subtitle">Local admin gate - stored in this browser</div></div></div><div class="panel__body">' +
                    '<div class="field"><label class="field__label">Admin email</label><input class="input" id="stEmail" value="' + U.esc(s.adminEmail || localStorage.getItem('adminEmail') || 'admin@trendaryo.com') + '"></div>' +
                    '<div class="field-row"><div class="field"><label class="field__label">New password</label><input class="input" id="stPass" type="password" placeholder="min 6 characters"></div>' +
                    '<div class="field"><label class="field__label">Confirm</label><input class="input" id="stPass2" type="password"></div></div>' +
                    '<div class="row mt-4"><button class="btn btn--primary btn--sm" id="stCredSave" type="button">' + A().icon('shieldCheck', 13) + 'Update credentials</button></div>' +
                    '<div class="field__hint mt-3">Until changed, the login page accepts the default admin@trendaryo.com / admin123. This is a local demo-grade gate - for a public deployment, wire real auth.</div></div></div>' +

                '<div class="panel"><div class="panel__head"><div><div class="panel__title">Maintenance bench</div><div class="panel__subtitle">Every destructive action asks twice</div></div></div><div class="panel__body">' +
                    '<div class="stack stack--sm">' +
                        '<button class="btn btn--sm" id="stBackup" type="button">' + A().icon('download', 13) + 'Export everything (JSON backup)</button>' +
                        '<button class="btn btn--sm" id="stReseed" type="button">' + A().icon('refresh', 13) + 'Reseed demo orders</button>' +
                        '<button class="btn btn--sm" id="stClearAi" type="button">Clear AI history</button>' +
                        '<button class="btn btn--sm" id="stResetProd" type="button">' + A().icon('refresh', 13) + 'Reset product overrides</button>' +
                        '<button class="btn btn--danger btn--sm" id="stWipe" type="button">' + A().icon('trash', 13) + 'Wipe ALL admin data</button>' +
                    '</div></div></div>' +
            '</div>' +

            '<div class="panel"><div class="panel__head"><div><div class="panel__title">Activity log</div><div class="panel__subtitle">Every admin action, newest first</div></div><div class="panel__actions"><button class="btn btn--sm" id="stLogExport" type="button">Export</button><button class="btn btn--sm" id="stLogClear" type="button">Clear</button></div></div>' +
                '<div class="table-wrap" id="stLog"></div></div>';

            root.querySelector('#stIdSave').addEventListener('click', function () {
                S.saveSettings({ storeName: root.querySelector('#stName').value.trim() || 'Trendaryo' });
                App.toast('Store identity saved', 'ok', 'Settings');
            });
            root.querySelector('#stCoSave').addEventListener('click', function () {
                S.saveSettings({ lowStock: parseInt(root.querySelector('#stLow').value, 10) || 0, currency: root.querySelector('#stCur').value });
                App.toast('Commerce settings saved', 'ok', 'Settings');
                app().badges();
            });

            var keyEye = root.querySelector('#stKeyEye');
            keyEye.addEventListener('click', function () {
                var inp = root.querySelector('#stKey');
                var show = inp.type === 'password';
                inp.type = show ? 'text' : 'password';
                keyEye.innerHTML = A().icon(show ? 'eyeOff' : 'eye', 13);
            });
            root.querySelector('#stProv').addEventListener('change', function () {
                root.querySelector('#stModelHint').textContent = modelHint[this.value] || '';
                root.querySelector('#stModel').placeholder = modelHint[this.value] || '';
            });
            root.querySelector('#stAiSave').addEventListener('click', function () {
                S.saveSettings({ aiProvider: root.querySelector('#stProv').value, aiKey: root.querySelector('#stKey').value.trim(), aiModel: root.querySelector('#stModel').value.trim(), aiTone: root.querySelector('#stTone').value });
                App.toast('AI settings saved', 'ok', 'Settings');
                App.route();
            });
            root.querySelector('#stAiTest').addEventListener('click', function () {
                var out = root.querySelector('#stTestOut');
                out.textContent = 'Testing...';
                engine.test().then(function (r) {
                    out.textContent = r.ok ? ('OK - ' + r.label + (r.ms ? ' (' + r.ms + 'ms)' : '')) : ('FAILED - ' + (r.error || 'unknown'));
                    App.toast(r.ok ? 'AI connection OK' : 'AI connection failed', r.ok ? 'ok' : 'danger', 'Settings');
                });
            });

            root.querySelector('#stCredSave').addEventListener('click', function () {
                var email = root.querySelector('#stEmail').value.trim();
                var p1 = root.querySelector('#stPass').value;
                var p2 = root.querySelector('#stPass2').value;
                if (!email || email.indexOf('@') < 0) { App.toast('Enter a valid admin email', 'warn', 'Security'); return; }
                if (p1 && p1.length < 6) { App.toast('Password needs at least 6 characters', 'warn', 'Security'); return; }
                if (p1 && p1 !== p2) { App.toast('Passwords do not match', 'warn', 'Security'); return; }
                if (!p1) { App.toast('Enter a new password to update credentials', 'warn', 'Security'); return; }
                S.write(S.K.creds, { email: email, pass: p1, updatedAt: S.now() });
                S.log('credentials.updated', email);
                App.toast('Credentials updated - the login page accepts them now', 'ok', 'Security');
                root.querySelector('#stPass').value = '';
                root.querySelector('#stPass2').value = '';
            });

            root.querySelector('#stBackup').addEventListener('click', function () {
                var keys = [S.K.settings, S.K.products, S.K.customers, S.K.content, S.K.ai, S.K.log, S.K.orders, 'trendaryo_newsletter', 'trendaryo_reviews', 'trendaryo_announcement'];
                var bundle = { exportedAt: S.now(), store: 'trendaryo-admin', data: {} };
                for (var i = 0; i < keys.length; i++) {
                    try { bundle.data[keys[i]] = JSON.parse(localStorage.getItem(keys[i]) || 'null'); } catch (e) { bundle.data[keys[i]] = null; }
                }
                var blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url; a.download = 'trendaryo-admin-backup.json';
                document.body.appendChild(a); a.click(); a.remove();
                setTimeout(function () { URL.revokeObjectURL(url); }, 500);
                S.log('data.backup', 'full JSON export');
                App.toast('Backup downloaded', 'ok', 'Settings');
            });
            root.querySelector('#stReseed').addEventListener('click', function () {
                App.confirm({ title: 'Reseed demo orders?', message: '<p class="t-body">Clears the order ledger and regenerates the two demo orders. Real orders on this device are lost.</p>', okText: 'Reseed', danger: true }).then(function (ok) {
                    if (!ok) return;
                    S.seedDemoOrders();
                    App.toast('Demo orders regenerated', 'ok', 'Settings');
                    app().badges();
                });
            });
            root.querySelector('#stClearAi').addEventListener('click', function () {
                App.confirm({ title: 'Clear AI history?', message: '<p class="t-body">All stored generation drafts are removed. Applied changes stay.</p>', okText: 'Clear', danger: true }).then(function (ok) {
                    if (!ok) return; S.aiClear(); App.toast('AI history cleared', 'ok', 'Settings'); App.route();
                });
            });
            root.querySelector('#stResetProd').addEventListener('click', function () {
                App.confirm({ title: 'Reset product overrides?', message: '<p class="t-body">Every edit, addition and deletion made in the admin returns to the base catalogue. The live shelf reverts instantly.</p>', okText: 'Reset overrides', danger: true }).then(function (ok) {
                    if (!ok) return;
                    S.resetProducts();
                    App.toast('Product overrides cleared - base catalogue restored', 'ok', 'Settings');
                    App.route();
                });
            });
            root.querySelector('#stWipe').addEventListener('click', function () {
                App.confirm({ title: 'Wipe ALL admin data?', message: '<p class="t-body"><b>Everything</b> this admin stores on this device is deleted: settings, overrides, customers, drafts, AI history, logs and orders. The browser then returns to the login page. This cannot be undone.</p>', okText: 'Wipe everything', danger: true }).then(function (ok) {
                    if (!ok) return;
                    S.resetAll();
                    App.logout();
                });
            });

            function drawLog() {
                var el = root.querySelector('#stLog');
                var logs = S.logs(60);
                if (!logs.length) { el.innerHTML = U.empty('activity', 'No activity yet', 'Actions across the admin appear here with actor, action and detail.'); return; }
                var h = '<table class="table table--compact"><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Detail</th></tr></thead><tbody>';
                for (var i = 0; i < logs.length; i++) {
                    h += '<tr><td class="fs-sm t-mute nowrap">' + App.ago(logs[i].at) + '</td><td class="fs-sm">' + U.esc(logs[i].actor) + '</td><td class="fs-sm fw-600">' + U.esc(logs[i].action) + '</td><td class="fs-sm t-dim">' + U.esc(logs[i].detail || '') + '</td></tr>';
                }
                el.innerHTML = h + '</tbody></table>';
            }
            drawLog();
            root.querySelector('#stLogClear').addEventListener('click', function () {
                App.confirm({ title: 'Clear the activity log?', message: '<p class="t-body">The audit trail is emptied.</p>', okText: 'Clear', danger: true }).then(function (ok) {
                    if (!ok) return; S.clearLogs(); App.toast('Log cleared', 'ok', 'Settings'); App.route();
                });
            });
            root.querySelector('#stLogExport').addEventListener('click', function () {
                var logs = S.logs();
                if (!logs.length) { App.toast('No log entries yet', 'warn'); return; }
                App.csv(logs.map(function (l) { return { at: l.at, actor: l.actor, action: l.action, detail: l.detail }; }), 'trendaryo-admin-log');
            });
        }
    };

})();
