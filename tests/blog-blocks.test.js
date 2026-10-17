const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

global.window = {};
eval(fs.readFileSync(path.join(__dirname, '..', 'blog-blocks.js'), 'utf8'));
const BB = global.window.BlogBlocks;

test('blog-blocks: renders every block type to safe HTML', () => {
  const html = BB.render([
    { type: 'h2', text: 'Battery life decides it' },
    { type: 'p', text: 'Bands run 10-14 days.' },
    { type: 'ul', items: ['Two weeks of battery', 'Heart rate'] },
    { type: 'quote', text: 'Wear it daily or not at all.', cite: 'Our testing' },
    { type: 'cta', title: 'Shop the guide', href: 'shop.html', label: 'Browse' },
  ]);

  assert.match(html, /<h2 class="bp-h2"[^>]*>Battery life decides it<\/h2>/);
  assert.match(html, /<p>Bands run 10-14 days\.<\/p>/);
  assert.match(html, /<ul class="bp-list"><li>Two weeks of battery<\/li><li>Heart rate<\/li><\/ul>/);
  assert.match(html, /<blockquote class="bp-quote">/);
  assert.match(html, /<cite>Our testing<\/cite>/);
  assert.match(html, /<div class="bp-cta">/);
});

test('blog-blocks: text is escaped - a model can never inject markup', () => {
  const html = BB.render([
    { type: 'h2', text: '<img src=x onerror=alert(1)>' },
    { type: 'p', text: '<script>alert("xss")</script>' },
    { type: 'ul', items: ['<b>bold?</b>'] },
  ]);

  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<b>bold?</b>'));
  assert.match(html, /&lt;script&gt;/);
});

test('blog-blocks: unsafe image src is dropped entirely', () => {
  const html = BB.render([
    { type: 'img', src: 'javascript:alert(1)', alt: 'x' },
    { type: 'img', src: 'https://cdn.example.com/a.jpg', alt: 'ok' },
  ]);
  assert.ok(!html.includes('javascript:'));
  assert.match(html, /https:\/\/cdn\.example\.com\/a\.jpg/);
});

test('blog-blocks: falls back to legacy plain content when there are no blocks', () => {
  const html = BB.render([], { content: 'First para.\n\nSecond para.' });
  assert.match(html, /<p>First para\.<\/p>/);
  assert.match(html, /<p>Second para\.<\/p>/);
});

test('blog-blocks: fromText converts markdown-ish AI output into blocks', () => {
  const blocks = BB.fromText(
    '# Heading one\n\n' +
    'Opening paragraph.\n\n' +
    '## Section two\n\n' +
    '- bullet a\n' +
    '- bullet b\n\n' +
    '> A pull quote\n'
  );

  assert.strictEqual(blocks[0].type, 'h2');
  assert.strictEqual(blocks[0].text, 'Heading one');
  assert.strictEqual(blocks[1].type, 'p');
  assert.strictEqual(blocks[2].type, 'h2');
  assert.deepStrictEqual(blocks[3], { type: 'ul', items: ['bullet a', 'bullet b'] });
  assert.strictEqual(blocks[4].type, 'quote');
});

test('blog-blocks: text() flattens blocks for the AI brief, readMinutes floors at 1', () => {
  const blocks = [
    { type: 'h2', text: 'Title' },
    { type: 'p', text: 'One two three four five six.' },
    { type: 'ul', items: ['x', 'y'] },
    { type: 'product', productId: '3' },
  ];
  const text = BB.text(blocks);
  assert.ok(text.includes('Title'));
  assert.ok(text.includes('One two three four five six.'));
  assert.ok(text.includes('x. y'));
  assert.ok(!text.includes('product'));

  assert.strictEqual(BB.readMinutes([{ type: 'p', text: 'tiny' }]), 1);
  const long = new Array(400).fill('word').join(' ');
  assert.strictEqual(BB.readMinutes([{ type: 'p', text: long }]), 2);
});
