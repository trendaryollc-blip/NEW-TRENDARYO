'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const BlogSchema = require('../blog-schema');

const post = {
    slug: 'aurora-anc-headphones-review',
    title: 'Aurora ANC Headphones Review: The Honest Verdict',
    excerpt: 'What the specs mean in real use.',
    category: 'tech',
    author: 'Trendaryo Editorial',
    coverImage: 'https://cdn.test/cover.jpg',
    createdAt: '2026-01-01T00:00:00.000Z',
    publishedAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-02T00:00:00.000Z',
    seo: {
        metaTitle: 'Aurora ANC Headphones Review | Trendaryo',
        metaDescription: 'Specs that matter, the verified rating, and whether it earns the price.',
        keywords: ['anc headphones', 'noise cancelling']
    }
};

const faqs = [
    { q: 'How loud is the ANC?', a: 'Most low-frequency noise, gone.' },
    { q: 'Can I return it?', a: 'Yes - 30 days, unused.' }
];

test('blog schema: article node carries the approved post facts', () => {
    const node = BlogSchema.articleNode(post);
    assert.strictEqual(node['@type'], 'Article');
    assert.strictEqual(node.headline, 'Aurora ANC Headphones Review | Trendaryo', 'meta title wins as headline');
    assert.strictEqual(node.datePublished, post.publishedAt);
    assert.strictEqual(node.dateModified, post.updatedAt);
    assert.strictEqual(node.publisher.name, 'Trendaryo');
    assert.strictEqual(node.keywords, 'anc headphones, noise cancelling');
    assert.strictEqual(node.image, 'https://cdn.test/cover.jpg');
    assert.match(node.description, /Specs that matter/);
});

test('blog schema: faq node is built from approved FAQs only', () => {
    const node = BlogSchema.faqNode(faqs);
    assert.strictEqual(node['@type'], 'FAQPage');
    assert.strictEqual(node.mainEntity.length, 2);
    assert.strictEqual(node.mainEntity[0].name, 'How loud is the ANC?');
    assert.strictEqual(node.mainEntity[0].acceptedAnswer.text, 'Most low-frequency noise, gone.');
});

test('blog schema: incomplete FAQ rows are dropped, empty faqs return null', () => {
    const node = BlogSchema.faqNode([{ q: 'answer only', a: '' }, { q: '', a: 'orphan' }]);
    assert.strictEqual(node.mainEntity.length, 0);
    assert.strictEqual(BlogSchema.faqNode([]), null);
    assert.strictEqual(BlogSchema.faqNode(undefined), null);
});

test('blog schema: build produces Article + Breadcrumb (+ FAQ when present)', () => {
    const graph = BlogSchema.build(post, { faqs });
    assert.strictEqual(graph['@context'], 'https://schema.org');
    assert.strictEqual(graph['@graph'].length, 3);
    assert.deepStrictEqual(graph['@graph'].map((n) => n['@type']), ['Article', 'BreadcrumbList', 'FAQPage']);

    const noFaqs = BlogSchema.build(post, {});
    assert.strictEqual(noFaqs['@graph'].length, 2, 'no FAQPage without approved FAQs');
});

test('blog schema: breadcrumb walks Home > Blog > Category > Post', () => {
    const bc = BlogSchema.breadcrumbNode(post);
    assert.strictEqual(bc['@type'], 'BreadcrumbList');
    assert.strictEqual(bc.itemListElement[1].name, 'Blog');
    assert.strictEqual(bc.itemListElement[2].name, 'Tech');
    assert.strictEqual(bc.itemListElement[3].name, post.title);
});

test('blog schema: jsonLd is script-tag safe', () => {
    const ld = BlogSchema.jsonLd(Object.assign({}, post, { title: '</script><img src=x>' }));
    assert.ok(ld.indexOf('</script>') < 0);
    assert.ok(ld.indexOf('\\u003c') >= 0);
});
