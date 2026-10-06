/**
 * TRENDARYO ADMIN - Inbox (contact messages)
 * Reads /api/contact (admin-gated GET) and flips status through
 * /api/contact/:id (admin-gated PUT). Text fields arrive pre-escaped
 * from the server, so they render as-is; the email is the only raw field.
 */
(function () {
    'use strict';

    var V = window.TrendaryoAdminViews = window.TrendaryoAdminViews || {};
    var U = V.util;

    function app() { return window.TrendaryoAdminApp; }
    function A() { return window.TrendaryoAdmin; }

    var TOPIC = {
        orders: 'Orders', returns: 'Returns', shipping: 'Shipping',
        payments: 'Payments', product: 'Product', account: 'Account', other: 'Other'
    };

    var st = { q: '', filter: '', loading: true, error: '', list: [], loaded: false };

    function statusOf(m) {
        if (m.status === 'new' || m.status === 'handled') return m.status;
        return m.type === 'chat' ? 'auto' : 'new';
    }

    function unesc(s) {
        return String(s == null ? '' : s)
            .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
            .replace(/&amp;/g, '&');
    }

    function statusBadge(m) {
        var s = statusOf(m);
        if (s === 'new') return '<span class="badge badge--warn"><span class="badge__dot"></span>new</span>';
        if (s === 'auto') return '<span class="badge badge--neutral"><span class="badge__dot"></span>auto-replied</span>';
        return '<span class="badge badge--ok"><span class="badge__dot"></span>handled</span>';
    }

    function filtered() {
        var q = st.q.trim().toLowerCase();
        var out = [];
        for (var i = 0; i < st.list.length; i++) {
            var m = st.list[i];
            var s = statusOf(m);
            if (st.filter === 'new' && s !== 'new') continue;
            if (st.filter === 'handled' && s === 'new') continue;
            if (st.filter === 'message' && m.type !== 'message') continue;
            if (st.filter === 'chat' && m.type !== 'chat') continue;
            if (q) {
                var hay = [m.name, m.email, m.topic, m.message].join(' ').toLowerCase();
                if (hay.indexOf(q) < 0) continue;
            }
            out.push(m);
        }
        return out;
    }

    function recount() {
        var n = 0;
        for (var i = 0; i < st.list.length; i++) if (statusOf(st.list[i]) === 'new') n++;
        V.inbox.unread = n;
        try { app().badges(); } catch (e) { /* shell not ready */ }
    }

    function load(root, ctx) {
        st.loading = true;
        st.error = '';
        draw(root, ctx);
        window.API.request('/contact').then(function (res) {
            st.list = (res && res.data) || [];
            st.loading = false;
            st.loaded = true;
            recount();
            draw(root, ctx);
        }, function (err) {
            st.loading = false;
            st.loaded = true;
            st.error = (err && err.message) || 'Could not reach the server';
            draw(root, ctx);
        });
    }

    function setStatus(root, ctx, m, status) {
        window.API.request('/contact/' + encodeURIComponent(m.id), { method: 'PUT', body: { status: status } }).then(function () {
            m.status = status;
            m.handledBy = status === 'handled' ? (localStorage.getItem('adminEmail') || 'admin') : null;
            recount();
            app().toast(status === 'handled' ? 'Message marked as handled' : 'Message reopened', 'ok', 'Inbox');
            draw(root, ctx);
        }, function (err) {
            app().toast((err && err.message) || 'Update failed', 'danger', 'Inbox');
        });
    }

    function draw(root, ctx) {
        var App = ctx.App;
        var body = root.querySelector('#ibBody');
        if (!body) return;

        var newN = 0, chatN = 0, handledN = 0, i;
        for (i = 0; i < st.list.length; i++) {
            var s = statusOf(st.list[i]);
            if (s === 'new') newN++;
            else handledN++;
            if (st.list[i].type === 'chat') chatN++;
        }
        var head = root.querySelector('#ibNewN');
        if (head) head.textContent = newN;
        var headHandled = root.querySelector('#ibHandledN');
        if (headHandled) headHandled.textContent = handledN;
        var headChat = root.querySelector('#ibChatN');
        if (headChat) headChat.textContent = chatN;
        var headTotal = root.querySelector('#ibTotalN');
        if (headTotal) headTotal.textContent = st.list.length;

        if (st.loading) {
            body.innerHTML = '<div class="empty"><span class="spinner"></span><p style="margin-top:12px;">Loading messages...</p></div>';
            return;
        }
        if (st.error) {
            body.innerHTML = '<div class="empty"><div class="empty__icon">' + A().icon('alert', 20) + '</div>' +
                '<h3>Inbox unavailable</h3><p>' + App.esc(st.error) + '</p>' +
                '<button class="btn btn--sm" id="ibRetry" type="button" style="margin-top:12px;">Retry</button></div>';
            var retry = body.querySelector('#ibRetry');
            if (retry) retry.addEventListener('click', function () { load(root, ctx); });
            return;
        }

        var list = filtered();
        if (!st.list.length) {
            body.innerHTML = U.empty('inbox', 'No messages yet', 'Contact form submissions and live chats land here the moment a customer reaches out.');
            return;
        }
        if (!list.length) {
            body.innerHTML = U.empty('search', 'Nothing matches', 'Adjust the search or filters to find the message you are after.');
            return;
        }

        var h = '<div class="table-wrap"><table class="table table--compact"><thead><tr>' +
            '<th>From</th><th>Topic</th><th>Message</th><th>Received</th><th>Status</th><th></th>' +
            '</tr></thead><tbody>';
        for (i = 0; i < list.length; i++) {
            var m = list[i];
            var preview = unesc(m.message);
            if (preview.length > 90) preview = preview.slice(0, 90) + '...';
            h += '<tr data-open="' + App.esc(m.id) + '" style="cursor:pointer;">' +
                '<td><div class="table__primary">' + (m.name || '-') + '</div><div class="table__secondary">' + App.esc(m.email || '') + '</div></td>' +
                '<td><span class="badge badge--neutral">' + App.esc(TOPIC[m.topic] || m.topic || '-') + '</span>' +
                (m.type === 'chat' ? ' <span class="badge badge--info">chat</span>' : '') + '</td>' +
                '<td><div class="t-truncate" style="max-width:320px;">' + App.esc(preview) + '</div></td>' +
                '<td class="fs-sm t-mute">' + App.ago(m.createdAt) + '</td>' +
                '<td>' + statusBadge(m) + '</td>' +
                '<td><div class="cell-actions">' +
                '<button class="icon-btn" data-view="' + App.esc(m.id) + '" type="button" title="Open">' + A().icon('eye', 14) + '</button>' +
                '</div></td></tr>';
        }
        h += '</tbody></table></div>';
        body.innerHTML = h;
    }

    function openMessage(ctx, root, m) {
        var App = ctx.App;
        var isChat = m.type === 'chat';
        var subject = 'Re: your Trendaryo message (' + (TOPIC[m.topic] || m.topic || 'support') + ')';
        var bodyText = 'Hi ' + unesc(m.name || '') + ',\n\nThanks for contacting Trendaryo. Regarding your message:\n\n> ' +
            unesc(m.message).replace(/\n/g, '\n> ') + '\n\nBest regards,\nTrendaryo Support';
        var mailto = 'mailto:' + encodeURIComponent(m.email || '') +
            '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(bodyText);

        var replyBlock = '';
        if (isChat && m.reply) {
            replyBlock = '<div class="t-label" style="margin:16px 0 6px;">Auto-reply sent in chat</div>' +
                '<div class="panel" style="background:var(--surface-2);"><div class="panel__body" style="line-height:1.6;">' + m.reply + '</div></div>';
        }
        var metaBlock = (m.handledBy || m.updatedAt) ?
            '<div class="fs-xs t-mute" style="margin-top:12px;">' +
            (m.status === 'handled' && m.handledBy ? 'Handled by ' + App.esc(m.handledBy) : '') +
            (m.updatedAt ? (m.status === 'handled' && m.handledBy ? ' - ' : '') + 'Updated ' + App.dateTime(m.updatedAt) : '') +
            '</div>' : '';

        App.drawer.open({
            title: m.name || 'Customer',
            sub: (TOPIC[m.topic] || m.topic || 'message') + (isChat ? ' - live chat' : ' - contact form') + ' - ' + App.dateTime(m.createdAt),
            body: '<div class="row row--wrap" style="gap:8px;margin-bottom:14px;">' + statusBadge(m) +
                (isChat ? '<span class="badge badge--info">chat</span>' : '') + '</div>' +
                '<div class="grid grid--2" style="margin-bottom:14px;">' +
                    '<div><div class="t-label" style="margin-bottom:6px;">From</div><div class="fs-sm">' + (m.name || '-') + '<br>' + App.esc(m.email || 'no email') + '</div></div>' +
                    '<div><div class="t-label" style="margin-bottom:6px;">Received</div><div class="fs-sm">' + App.dateTime(m.createdAt) + '<br><span class="t-mute">' + App.ago(m.createdAt) + '</span></div></div>' +
                '</div>' +
                '<div class="t-label" style="margin-bottom:6px;">Message</div>' +
                '<div class="panel" style="background:var(--surface-2);"><div class="panel__body" style="white-space:pre-wrap;line-height:1.6;">' + (m.message || '') + '</div></div>' +
                replyBlock + metaBlock,
            foot: '<button class="btn btn--sm" data-copy type="button">' + A().icon('copy', 13) + 'Copy email</button>' +
                '<span class="spacer"></span>' +
                '<button class="btn btn--sm" data-toggle type="button">' +
                    (statusOf(m) === 'new' ? A().icon('check', 13) + 'Mark handled' : A().icon('undo', 13) + 'Reopen') +
                '</button>' +
                (m.email ? '<a class="btn btn--primary" href="' + App.esc(mailto) + '">' + A().icon('send', 13) + 'Reply by email</a>' : ''),
            onMount: function (drawerRoot) {
                var copyBtn = drawerRoot.querySelector('[data-copy]');
                if (copyBtn) copyBtn.addEventListener('click', function () {
                    var email = m.email || '';
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(email).then(function () { App.toast('Email copied: ' + email, 'ok', 'Inbox'); });
                    } else {
                        App.toast(email, 'info', 'Email');
                    }
                });
                var toggleBtn = drawerRoot.querySelector('[data-toggle]');
                if (toggleBtn) toggleBtn.addEventListener('click', function () {
                    var next = statusOf(m) === 'new' ? 'handled' : 'new';
                    setStatus(root, ctx, m, next);
                    App.drawer.close();
                });
            }
        });
    }

    V.inbox = {
        title: 'Inbox',
        icon: 'inbox',
        sub: 'Contact form messages and live chats - reply straight from here',
        unread: 0,
        render: function (root, ctx) {
            var App = ctx.App;

            root.innerHTML = U.head('Inbox', 'Contact form messages and live chats from the storefront',
                '<button class="btn btn--sm" id="ibRefresh" type="button">' + A().icon('refresh', 13) + 'Refresh</button>') +

                '<div class="grid grid--4" style="margin-bottom:16px;">' +
                    U.kpi('mail', 'stat__icon--warn', 'New', '<span id="ibNewN">0</span>', 'awaiting a reply') +
                    U.kpi('check', 'stat__icon--ok', 'Handled', '<span id="ibHandledN">0</span>', 'worked or closed') +
                    U.kpi('send', '', 'Live chats', '<span id="ibChatN">0</span>', 'auto-replied in widget') +
                    U.kpi('inbox', '', 'Total', '<span id="ibTotalN">0</span>', 'last 200 stored') +
                '</div>' +

                '<div class="panel"><div class="toolbar">' +
                    '<div class="search">' + A().icon('search', 14) + '<input id="ibQ" type="text" placeholder="Search name, email or message..." value="' + App.esc(st.q) + '"></div>' +
                    '<div class="chip-row" id="ibChips">' +
                        '<button class="chip' + (st.filter === '' ? ' is-active' : '') + '" data-f="" type="button">All</button>' +
                        '<button class="chip' + (st.filter === 'new' ? ' is-active' : '') + '" data-f="new" type="button">New</button>' +
                        '<button class="chip' + (st.filter === 'handled' ? ' is-active' : '') + '" data-f="handled" type="button">Handled</button>' +
                        '<button class="chip' + (st.filter === 'message' ? ' is-active' : '') + '" data-f="message" type="button">Messages</button>' +
                        '<button class="chip' + (st.filter === 'chat' ? ' is-active' : '') + '" data-f="chat" type="button">Chats</button>' +
                    '</div>' +
                    '<span class="spacer"></span>' +
                '</div><div id="ibBody"></div></div>';

            var q = root.querySelector('#ibQ');
            q.addEventListener('input', App.debounce(function () { st.q = q.value; draw(root, ctx); }, 200));

            root.querySelector('#ibBody').addEventListener('click', function (e) {
                var t = e.target.closest('[data-view]') || e.target.closest('[data-open]');
                if (!t) return;
                var id = t.getAttribute('data-view') || t.getAttribute('data-open');
                var list = filtered();
                for (var x = 0; x < list.length; x++) {
                    if (list[x].id === id) { openMessage(ctx, root, list[x]); return; }
                }
            });

            var chips = root.querySelectorAll('#ibChips .chip');
            for (var i = 0; i < chips.length; i++) {
                chips[i].addEventListener('click', function () {
                    for (var x = 0; x < chips.length; x++) chips[x].classList.remove('is-active');
                    this.classList.add('is-active');
                    st.filter = this.getAttribute('data-f');
                    draw(root, ctx);
                });
            }

            root.querySelector('#ibRefresh').addEventListener('click', function () { load(root, ctx); });

            if (!st.loaded) load(root, ctx);
            else { recount(); draw(root, ctx); }
        }
    };

})();
