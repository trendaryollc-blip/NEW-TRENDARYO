const { initFirebase } = require('../_lib/firebase');

const SITE = process.env.SITE_URL || 'https://trendaryo.com';

function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function blockText(blocks, content) {
  if (Array.isArray(blocks) && blocks.length) {
    return blocks
      .filter((b) => b && (b.type === 'p' || b.type === 'h2' || b.type === 'quote'))
      .map((b) => b.text || '')
      .filter(Boolean)
      .join('\n\n');
  }
  return String(content || '');
}

/** RSS 2.0 feed of published posts - GET /api/blog/rss (also /api/rss). */
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }

  let items = '';
  try {
    const { db } = initFirebase();
    const snap = await db.collection('blog')
      .where('status', '==', 'published')
      .get();

    const docs = snap.docs
      .slice()
      .sort((a, b) => new Date(b.data().publishedAt || 0) - new Date(a.data().publishedAt || 0))
      .slice(0, 50);

    for (const doc of docs) {
      const p = doc.data();
      const url = SITE + '/blog-post.html?slug=' + encodeURIComponent(doc.id);
      const pubDate = new Date(p.publishedAt || p.createdAt || Date.now()).toUTCString();
      const description = p.excerpt || blockText(p.blocks, p.content).slice(0, 300);

      items +=
        '    <item>\n' +
        '      <title>' + xmlEscape(p.title) + '</title>\n' +
        '      <link>' + xmlEscape(url) + '</link>\n' +
        '      <guid isPermaLink="true">' + xmlEscape(url) + '</guid>\n' +
        '      <description>' + xmlEscape(description) + '</description>\n' +
        '      <pubDate>' + xmlEscape(pubDate) + '</pubDate>\n' +
        '      <author>' + xmlEscape(p.author || 'Trendaryo Editorial') + '</author>\n' +
        (p.category ? '      <category>' + xmlEscape(p.category) + '</category>\n' : '') +
        '    </item>\n';
    }
  } catch (error) {
    /* Missing index on publishedAt should not kill the feed - serve an
       empty channel and let the next request retry the ordered query. */
    console.error('RSS blog lookup failed:', error.message);
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n' +
    '  <channel>\n' +
    '    <title>Trendaryo Blog</title>\n' +
    '    <link>' + xmlEscape(SITE + '/blog') + '</link>\n' +
    '    <atom:link href="' + xmlEscape(SITE + '/api/blog/rss') + '" rel="self" type="application/rss+xml"/>\n' +
    '    <description>Buying guides, product deep-dives and style notes from the Trendaryo editors.</description>\n' +
    '    <language>en</language>\n' +
    items +
    '  </channel>\n' +
    '</rss>\n';

  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800');
  res.statusCode = 200;
  res.end(xml);
};
