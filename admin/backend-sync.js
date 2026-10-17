/**
 * TRENDARYO ADMIN - BACKEND SYNC
 * ---------------------------------------------------------------------------
 * Turns the offline command deck into a real dashboard backed by Firestore.
 *
 * Boot flow (admin.html):
 *   1. Verify the signed-in Firebase user is a server-confirmed admin
 *      (role read from Firestore via /api/auth/me - never client-set).
 *   2. Hydrate the store's localStorage tables from the API (products,
 *      orders, customers, reviews, newsletter, settings) so every module
 *      works on live production data.
 *   3. Hook the store's mutators so admin actions write through to Firestore
 *      and stay in sync with the storefront (catalogue cache, orders, etc).
 *
 * Load after app.js/views, before the inline boot call.
 */
(function () {
    'use strict';

    var App = window.TrendaryoAdminApp;

    function api() { return window.API; }
    function lsGet(key, fallback) {
        try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
        catch (e) { return fallback; }
    }
    function lsSet(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); return true; }
        catch (e) { return false; }
    }

    /* ================= AUTH GATE ================= */

    function verifyAdmin() {
        return new Promise(function (resolve) {
            function check(user) {
                if (!user) { location.replace('admin-login.html'); return resolve(false); }
                user.getIdToken(true).then(function (token) {
                    return fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } });
                }).then(function (r) {
                    if (!r.ok) throw new Error('not allowed');
                    return r.json();
                }).then(function (body) {
                    var me = body && body.data;
                    if (!me || me.role !== 'admin' || me.status !== 'active') {
                        location.replace('admin-login.html');
                        return resolve(false);
                    }
                    localStorage.setItem('adminEmail', me.email || '');
                    window.__adminMe = me;
                    resolve(true);
                }).catch(function () {
                    location.replace('admin-login.html');
                    resolve(false);
                });
            }

            var attempts = 0;
            (function waitFirebase() {
                if (typeof firebase !== 'undefined' && firebase.auth) {
                    initFirebase().then(function (h) {
                        if (!h || !h.auth) { location.replace('admin-login.html'); return resolve(false); }
                        h.auth.onAuthStateChanged(check);
                    }).catch(function () { location.replace('admin-login.html'); resolve(false); });
                } else if (attempts++ < 80) {
                    setTimeout(waitFirebase, 150);
                } else {
                    location.replace('admin-login.html');
                    resolve(false);
                }
            })();
        });
    }

    /* ================= DATA HYDRATION ================= */

    function mapProductToCatalog(p) {
        var specs = [];
        if (Array.isArray(p.specs)) {
            specs = p.specs.map(function (s) { return Array.isArray(s) ? s : [s.label || '', s.value || '']; });
        }
        return {
            id: p.id || p.slug,
            name: p.name || 'Product',
            description: p.description || '',
            price: Number(p.price) || 0,
            oldPrice: p.originalPrice != null ? Number(p.originalPrice) : undefined,
            emoji: p.emoji || '📦',
            badge: p.badge || null,
            rating: Number(p.rating) || 0,
            reviews: Number(p.reviewCount) || 0,
            image: p.image || (p.images && p.images[0]) || 'assets/placeholder.jpg',
            category: p.category || '',
            brand: p.brand || '',
            stock: p.stock,
            sku: p.sku || '',
            specs: specs,
            features: p.features || [],
            seo: p.seo || null,
            hidden: p.status === 'draft',
            costPrice: p.costPrice != null ? Number(p.costPrice) : null,
            reorderPoint: p.reorderPoint != null ? Number(p.reorderPoint) : null,
            leadTimeDays: p.leadTimeDays != null ? Number(p.leadTimeDays) : null,
            _backend: true
        };
    }

    function refreshProductCache(list) {
        if (!Array.isArray(list)) return;
        lsSet('trendaryo_catalog_cache', list);
        lsSet('trendaryo_catalog_version', 'admin-' + Date.now());
        if (window.TrendaryoProducts && typeof window.TrendaryoProducts.setBase === 'function') {
            window.TrendaryoProducts.setBase(list);
        }
        // Admin edits live in the override layer; backend is the source of truth.
        lsSet('trendaryo_admin_products', { v: 1, overrides: {}, deleted: [], added: [] });
    }

    function mapOrderToAdmin(o) {
        var items = (o.items || []).map(function (it) {
            return {
                id: it.productId || it.id,
                name: it.name || 'Product',
                price: Number(it.price) || 0,
                qty: Number(it.quantity) || Number(it.qty) || 1,
                quantity: Number(it.quantity) || Number(it.qty) || 1,
                image: it.image || ''
            };
        });
        var history = (o.statusHistory || []).map(function (h) {
            return { status: h.status, at: h.timestamp || h.at };
        });
        if (!history.length && o.status) history.push({ status: o.status, at: o.createdAt });
        return {
            id: o.id,
            orderNumber: o.orderNumber || o.id,
            status: o.status || 'pending',
            paymentStatus: o.paymentStatus || 'pending',
            total: Number(o.total) || 0,
            subtotal: Number(o.subtotal) || 0,
            discount: Number(o.discount) || 0,
            tax: Number(o.tax) || 0,
            shippingCost: Number(o.shipping) || 0,
            currency: o.currency || 'usd',
            date: o.createdAt || new Date().toISOString(),
            createdAt: o.createdAt || new Date().toISOString(),
            paymentMethod: o.paymentMethod || 'card',
            shipping: {
                name: (o.shippingAddress && o.shippingAddress.fullName) || '',
                email: (o.shippingAddress && o.shippingAddress.email) || '',
                city: (o.shippingAddress && o.shippingAddress.city) || '',
                country: (o.shippingAddress && o.shippingAddress.country) || '',
                street: (o.shippingAddress && o.shippingAddress.street) || '',
                zip: (o.shippingAddress && o.shippingAddress.zipCode) || '',
                address: (o.shippingAddress && o.shippingAddress.street) || ''
            },
            items: items,
            history: history,
            userId: o.userId,
            coupon: o.coupon || null,
            /* F1/F6/F9: server state machine + hold + SLA flags. */
            allowedTransitions: Array.isArray(o.allowedTransitions) ? o.allowedTransitions : null,
            riskLevel: o.riskLevel || null,
            needsAttention: !!o.needsAttention,
            attentionReason: o.attentionReason || null,
            slaBreached: !!o.slaBreached,
            fulfillment: o.fulfillment || null,
            supplierSubmittedAt: o.supplierSubmittedAt || null
        };
    }

    function mapUserToCustomer(u) {
        var addr = (u.addresses && u.addresses[0]) || {};
        return {
            id: u.id || u.uid,
            name: [(u.firstName || ''), (u.lastName || '')].join(' ').trim() || u.email || 'Anonymous',
            email: u.email || '',
            city: addr.city || '',
            country: addr.country || '',
            role: u.role || 'user',
            status: u.status || 'active',
            source: u.role === 'admin' ? 'staff' : 'account',
            createdAt: u.createdAt || null,
            sources: ['account']
        };
    }

    function mapReviewToAdmin(r) {
        return {
            id: r.id,
            productId: r.productId,
            userName: r.userName || 'Customer',
            userId: r.userId || '',
            rating: r.rating || 0,
            title: r.title || '',
            comment: r.comment || '',
            status: r.status || 'approved',
            createdAt: r.createdAt || new Date().toISOString()
        };
    }

    function getJSON(url) {
        return api().request(url);
    }

    function loadAll() {
        if (!api()) return Promise.resolve();

        var jobs = {};

        jobs.products = api().getProducts(1, 500, { status: 'all' });
        jobs.orders = getJSON('/admin/orders?limit=500');
        jobs.users = getJSON('/admin/users?limit=500');
        jobs.settings = getJSON('/settings');
        jobs.newsletter = getJSON('/newsletter');
        jobs.reviews = api().request('/reviews').catch(function () { return { data: [] }; });
        /* Drafts and published posts both live in the studio queue. */
        jobs.blog = getJSON('/blog?status=all&limit=500').catch(function () { return { data: [] }; });

        return Promise.all([
            jobs.products.catch(function () { return { data: [] }; }),
            jobs.orders.catch(function () { return { data: [], pagination: {} }; }),
            jobs.users.catch(function () { return { data: [] }; }),
            jobs.settings.catch(function () { return { data: null }; }),
            jobs.newsletter.catch(function () { return { data: [] }; }),
            jobs.reviews.catch(function () { return { data: [] }; }),
            jobs.blog.catch(function () { return { data: [] }; })
        ]).then(function (results) {
            var products = (results[0].data || []).map(mapProductToCatalog);
            var orders = (results[1].data || []).map(mapOrderToAdmin);
            var users = (results[2].data || []).map(mapUserToCustomer);
            var settings = results[3].data || null;
            var newsletter = (results[4].data || []).map(function (n) { return (n.email || '').toLowerCase(); });
            var reviews = (results[5].data || []).map(mapReviewToAdmin);
            var posts = results[6].data || [];

            refreshProductCache(products);
            lsSet('trendaryo_orders', orders);
            lsSet('trendaryo_admin_customers', users);
            lsSet('trendaryo_newsletter', newsletter);
            lsSet('trendaryo_reviews', reviews);
            lsSet('trendaryo_admin_blog', posts);

            if (settings) {
                var S = window.TrendaryoAdminStore;
                var patch = {};
                if (settings.storeName != null) patch.storeName = settings.storeName;
                if (settings.lowStock != null) patch.lowStock = settings.lowStock;
                if (settings.currency != null) patch.currency = settings.currency.toUpperCase();
                if (settings.announcement != null) patch.announcement = settings.announcement;
                if (settings.taxRatesByCountry != null) patch.taxRatesByCountry = settings.taxRatesByCountry;
                if (settings.taxRatesByRegion != null) patch.taxRatesByRegion = settings.taxRatesByRegion;
                if (settings.shippingByCountry != null) patch.shippingByCountry = settings.shippingByCountry;
                if (settings.codCountries != null) patch.codCountries = settings.codCountries;
                /* Production control keys (F5/F6/F9). */
                if (settings.checkoutEnabled != null) patch.checkoutEnabled = !!settings.checkoutEnabled;
                if (settings.maintenanceMode != null) patch.maintenanceMode = !!settings.maintenanceMode;
                if (settings.maintenanceMessage != null) patch.maintenanceMessage = settings.maintenanceMessage;
                if (settings.blockedCountries != null) patch.blockedCountries = settings.blockedCountries;
                if (settings.supportEmail != null) patch.supportEmail = settings.supportEmail;
                if (settings.riskEnabled != null) patch.riskEnabled = !!settings.riskEnabled;
                if (settings.riskReviewThreshold != null) patch.riskReviewThreshold = settings.riskReviewThreshold;
                if (settings.riskMaxOrderValue != null) patch.riskMaxOrderValue = settings.riskMaxOrderValue;
                if (settings.supplierLeadDays != null) patch.supplierLeadDays = settings.supplierLeadDays;
                S.saveSettings(patch);
                // don't log a synthetic settings update
                var log = lsGet('trendaryo_admin_log', []);
                if (log[0] && log[0].action === 'settings.updated' && !log[0].__sync) log.shift();
                lsSet('trendaryo_admin_log', log);
            }

            console.log('Trendaryo admin: backend data loaded (' + products.length + ' products, ' + orders.length + ' orders)');
        });
    }

    /* ================= WRITE-THROUGH HOOKS ================= */

    function hookStore() {
        var S = window.TrendaryoAdminStore;
        if (!S || S.__hooked) return;
        S.__hooked = true;

        function notify(err) {
            if (err) console.warn('Trendaryo admin sync:', err.message || err);
        }

        function productPayload(patch) {
            var OPS = { costPrice: 1, reorderPoint: 1, leadTimeDays: 1 };
            var out = {}, k;
            for (k in patch) {
                if (patch[k] === undefined) continue;
                /* null clears an ops field; every other null stays local-only. */
                if (patch[k] === null && !OPS[k]) continue;
                switch (k) {
                    case 'price': out.price = Number(patch.price) || 0; break;
                    case 'oldPrice': out.originalPrice = Number(patch.oldPrice) || null; break;
                    case 'hidden': out.status = patch.hidden ? 'draft' : 'active'; break;
                    case 'seo': out.seo = patch.seo; break;
                    case 'costPrice':
                    case 'reorderPoint':
                    case 'leadTimeDays': out[k] = patch[k]; break;
                    default: out[k] = patch[k];
                }
            }
            return out;
        }

        var origSaveProduct = S.saveProduct;
        S.saveProduct = function (id, patch) {
            var res = origSaveProduct.call(S, id, patch);
            if (api()) api().updateProduct(String(id), productPayload(patch)).catch(notify);
            return res;
        };

        var origAddProduct = S.addProduct;
        S.addProduct = function (p) {
            var res = origAddProduct.call(S, p);
            if (api()) {
                var payload = {
                    name: p.name,
                    description: p.description || '',
                    price: Number(p.price) || 0,
                    originalPrice: p.oldPrice != null ? Number(p.oldPrice) : null,
                    category: p.category || 'general',
                    brand: p.brand || '',
                    stock: Number(p.stock) != null ? Number(p.stock) : 0,
                    image: p.image || '',
                    emoji: p.emoji || '📦',
                    badge: p.badge || null,
                    sku: p.sku || '',
                    features: p.features || [],
                    status: p.hidden ? 'draft' : 'active',
                    costPrice: p.costPrice != null ? Number(p.costPrice) : undefined,
                    reorderPoint: p.reorderPoint != null ? Number(p.reorderPoint) : undefined,
                    leadTimeDays: p.leadTimeDays != null ? Number(p.leadTimeDays) : undefined,
                    /* Keep the backend row on the same id the dashboard just
                       assigned, so content, briefs and relations resolve. */
                    clientId: String(p.id)
                };
                api().createProduct(payload).then(function () {
                    var App = window.TrendaryoAdminApp;
                    if (App && App.toast) App.toast(p.name + ' synced to the catalog', 'ok', 'Catalog');
                }).catch(function (err) {
                    notify(err);
                    var App2 = window.TrendaryoAdminApp;
                    if (App2 && App2.toast) {
                        App2.toast('Saved locally only - the catalog sync failed (' + ((err && err.message) || 'unknown error') + '). Reload the catalog and retry before publishing content.', 'warn', 'Catalog');
                    }
                });
            }
            return res;
        };

        var origDeleteProduct = S.deleteProduct;
        S.deleteProduct = function (id) {
            origDeleteProduct.call(S, id);
            if (api()) api().deleteProduct(String(id)).catch(notify);
        };

        var origSetStock = S.setStock;
        S.setStock = function (id, n) {
            var res = origSetStock.call(S, id, n);
            if (api()) api().updateProduct(String(id), { stock: Math.max(0, parseInt(n, 10) || 0) }).catch(notify);
            return res;
        };

        var origResetProducts = S.resetProducts;
        S.resetProducts = function () {
            origResetProducts.call(S);
            // Re-pull from Firestore so the excluded offline layer is repopulated.
            if (api()) api().getProducts(1, 500, { status: 'all' })
                .then(function (r) { refreshProductCache((r.data || []).map(mapProductToCatalog)); })
                .catch(notify);
        };

        /* The server owns the state machine: if it refuses the move we pull
           the real orders back so the board never lies about a status. */
        function reloadOrders() {
            if (!api()) return;
            getJSON('/admin/orders?limit=500').then(function (r) {
                lsSet('trendaryo_orders', (r.data || []).map(mapOrderToAdmin));
                if (App && App.route && /orders/.test(String(location.hash || ''))) App.route();
            }).catch(notify);
        }
        /* Views need this after server-side actions (risk release, refunds). */
        window.TrendaryoAdminSync = window.TrendaryoAdminSync || {};
        window.TrendaryoAdminSync.reloadOrders = reloadOrders;

        var origSetOrderStatus = S.setOrderStatus;
        S.setOrderStatus = function (id, status, note) {
            var res = origSetOrderStatus.call(S, id, status);
            if (api()) {
                api().updateOrderStatus(String(id), { status: status, note: note || '' })
                    .then(reloadOrders)
                    .catch(function (err) {
                        notify(err);
                        reloadOrders();
                        var msg = (err && err.message) || 'rejected';
                        if (App && App.toast) App.toast('Server refused "' + status + '": ' + msg, 'danger', 'Orders');
                    });
            }
            return res;
        };

        var origSaveSettings = S.saveSettings;
        S.saveSettings = function (patch) {
            var res = origSaveSettings.call(S, patch);
            if (api()) {
                var out = {};
                if (patch.storeName !== undefined) out.storeName = patch.storeName;
                if (patch.lowStock !== undefined) out.lowStock = patch.lowStock;
                if (patch.currency !== undefined) out.currency = String(patch.currency).toLowerCase();
                if (patch.announcement !== undefined) out.announcement = patch.announcement;
                if (patch.taxRatesByCountry !== undefined) out.taxRatesByCountry = patch.taxRatesByCountry;
                if (patch.taxRatesByRegion !== undefined) out.taxRatesByRegion = patch.taxRatesByRegion;
                if (patch.shippingByCountry !== undefined) out.shippingByCountry = patch.shippingByCountry;
                if (patch.codCountries !== undefined) out.codCountries = patch.codCountries;
                /* Production control keys (F5/F6/F9). */
                if (patch.checkoutEnabled !== undefined) out.checkoutEnabled = !!patch.checkoutEnabled;
                if (patch.maintenanceMode !== undefined) out.maintenanceMode = !!patch.maintenanceMode;
                if (patch.maintenanceMessage !== undefined) out.maintenanceMessage = String(patch.maintenanceMessage || '');
                if (patch.blockedCountries !== undefined) out.blockedCountries = patch.blockedCountries;
                if (patch.supportEmail !== undefined) out.supportEmail = String(patch.supportEmail || '');
                if (patch.riskEnabled !== undefined) out.riskEnabled = !!patch.riskEnabled;
                if (patch.riskReviewThreshold !== undefined) out.riskReviewThreshold = patch.riskReviewThreshold;
                if (patch.riskMaxOrderValue !== undefined) out.riskMaxOrderValue = patch.riskMaxOrderValue;
                if (patch.supplierLeadDays !== undefined) out.supplierLeadDays = patch.supplierLeadDays;
                if (Object.keys(out).length) api().request('/settings', { method: 'PUT', body: out }).catch(notify);
            }
            return res;
        };

        var origNewsletterAdd = S.newsletterAdd;
        S.newsletterAdd = function (email) {
            var res = origNewsletterAdd.call(S, email);
            if (api() && res) api().subscribeNewsletter(email).catch(notify);
            return res;
        };

        var origNewsletterRemove = S.newsletterRemove;
        S.newsletterRemove = function (email) {
            var res = origNewsletterRemove.call(S, email);
            if (api() && res) api().request('/newsletter?email=' + encodeURIComponent(email), { method: 'DELETE' }).catch(notify);
            return res;
        };

        var origDeleteReview = S.deleteReview;
        S.deleteReview = function (id) {
            origDeleteReview.call(S, id);
            if (api()) api().request('/reviews/' + encodeURIComponent(String(id)), { method: 'DELETE' }).catch(notify);
        };

        /* ---------- BLOG write-through ----------
           The server owns the document (id = slug), so after a create/delete we
           re-pull the list rather than guessing which id Firestore assigned. */
        var BLOG_FIELDS = ['title', 'excerpt', 'content', 'coverImage', 'coverAlt',
            'category', 'tags', 'author', 'readMinutes', 'status',
            'featured', 'scheduledFor', 'seo', 'relatedProductIds', 'blocks'];

        function blogPayload(obj) {
            var out = {}, i;
            for (i = 0; i < BLOG_FIELDS.length; i++) {
                if (obj[BLOG_FIELDS[i]] !== undefined) out[BLOG_FIELDS[i]] = obj[BLOG_FIELDS[i]];
            }
            return out;
        }

        function reloadBlog() {
            if (!api()) return;
            getJSON('/blog?status=all&limit=500').then(function (r) {
                lsSet('trendaryo_admin_blog', r.data || []);
                if (App && App.route && /blog/.test(String(location.hash || ''))) App.route();
            }).catch(notify);
        }
        window.TrendaryoAdminSync = window.TrendaryoAdminSync || {};
        window.TrendaryoAdminSync.reloadBlog = reloadBlog;

        var origAddBlogPost = S.addBlogPost;
        S.addBlogPost = function (p) {
            var res = origAddBlogPost.call(S, p);
            if (api()) {
                api().createPost(blogPayload(p)).then(function () {
                    reloadBlog();
                }).catch(function (err) {
                    notify(err);
                    App.toast('Saved locally - the server rejected it: ' + ((err && err.message) || 'error'), 'warn', 'Blog');
                });
            }
            return res;
        };

        var origSaveBlogPost = S.saveBlogPost;
        S.saveBlogPost = function (id, patch) {
            var res = origSaveBlogPost.call(S, id, patch);
            var target = res ? (res.slug || res.id) : id;
            if (api() && target) {
                api().updatePost(String(target), blogPayload(patch)).then(function (r) {
                    /* Reconcile with the authoritative doc (slug, timestamps). */
                    if (r && r.data) origSaveBlogPost.call(S, id, r.data);
                }).catch(function (err) {
                    notify(err);
                    App.toast('Local only - the server refused this save: ' + ((err && err.message) || 'error'), 'warn', 'Blog');
                });
            }
            return res;
        };

        var origDeleteBlogPost = S.deleteBlogPost;
        S.deleteBlogPost = function (id) {
            var post = S.blogPost(id);
            origDeleteBlogPost.call(S, id);
            if (api() && post) {
                api().deletePost(String(post.slug || post.id || id))
                    .then(reloadBlog)
                    .catch(function (err) { notify(err); reloadBlog(); });
            }
        };
    }

    /* ================= BOOT OVERRIDE ================= */

    if (App) {
        App.start = function () {
            verifyAdmin().then(function (ok) {
                if (!ok) return;
                loadAll().then(hookStore).catch(hookStore).then(function () {
                    // guard must pass now - we are verified.
                    App.guard = function () { return true; };
                    App.buildShell();
                    window.addEventListener('hashchange', App.route);
                    document.addEventListener('keydown', function (e) {
                        if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') {
                            e.preventDefault();
                            App.copilot();
                        }
                    });
                    App.route();
                });
            });
        };
        App.logout = function () {
            try { if (firebase.auth) firebase.auth().signOut(); } catch (e) { /* ignore */ }
            var keys = ['adminToken', 'userRole', 'adminEmail', 'adminLoginTime'];
            for (var i = 0; i < keys.length; i++) localStorage.removeItem(keys[i]);
            location.replace('admin-login.html');
        };
    }

})();
