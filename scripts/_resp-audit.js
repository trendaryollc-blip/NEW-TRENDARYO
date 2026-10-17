// One-off: full responsive audit of the hero across viewport classes.
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const PORT = 4591;
const server = http.createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, p === '/' ? 'index.html' : p);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary' }[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
});
const SIZES = [
    ['phone-360', 360, 740], ['phone-390', 390, 844], ['phone-470', 470, 860],
    ['phablet-600', 600, 900], ['tablet-768', 768, 1024], ['tablet-900', 900, 700],
    ['laptop-1024-short', 1024, 620], ['laptop-1280', 1280, 720],
    ['laptop-1366', 1366, 754], ['desktop-1440', 1440, 900], ['desktop-1920', 1920, 1080],
    ['split-1280x500', 1280, 500], ['landscape-phone-740x360', 740, 360],
];
(async () => {
    await new Promise(r => server.listen(PORT, r));
    const { chromium } = require('playwright-core');
    const os = require('os');
    const px = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');
    const dirs = fs.readdirSync(px).filter(d => /^chromium/i.test(d));
    const exe = dirs.flatMap(d => [path.join(px, d, 'chrome-win64', 'chrome.exe'), path.join(px, d, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe')]).find(c => fs.existsSync(c));
    const browser = await chromium.launch({ headless: true, executablePath: exe });
    const report = [];
    for (const [label, width, height] of SIZES) {
        const page = await browser.newPage({ viewport: { width, height } });
        const errs = [];
        page.on('pageerror', e => errs.push(String(e.message).slice(0, 120)));
        try {
            await page.goto('http://127.0.0.1:' + PORT + '/index.html', { waitUntil: 'load', timeout: 60000 });
            await page.waitForTimeout(9000);
            const m = await page.evaluate(() => {
                const hero = document.getElementById('hero');
                const hr = hero.getBoundingClientRect();
                const scene = document.getElementById('tr-hero-scene').getBoundingClientRect();
                const title = document.querySelector('.tr-hero__title').getBoundingClientRect();
                const lede = document.querySelector('.tr-hero__lede');
                const ledeR = lede ? lede.getBoundingClientRect() : null;
                const cta = document.querySelector('.tr-hero__cta').getBoundingClientRect();
                const featsEl = document.querySelector('.tr-hero__feats');
                const feats = featsEl ? featsEl.getBoundingClientRect() : null;
                const fallback = document.getElementById('tr-hero-fallback').getBoundingClientRect();
                const boxes = window.__heroBoxes && window.__heroBoxes();
                const doc = document.documentElement;
                const heroRightOverflow = Array.from(hero.querySelectorAll('*')).reduce((mx, el) => Math.max(mx, el.getBoundingClientRect().right - hr.right), 0);
                return {
                    heroH: Math.round(hr.height),
                    sceneH: Math.round(scene.height),
                    horizScroll: doc.scrollWidth > doc.clientWidth + 1,
                    heroOverflowRight: Math.round(heroRightOverflow),
                    wordTop: boxes && boxes.word ? boxes.word.top : null,
                    wordRight: boxes && boxes.word ? boxes.word.right : null,
                    prodBottom: boxes ? boxes.products.bottom : null,
                    prodRight: boxes ? boxes.products.right : null,
                    titleTop: Math.round(title.top - hr.top),
                    titleW: Math.round(title.width),
                    ledeH: ledeR ? Math.round(ledeR.height) : null,
                    ctaTop: Math.round(cta.top - hr.top),
                    featsH: feats ? Math.round(feats.height) : null,
                    featsHidden: !featsEl,
                    fallbackShown: document.getElementById('hero').classList.contains('is-fallback'),
                    ready3d: document.getElementById('hero').classList.contains('is-3d-ready'),
                    sceneBottom: Math.round(scene.bottom - hr.top),
                    titleClash: boxes ? (Math.round(title.top - hr.top) < boxes.products.bottom + 4) : null,
                };
            });
            m.label = label; m.size = width + 'x' + height; m.errors = errs.length ? errs : 0;
            report.push(m);
            await page.screenshot({ path: path.join(__dirname, `_rs-${label}.png`) });
        } catch (e) {
            report.push({ label, size: width + 'x' + height, error: String(e).slice(0, 100) });
        }
        await page.close();
    }
    console.log(JSON.stringify(report, null, 1));
    await browser.close(); server.close();
})().catch(e => { console.error(e); server.close(); process.exit(1); });
