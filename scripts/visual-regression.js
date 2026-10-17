/**
 * Visual regression for the CSS extraction.
 *
 * Builds a controlled baseline that differs from the current page in ONLY one
 * way: the stylesheet is inlined back into a <style> block instead of linked
 * as home.css. Everything else (DOM, scripts, defer attributes, the vortex
 * placeholder) stays identical, so any pixel difference is attributable to
 * the CSS extraction itself.
 *
 * Run: node scripts/visual-regression.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 4174;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
});

/** home.css minus the added header comment and the .vx-status rule = the
 *  original inline CSS, byte for byte. */
function originalInlineCss() {
    const all = fs.readFileSync(path.join(ROOT, 'home.css'), 'utf8');
    const lines = all.split(/\r?\n/);
    // header comment is the first 6 lines (0..5)
    let start = 0;
    while (start < lines.length && (lines[start].trim() === '' || /^\/\*|=|TRENDARYO — Homepage styles|Kept byte-identical|as before/.test(lines[start].trim()))) start++;
    let body = lines.slice(start).join('\n');
    // strip the .vx-status rule block (it was appended, not part of the original)
    body = body.replace(/\n\s*\/\* ── Bestseller grid loading placeholder ──[\s\S]*?\n\s*\}\n/, '\n');
    return body;
}

async function diffInBrowser(browser, urlOld, urlNew) {
    const page = await browser.newPage();
    try {
        await page.goto('about:blank');
        return await page.evaluate(async ([a, b]) => {
            const load = src => new Promise((res, rej) => {
                const i = new Image();
                i.onload = () => res(i);
                i.onerror = () => rej(new Error('decode failed'));
                i.src = src;
            });
            const A = await load(a), B = await load(b);
            const w = Math.min(A.width, B.width), h = Math.min(A.height, B.height);
            const cv = document.createElement('canvas');
            cv.width = w; cv.height = h;
            const ctx = cv.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(A, 0, 0); const pa = ctx.getImageData(0, 0, w, h).data;
            ctx.clearRect(0, 0, w, h);
            ctx.drawImage(B, 0, 0); const pb = ctx.getImageData(0, 0, w, h).data;
            let diff = 0, total = 0, maxD = 0;
            for (let i = 0; i < pa.length; i += 4) {
                total++;
                const d = Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]) + Math.abs(pa[i + 3] - pb[i + 3]);
                if (d > maxD) maxD = d;
                if (d > 12) diff++;
            }
            return {
                pct: +(diff / total * 100).toFixed(4), diff, total, w, h, maxD,
                oldW: A.width, oldH: A.height, newW: B.width, newH: B.height,
                sameDims: A.width === B.width && A.height === B.height,
            };
        }, [urlOld, urlNew]);
    } catch (e) {
        return { error: e.message };
    } finally {
        await page.close();
    }
}

async function main() {
    await new Promise(r => server.listen(PORT, r));
    const { chromium } = require('playwright-core');
    const os = require('os');
    const px = path.join(os.homedir(), 'AppData', 'Local', 'ms-playwright');
    const dirs = fs.readdirSync(px).filter(d => /^chromium/i.test(d));
    const exe = dirs.flatMap(d => [
        path.join(px, d, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'),
        path.join(px, d, 'chrome-win64', 'chrome.exe'),
    ]).find(c => fs.existsSync(c));
    const browser = await chromium.launch({ headless: true, executablePath: exe });

    const shoot = async (label, vp) => {
        const page = await browser.newPage({ viewport: vp, isMobile: /mobile/.test(label), hasTouch: /mobile/.test(label) });
        await page.route('**/gsap*', r => r.abort()); // static, fully-rendered state
        await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
        await page.waitForTimeout(1800);
        await page.evaluate(() => { const p = document.getElementById('preloader'); if (p) p.classList.add('hidden'); });
        await page.evaluate(async () => {
            const h = document.body.scrollHeight;
            for (let y = 0; y < h; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 30)); }
            window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 500));
        });
        await page.waitForTimeout(800);
        const buf = await page.screenshot({ fullPage: true });
        await page.close();
        return buf;
    };

    // ---- NEW: current index.html (home.css linked) ----
    const shots = {};
    for (const [label, vp] of [['new-desktop', { width: 1360, height: 900 }], ['new-mobile', { width: 390, height: 844 }]]) {
        shots[label] = await shoot(label, vp);
    }

    // ---- BASELINE: identical file, but the stylesheet inlined again ----
    const current = fs.readFileSync(path.join(ROOT, 'index.html'));
    const inlined = current.toString('utf8').replace(
        '    <link rel="stylesheet" href="home.css">',
        '    <style>\n' + originalInlineCss() + '\n    </style>'
    );
    if (!/inlined/i.test(inlined) && inlined === current.toString('utf8')) {
        console.error('FATAL: could not rebuild the inline baseline — home.css link not found');
        server.close(); process.exit(1);
    }
    fs.writeFileSync(path.join(ROOT, 'index.html'), inlined);
    try {
        for (const [label, vp] of [['old-desktop', { width: 1360, height: 900 }], ['old-mobile', { width: 390, height: 844 }]]) {
            shots[label] = await shoot(label, vp);
        }
    } finally {
        fs.writeFileSync(path.join(ROOT, 'index.html'), current); // always restore
    }

    // ---- compare ----
    const outDir = path.join(ROOT, 'visual-diff');
    fs.mkdirSync(outDir, { recursive: true });
    for (const k of Object.keys(shots)) fs.writeFileSync(path.join(outDir, k + '.png'), shots[k]);

    console.log('\n=== VISUAL REGRESSION: inline <style> vs home.css ===');
    let issues = 0;
    for (const key of ['desktop', 'mobile']) {
        const a = 'data:image/png;base64,' + shots[`old-${key}`].toString('base64');
        const b = 'data:image/png;base64,' + shots[`new-${key}`].toString('base64');
        const r = await diffInBrowser(browser, a, b);
        if (r.error) { console.log(`  WARN  ${key}: ${r.error}`); continue; }
        const dimNote = r.sameDims ? '' : ` (clamped ${r.w}x${r.h}; old=${r.oldW}x${r.oldH} new=${r.newW}x${r.newH})`;
        if (r.pct < 0.6) console.log(`  PASS  ${key}: ${r.pct.toFixed(3)}% pixels differ (${r.w}x${r.h})${dimNote}`);
        else { console.log(`  FAIL  ${key}: ${r.pct.toFixed(3)}% pixels differ (${r.w}x${r.h})${dimNote} — see visual-diff/${key}*.png`); issues++; }
    }
    console.log(`\nScreenshots: ${path.relative(ROOT, outDir)}/ (old-* = inlined baseline, new-* = home.css)`);
    await browser.close();
    console.log(`\n=== RESULT: ${issues === 0 ? 'CSS extraction is pixel-identical' : issues + ' visual issue(s)'} ===`);
}

main()
    .catch(e => { console.error('VISUAL TEST ERROR:', e.message); })
    .finally(() => { server.close(); process.exit(0); });
