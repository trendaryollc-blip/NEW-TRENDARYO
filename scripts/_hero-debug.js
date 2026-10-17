/**
 * TEMPORARY debug — dump slots/anchors/rest positions + page errors.
 * Run: node scripts/_hero-debug.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = 4178;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.json': 'application/json', '.glb': 'model/gltf-binary', '.woff': 'font/woff', '.woff2': 'font/woff2',
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
async function main() {
  await new Promise(r => server.listen(PORT, r));
  const { chromium } = require('playwright-core');
  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath() });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__heroDebug && window.__heroDebug().models === 7, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(8000);
  const d = await page.evaluate(() => {
    const dbg = window.__heroDebug();
    const boxes = window.__heroBoxes();
    return {
      models: dbg.models, stage: dbg.stage, slots: dbg.slots, slotDiag: dbg.slotDiag, anchors: dbg.anchors, restX: dbg.restX,
      geom: dbg.geom, perModel: boxes && boxes.perModel, widths: dbg.widths,
    };
  });
  console.log('errors:', errors.slice(0, 10));
  console.log(JSON.stringify(d, null, 1));
  await browser.close(); server.close();
}
main().catch(e => { console.error(e); server.close(); process.exit(1); });
