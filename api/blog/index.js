const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAdmin } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');
const { logAudit } = require('../_lib/audit');

const WRITABLE = [
  'title', 'excerpt', 'content', 'coverImage', 'coverAlt',
  'category', 'tags', 'author', 'readMinutes', 'status',
  'featured', 'scheduledFor', 'seo', 'relatedProductIds', 'blocks'
];

function clean(obj) {
  const out = {};
  for (const k of WRITABLE) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function nowISO() { return new Date().toISOString(); }
const { syncLinks } = require('../_lib/internal-links');

/* Phase 22: product <-> blog relationships, one row per pair. */
async function writeProductRelations(db, blogId, productIds, adminUser) {
    if (!Array.isArray(productIds) || !productIds.length) return;
    for (const productId of productIds) {
        const pid = String(productId || '').trim();
        if (!pid) continue;
        try {
            await db.collection('product_blog_relations').doc(blogId + '-' + pid).set({
                productId: pid,
                blogId,
                relationshipType: 'generated',
                dateCreated: nowISO(),
                createdBy: (adminUser && (adminUser.uid || adminUser.email)) || 'admin'
            }, { merge: true });
        } catch (e) {
            console.error('[blog] relation write failed:', e.message);
        }
    }
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 60)) return res.status(429).json({ error: { message: 'Too many requests' } });

  try {
    const { db } = initFirebase();

    if (req.method === 'GET') {
      const { page = 1, limit = 20, category, search, sort = 'newest', status = 'published', featured, productId } = req.query;

      /* Only the published shelf is public - anything else (drafts, the admin
         queue, status=all) is a server-confirmed admin view. */
      if (status !== 'published') {
        const adminUser = await requireAdmin(req, res);
        if (!adminUser) return;
      }

      let q = db.collection('blog');
      if (status !== 'all') q = q.where('status', '==', status);
      if (category) q = q.where('category', '==', category);
      if (featured === 'true') q = q.where('featured', '==', true);
      /* Phase 23: the storefront product page pulls its related articles. */
      if (productId) q = q.where('relatedProductIds', 'array-contains', String(productId));

      const snapshot = await q.get();
      let posts = snapshot.docs.map(doc => ({ id: doc.id, slug: doc.id, ...doc.data() }));

      if (search) {
        const qStr = String(search).toLowerCase();
        posts = posts.filter(p =>
          (p.title && p.title.toLowerCase().includes(qStr)) ||
          (p.excerpt && p.excerpt.toLowerCase().includes(qStr)) ||
          (p.tags && p.tags.some(t => t.toLowerCase().includes(qStr))) ||
          (p.content && p.content.toLowerCase().includes(qStr))
        );
      }

      if (sort === 'oldest') posts.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      else if (sort === 'popular') posts.sort((a, b) => (b.views || 0) - (a.views || 0));
      else if (sort === 'title') posts.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      else posts.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

      const total = posts.length;
      const p = parseInt(page);
      const l = Math.min(parseInt(limit), 100);
      const paginated = posts.slice((p - 1) * l, p * l);

      return res.status(200).json({
        data: paginated,
        pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) },
      });
    }

    if (req.method === 'POST') {
      const adminUser = await requireAdmin(req, res);
      if (!adminUser) return;

      const body = req.body || {};
      if (!body.title) return res.status(400).json({ error: { message: 'Title is required' } });

      const baseSlug = slugify(body.title);
      let slug = baseSlug;
      let counter = 1;
      while (true) {
        const exists = await db.collection('blog').doc(slug).get();
        if (!exists.exists) break;
        slug = `${baseSlug}-${counter++}`;
      }

      const postData = {
        slug,
        title: body.title,
        excerpt: body.excerpt || '',
        content: body.content || '',
        coverImage: body.coverImage || '',
        coverAlt: body.coverAlt || '',
        category: body.category || 'general',
        tags: Array.isArray(body.tags) ? body.tags : [],
        author: body.author || 'Trendaryo Editorial',
        readMinutes: parseInt(body.readMinutes) || 5,
        status: body.status || 'draft',
        featured: !!body.featured,
        scheduledFor: body.scheduledFor || null,
        seo: body.seo || { metaTitle: '', metaDescription: '', keywords: [], ogImage: '' },
        relatedProductIds: Array.isArray(body.relatedProductIds) ? body.relatedProductIds : [],
        blocks: Array.isArray(body.blocks) ? body.blocks : [],
        views: 0,
        createdAt: nowISO(),
        updatedAt: nowISO(),
        publishedAt: body.status === 'published' ? nowISO() : null,
        createdBy: adminUser.uid,
      };

      const docRef = await db.collection('blog').doc(slug).set(postData);
      await logAudit(db, 'blog.create', { slug, title: postData.title, status: postData.status }, adminUser);

      /* Phase 22: every product an article references gets a relation row,
         so "linked blogs" on the product page is a real two-way link. */
      await writeProductRelations(db, slug, postData.relatedProductIds, adminUser);

      /* Phase 26: the article's internal links become queryable rows. */
      await syncLinks(db, slug, (body.seo || {}).internalLinks);

      return res.status(201).json({ data: { id: slug, ...postData } });
    }

    return res.status(405).json({ error: { message: 'Method not allowed' } });
  } catch (error) {
    console.error('Blog index error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};