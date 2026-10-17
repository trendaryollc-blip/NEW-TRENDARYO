/**
 * TEMPORARY verification — hero fixes:
 *   1. CTA vs trust-rail overlap scan across a viewport matrix
 *   2. equal-gap measurement of the hanging products (7/7 models)
 *   3. wordmark right-margin coverage
 * Run: node scripts/_hero-verify.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 4177;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.glb': 'model/gltf-binary',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.jpg': 'image/jpeg',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('404'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

function chromiumPath() {
  const px = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');
  const dirs = fs.readdirSync(px).filter(d => /^chromium/i.test(d));
  const exe = dirs.flatMap(d => [
    path.join(px, d, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
    path.join(px, d, 'chrome-win64', 'chrome.exe'),
  ]).find(c => fs.existsSync(c));
  if (!exe) throw new Error('No Chromium under ' + px);
  return exe;
}

let failures = 0;

async function main() {
  await new Promise(r => server.listen(PORT, r));
  const { chromium } = require('playwright-core');
  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath() });

  /* ═══ 1 — overlap matrix ═══ */
  console.log('=== 1. CTA / trust-rail overlap matrix ===');
  const widths = [1024, 1280, 1366, 1440, 1512, 1536, 1600, 1728, 1920, 2560];
  const heights = [480, 500, 540, 560, 600, 640, 676, 700, 740, 768, 800, 860, 900, 1000];
  const overlaps = [];
  let spill = 0;
  for (const w of widths) {
    for (const h of heights) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(450);
      const d = await page.evaluate(() => {
        const hero = document.getElementById('hero');
        const hr = hero.getBoundingClientRect();
        const rel = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { top: +(r.top - hr.top).toFixed(1), bottom: +(r.bottom - hr.top).toFixed(1) };
        };
        const feats = document.querySelector('.tr-hero__feats');
        return {
          cta: rel('.tr-hero__cta'), copy: rel('.tr-hero__copy'), feats: rel('.tr-hero__feats'),
          featsDisplay: feats ? getComputedStyle(feats).display : 'none',
          heroBottomDoc: +(hr.bottom).toFixed(1), vh: window.innerHeight,
        };
      });
      await page.close();
      if (d.featsDisplay === 'none') continue;
      const ctaOver = d.cta ? +(d.cta.bottom - d.feats.top).toFixed(1) : 0;
      const copyOver = d.copy ? +(d.copy.bottom - d.feats.top).toFixed(1) : 0;
      if (ctaOver > 0 || copyOver > 0) overlaps.push(`${w}x${h}: ctaOver=${ctaOver} copyOver=${copyOver}`);
      if (d.heroBottomDoc > d.vh + 1) spill++;
    }
  }
  if (overlaps.length) { failures++; overlaps.forEach(s => console.log('  OVERLAP ' + s)); }
  else console.log(`  PASS — 0 overlapping configs across ${widths.length * heights.length} viewports`);
  console.log(`  (info) ${spill} configs keep the hero taller than the fold — page scrolls instead of overlapping`);

  /* ═══ 2 — product spacing + wordmark coverage at key sizes (next chunk) ═══ */
  await spacingChecks(browser);
}

/* ═══ 2 — product spacing + wordmark coverage at key sizes ═══ */
async function spacingChecks(browser) {
  console.log('\n=== 2. Equal product gaps + wordmark coverage (7 models) ===');
  const PORT = Number(process.env.PORT) || 4177;
  for (const [w, h] of [[1920, 1080], [1600, 900], [1440, 900], [1366, 768], [1280, 800]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
    // wait for all 7 models + physics to fully settle (the anchors jump once
    // when fitModels runs, so the pendulums need several seconds to rest)
    await page.waitForFunction(() => window.__heroDebug && window.__heroDebug().models === 7, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(8000);
    const d = await page.evaluate(() => {
      const boxes = window.__heroBoxes ? window.__heroBoxes() : null;
      const dbg = window.__heroDebug ? window.__heroDebug() : null;
      const gaps = [];
      if (boxes && boxes.perModel && boxes.perModel.length > 1) {
        for (let i = 1; i < boxes.perModel.length; i++) {
          gaps.push(boxes.perModel[i].left - boxes.perModel[i - 1].right);
        }
      }
      const hero = document.getElementById('hero');
      return {
        models: dbg ? dbg.models : 0, gaps,
        word: boxes ? boxes.word : null, heroW: Math.round(hero.getBoundingClientRect().width),
        overflow: boxes ? boxes.productOverflow : null,
      };
    });
    const gapStr = d.gaps.map(g => Math.round(g)).join(', ');
    const spread = d.gaps.length > 1 ? Math.max(...d.gaps) - Math.min(...d.gaps) : 999;
    const mean = d.gaps.length ? d.gaps.reduce((a, b) => a + b, 0) / d.gaps.length : 0;
    /* Products spin on their ropes, so widths — and therefore gaps — breathe
       by a few px; require: no overlaps, all gaps positive, tight spread. */
    const equal = d.gaps.length > 1 && Math.min(...d.gaps) > 2 && spread <= 20 && spread <= mean * 0.7;
    const rightGap = d.word ? d.heroW - d.word.right : -1;
    const ok = d.models === 7 && equal && rightGap >= 0 && rightGap <= 45 && !d.overflow;
    if (!ok) failures++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'} ${w}x${h}: models=${d.models} gaps=[${gapStr}] ` +
      `mean=${Math.round(mean)} spread=${spread === 999 ? '?' : Math.round(spread)}px wordRightGap=${rightGap} overflow=${d.overflow}`);
    await page.screenshot({ path: path.join(__dirname, `_verify-${w}x${h}.png`) });
    await page.close();
  }
  await browser.close();
  server.close();
  console.log(`\n=== RESULT: ${failures === 0 ? 'ALL CHECKS PASS' : failures + ' failing check group(s)'} ===`);
  process.exit(failures ? 1 : 0);
}

main().catch(e => { console.error(e); server.close(); process.exit(1); });
