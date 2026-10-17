/**
 * TRENDARYO - BLOG SCHEMA ENGINE
 * ---------------------------------------------------------------------------
 * Phase 8/21 for articles: schema.org JSON-LD for a blog post - Article +
 * FAQPage (from the approved FAQs) + BreadcrumbList.
 *
 * Pure and deterministic: values come from the stored post and its approved
 * FAQs. Shared by the publish API, the admin preview and the storefront page.
 */
(function (root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.TrendaryoBlogSchema = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    var SITE = 'https://trendaryo.com';
    var STORE_NAME = 'Trendaryo';

    function str(v) { return String(v == null ? '' : v).trim(); }
    function esc(v) {
        return str(v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function safeJson(value) {
        return JSON.stringify(value)
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/&/g, '\\u0026');
    }

    function articleNode(post) {
        var url = str(post.url) || (SITE + '/blog-post.html?slug=' + encodeURIComponent(str(post.slug || post.id)));
        var node = {
            '@type': 'Article',
            headline: str(post.seo && post.seo.metaTitle) || str(post.title) || 'Article',
            description: esc(str(post.seo && post.seo.metaDescription) || str(post.excerpt) || ''),
            author: { '@type': 'Organization', name: STORE_NAME },
            publisher: {
                '@type': 'Organization',
                name: STORE_NAME,
                url: SITE + '/'
            },
            mainEntityOfPage: url,
            datePublished: str(post.publishedAt) || str(post.createdAt) || undefined,
            dateModified: str(post.updatedAt) || undefined
        };
        var image = str(post.coverImage);
        if (image) node.image = image.indexOf('http') === 0 ? image : SITE + '/' + image.replace(/^\/+/, '');
        var keywords = (post.seo && post.seo.keywords) || [];
        if (Array.isArray(keywords) && keywords.length) node.keywords = keywords.slice(0, 12).join(', ');
        return node;
    }

    function faqNode(faqs) {
        if (!Array.isArray(faqs) || !faqs.length) return null;
        return {
            '@type': 'FAQPage',
            mainEntity: faqs.slice(0, 20).map(function (f) {
                return {
                    '@type': 'Question',
                    name: esc(f.q || f.question || ''),
                    acceptedAnswer: { '@type': 'Answer', text: esc(f.a || f.answer || '') }
                };
            }).filter(function (q) { return q.name && q.acceptedAnswer.text; })
        };
    }

    function breadcrumbNode(post) {
        return {
            '@type': 'BreadcrumbList',
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
                { '@type': 'ListItem', position: 2, name: 'Blog', item: SITE + '/blog.html' },
                {
                    '@type': 'ListItem', position: 3,
                    name: str(post.category) ? str(post.category).charAt(0).toUpperCase() + str(post.category).slice(1) : 'Guides',
                    item: SITE + '/blog.html'
                },
                {
                    '@type': 'ListItem', position: 4,
                    name: str(post.title) || 'Article',
                    item: SITE + '/blog-post.html?slug=' + encodeURIComponent(str(post.slug || post.id))
                }
            ]
        };
    }

    /* The full document. FAQs (approved) come from the post body when stored. */
    function build(post, opts) {
        opts = opts || {};
        var graph = [articleNode(post), breadcrumbNode(post)];
        var faqs = Array.isArray(opts.faqs) ? opts.faqs : (post.faqs || []);
        var faq = faqNode(faqs);
        if (faq) graph.push(faq);
        return {
            '@context': 'https://schema.org',
            '@graph': graph
        };
    }

    function jsonLd(post, opts) {
        return safeJson(build(post, opts));
    }

    return {
        build: build,
        jsonLd: jsonLd,
        articleNode: articleNode,
        faqNode: faqNode,
        breadcrumbNode: breadcrumbNode,
        safeJson: safeJson
    };
});
