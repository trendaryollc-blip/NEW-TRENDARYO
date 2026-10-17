'use strict';

/* The AI engine is a browser module; eval it with a minimal window shim so
   the Offline Studio generators (the no-API-key path every admin falls back
   to) are covered by the same node:test suite. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

global.window = global;

global.TrendaryoAdminStore = {
    settings: () => ({ aiProvider: 'offline', aiTone: 'confident', lowStock: 5 }),
    aiHistory: () => [],
    aiAdd: () => {},
};
global.TrendaryoProducts = {
    categoryOf: (p) => p.category || 'general',
    specs: (p) => p.specs || [],
    stars: () => '',
};
global.TrendaryoAdminApp = { toast: () => {} };

eval(fs.readFileSync(path.join(__dirname, '..', 'admin', 'core', 'product-context.js'), 'utf8'));
eval(fs.readFileSync(path.join(__dirname, '..', 'admin', 'core', 'ai.js'), 'utf8'));

const AI = global.TrendaryoAdminAI;

const product = {
    id: 17,
    name: 'Aurora ANC Headphones',
    category: 'tech',
    brand: 'Aurora',
    price: 149,
    oldPrice: 199,
    rating: 4.6,
    reviews: 128,
    description: 'Hybrid noise cancelling over-ear headphones with a 40-hour battery life and multipoint Bluetooth.',
    specs: [['Bluetooth', '5.3'], ['Battery', '40 hours'], ['Noise cancelling', 'Hybrid ANC'], ['Warranty', '2 years']],
    image: 'https://cdn.test/a.jpg'
};

test('ai tasks: the product page engine tasks are registered as JSON', () => {
    for (const key of ['productPage', 'featureBenefits', 'imageSeo', 'productSeoFull']) {
        assert.ok(AI.TASKS[key], key + ' registered');
        assert.strictEqual(AI.TASKS[key].json, true, key + ' declares json output');
    }
    assert.ok(AI.TASKS.productPage.maxTokens >= 3000, 'product page asks for a big token budget');
    assert.ok(AI.TASKS.productPage.seconds >= 60, 'product page allows a longer generation window');
});

test('ai tasks: offline productPage returns every section, grounded in the specs', async () => {
    const res = await AI.run('productPage', { product }, { silent: true });
    assert.ok(res.data, 'output parses as JSON');
    const d = res.data;
    for (const key of ['title', 'shortDescription', 'longDescription', 'features', 'benefits', 'useCases', 'whyChoose', 'specifications', 'faqs', 'shipping', 'returns', 'summary']) {
        assert.ok(key in d, 'section present: ' + key);
    }
    assert.ok(d.title.includes('Aurora'), 'title leads with the product');
    assert.ok(d.specifications.length === 4, 'specs copied from the brief');
    assert.ok(d.benefits.some((b) => /bluetooth/i.test(b)), 'benefit derived from the Bluetooth spec');
    assert.ok(/5\.3/.test(d.benefits.find((b) => /bluetooth/i.test(b))), 'benefit quotes the real spec value');
    assert.ok(/24 hours/.test(d.shipping) && /30 days/.test(d.returns), 'store promises included');
    assert.ok(/Aurora/.test(d.longDescription), 'long description grounded in the product');
    assert.strictEqual(res.provider, 'offline');
});

test('ai tasks: offline featureBenefits converts each spec to an honest sentence', async () => {
    const res = await AI.run('featureBenefits', { product }, { silent: true });
    const rows = res.data.benefits;
    assert.strictEqual(rows.length, 4, 'one benefit per spec');
    const bt = rows.find((r) => /bluetooth/i.test(r.spec));
    assert.match(bt.benefit, /pairs in seconds/);
    const battery = rows.find((r) => /battery/i.test(r.spec));
    assert.match(battery.benefit, /40 hours/);
    assert.ok(battery.benefit.length > 20, 'benefit is a sentence, not a copy of the label');
});

test('ai tasks: offline imageSeo writes alt, seoAlt, caption and description per image', async () => {
    const res = await AI.run('imageSeo', {
        context: { productName: 'Aurora ANC Headphones', category: 'tech', description: product.description },
        images: ['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg']
    }, { silent: true });
    const imgs = res.data.images;
    assert.strictEqual(imgs.length, 2);
    for (const img of imgs) {
        assert.ok(img.alt.length > 5 && img.seoAlt.length > 5 && img.caption.length > 5 && img.description.length > 5);
    }
    assert.ok(imgs[0].alt.includes('Aurora ANC Headphones'));
});

test('ai tasks: offline productSeoFull fills the Phase 7 package', async () => {
    const res = await AI.run('productSeoFull', { product }, { silent: true });
    const d = res.data;
    assert.ok(d.metaTitle.length <= 60 && d.metaTitle.includes('Aurora'));
    assert.ok(d.metaDescription.length <= 155);
    assert.ok(d.keywords.length >= 5 && Array.isArray(d.longTailKeywords));
    assert.ok(['informational', 'commercial', 'transactional', 'navigational'].includes(d.searchIntent));
    assert.strictEqual(d.canonicalUrl, '', 'canonical is left for the server to stamp');
    assert.ok(d.twitter && d.twitter.card);
    assert.ok(d.ogTitle && d.ogDescription);
});

test('ai tasks: the articleRevise task is registered with a big budget', () => {
    assert.ok(AI.TASKS.articleRevise, 'articleRevise registered');
    assert.strictEqual(AI.TASKS.articleRevise.json, true);
    assert.ok(AI.TASKS.articleRevise.maxTokens >= 3000);
    assert.ok(AI.TASKS.articleRevise.seconds >= 60);
});

const reviseArticle = {
    seoTitle: 'Aurora ANC Headphones Review: The Honest Verdict',
    metaTitle: 'Aurora ANC Headphones Review | Trendaryo',
    metaDescription: 'Specs that matter and the verified rating.',
    sections: [
        { h2: 'Why buyers choose wrong', paragraphs: ['The spec sheet lists numbers; the buying decision is about how those numbers land in daily use, and marketing terms are free while a verified rating is not.'], h3s: [] },
        { h2: 'The criteria that decide', paragraphs: ['Map your must-haves first, then spend on the unit that clears them without needing replacement for a very long time indeed.'], h3s: [] }
    ],
    faqs: [{ q: 'How loud is the ANC?', a: 'Most low-frequency noise, gone.' }]
};

test('ai tasks: offline articleRevise improves SEO deterministically', async () => {
    const res = await AI.run('articleRevise', {
        action: 'improve-seo',
        article: reviseArticle,
        primaryKeyword: 'anc headphones',
        keywords: ['anc headphones', 'noise cancelling']
    }, { silent: true });
    const d = res.data;
    assert.ok(d.metaTitle.length <= 60);
    assert.ok(d.metaDescription.length <= 155);
    assert.ok(d.metaTitle.toLowerCase().includes('anc headphones'), 'meta leads with the primary keyword');
    assert.ok(d.keywords.length >= 1);
});

test('ai tasks: offline articleRevise expands with grounded sections', async () => {
    const res = await AI.run('articleRevise', { action: 'expand', article: reviseArticle, product }, { silent: true });
    assert.strictEqual(res.data.sections.length, 2);
    assert.ok(res.data.sections.every((s) => s.h2), 'every added section has a heading');
    assert.ok(/Bluetooth/.test(JSON.stringify(res.data)) || /24 hours/.test(JSON.stringify(res.data)), 'expansion quotes real catalogue data');
});

test('ai tasks: offline articleRevise shortens to the first sentences', async () => {
    const res = await AI.run('articleRevise', { action: 'shorten', article: reviseArticle }, { silent: true });
    const paras = (res.data.sections || []).flatMap((s) => s.paragraphs);
    assert.ok(paras.length === 2);
    assert.ok(paras.every((p) => (p.match(/[.!?]/g) || []).length <= 2), 'each paragraph is the opening thought');
});

test('ai tasks: offline articleRevise rebuilds FAQs to a healthy set', async () => {
    const res = await AI.run('articleRevise', { action: 'faqs', article: { faqs: [{ q: 'One question?', a: 'An answer.' }] } }, { silent: true });
    assert.ok(res.data.faqs.length >= 4, 'store-truth FAQs are added');
    assert.ok(res.data.faqs.every((f) => f.q && f.a));
});

test('ai tasks: offline articleRevise mines keywords and internal links', async () => {
    const kw = await AI.run('articleRevise', { action: 'keywords', product }, { silent: true });
    assert.ok(kw.data.keywords.length >= 3);
    assert.ok(kw.data.longTailKeywords.length >= 3);

    const links = await AI.run('articleRevise', { action: 'links', product }, { silent: true });
    assert.ok(links.data.internalLinks.length >= 3, 'product page + guides + shelf');
    assert.ok(links.data.internalLinks.every((l) => l.anchor && l.path));
});

test('ai tasks: offline articleRevise comparisons and tones stay grounded', async () => {
    const cmp = await AI.run('articleRevise', { action: 'comparison', product }, { silent: true });
    assert.ok(cmp.data.comparison.length >= 4);
    assert.ok(cmp.data.section.h2, 'the comparison rides its own section');

    const luxury = await AI.run('articleRevise', { action: 'tone-luxury', article: reviseArticle, product }, { silent: true });
    assert.ok(luxury.data.introduction.includes('Aurora'), 'the tone rewrite names the product');
    assert.ok(luxury.data.conclusion, 'the tone rewrite closes');

    const readable = await AI.run('articleRevise', { action: 'readability', article: reviseArticle }, { silent: true });
    const longOnes = (readable.data.sections || []).flatMap((s) => s.paragraphs).filter((p) => p.split(/\s+/).length > 30);
    assert.strictEqual(longOnes.length, 0, 'no runaway sentences after the pass');
});

test('ai tasks: offline articleRevise never drops the article for unknown actions', async () => {
    const res = await AI.run('articleRevise', { action: 'nonsense', article: reviseArticle }, { silent: true });
    assert.strictEqual(res.data.sections.length, 2, 'the body passes through untouched');
});

test('ai tasks: prompts use the shared Product Context Engine brief', () => {
    const sys = AI.TASKS.productPage.build({ product });
    assert.match(sys, /Specifications: Bluetooth: 5\.3; Battery: 40 hours/);
    assert.match(sys, /Rating: 4\.6\/5 from 128/);
    assert.ok(!/cost|reorder/i.test(sys), 'internal ops fields never reach a prompt');
});
