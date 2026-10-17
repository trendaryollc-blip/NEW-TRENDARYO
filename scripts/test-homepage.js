/**
 * End-to-end smoke test — homepage (3D hero + all previous fixes).
 *
 * Covers:
 *   1. home.css / hero-3d.css load and the hero renders
 *   2. the 3D scene actually boots (three.js, canvas, first frame) and the
 *      fallback does NOT engage when WebGL is available
 *   3. the fallback DOES engage when three.js cannot load
 *   4. home-engine.js still hydrates the section grids from the catalogue
 *   5. deferred non-critical scripts execute
 *   6. mobile hamburger -> nav open/close flow, outside-click close, dropdown
 *
 * Run: node scripts/test-homepage.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 4173;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.glb': 'model/gltf-binary',
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

let passed = 0, failed = 0, browser;
const log = (ok, name, extra) => {
  if (ok) { passed++; console.log(`  PASS  ${name}${extra ? '  — ' + extra : ''}`); }
  else { failed++; console.log(`  FAIL  ${name}${extra ? '  — ' + extra : ''}`); }
};

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

async function main() {
  await new Promise(r => server.listen(PORT, r));
  const { chromium } = require('playwright-core');
  browser = await chromium.launch({ headless: true, executablePath: chromiumPath() });
  const consoleErrors = [];
  const IGNORE = /favicon|net::ERR_|Failed to load resource|Firebase|api\/|401|403|AbortError|WebGL|SwiftShader|GroupMarkerNotSet|deprecated/i;

  /* ══════════════════ DESKTOP — 3D hero ══════════════════ */
  console.log('\n=== DESKTOP (1360x900) — 3D hero ===');
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));

  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });

  // structure present immediately
  const struct = await page.evaluate(() => ({
    heroCls: document.getElementById('hero')?.className || '',
    scene: !!document.getElementById('tr-hero-scene'),
    fallback: !!document.getElementById('tr-hero-fallback'),
    copy: !!document.querySelector('.tr-hero__copy'),
    title: (document.querySelector('.tr-hero__title')?.textContent || '').trim(),
    cssHero: !!document.querySelector('link[href="hero-3d.css"]'),
    cssHome: !!document.querySelector('link[href="home.css"]'),
    importmap: !!document.querySelector('script[type="importmap"]'),
    importmapCount: document.querySelectorAll('script[type="importmap"]').length,
    sceneModule: !!document.querySelector('script[type="module"][src*="hero-3d-scene.js"]'),
  }));
  log(struct.heroCls.includes('tr-hero'), 'hero carries .tr-hero', struct.heroCls);
  log(struct.scene && struct.fallback && struct.copy, 'scene + fallback + copy all present');
  log(/Trends worth/.test(struct.title), 'hero copy is site-branded', `"${struct.title}"`);
  log(struct.cssHero && struct.cssHome, 'hero-3d.css + home.css linked');
  log(struct.importmap && struct.importmapCount === 1, 'exactly one importmap', String(struct.importmapCount));
  log(struct.sceneModule, 'scene module script referenced');

  await page.evaluate(() => { const p = document.getElementById('preloader'); if (p) p.classList.add('hidden'); });

  // the scene must boot: canvas injected, is-3d-ready set, fallback NOT engaged
  const booted = await page.waitForFunction(() => {
    const hero = document.getElementById('hero');
    return hero && (hero.classList.contains('is-3d-ready') || hero.classList.contains('is-fallback'));
  }, null, { timeout: 30000 }).then(() => page.evaluate(() => {
    const hero = document.getElementById('hero');
    const cv = document.querySelector('#tr-hero-scene canvas');
    return {
      ready: hero.classList.contains('is-3d-ready'),
      fallback: hero.classList.contains('is-fallback'),
      canvas: !!cv,
      w: cv ? cv.clientWidth : 0,
      h: cv ? cv.clientHeight : 0,
      fallbackImgs: document.querySelectorAll('#tr-hero-fallback img').length,
    };
  }));

  log(booted.ready, '3D scene reported ready (first frame rendered)');
  log(!booted.fallback, 'fallback NOT engaged when WebGL works');
  log(booted.canvas, 'three.js canvas injected into .tr-hero__scene');
  log(booted.w > 1000 && booted.h > 300, 'canvas sized to hero container', `${booted.w}x${booted.h}`);

  // models actually arrive (10MB across 7 GLBs) — give the network time
  await page.waitForFunction(() => (window.__heroModelCount || 0) >= 7, null, { timeout: 45000 })
    .catch(() => { /* reported by the assertion below */ });
  const modelInfo = await page.evaluate(() => ({
    loaded: window.__heroModelCount || 0,
    hasWebGL: (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl') || c.getContext('experimental-webgl')); } catch (e) { return false; } })(),
  }));
  log(modelInfo.loaded === 7, 'all 7 GLB models loaded and hung', `${modelInfo.loaded}/7`);
  log(modelInfo.hasWebGL, 'WebGL available in this browser');

  // catalogue data still flows
  const data = await page.evaluate(() => ({
    stats: Array.from(document.querySelectorAll('[data-stat]')).map(e => e.getAttribute('data-stat') + '=' + e.getAttribute('data-count')),
    cats: document.querySelectorAll('#constellations .constellation').length,
    cards: document.querySelectorAll('#vortex .pc-card').length,
    da: document.querySelector('.pipe-stat b[data-pipe="reviews"]')?.textContent || '',
  }));
  log(data.stats.length === 4 && data.stats.every(s => !/=null$/.test(s)), 'proof stats computed', data.stats.join(', '));
  log(data.cats >= 5, 'category tiles rendered', String(data.cats));
  log(data.cards === 6, 'vortex grid has 6 cards', String(data.cards));
  log(/[\d,]+/.test(data.da), 'pipeline chip uses live total', data.da);

  // hero trust rail shows the REAL live rating
  const rating = await page.evaluate(() => document.querySelector('[data-hero-rating]')?.textContent || '');
  log(/^[0-9.]+$/.test(rating) && rating !== '', 'hero rating is live/computed', rating);

  // deferred scripts executed
  const deferred = await page.evaluate(() => ({
    bg: typeof window.__bgPerformanceSettings !== 'undefined' || typeof window.updateParticlesTheme === 'function',
    // cursor-particles.js sets this flag at module scope; .cursor-dust appears on mousemove
    cursorFlag: window.__cursorTrailActive === true,
    cursorEls: document.querySelectorAll('.cursor-dust').length,
  }));
  log(deferred.bg, 'deferred bg-optimized.js executed');
  log(deferred.cursorFlag, 'deferred cursor-particles.js executed');

  // move the mouse: the trail must produce dust (proves it is live, not just loaded)
  await page.mouse.move(400, 400);
  await page.mouse.move(520, 460, { steps: 8 });
  await page.waitForTimeout(300);
  const dust = await page.evaluate(() => document.querySelectorAll('.cursor-dust').length);
  log(dust > 0, 'cursor trail spawns dust on mousemove', `${dust} particles`);

  // page scroll is NOT blocked by the canvas (the old hero's body overflow bug)
  const scroll = await page.evaluate(() => {
    const before = window.scrollY;
    window.scrollTo(0, 1200);
    const after = window.scrollY;
    window.scrollTo(0, before);
    return { before, after };
  });
  log(scroll.after > 0, 'page still scrolls (canvas does not swallow input)', `scrolled to ${scroll.after}px`);

  await page.close();

  /* ══════════════════ FALLBACK — three.js blocked ══════════════════ */
  console.log('\n=== FALLBACK (three.js CDN blocked) ===');
  const fb = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await fb.route('**/three@0.160.0/**', r => r.abort());
  await fb.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
  const fbState = await fb.waitForFunction(() =>
    document.getElementById('hero').classList.contains('is-fallback'), null, { timeout: 15000 }
  ).then(() => fb.evaluate(() => {
    const hero = document.getElementById('hero');
    const imgs = document.querySelectorAll('#tr-hero-fallback img');
    return {
      fallback: hero.classList.contains('is-fallback'),
      ready: hero.classList.contains('is-3d-ready'),
      visible: getComputedStyle(document.getElementById('tr-hero-fallback')).display,
      imgs: imgs.length,
      firstSrcOk: imgs.length ? imgs[0].src.startsWith('data:image/svg+xml') : false,
    };
  }));
  log(fbState.fallback, 'fallback engages when three.js unavailable');
  log(fbState.visible === 'flex', 'fallback row is displayed', fbState.visible);
  log(fbState.imgs > 0, 'fallback shows product tiles', `${fbState.imgs} tiles`);
  log(fbState.firstSrcOk, 'fallback tiles are offline-safe data URIs');
  await fb.close();

  /* ══════════════════ MOBILE — nav + hero ══════════════════ */
  console.log('\n=== MOBILE (390x844) ===');
  const m = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  m.on('pageerror', e => consoleErrors.push('mobile pageerror: ' + e.message));
  await m.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
  await m.waitForTimeout(1500);
  await m.evaluate(() => { const p = document.getElementById('preloader'); if (p) p.classList.add('hidden'); });

  // hero copy should be repositioned to the bottom on phones, not clipped
  const heroM = await m.evaluate(() => {
    const c = document.querySelector('.tr-hero__copy').getBoundingClientRect();
    const h = document.getElementById('hero').getBoundingClientRect();
    return { copyBottom: Math.round(c.bottom), heroBottom: Math.round(h.bottom), vh: window.innerHeight };
  });
  log(heroM.copyBottom <= heroM.heroBottom + 2, 'hero copy inside hero bounds', JSON.stringify(heroM));

  // touch: canvas must not block page scrolling
  const touchScroll = await m.evaluate(() => {
    const cv = document.querySelector('#tr-hero-scene');
    return { pe: cv ? getComputedStyle(cv).pointerEvents : 'none' };
  });
  log(touchScroll.pe === 'none', 'canvas is pointer-events:none on touch (page scrolls)', touchScroll.pe);

  const toggleVisible = () => m.evaluate(() => {
    const t = document.getElementById('store-mobile-toggle');
    if (!t) return { present: false };
    const cs = getComputedStyle(t);
    return { present: true, display: cs.display };
  });
  const navState = () => m.evaluate(() => {
    const nav = document.querySelector('.store-nav');
    const header = document.getElementById('store-header');
    const toggle = document.getElementById('store-mobile-toggle');
    const cs = getComputedStyle(nav);
    return {
      visible: cs.display !== 'none' && cs.visibility === 'visible',
      open: header.classList.contains('is-open'),
      aria: toggle ? toggle.getAttribute('aria-expanded') : null,
      h: Math.round(nav.getBoundingClientRect().height),
    };
  });

  const tv = await toggleVisible();
  log(tv.present && tv.display !== 'none', 'hamburger visible at 390px', tv.display);
  const before = await navState();
  log(!before.visible, 'nav hidden by default', `height=${before.h}`);

  await m.click('#store-mobile-toggle');
  await m.waitForTimeout(350);
  const o1 = await navState();
  log(o1.visible, 'click 1: nav OPEN', `height=${o1.h}px`);
  log(o1.aria === 'true', 'click 1: aria-expanded="true"', String(o1.aria));

  await m.click('#store-mobile-toggle');
  await m.waitForTimeout(350);
  const c1 = await navState();
  log(!c1.visible, 'click 2: nav CLOSED', `height=${c1.h}px`);
  log(c1.aria === 'false', 'click 2: aria-expanded="false"', String(c1.aria));

  await m.click('#store-mobile-toggle');
  await m.waitForTimeout(300);
  log((await navState()).visible, 'click 3: nav re-opens');

  await m.evaluate(() => document.body.click());
  await m.waitForTimeout(300);
  const oc = await navState();
  log(!oc.visible && oc.aria === 'false', 'outside click closes nav + resets aria');

  await m.click('#store-mobile-toggle');
  await m.waitForTimeout(300);
  await m.locator('.store-nav-item[data-dropdown] .store-nav-link').first().click();
  await m.waitForTimeout(300);
  const dd = await m.evaluate(() => {
    const item = document.querySelector('.store-nav-item[data-dropdown]');
    const d = item.querySelector('.store-dropdown');
    const cs = getComputedStyle(d);
    return { isOpen: item.classList.contains('is-open'), visible: cs.visibility === 'visible' };
  });
  log(dd.isOpen && dd.visible, 'mobile: dropdown tap opens submenu');

  // CTA links point at real pages
  const links = await m.evaluate(() => Array.from(document.querySelectorAll('.tr-hero__cta a')).map(a => a.getAttribute('href')));
  log(links.includes('shop.html'), 'primary CTA -> shop.html', links.join(', '));
  await m.close();

  /* ══════════════════ LAYOUT — hero fits the fold at every breakpoint ══════════════════ */
  console.log('\n=== LAYOUT — hero bottom vs viewport ===');
  for (const [w, h, mob] of [[1920, 1080, false], [1440, 900, false], [1280, 800, false], [900, 800, false], [390, 844, true], [380, 700, true]]) {
    const lp = await browser.newPage({ viewport: { width: w, height: h }, isMobile: mob, hasTouch: mob });
    await lp.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
    await lp.waitForTimeout(700);
    const r = await lp.evaluate(() => {
      const hero = document.getElementById('hero');
      const b = hero.getBoundingClientRect();
      return { bottom: Math.round(b.bottom), top: Math.round(b.top), vh: window.innerHeight };
    });
    log(r.bottom <= r.vh + 1, `hero fits the fold at ${w}x${h}`, `bottom=${r.bottom} / vh=${r.vh}`);
    await lp.close();
  }

  /* ══════════════════ CONSOLE ══════════════════ */
  console.log('\n=== CONSOLE ===');
  const relevant = consoleErrors.filter(e => !IGNORE.test(e));
  if (relevant.length) {
    relevant.slice(0, 8).forEach(e => console.log('  ' + e.slice(0, 180)));
    log(false, 'no unexpected console errors', `${relevant.length} error(s)`);
  } else log(true, 'no unexpected console errors');

  console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
}

main()
  .catch(e => { console.error('\nTEST HARNESS ERROR:', e.message); failed++; })
  .finally(async () => {
    if (browser) await browser.close();
    server.close();
    process.exit(failed ? 1 : 0);
  });
