'use strict';

const test = require('node:test');
const assert = require('node:assert');

const SEO = require('../seo-analysis');

const strongBlocks = [
    { type: 'p', text: 'You do not need forty options. You need the two that survive comparison.' },
    { type: 'h2', text: 'Why anc headphones buyers choose wrong' },
    { type: 'p', text: 'The spec sheet lists numbers. The buying decision is about how those numbers land in daily use. Marketing terms are free - a verified rating is not.' },
    { type: 'h3', text: 'The row that matters' },
    { type: 'p', text: 'Bluetooth 5.3 pairs in seconds. It holds a steadier connection over a longer range.' },
    { type: 'h2', text: 'The criteria that decide' },
    { type: 'p', text: 'Map your must-haves first. Then spend on the unit that clears them without needing replacement.' },
    { type: 'h2', text: 'Head to head with the field' },
    { type: 'p', text: 'The Aurora leads on the numbers that matter at this price. The runner-up wins on one row only.' },
    { type: 'h2', text: 'Questions buyers ask' },
    { type: 'h3', text: 'How loud is the ANC?' },
    { type: 'p', text: 'Most low-frequency noise, gone.' },
    { type: 'h2', text: 'Where to go next' },
    { type: 'ul', items: ['Aurora product page (product.html?id=17)', 'The buying guide (blog.html)'] },
    { type: 'cta', title: 'See the Aurora on the shelf', href: 'product.html?id=17', label: 'View the product' },
    { type: 'product', productId: '17' }
];

function strongPayload(overrides) {
    return Object.assign({
        title: 'Aurora ANC Headphones Review: The Honest Verdict',
        excerpt: 'What the specs mean in real use.',
        metaTitle: 'Aurora ANC Headphones Review | Trendaryo',
        metaDescription: 'The anc headphones that matter: specs that count, the verified rating, and whether it earns the price. Free shipping over $50.',
        keywords: ['anc headphones', 'noise cancelling', 'bluetooth headphones'],
        blocks: strongBlocks,
        faqs: [{ q: 'How loud is the ANC?', a: 'Most low-frequency noise, gone.' }],
        images: [{ url: 'https://cdn.test/a.jpg', alt: 'Aurora ANC Headphones front view' }],
        internalLinks: [],
        schema: { '@context': 'https://schema.org', '@graph': [{ '@type': 'Article' }, { '@type': 'FAQPage' }, { '@type': 'BreadcrumbList' }] },
        wordTarget: 400
    }, overrides || {});
}

test('seo-analysis: a strong article scores well with an A grade', () => {
    const a = SEO.analyze(strongPayload());
    assert.ok(a.score >= 80, 'score was ' + a.score);
    assert.ok(['A', 'B'].includes(a.grade), 'grade was ' + a.grade);
    assert.ok(a.seoScore >= 80);
    assert.ok(a.wordCount > 60);
    assert.strictEqual(a.metrics.length, 7);
});

test('seo-analysis: keyword placement drives the keyword metric', () => {
    const good = SEO.analyze(strongPayload());
    const kw = good.metrics.find((m) => m.id === 'keywords');
    assert.strictEqual(kw.score, 100, 'title + intro + h2 + both meta fields + density');

    const bad = SEO.analyze(strongPayload({
        metaTitle: 'Something else entirely',
        metaDescription: 'Nothing about the product here at all.',
        blocks: [{ type: 'p', text: 'A post about something else entirely.' }]
    }));
    const kw2 = bad.metrics.find((m) => m.id === 'keywords');
    assert.ok(kw2.score < 50, 'score was ' + kw2.score);
});

test('seo-analysis: meta length bounds are enforced', () => {
    const a = SEO.analyze(strongPayload({ metaTitle: 'Too short', metaDescription: 'Too short' }));
    const meta = a.metrics.find((m) => m.id === 'meta');
    assert.strictEqual(meta.score, 40, 'both fields present but undersized');
    assert.match(meta.hint, /30-60/);
});

test('seo-analysis: header structure flags thin and bloated bodies', () => {
    const thin = SEO.analyze(strongPayload({ blocks: [{ type: 'h2', text: 'Only one' }, { type: 'p', text: 'Body.' }] }));
    const headers = thin.metrics.find((m) => m.id === 'headers');
    assert.ok(headers.score < 80, 'one H2 keeps most points off');
    assert.match(headers.hint, /Fewer than 3/);

    const none = SEO.analyze(strongPayload({ blocks: [{ type: 'p', text: 'No headers at all here.' }] }));
    const headers2 = none.metrics.find((m) => m.id === 'headers');
    assert.ok(headers2.score < 40, 'zero H2s scores low');

    const bloated = SEO.analyze(strongPayload({
        blocks: Array.from({ length: 10 }, (_, i) => ({ type: 'h2', text: 'Section number ' + (i + 1) })).concat([{ type: 'p', text: 'Body.' }])
    }));
    const headers3 = bloated.metrics.find((m) => m.id === 'headers');
    assert.match(headers3.hint, /More than 8/);
});

test('seo-analysis: link structure counts cta + product blocks and internal links', () => {
    const a = SEO.analyze(strongPayload({ internalLinks: [{ anchor: 'Guide', path: 'blog.html', why: 'context' }] }));
    const links = a.metrics.find((m) => m.id === 'links');
    assert.strictEqual(links.score, 100, 'three internal link anchors, a cta and a product block');

    const two = SEO.analyze(strongPayload());
    const links2 = two.metrics.find((m) => m.id === 'links');
    assert.strictEqual(links2.score, 70, 'cta + product block, but only two link anchors');

    const bare = SEO.analyze(strongPayload({ blocks: [{ type: 'p', text: 'Just a paragraph with no links anywhere.' }] }));
    const links3 = bare.metrics.find((m) => m.id === 'links');
    assert.strictEqual(links3.score, 0);
    assert.match(links3.hint, /Add 3-5/);
});

test('seo-analysis: images without alt text score zero and link suggestions fire', () => {
    const a = SEO.analyze(strongPayload({ images: [{ url: 'https://cdn.test/a.jpg', alt: '' }] }));
    const images = a.metrics.find((m) => m.id === 'images');
    assert.strictEqual(images.score, 0);
    assert.match(images.hint, /missing alt/);

    const none = SEO.analyze(strongPayload({ images: [] }));
    const images2 = none.metrics.find((m) => m.id === 'images');
    assert.strictEqual(images2.score, 0);
});

test('seo-analysis: schema metric rewards the publish-time graph', () => {
    const a = SEO.analyze(strongPayload({ schema: null }));
    const schema = a.metrics.find((m) => m.id === 'schema');
    assert.strictEqual(schema.score, 0);
    assert.strictEqual(SEO.analyze(strongPayload()).metrics.find((m) => m.id === 'schema').score, 100);
});

test('seo-analysis: depth and expand/shorten suggestions track the word target', () => {
    const short = SEO.analyze(strongPayload({ wordTarget: 4000 }));
    assert.ok(short.suggestions.some((s) => s.action === 'expand'), 'thin article offers expand');
    assert.ok(!short.suggestions.some((s) => s.action === 'shorten'));
    const depth = short.metrics.find((m) => m.id === 'depth');
    assert.ok(depth.score < 30);

    const long = SEO.analyze(strongPayload({ wordTarget: 20, faqs: [
        { q: 'a', a: 'b' }, { q: 'c', a: 'd' }, { q: 'e', a: 'f' }, { q: 'g', a: 'h' }, { q: 'i', a: 'j' }
    ] }));
    assert.ok(long.suggestions.some((s) => s.action === 'shorten'), 'bloated article offers shorten');
});

test('seo-analysis: readability scores dense prose low and offers the rewrite', () => {
    const dense = SEO.analyze(strongPayload({
        blocks: [{
            type: 'p',
            text: 'The specification sheet comprehensively enumerates an extraordinary multiplicity of indistinguishable characteristics which, notwithstanding the considerable marketing enthusiasm surrounding them, contribute approximately nothing whatsoever to the quotidian utilisation of the aforementioned apparatus in a conventional domestic environment.'
        }]
    }));
    assert.ok(dense.readabilityScore < 60, 'score was ' + dense.readabilityScore);
    assert.ok(dense.readability.longSentences >= 1);
    assert.ok(dense.readability.score < 40);
    assert.ok(dense.suggestions.some((s) => s.action === 'readability'));
});

test('seo-analysis: simple prose scores readability high', () => {
    const a = SEO.analyze(strongPayload());
    assert.ok(a.readability.score >= 50, 'flesch was ' + a.readability.score);
    assert.ok(['simple', 'moderate'].includes(a.readability.level));
});

test('seo-analysis: tone rewrites are always offered, faqs when thin', () => {
    const a = SEO.analyze(strongPayload({ faqs: [] }));
    for (const action of ['tone-luxury', 'tone-technical', 'tone-sales']) {
        assert.ok(a.suggestions.some((s) => s.action === action), action + ' offered');
    }
    assert.ok(a.suggestions.some((s) => s.action === 'faqs'));
});

test('seo-analysis: empty payload does not throw and scores zero-ish', () => {
    const a = SEO.analyze({});
    assert.strictEqual(a.wordCount, 0);
    assert.ok(a.score < 40);
    assert.ok(a.suggestions.length > 0);
});

test('seo-analysis: legacy plain content works without blocks', () => {
    const a = SEO.analyze({
        title: 'Plain post', content: 'First paragraph here.\n\nSecond paragraph follows it. It is still short.',
        metaTitle: 'Plain post | Trendaryo', metaDescription: 'A plain post about things that matter to someone somewhere.',
        keywords: ['plain post'], wordTarget: 100
    });
    assert.ok(a.wordCount > 10);
    assert.ok(a.metrics.every((m) => typeof m.score === 'number'));
});
