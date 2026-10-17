/**
 * TRENDARYO - PRODUCT CONTEXT ENGINE
 * ---------------------------------------------------------------------------
 * Phase 3 of the AI Content Engine. One canonical context object per
 * product, built from the live catalogue row, and shared by every AI
 * module (product page generation, SEO, images, blog briefs, blog articles)
 * so no module ever re-invents or re-parses product data.
 *
 * Pure functions only - no DOM, no Firebase - so the same file powers the
 * admin dashboard in the browser and the node:test suites on the server.
 *
 * Deliberately excluded: costPrice / reorderPoint. Those are internal
 * margin and ops fields; they must never reach a prompt or public content.
 */
(function (root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.TrendaryoProductContext = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    function PD() {
        return (typeof window !== 'undefined' && window.TrendaryoProducts) || null;
    }

    function num(v) {
        var n = Number(v);
        return isFinite(n) ? n : 0;
    }

    function str(v) {
        return String(v == null ? '' : v).trim();
    }

    /* ---------- field normalisers ---------- */

    function categoryOf(p) {
        var P = PD();
        if (P && typeof P.categoryOf === 'function') {
            try {
                var c = String(P.categoryOf(p) || '').toLowerCase();
                if (c) return c;
            } catch (e) { /* fall back to the raw field */ }
        }
        return (str(p && p.category).toLowerCase() || 'general');
    }

    function specsOf(p) {
        var rows = [];
        var P = PD();
        if (P && typeof P.specs === 'function') {
            try {
                var generated = P.specs(p);
                if (Array.isArray(generated) && generated.length) rows = generated;
            } catch (e) { rows = []; }
        }
        if (!rows.length && Array.isArray(p && p.specs)) rows = p.specs;
        var out = [];
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            if (Array.isArray(r)) out.push({ label: str(r[0]), value: str(r[1]) });
            else if (r && typeof r === 'object') out.push({ label: str(r.label || r.name), value: str(r.value) });
            else if (str(r)) out.push({ label: str(r), value: '' });
        }
        return out.filter(function (row) { return row.label; });
    }

    function imagesOf(p) {
        var out = [];
        function push(src) {
            src = str(src);
            if (src && out.indexOf(src) < 0) out.push(src);
        }
        push(p && p.image);
        if (p && Array.isArray(p.images)) for (var i = 0; i < p.images.length; i++) push(p.images[i]);
        return out;
    }

    function tagsOf(p) {
        var out = [];
        function push(t) {
            t = str(t).toLowerCase();
            if (t && out.indexOf(t) < 0 && out.length < 12) out.push(t);
        }
        if (p && Array.isArray(p.tags)) for (var i = 0; i < p.tags.length; i++) push(p.tags[i]);
        if (p && p.badge) push(p.badge);
        return out;
    }

    function variantsOf(p) {
        if (!p || !Array.isArray(p.variants)) return [];
        var out = [];
        for (var i = 0; i < p.variants.length; i++) {
            var v = p.variants[i];
            if (!v || typeof v !== 'object') continue;
            out.push({
                name: str(v.name || v.title),
                options: Array.isArray(v.options) ? v.options.map(str).filter(Boolean) : []
            });
        }
        return out.filter(function (v) { return v.name; });
    }

    /* ---------- the canonical context object (Phase 3) ---------- */

    function context(product, opts) {
        opts = opts || {};
        var p = product || {};
        return {
            productId: str(p.id),
            productName: str(p.name),
            category: opts.category || categoryOf(p),
            brand: str(p.brand),
            sku: str(p.sku),
            price: num(p.price),
            compareAtPrice: p.oldPrice != null ? num(p.oldPrice) : null,
            currency: 'USD',
            description: str(p.description),
            specifications: specsOf(p),
            images: imagesOf(p),
            variants: variantsOf(p),
            tags: tagsOf(p),
            rating: num(p.rating),
            reviewCount: num(p.reviews),
            stock: p._stock != null ? num(p._stock) : num(p.stock),
            hidden: !!p.hidden,
            supplier: {
                supplierId: str(p.supplierId),
                leadTimeDays: p.leadTimeDays != null ? num(p.leadTimeDays) : null
            },
            url: 'product.html?id=' + encodeURIComponent(str(p.id))
        };
    }

    /* Prompt-ready text block. Every AI task builds its user message from
       this, so the model always sees the same grounded product facts. */
    function brief(ctx) {
        var lines = [
            'Product: ' + (ctx.productName || '[unnamed]'),
            'Category: ' + (ctx.category || 'general'),
            ctx.brand ? 'Brand: ' + ctx.brand : '',
            'Price: $' + ctx.price + (ctx.compareAtPrice ? ' (usually $' + ctx.compareAtPrice + ')' : ''),
            'Rating: ' + ctx.rating + '/5 from ' + ctx.reviewCount + ' verified buyers',
            ctx.sku ? 'SKU: ' + ctx.sku : ''
        ];
        if (ctx.specifications && ctx.specifications.length) {
            var rows = [];
            for (var i = 0; i < ctx.specifications.length; i++) {
                rows.push(ctx.specifications[i].label + (ctx.specifications[i].value ? ': ' + ctx.specifications[i].value : ''));
            }
            lines.push('Specifications: ' + rows.join('; '));
        }
        if (ctx.tags && ctx.tags.length) lines.push('Tags: ' + ctx.tags.join(', '));
        lines.push('Base description: ' + (ctx.description || '[none provided]'));
        return lines.filter(Boolean).join('\n');
    }

    function briefOf(product) {
        return brief(context(product));
    }

    /* ---------- catalogue search (Phase 14: briefs reference real products) ---------- */

    var STOP = ['the', 'a', 'an', 'with', 'and', 'for', 'of', 'to', 'in', 'on', 'best', 'buy', 'how', 'why'];

    function tokens(text) {
        var words = String(text || '').toLowerCase().split(/[^a-z0-9]+/);
        var out = [];
        for (var i = 0; i < words.length; i++) {
            var w = words[i];
            if (w.length > 2 && STOP.indexOf(w) < 0 && out.indexOf(w) < 0) out.push(w);
        }
        return out;
    }

    /* Scores catalogue rows against a product-kind description
       ("noise cancelling headphones", "budget running watches") and
       returns the best matches, strongest first. */
    function matchProducts(list, query, opts) {
        opts = opts || {};
        var limit = opts.limit || 8;
        var wantedCat = str(opts.category).toLowerCase();
        var qTokens = tokens(query);
        var scored = [];
        for (var i = 0; i < (list || []).length; i++) {
            var p = list[i];
            if (p.hidden && !opts.includeHidden) continue;
            var ctx = context(p);
            var score = 0, j;
            var name = String(ctx.productName || '').toLowerCase();
            var desc = String(ctx.description || '').toLowerCase();
            var cat = String(ctx.category || '').toLowerCase();
            var hay = (ctx.tags || []).join(' ').toLowerCase() + ' ' +
                (ctx.specifications || []).map(function (s) { return s.label + ' ' + s.value; }).join(' ').toLowerCase();
            if (wantedCat && cat === wantedCat) score += 4;
            for (j = 0; j < qTokens.length; j++) {
                var t = qTokens[j];
                if (name.indexOf(t) >= 0) score += 4;
                if (hay.indexOf(t) >= 0) score += 2;
                if (desc.indexOf(t) >= 0) score += 1;
                if (cat.indexOf(t) >= 0) score += 3;
            }
            if (score > 0) {
                score += Math.min(2, ctx.rating / 2.5) + Math.min(1, ctx.reviewCount / 500);
                scored.push({ product: p, score: Math.round(score * 100) / 100 });
            }
        }
        scored.sort(function (a, b) { return b.score - a.score; });
        return scored.slice(0, limit).map(function (s) { return s.product; });
    }

    /* ---------- deterministic SEO analysis (Phase 13: "Analyze SEO") ---------- */

    function analyzeSeo(product) {
        var p = product || {};
        var ctx = context(p);
        var seo = p.seo || {};
        var metaTitle = str(seo.metaTitle);
        var metaDescription = str(seo.metaDescription);
        var keywords = Array.isArray(seo.keywords) ? seo.keywords.filter(Boolean) : [];
        var descWords = ctx.description ? ctx.description.split(/\s+/).filter(Boolean).length : 0;

        var checks = [
            {
                id: 'metaTitle', label: 'Meta title', weight: 20,
                ok: metaTitle.length >= 30 && metaTitle.length <= 60,
                hint: metaTitle ? 'Meta title is ' + metaTitle.length + ' characters - aim for 30-60.' : 'No meta title yet - the AI SEO package writes one.'
            },
            {
                id: 'metaDescription', label: 'Meta description', weight: 20,
                ok: metaDescription.length >= 70 && metaDescription.length <= 155,
                hint: metaDescription ? 'Meta description is ' + metaDescription.length + ' characters - aim for 70-155.' : 'No meta description yet - the AI SEO package writes one.'
            },
            {
                id: 'keywords', label: 'Keyword coverage', weight: 15,
                ok: keywords.length >= 6,
                hint: keywords.length + ' keywords saved - 6 or more gives the storefront enough long-tail coverage.'
            },
            {
                id: 'description', label: 'Base description', weight: 15,
                ok: descWords >= 40,
                hint: descWords ? 'Description runs ' + descWords + ' words.' : 'The product has no description - generate one before drafting a page.'
            },
            {
                id: 'specifications', label: 'Specifications', weight: 10,
                ok: ctx.specifications.length >= 3,
                hint: ctx.specifications.length + ' spec rows - every future AI section is grounded in these.'
            },
            {
                id: 'images', label: 'Images', weight: 10,
                ok: ctx.images.length >= 1,
                hint: ctx.images.length ? ctx.images.length + ' image(s) on file.' : 'No images - alt text and OG images depend on at least one.'
            },
            {
                id: 'socialProof', label: 'Rating and reviews', weight: 10,
                ok: ctx.rating > 0 && ctx.reviewCount > 0,
                hint: ctx.reviewCount > 0 ? 'Rated ' + ctx.rating + '/5 from ' + ctx.reviewCount + ' buyers.' : 'No verified ratings yet.'
            }
        ];

        var score = 0, full = 0, partial = 0;
        for (var i = 0; i < checks.length; i++) {
            if (checks[i].ok) { score += checks[i].weight; full++; } else partial++;
        }
        return {
            score: score,
            state: full === checks.length ? 'full' : (full ? 'partial' : 'missing'),
            checks: checks
        };
    }

    /* ---------- product to blog relations (Phase 22/23 preview) ---------- */

    function linkedBlogs(posts, productId) {
        var id = str(productId);
        var out = [];
        for (var i = 0; i < (posts || []).length; i++) {
            var rel = posts[i] && posts[i].relatedProductIds;
            if (Array.isArray(rel)) {
                for (var j = 0; j < rel.length; j++) {
                    if (str(rel[j]) === id) { out.push(posts[i]); break; }
                }
            }
        }
        return out;
    }

    /* Source-of-truth status (Phase 11): approved content wins over the
       supplier description once a human has published a content draft. */
    function contentStatus(product) {
        var p = product || {};
        var approved = p.contentStatus === 'published' || (p.content && p.content.approvedAt);
        return {
            hasApproved: !!approved,
            hasDraft: !!(p.contentDraft || (p.content && !approved)),
            state: approved ? 'published' : (p.contentDraft || p.content ? 'draft' : 'none'),
            updatedAt: approved && p.content ? (p.content.approvedAt || p.content.updatedAt || null) : (p.contentDraft ? p.contentDraft.updatedAt : null)
        };
    }

    return {
        context: context,
        brief: brief,
        briefOf: briefOf,
        matchProducts: matchProducts,
        analyzeSeo: analyzeSeo,
        linkedBlogs: linkedBlogs,
        contentStatus: contentStatus,
        tokens: tokens
    };
});
