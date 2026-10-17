const { chromium } = require('playwright-core');

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:\\Users\\khan\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe' });
  const sizes = process.argv.slice(2).length ? process.argv.slice(2).map(s => s.split('x').map(Number)) : [[1366,768],[1920,1080]];
  for (const [w, h] of sizes) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    try {
      await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForFunction(() => {
        const b = window.__heroBoxes && window.__heroBoxes();
        return b && b.perModel && b.perModel.length === 7 && b.word && b.word.height > 0;
      }, { timeout: 45000 });
      await page.waitForTimeout(800);
      const m = await page.waitForFunction(() => {
        const vh = innerHeight;
        const hero = document.getElementById('hero').getBoundingClientRect();
        const b = window.__heroBoxes && window.__heroBoxes();
        if (!b || !b.products || !b.word || !b.word.height) return null;
        const cta = document.querySelector('.tr-hero__btn--primary').getBoundingClientRect();
        const ghost = document.querySelector('.tr-hero__btn--ghost').getBoundingClientRect();
        const title = document.querySelector('.tr-hero__title').getBoundingClientRect();
        const off = hero.top;
        return {
          vh, heroBottom: hero.bottom,
          prodBottom: b.products.bottom + off,
          titleTop: title.top,
          ctaBottom: Math.max(cta.bottom, ghost.bottom),
          gapProductsToHeadline: title.top - (b.products.bottom + off),
        };
      }, { timeout: 20000 }).then(h => h.jsonValue());
      const fit = m.ctaBottom <= m.vh && m.prodBottom <= m.vh && m.gapProductsToHeadline >= 8;
      console.log(`${w}x${h}: ${fit ? 'OK' : 'CHECK'} | heroBottom=${Math.round(m.heroBottom)} prodBottom=${Math.round(m.prodBottom)} gapProdToHeadline=${Math.round(m.gapProductsToHeadline)} titleTop=${Math.round(m.titleTop)} ctaBottom=${Math.round(m.ctaBottom)} vh=${m.vh}`);
      if (w === parseInt(process.argv[2])) await page.screenshot({ path: 'C:\\Users\\khan\\AppData\\Local\\Temp\\opencode\\hero-' + w + '.png' });
    } catch (e) {
      console.log(`${w}x${h}: FAILED — ${e.message.split('\n')[0]}`);
    }
    await page.close();
  }
  await browser.close();
})();
