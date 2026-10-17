const test = require('node:test');
const assert = require('node:assert');

const PC = require('../admin/core/product-context');

const product = {
    id: 17,
    name: 'Aurora ANC Headphones',
    category: 'tech',
    brand: 'Aurora',
    price: 149,
    oldPrice: 199,
    description: 'Hybrid noise cancelling over-ear headphones with a 40-hour battery.',
    specs: [['Bluetooth', '5.3'], ['Battery', '40h'], { label: 'Weight', value: '250g' }],
    image: 'https://cdn.test/a.jpg',
    images: ['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg'],
    tags: ['audio', 'anc'],
    rating: 4.6,
    reviews: 128,
    stock: 12,
    sku: 'AUR-17',
    supplierId: 'sup-9',
    leadTimeDays: 5,
    costPrice: 42,
    reorderPoint: 4
};

test('product-context: context() builds the canonical object', () => {
    const ctx = PC.context(product);
    assert.strictEqual(ctx.productId, '17');
    assert.strictEqual(ctx.productName, 'Aurora ANC Headphones');
    assert.strictEqual(ctx.category, 'tech');
    assert.strictEqual(ctx.brand, 'Aurora');
    assert.strictEqual(ctx.sku, 'AUR-17');
    assert.strictEqual(ctx.price, 149);
    assert.strictEqual(ctx.compareAtPrice, 199);
    assert.strictEqual(ctx.currency, 'USD');
    assert.strictEqual(ctx.url, 'product.html?id=17');
    assert.strictEqual(ctx.stock, 12);
    assert.strictEqual(ctx.supplier.supplierId, 'sup-9');
    assert.strictEqual(ctx.supplier.leadTimeDays, 5);
});

test('product-context: specifications normalise pairs and {label,value} rows', () => {
    const specs = PC.context(product).specifications;
    assert.strictEqual(specs.length, 3);
    assert.deepStrictEqual(specs[0], { label: 'Bluetooth', value: '5.3' });
    assert.deepStrictEqual(specs[2], { label: 'Weight', value: '250g' });
});

test('product-context: images dedupe the cover image', () => {
    const images = PC.context(product).images;
    assert.deepStrictEqual(images, ['https://cdn.test/a.jpg', 'https://cdn.test/b.jpg']);
});

test('product-context: internal ops fields never reach the context object or a brief', () => {
    const ctx = PC.context(product);
    assert.ok(!('costPrice' in ctx), 'costPrice must not be exposed');
    assert.ok(!('reorderPoint' in ctx), 'reorderPoint must not be exposed');
    const brief = PC.brief(ctx).toLowerCase();
    assert.ok(brief.indexOf('cost') < 0, 'brief must not mention cost');
    assert.ok(brief.indexOf('reorder') < 0, 'brief must not mention reorder');
    assert.ok(brief.indexOf('42') < 0, 'the cost value must not leak');
});

test('product-context: brief() carries the grounded facts every module quotes', () => {
    const brief = PC.brief(PC.context(product));
    assert.match(brief, /Product: Aurora ANC Headphones/);
    assert.match(brief, /Category: tech/);
    assert.match(brief, /Brand: Aurora/);
    assert.match(brief, /Price: \$149 \(usually \$199\)/);
    assert.match(brief, /Rating: 4\.6\/5 from 128 verified buyers/);
    assert.match(brief, /Specifications: Bluetooth: 5\.3; Battery: 40h; Weight: 250g/);
    assert.match(brief, /Tags: audio, anc/);
    assert.match(brief, /Base description: Hybrid noise cancelling/);
});

test('product-context: context() tolerates empty rows without throwing', () => {
    const ctx = PC.context({ id: 'x', name: 'Sparse' });
    assert.strictEqual(ctx.category, 'general');
    assert.strictEqual(ctx.price, 0);
    assert.deepStrictEqual(ctx.specifications, []);
    assert.deepStrictEqual(ctx.images, []);
    assert.strictEqual(ctx.supplier.leadTimeDays, null);
});

test('product-context: matchProducts ranks the best kind match first', () => {
    const list = [
        { id: 1, name: 'Aurora ANC Headphones', category: 'tech', description: 'Hybrid noise cancelling', specs: [['Bluetooth', '5.3']], rating: 4.6, reviews: 128 },
        { id: 2, name: 'Baseline Earbuds', category: 'tech', description: 'Cheap earbuds', rating: 4.1, reviews: 12 },
        { id: 3, name: 'Running Watch S2', category: 'sport', description: 'GPS running watch', rating: 4.4, reviews: 60 },
        { id: 4, name: 'Trail Runner Pro', category: 'sport', description: 'Lightweight running shoes', hidden: true, rating: 4.8, reviews: 200 }
    ];
    const matched = PC.matchProducts(list, 'noise cancelling headphones');
    assert.strictEqual(matched[0].id, 1, 'name + description hits outrank the rest');
    assert.ok(matched.every(p => !p.hidden), 'hidden products are excluded by default');

    const withHidden = PC.matchProducts(list, 'running', { includeHidden: true, limit: 10 });
    assert.ok(withHidden.some(p => p.id === 4), 'includeHidden surfaces hidden rows');
});

test('product-context: matchProducts respects the limit and the category hint', () => {
    const list = [
        { id: 1, name: 'Watch A', category: 'sport' },
        { id: 2, name: 'Watch B', category: 'sport' },
        { id: 3, name: 'Watch C', category: 'tech' }
    ];
    const matched = PC.matchProducts(list, 'watch', { limit: 2 });
    assert.strictEqual(matched.length, 2);
});

test('product-context: analyzeSeo scores a full package at 100 and a bare product as missing', () => {
    const missing = PC.analyzeSeo({ id: 9, name: 'No SEO', price: 10, description: 'x'.repeat(80), specs: [['a', 'b'], ['c', 'd'], ['e', 'f']], image: 'i.jpg', rating: 4, reviews: 5 });
    assert.strictEqual(missing.state, 'partial');
    assert.ok(missing.score > 0 && missing.score < 100);

    const full = PC.analyzeSeo({
        id: 9, name: 'Full SEO', price: 10,
        description: 'hybrid noise cancelling over-ear headphones with a forty hour battery life and bluetooth five point three support for stable wireless audio '.repeat(2),
        specs: [['a', 'b'], ['c', 'd'], ['e', 'f']],
        image: 'i.jpg', rating: 4, reviews: 5,
        seo: {
            metaTitle: 'Aurora ANC Headphones - Hybrid Noise Cancelling | Trendaryo',
            metaDescription: 'Hybrid noise cancelling headphones with a 40-hour battery, Bluetooth 5.3 and free shipping over $50 at Trendaryo.',
            keywords: ['anc headphones', 'noise cancelling', 'bluetooth headphones', 'over-ear headphones', 'trendaryo audio', 'best anc headphones']
        }
    });
    assert.strictEqual(full.state, 'full');
    assert.strictEqual(full.score, 100);
    assert.ok(full.checks.every(c => c.ok));
});

test('product-context: analyzeSeo flags a short meta title with a hint', () => {
    const result = PC.analyzeSeo({ id: 9, name: 'Short', price: 10, seo: { metaTitle: 'Too short' } });
    const check = result.checks.find(c => c.id === 'metaTitle');
    assert.strictEqual(check.ok, false);
    assert.match(check.hint, /30-60/);
});

test('product-context: linkedBlogs matches both string and numeric product ids', () => {
    const posts = [
        { id: 'b1', title: 'One', relatedProductIds: [17] },
        { id: 'b2', title: 'Two', relatedProductIds: ['17', 18] },
        { id: 'b3', title: 'Three', relatedProductIds: [19] },
        { id: 'b4', title: 'No relations' }
    ];
    const linked = PC.linkedBlogs(posts, 17);
    assert.strictEqual(linked.length, 2);
    assert.deepStrictEqual(linked.map(p => p.id), ['b1', 'b2']);
});

test('product-context: contentStatus reports the source-of-truth state', () => {
    assert.strictEqual(PC.contentStatus({}).state, 'none');
    assert.strictEqual(PC.contentStatus({ contentDraft: { updatedAt: '2026-01-01' } }).state, 'draft');
    const approved = PC.contentStatus({ content: { approvedAt: '2026-02-01', body: 'x' } });
    assert.strictEqual(approved.state, 'published');
    assert.strictEqual(approved.hasApproved, true);
});

test('product-context: tokens drops stop words and short noise', () => {
    assert.deepStrictEqual(PC.tokens('How to buy the best ANC headphones'), ['anc', 'headphones']);
});
