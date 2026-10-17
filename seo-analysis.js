/**
 * TRENDARYO - SEO ANALYSIS ENGINE
 * ---------------------------------------------------------------------------
 * Phase 18 of the AI Content Engine. Deterministic scoring for an article or
 * a product content draft: SEO score, readability score, keyword
 * optimisation, header structure, link structure, schema status, image SEO
 * and content depth - plus the concrete improvement actions (Phase 19) the
 * score justifies.
 *
 * Pure functions, no DOM: shared by the admin Blog Studio, the Blog
 * Generator, the Product Details page and the test suite.
 *
 * Input shape (everything optional - missing data scores as a gap):
 *   {
 *     title, excerpt, metaTitle, metaDescription,
 *     keywords: [], primaryKeyword,
 *     blocks: [{ type:'h2'|'h3'|'p'|'ul'|'cta'|'product'|'quote', text|items|href }],
 *     faqs: [{ q, a }],
 *     images: [{ url, alt }],
 *     internalLinks: [{ anchor, path }],
 *     schema: object|null,
 *     wordTarget: 1200
 *   }
 */
(function (root, factory) {
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.TrendaryoSeoAnalysis = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    /* ---------- text helpers ---------- */

    function str(v) { return String(v == null ? '' : v).trim(); }
    function words(text) {
        return str(text).split(/\s+/).filter(Boolean);
    }
    function sentences(text) {
        var parts = str(text).split(/[.!?]+(?:\s|$)/);
        return parts.filter(function (s) { return s.trim().length > 1; });
    }
    function syllables(word) {
        var w = String(word || '').toLowerCase().replace(/[^a-z]/g, '');
        if (!w) return 0;
        if (w.length <= 3) return 1;
        w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
        w = w.replace(/^y/, '');
        var groups = w.match(/[aeiouy]{1,2}/g);
        return groups ? groups.length : 1;
    }
    function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

    function blockText(b) {
        if (!b) return '';
        if (b.type === 'ul' && Array.isArray(b.items)) return b.items.join(' ');
        if (b.type === 'product' || b.type === 'img') return '';
        return str(b.text);
    }

    /* Pull the plain text + structure out of a blog-blocks array (or legacy
       plain content passed as { content: '...' }). */
    function readPayload(p) {
        var p2 = p || {};
        var blocks = Array.isArray(p2.blocks) ? p2.blocks : [];
        var h1 = [], h2 = [], h3 = [], paragraphs = [], links = 0;
        var bodyText = '';
        var i, b;
        for (i = 0; i < blocks.length; i++) {
            b = blocks[i];
            var t = blockText(b);
            if (b.type === 'h2') { h2.push(t); }
            else if (b.type === 'h3') { h3.push(t); }
            else if (b.type === 'ul') { if (t) paragraphs.push(t); }
            else if (b.type === 'cta') { if (b.href) links++; }
            else if (b.type === 'product') { links++; }
            else if (t) { paragraphs.push(t); }
            bodyText += (bodyText ? ' ' : '') + t;
        }
        if (!blocks.length && p2.content) {
            bodyText = str(p2.content);
            paragraphs = sentences(bodyText).map(function (s) { return s.trim(); });
        }
        var allHeaders = h1.concat(h2, h3);
        var wordList = words(bodyText + ' ' + str(p2.title) + ' ' + str(p2.excerpt));
        return {
            blocks: blocks,
            h2: h2, h3: h3, allHeaders: allHeaders,
            paragraphCount: paragraphs.length,
            bodyText: bodyText,
            wordCount: words(bodyText).length,
            allWords: wordList,
            internalLinkCount: links + (Array.isArray(p2.internalLinks) ? p2.internalLinks.length : 0),
            faqs: Array.isArray(p2.faqs) ? p2.faqs : [],
            images: Array.isArray(p2.images) ? p2.images : [],
            schema: p2.schema || null,
            keywords: Array.isArray(p2.keywords) ? p2.keywords.filter(Boolean) : [],
            primary: str(p2.primaryKeyword) || (Array.isArray(p2.keywords) && p2.keywords.length ? str(p2.keywords[0]) : ''),
            metaTitle: str(p2.metaTitle),
            metaDescription: str(p2.metaDescription),
            title: str(p2.title),
            wordTarget: Number(p2.wordTarget) || 1200
        };
    }

    /* ---------- readability (Flesch-style) ---------- */

    function readabilityOf(text) {
        var sents = sentences(text);
        var wordList = words(text);
        if (!sents.length || !wordList.length) {
            return { score: 0, avgSentenceWords: 0, longSentences: 0, level: 'unknown', words: 0, sentences: 0 };
        }
        var syllablesTotal = 0;
        for (var i = 0; i < wordList.length; i++) syllablesTotal += syllables(wordList[i]);
        var avgSentence = wordList.length / sents.length;
        var avgSyllable = syllablesTotal / wordList.length;
        var flesch = 206.835 - 1.015 * avgSentence - 84.6 * avgSyllable;
        var longSentences = 0;
        for (var j = 0; j < sents.length; j++) {
            if (words(sents[j]).length > 30) longSentences++;
        }
        var level = avgSentence <= 18 ? 'simple' : (avgSentence <= 24 ? 'moderate' : 'dense');
        /* Map Flesch to a 0-100 editorial score. */
        var score = Math.round(clamp((flesch - 20) * 1.15, 0, 100));
        return {
            score: score,
            avgSentenceWords: Math.round(avgSentence * 10) / 10,
            longSentences: longSentences,
            level: level,
            words: wordList.length,
            sentences: sents.length
        };
    }

    /* ---------- metric helpers ---------- */

    function metric(id, label, score, weight, value, hint) {
        return {
            id: id, label: label,
            score: Math.round(clamp(score, 0, 100)),
            weight: weight,
            value: str(value),
            hint: str(hint)
        };
    }

    function containsPhrase(hay, needle) {
        if (!needle) return false;
        return String(hay || '').toLowerCase().indexOf(needle.toLowerCase()) >= 0;
    }

    function keywordMetric(d) {
        if (!d.primary) {
            return metric('keywords', 'Keyword optimisation', 0, 20, 'no primary keyword', 'Give the article a primary keyword - everything else scores against it.');
        }
        var kw = d.primary.toLowerCase();
        var first100 = words(d.bodyText).slice(0, 100).join(' ').toLowerCase();
        var hits = [];
        if (containsPhrase(d.title, kw)) hits.push(20);
        if (containsPhrase(first100, kw)) hits.push(20);
        if (d.h2.some(function (h) { return containsPhrase(h, kw); })) hits.push(15);
        if (containsPhrase(d.metaTitle, kw)) hits.push(15);
        if (containsPhrase(d.metaDescription, kw)) hits.push(15);
        var occurrences = (d.bodyText.toLowerCase().match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        var density = d.wordCount ? (occurrences * words(kw).length) / d.wordCount * 100 : 0;
        if (density >= 0.4 && density <= 2.5) hits.push(15);
        var score = hits.reduce(function (a, b) { return a + b; }, 0);
        var value = 'keyword in title/intro/H2/meta, density ' + (Math.round(density * 10) / 10) + '%';
        var hint = density > 2.5
            ? 'Keyword density is ' + (Math.round(density * 10) / 10) + '% - trim mentions to stay under 2.5%.'
            : (hits.length < 4 ? 'Use the primary keyword in the title, the first 100 words, one H2 and both meta fields.' : 'Placement and density are healthy.');
        return metric('keywords', 'Keyword optimisation', score, 20, value, hint);
    }

    function metaMetric(d) {
        var t = d.metaTitle, desc = d.metaDescription;
        var score = 0;
        if (t.length >= 30 && t.length <= 60) score += 50;
        else if (t.length > 0) score += 20;
        if (desc.length >= 70 && desc.length <= 155) score += 50;
        else if (desc.length > 0) score += 20;
        var value = t ? 'title ' + t.length + ' chars' : 'no meta title';
        if (desc) value += ' - description ' + desc.length + ' chars';
        var hint = 'Meta title 30-60 characters, description 70-155. ' +
            (desc ? '' : 'Write a meta description with a benefit and a reason to click.');
        return metric('meta', 'Meta quality', score, 15, value, hint);
    }

    function headersMetric(d) {
        var h2n = d.h2.length;
        var score = 0;
        if (h2n >= 3 && h2n <= 8) score += 50;
        else if (h2n >= 1) score += 25;
        var shortH2 = d.h2.filter(function (h) { return words(h).length >= 3 && words(h).length <= 9; }).length;
        if (h2n && shortH2 / h2n >= 0.6) score += 25;
        else if (h2n) score += 10;
        if (d.h3.length <= d.h2.length * 3) score += 25;
        else score += 10;
        var value = h2n + ' H2, ' + d.h3.length + ' H3';
        var hint = h2n < 3 ? 'Fewer than 3 H2 sections - crawlers and readers want 3-8.' :
            (h2n > 8 ? 'More than 8 H2 sections - consolidate for a cleaner structure.' : 'Structure is healthy.');
        return metric('headers', 'Header structure', score, 15, value, hint);
    }

    function linksMetric(d) {
        var score = 0;
        if (d.internalLinkCount >= 3) score += 60;
        else if (d.internalLinkCount >= 1) score += 30;
        if (d.blocks.some(function (b) { return b.type === 'product'; })) score += 20;
        if (d.blocks.some(function (b) { return b.type === 'cta'; })) score += 20;
        var value = d.internalLinkCount + ' internal link(s)';
        var hint = d.internalLinkCount < 3 ? 'Add 3-5 internal links (related guides, the product page, a comparison piece).' : 'Internal linking is healthy.';
        return metric('links', 'Link structure', score, 15, value, hint);
    }

    function imagesMetric(d) {
        if (!d.images.length) {
            return metric('images', 'Image SEO', 0, 10, 'no images', 'Add at least one image with descriptive alt text.');
        }
        var withAlt = d.images.filter(function (i) { return str(i.alt).length >= 10; }).length;
        var good = d.images.filter(function (i) { return str(i.alt).length >= 10 && str(i.alt).length <= 125; }).length;
        var score = Math.round((good / d.images.length) * 100);
        return metric('images', 'Image SEO', score, 10, good + '/' + d.images.length + ' images with alt text', withAlt < d.images.length ? 'Some images are missing alt text - every image needs one under 125 characters.' : 'Every image has accessible alt text.');
    }

    function schemaMetric(d) {
        var s = d.schema;
        if (!s || typeof s !== 'object') {
            return metric('schema', 'Schema status', 0, 10, 'no schema', 'Schema is generated automatically when the article is published.');
        }
        var types = (s['@graph'] || [s]).map(function (n) { return n && n['@type']; }).filter(Boolean);
        var score = types.length ? 100 : 40;
        return metric('schema', 'Schema status', score, 10, types.join(' + ') || 'present', 'Structured data is present and ships with the published article.');
    }

    function depthMetric(d) {
        var target = d.wordTarget;
        var ratio = d.wordCount / target;
        var score = ratio >= 1 ? 100 : Math.round(ratio * 100);
        return metric('depth', 'Content depth', score, 10, d.wordCount + ' words (target ' + target + ')', d.wordCount < target * 0.7 ? 'The article is well under its target length - expand the thin sections.' : 'Length is healthy for the target.');
    }

    /* ---------- the analysis ---------- */

    function analyze(payload) {
        var d = readPayload(payload);
        var readability = readabilityOf(d.bodyText);

        var metrics = [
            keywordMetric(d),
            metaMetric(d),
            headersMetric(d),
            linksMetric(d),
            imagesMetric(d),
            schemaMetric(d),
            depthMetric(d)
        ];

        var totalWeight = metrics.reduce(function (a, m) { return a + m.weight; }, 0);
        var weighted = metrics.reduce(function (a, m) { return a + m.score * m.weight; }, 0);
        var seoScore = Math.round(weighted / totalWeight);
        var combined = Math.round(seoScore * 0.85 + readability.score * 0.15);

        return {
            score: combined,
            seoScore: seoScore,
            readabilityScore: readability.score,
            grade: combined >= 85 ? 'A' : (combined >= 70 ? 'B' : (combined >= 55 ? 'C' : 'D')),
            wordCount: d.wordCount,
            readability: readability,
            metrics: metrics,
            suggestions: suggestionsFor(d, metrics, readability),
            summary: d.h2.length + ' sections, ' + d.wordCount + ' words, ' + d.internalLinkCount + ' internal links, ' + d.faqs.length + ' FAQs'
        };
    }

    /* Phase 19: only offer the improvements the score justifies. */
    function suggestionsFor(d, metrics, readability) {
        var out = [];
        function byId(id) {
            for (var i = 0; i < metrics.length; i++) if (metrics[i].id === id) return metrics[i];
            return null;
        }
        var kw = byId('keywords');
        if (kw && kw.score < 70) out.push({ action: 'improve-seo', label: 'Improve SEO', hint: 'Tighten keyword placement in the title, intro, H2s and meta without keyword stuffing.' });
        if (d.wordCount < d.wordTarget * 0.7) out.push({ action: 'expand', label: 'Expand content', hint: 'Add grounded sections until the article reaches its target length.' });
        if (d.wordCount > d.wordTarget * 1.4) out.push({ action: 'shorten', label: 'Shorten content', hint: 'Trim repetition while keeping every fact.' });
        if (d.faqs.length < 4) out.push({ action: 'faqs', label: 'Regenerate FAQs', hint: 'Write the buyer questions this article does not answer yet.' });
        if (!d.keywords.length || d.keywords.length < 5) out.push({ action: 'keywords', label: 'Add more keywords', hint: 'Mine secondary and long-tail phrases from the approved product facts.' });
        if (d.internalLinkCount < 3) out.push({ action: 'links', label: 'Add internal links', hint: 'Point to the product page, related guides and the comparison coverage.' });
        if (!d.blocks.some(function (b) { return b.type === 'h3'; })) out.push({ action: 'comparison', label: 'Generate comparison', hint: 'Add a side-by-side comparison block on the criteria that matter.' });
        if (readability.score < 60) out.push({ action: 'readability', label: 'Improve readability', hint: 'Shorten long sentences and split dense paragraphs.' });
        out.push({ action: 'tone-luxury', label: 'Rewrite luxury', hint: 'Refined, craftsmanship-forward voice.' });
        out.push({ action: 'tone-technical', label: 'Rewrite technical', hint: 'Specification-led voice for comparison readers.' });
        out.push({ action: 'tone-sales', label: 'Rewrite sales focused', hint: 'Outcome-first voice that leads with buyer value.' });
        return out;
    }

    return {
        analyze: analyze,
        readabilityOf: readabilityOf,
        readPayload: readPayload,
        syllables: syllables
    };
});
