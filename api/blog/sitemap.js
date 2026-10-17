const { initFirebase } = require('../_lib/firebase');

const SITE = process.env.SITE_URL || 'https://trendaryo.com';

const STATIC_PAGES = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/shop', priority: '0.9', changefreq: 'daily' },
  { path: '/blog', priority: '0.8', changefreq: 'daily' },
  { path: '/about', priority: '0.5', changefreq: 'monthly' },
  { path: '/contact', priority: '0.4', changefreq: 'yearly' },
  { path: '/faq', priority: '0.4', changefreq: 'monthly' },
  { path: '/shipping', priority: '0.3', changefreq: 'yearly' },
  { path: '/returns', priority: '0.3', changefreq: 'yearly' },
  { path: '/privacy', priority: '0.2', changefreq: 'yearly' },
  { path: '/terms', priority: '0.2', changefreq: 'yearly' },
];

function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Dynamic sitemap: the static storefront pages plus every published post.
 * Served at GET /api/sitemap.xml (and /api/sitemap) and proxied from the
 * root /sitemap.xml so the file always reflects the live article shelf.
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  const today = new Date().toISOString().slice(0, 10);
  let urls = '';

  for (const page of STATIC_PAGES) {
    urls +=
      '  <url>\n' +
      '    <loc>' + xmlEscape(SITE + page.path) + '</loc>\n' +
      '    <changefreq>' + page.changefreq + '</changefreq>\n' +
      '    <priority>' + page.priority + '</priority>\n' +
      '  </url>\n';
  }

  try {
    const { db } = initFirebase();
    const snap = await db.collection('blog').where('status', '==', 'published').get();
    for (const doc of snap.docs) {
      const p = doc.data();
      const lastmod = (p.updatedAt || p.publishedAt || today).slice(0, 10);
      urls +=
        '  <url>\n' +
        '    <loc>' + xmlEscape(SITE + '/blog-post.html?slug=' + encodeURIComponent(doc.id)) + '</loc>\n' +
        '    <lastmod>' + xmlEscape(lastmod) + '</lastmod>\n' +
        '    <changefreq>monthly</changefreq>\n' +
        '    <priority>0.6</priority>\n' +
        '  </url>\n';
    }
  } catch (error) {
    /* A Firestore blip must not take the sitemap down - static pages still
       go out and the next crawl will pick the posts back up. */
    console.error('Sitemap blog lookup failed:', error.message);
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls +
    '</urlset>\n';

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  res.statusCode = 200;
  res.end(xml);
};
