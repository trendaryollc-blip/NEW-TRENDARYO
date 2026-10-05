const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const excludedDirectories = new Set(['.git', '.kilo', '.kilocode', 'node_modules', 'coverage']);

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

const projectFiles = walk(root);
const htmlFiles = projectFiles.filter((file) => path.extname(file).toLowerCase() === '.html');
const jsFiles = projectFiles.filter((file) => path.extname(file).toLowerCase() === '.js');

test('all checked-in HTML pages are non-empty and contain a document shell', async (t) => {
  assert.ok(htmlFiles.length > 0, 'expected to discover project HTML pages');
  for (const file of htmlFiles) {
    await t.test(path.relative(root, file), () => {
      const html = fs.readFileSync(file, 'utf8');
      assert.ok(html.trim().length > 0, 'page must not be empty');
      if (html.startsWith('google-site-verification:')) {
        assert.match(html.trim(), /^google-site-verification: [\w-]+\.html$/);
        return;
      }
      assert.match(html, /<html\b/i, 'page must include an html element');
      assert.match(html, /<body\b/i, 'page must include a body element');
    });
  }
});

test('all checked-in JavaScript files parse without syntax errors', async (t) => {
  assert.ok(jsFiles.length > 0, 'expected to discover project JavaScript files');
  for (const file of jsFiles) {
    await t.test(path.relative(root, file), () => {
      const source = fs.readFileSync(file, 'utf8');
      assert.ok(source.trim().length > 0, 'JavaScript file must not be empty');
      assert.doesNotThrow(() => new vm.Script(source, { filename: file }));
    });
  }
});
