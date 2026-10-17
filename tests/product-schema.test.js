'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const ProductSchema = require('../product-schema');

const product = {
    id: 'p1',
    name: 'Aurora ANC Headphones',
    category: 'tech',
    brand: 'Aurora',
    price: 149,
    oldPrice: 199,
    rating: 4.6,
    reviews: 128,
    stock: 12,
    sku: 'AUR-1',
    description: 'Hybrid noise cancelling over-ear headphones.',
    image: 'https://cdn.test/a.jpg',
    images: ['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg'],
    specs: [['Bluetooth', '5.3'], ['Battery', '40h'], ['Weight', '250g']]
};

const goodSections = {
    title: 'Aurora ANC Headphones - quiet that lasts | Trendaryo',
    shortDescription: 'Hybrid noise cancelling headphones with a 40-hour battery.',
    longDescription: 'First paragraph about noise cancelling.\n\nSecond paragraph about the battery.',
    features: ['Hybrid ANC', '40-hour battery', 'Bluetooth 5.3'],
    benefits: ['Drops the commute noise', 'Lasts the working week'],
    useCases: ['Open-plan offices'],
    whyChoose: 'It beat its alternatives on rating and review volume.',
    specifications: [{ label: 'Bluetooth', value: '5.3' }],
    shipping: 'Packed within 24 hours, 5-7 working days, free over $50.',
    returns: '30 days, unused, original packaging.',
    summary: 'The vetted quiet pick at $149.'
};

const goodFaqs = [{ q: 'How loud is the ANC?', a: 'It removes most low-frequency noise.' }];

function draftBody(overrides = {}) {
    return {
        sections: Object.assign({}, goodSections, (overrides.sections || {})),
        faqs: overrides.faqs || goodFaqs,
        images: overrides.images || [{ url: 'https://cdn.test/a.jpg', alt: 'Front view', seoAlt: 'Aurora ANC Headphones front view', caption: 'As it ships', description: 'Primary product image.' }],
        seo: overrides.seo
    };
}

test('schema: product node carries approved facts only', () => {
    const node = ProductSchema.productNode(product, { content: goodSections });
    assert.strictEqual(node['@type'], 'Product');
    assert.strictEqual(node.name, 'Aurora ANC Headphones');
    assert.strictEqual(node.sku, 'AUR-1');
    assert.strictEqual(node.brand.name, 'Aurora');
    assert.deepStrictEqual(node.image, ['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg']);
    assert.strictEqual(node.aggregateRating.ratingValue, 4.6);
    assert.strictEqual(node.aggregateRating.reviewCount, 128);
    assert.strictEqual(node.offers.price, '149.00');
    assert.strictEqual(node.offers.priceCurrency, 'USD');
    assert.strictEqual(node.offers.availability, 'https://schema.org/InStock');
    assert.ok(node.description.includes('First paragraph'), 'approved long description is used');
});

test('schema: hidden products are OutOfStock and oldPrice loses the offer price', () => {
    const hidden = ProductSchema.productNode(Object.assign({}, product, { hidden: true }));
    assert.strictEqual(hidden.offers.availability, 'https://schema.org/OutOfStock');
    const cheap = ProductSchema.productNode(product);
    assert.strictEqual(cheap.offers.price, '149.00');
});

test('schema: breadcrumb walks Home > Shop > Category > Product', () => {
    const bc = ProductSchema.breadcrumbNode(product);
    assert.strictEqual(bc['@type'], 'BreadcrumbList');
    assert.strictEqual(bc.itemListElement.length, 4);
    assert.strictEqual(bc.itemListElement[0].name, 'Home');
    assert.strictEqual(bc.itemListElement[2].name, 'Electronics');
    assert.strictEqual(bc.itemListElement[3].name, 'Aurora ANC Headphones');
});

test('schema: build wraps product + breadcrumb in one @graph', () => {
    const graph = ProductSchema.build(product, {});
    assert.strictEqual(graph['@context'], 'https://schema.org');
    assert.strictEqual(graph['@graph'].length, 2);
    assert.strictEqual(graph['@graph'][0]['@type'], 'Product');
    assert.strictEqual(graph['@graph'][1]['@type'], 'BreadcrumbList');
});

test('schema: jsonLd is script-tag safe', () => {
    const ld = ProductSchema.jsonLd({ id: 9, name: '</script><img src=x>', price: 10 }, {});
    assert.ok(ld.indexOf('</script>') < 0, 'no closing script tag in payload');
    assert.ok(ld.indexOf('\\u003c') >= 0, 'angle brackets are escaped');
    assert.ok(ld.indexOf('\\u0026') >= 0 || ld.indexOf('&') < 0, 'ampersands escaped');
});

test('schema: no rating means no aggregateRating (never invent one)', () => {
    const node = ProductSchema.productNode({ id: 9, name: 'Fresh', price: 10, rating: 0, reviews: 0 }, {});
    assert.ok(!node.aggregateRating, 'aggregateRating omitted without ratings');
});
