const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAdmin } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');
const { logAudit } = require('../_lib/audit');
const BlogSchema = require('../../blog-schema');
const { syncLinks, clearLinks } = require('../_lib/internal-links');

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

function nowISO() { return new Date().toISOString(); }

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 60)) return res.status(429).json({ error: { message: 'Too many requests' } });

  try {
    const { db } = initFirebase();
    const id = (req.query.id || '').trim();
    if (!id) return res.status(400).json({ error: { message: 'Post ID required' } });

    const docRef = db.collection('blog').doc(id);

    if (req.method === 'GET') {
      const snap = await docRef.get();
      if (!snap.exists) return res.status(404).json({ error: { message: 'Post not found' } });

      const data = { id: snap.id, slug: snap.id, ...snap.data() };
      if (data.status !== 'published') {
        const adminUser = await requireAdmin(req, res);
        if (!adminUser) return res.status(404).json({ error: { message: 'Post not found' } });
      }

      return res.status(200).json({ data });
    }

    if (req.method === 'PUT') {
      const adminUser = await requireAdmin(req, res);
      if (!adminUser) return;

      const snap = await docRef.get();
      if (!snap.exists) return res.status(404).json({ error: { message: 'Post not found' } });

      const current = snap.data();
      const body = req.body || {};
      const patch = clean(body);

      if (patch.status === 'published' && current.status !== 'published') {
        patch.publishedAt = nowISO();

        /* Phase 21: publish generates the Article/FAQ/Breadcrumb JSON-LD from
           the stored post (never from client input) and stamps it on seo. */
        const mergedSeo = Object.assign({}, current.seo || {}, patch.seo || {});
        const mergedFaqs = Array.isArray(mergedSeo.faqs) ? mergedSeo.faqs : (current.faqs || []);
        mergedSeo.schema = BlogSchema.build(
            {
                slug: id,
                title: patch.title || current.title,
                excerpt: patch.excerpt || current.excerpt,
                category: patch.category || current.category,
                coverImage: patch.coverImage || current.coverImage,
                createdAt: current.createdAt,
                publishedAt: patch.publishedAt,
                updatedAt: nowISO(),
                seo: mergedSeo
            },
            { faqs: mergedFaqs }
        );
        patch.seo = mergedSeo;
      }

      /* Phase 22: keep relations in sync when products are linked/replaced. */
      if (patch.relatedProductIds !== undefined) {
        for (const productId of (current.relatedProductIds || [])) {
            if (!(patch.relatedProductIds || []).some((x) => String(x) === String(productId))) {
                try {
                    await db.collection('product_blog_relations').doc(id + '-' + productId).delete();
                } catch (e) { /* best-effort */ }
            }
        }
        for (const productId of (patch.relatedProductIds || [])) {
            try {
                await db.collection('product_blog_relations').doc(id + '-' + productId).set({
                    productId: String(productId),
                    blogId: id,
                    relationshipType: 'related',
                    dateCreated: nowISO(),
                    createdBy: adminUser.uid
                }, { merge: true });
            } catch (e) {
                console.error('[blog] relation write failed:', e.message);
            }
        }
      }

      /* Phase 26: mirror the article's internal links as queryable rows. */
      if (patch.seo !== undefined || patch.blocks !== undefined) {
        const mergedInternal = (patch.seo && patch.seo.internalLinks !== undefined)
          ? patch.seo.internalLinks
          : (current.seo && current.seo.internalLinks);
        await syncLinks(db, id, mergedInternal);
      }

      const updated = {
        ...patch,
        updatedAt: nowISO(),
        updatedBy: adminUser.uid,
      };

      await docRef.update(updated);
      await logAudit(db, 'blog.update', { slug: id, changes: Object.keys(patch), status: patch.status || current.status }, adminUser);

      const fresh = await docRef.get();
      return res.status(200).json({ data: { id: fresh.id, slug: fresh.id, ...fresh.data() } });
    }

    if (req.method === 'DELETE') {
      const adminUser = await requireAdmin(req, res);
      if (!adminUser) return;

      const snap = await docRef.get();
      if (!snap.exists) return res.status(404).json({ error: { message: 'Post not found' } });

      const current = snap.data();
      await docRef.delete();
      await clearLinks(db, id);
      await logAudit(db, 'blog.delete', { slug: id, title: current.title }, adminUser);

      return res.status(200).json({ data: { success: true } });
    }

    if (req.method === 'POST') {
      const snap = await docRef.get();
      if (!snap.exists) return res.status(404).json({ error: { message: 'Post not found' } });

      const action = (req.body && req.body.action) || '';
      /* View counting is the one public write: rate-limited above, no auth
         needed, and never lets a client set any field except the counter. */
      if (action === 'view' || action === 'increment-view') {
        const current = snap.data();
        if (current.status !== 'published') {
          return res.status(404).json({ error: { message: 'Post not found' } });
        }
        await docRef.update({ views: (current.views || 0) + 1 });
        return res.status(200).json({ data: { views: (current.views || 0) + 1 } });
      }

      const adminUser = await requireAdmin(req, res);
      if (!adminUser) return;

      if (action === 'duplicate') {
        const current = snap.data();
        const baseSlug = current.slug + '-copy';
        let slug = baseSlug;
        let counter = 1;
        while (true) {
          const exists = await db.collection('blog').doc(slug).get();
          if (!exists.exists) break;
          slug = `${baseSlug}-${counter++}`;
        }
        const dup = { ...current, slug, title: current.title + ' (Copy)', status: 'draft', views: 0, createdAt: nowISO(), updatedAt: nowISO(), publishedAt: null, createdBy: adminUser.uid };
        await db.collection('blog').doc(slug).set(dup);
        await logAudit(db, 'blog.duplicate', { slug: dup.slug, from: id }, adminUser);
        return res.status(201).json({ data: { id: slug, ...dup } });
      }

      return res.status(400).json({ error: { message: 'Unknown action' } });
    }

    return res.status(405).json({ error: { message: 'Method not allowed' } });
  } catch (error) {
    console.error('Blog [id] error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};