/**
 * TRENDARYO - PRODUCT SCHEMA ENGINE
 * ---------------------------------------------------------------------------
 * Phase 8 of the AI Content Engine. Builds schema.org JSON-LD for a product
 * page: Product + Offer + BreadcrumbList + AggregateRating (and reviews when
 * individual review rows exist).
 *
 * Pure and deterministic: every value comes from the product row and the
 * APPROVED content, never from the model - a schema generator that invents
 * facts is worse than none, because search engines treat it as a promise.
 * Shared by the publish API, the admin preview and the storefront page.
 */
(function (root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.TrendaryoProductSchema = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    var SITE = 'https://trendaryo.com';
    var STORE_NAME = 'Trendaryo';

    function str(v) { return String(v == null ? '' : v).trim(); }
    function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
    function esc(v) {
        return str(v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    /* JSON-LD is embedded in a script tag: keep it injectable-tag free. */
    function safeJson(value) {
        return JSON.stringify(value)
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/&/g, '\\u0026');
    }

    function categoryLabel(category) {
        var c = str(category).toLowerCase();
        var map = {
            tech: 'Electronics', fashion: 'Fashion & Accessories', home: 'Home & Living',
            lifestyle: 'Lifestyle', guides: 'Guides', sport: 'Sport & Outdoor'
        };
        if (map[c]) return map[c];
        return c ? c.charAt(0).toUpperCase() + c.slice(1) : 'Shop';
    }

    function availabilityOf(product) {
        var stock = product._stock != null ? num(product._stock) : num(product.stock);
        if (product.hidden || product.status === 'draft') return 'https://schema.org/OutOfStock';
        return stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';
    }

    /* ---------- the graph ---------- */

    function productNode(product, opts) {
        opts = opts || {};
        var seo = (opts.seo) || {};
        var content = (opts.content) || {};
        var images = [];
        if (product.image) images.push(str(product.image));
        if (Array.isArray(product.images)) {
            for (var i = 0; i < product.images.length; i++) {
                var src = str(product.images[i]);
                if (src && images.indexOf(src) < 0) images.push(src);
            }
        }

        var node = {
            '@type': 'Product',
            name: str(product.name) || 'Product',
            description: esc(content.longDescription || content.shortDescription || seo.metaDescription || product.description || ''),
            sku: str(product.sku) || '',
            mpn: str(product.sku) || undefined,
            brand: { '@type': 'Brand', name: str(product.brand) || STORE_NAME },
            category: categoryLabel(product.category),
        };
        if (images.length) node.image = images.length === 1 ? images[0] : images;

        var rating = num(product.rating);
        var reviews = num(product.reviews != null ? product.reviews : product.reviewCount);
        if (rating > 0 && reviews > 0) {
            node.aggregateRating = {
                '@type': 'AggregateRating',
                ratingValue: Math.round(rating * 10) / 10,
                reviewCount: reviews,
                bestRating: 5,
                worstRating: 1
            };
        }

        if (Array.isArray(opts.reviews) && opts.reviews.length) {
            node.review = opts.reviews.slice(0, 5).map(function (r) {
                return {
                    '@type': 'Review',
                    author: { '@type': 'Person', name: str(r.name) || 'Verified buyer' },
                    datePublished: str(r.date) || undefined,
                    reviewBody: esc(r.body || ''),
                    reviewRating: {
                        '@type': 'Rating',
                        ratingValue: num(r.rating) || 5,
                        bestRating: 5,
                        worstRating: 1
                    }
                };
            }).filter(function (r) { return r.reviewBody; });
            if (!node.review.length) delete node.review;
        }

        var price = num(product.price);
        node.offers = {
            '@type': 'Offer',
            url: str(opts.url) || (SITE + '/product.html?id=' + encodeURIComponent(str(product.id))),
            priceCurrency: str(opts.currency) || 'USD',
            price: (Math.round(price * 100) / 100).toFixed(2),
            itemCondition: 'https://schema.org/NewCondition',
            availability: availabilityOf(product),
            seller: { '@type': 'Organization', name: STORE_NAME }
        };
        if (product.oldPrice != null && num(product.oldPrice) > price) {
            node.offers.priceSpecification = {
                '@type': 'PriceSpecification',
                price: (Math.round(price * 100) / 100).toFixed(2),
                priceCurrency: str(opts.currency) || 'USD'
            };
        }
        return node;
    }

    function breadcrumbNode(product) {
        return {
            '@type': 'BreadcrumbList',
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
                { '@type': 'ListItem', position: 2, name: 'Shop', item: SITE + '/shop.html' },
                {
                    '@type': 'ListItem', position: 3,
                    name: categoryLabel(product.category),
                    item: SITE + '/shop.html?category=' + encodeURIComponent(str(product.category).toLowerCase())
                },
                {
                    '@type': 'ListItem', position: 4,
                    name: str(product.name) || 'Product',
                    item: SITE + '/product.html?id=' + encodeURIComponent(str(product.id))
                }
            ]
        };
    }

    /* Full JSON-LD document (@graph: product+offer, breadcrumb). */
    function build(product, opts) {
        opts = opts || {};
        var graph = [productNode(product, opts), breadcrumbNode(product)];
        return {
            '@context': 'https://schema.org',
            '@graph': graph
        };
    }

    /* Script-tag ready serialisation. */
    function jsonLd(product, opts) {
        return safeJson(build(product, opts));
    }

    return {
        build: build,
        jsonLd: jsonLd,
        productNode: productNode,
        breadcrumbNode: breadcrumbNode,
        categoryLabel: categoryLabel,
        safeJson: safeJson
    };
});
