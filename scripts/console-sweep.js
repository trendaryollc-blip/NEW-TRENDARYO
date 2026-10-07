const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'console-sweep');
const IGNORE = [/favicon/i, /\/favicon\.ico/i, /assets\/favicon/i];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const res = await fetch(BASE + '/api/products');
  let productId = '1';
  try {
    const j = await res.json();
    const list = j.products || j.data || (Array.isArray(j) ? j : []);
    if (list && list.length) productId = String(list[0].id || list[0]._id || list[0].productId);
  } catch (e) {}

  const pages = [
    ['home', '/'],
    ['shop', '/shop.html'],
    ['product', '/product.html?id=' + encodeURIComponent(productId)],
    ['cart', '/cart.html'],
    ['checkout', '/checkout.html'],
    ['login', '/login.html'],
    ['register', '/register.html'],
    ['orders', '/orders.html'],
    ['account', '/account.html'],
    ['admin', '/admin.html'],
    ['track-order', '/track-order.html'],
    ['contact', '/contact.html'],
  ];

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--disable-dev-shm-usage'],
  });

  const report = [];

  for (const [name, url] of pages) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    const failed = [];

    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      const loc = msg.location() || {};
      if (IGNORE.some((re) => re.test(text)) || IGNORE.some((re) => re.test(loc.url || ''))) return;
      errors.push({ text, source: (loc.url || '') + (loc.lineNumber != null ? ':' + loc.lineNumber : '') });
    });
    page.on('pageerror', (err) => {
      const text = String(err && err.stack ? err.stack : err);
      if (IGNORE.some((re) => re.test(text))) return;
      errors.push({ text, source: 'pageerror' });
    });
    page.on('requestfailed', (req) => {
      const u = req.url();
      if (IGNORE.some((re) => re.test(u))) return;
      failed.push(u + ' -> ' + (req.failure() && req.failure().errorText));
    });
    page.on('response', (resp) => {
      if (resp.status() >= 400) {
        const u = resp.url();
        if (IGNORE.some((re) => re.test(u))) return;
        if (resp.request().resourceType() === 'image' && resp.status() === 404) { failed.push(u + ' -> HTTP ' + resp.status()); return; }
        failed.push(u + ' -> HTTP ' + resp.status());
      }
    });

    try {
      await page.goto(BASE + url, { waitUntil: 'load', timeout: 45000 });
    } catch (e) {
      errors.push({ text: 'NAVIGATION FAILED: ' + e.message, source: url });
    }
    await page.waitForTimeout(10000);

    const uniq = [];
    const seenKeys = new Set();
    for (const e of errors) {
      const key = e.text.replace(/blob:\S+/g, 'blob:*').slice(0, 200);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      uniq.push(e);
    }
    errors.length = 0;
    errors.push(...uniq);

    const shot = path.join(OUT, name + '.png');
    let overlayOk = true;
    try {
      await page.evaluate((errs) => {
        const box = document.createElement('div');
        box.id = '__console-sweep';
        box.style.cssText =
          'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#202124;color:#f28b82;' +
          'font:12px/1.5 Consolas,Menlo,monospace;padding:10px 14px;max-height:60vh;overflow:auto;' +
          'border-top:3px solid #f28b82;white-space:pre-wrap;word-break:break-word;';
        const head = document.createElement('div');
        head.style.cssText = 'color:#8ab4f8;font-weight:bold;margin-bottom:6px;';
        head.textContent = 'CONSOLE SWEEP — ' + errs.length + ' error(s)';
        box.appendChild(head);
        errs.forEach((e, i) => {
          const line = document.createElement('div');
          line.textContent = '[' + (i + 1) + '] ' + e.text + (e.source ? '\n    at ' + e.source : '');
          line.style.marginBottom = '6px';
          box.appendChild(line);
        });
        document.body.appendChild(box);
      }, errors);
    } catch (e) {
      overlayOk = false;
    }
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot });
    if (errors.length) {
      await page.evaluate(() => {
        const box = document.getElementById('__console-sweep');
        if (!box) return;
        box.style.top = '0';
        box.style.maxHeight = '100vh';
        box.style.height = '100vh';
        box.style.padding = '20px 24px';
        box.style.borderTop = 'none';
      });
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(OUT, name + '-console.png') });
      await page.evaluate(() => {
        const box = document.getElementById('__console-sweep');
        if (!box) return;
        box.style.top = '';
        box.style.maxHeight = '60vh';
        box.style.height = '';
        box.style.padding = '10px 14px';
        box.style.borderTop = '3px solid #f28b82';
      });
    }

    report.push({ name, url, errors, failed, screenshot: shot, overlayOk });
    console.log(name + ': ' + errors.length + ' console errors, ' + failed.length + ' request issues');
    await context.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log('PRODUCT_ID=' + productId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
