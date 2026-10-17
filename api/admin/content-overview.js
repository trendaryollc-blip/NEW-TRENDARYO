/**
 * TRENDARYO API - Content pipeline overview (Milestone 6)
 * ---------------------------------------------------------------------------
 * One admin-only call for the Content Command Center: every product content
 * draft with its workflow status, brief status and linked-article coverage.
 * Joins are done server-side (Admin SDK) so the dashboard needs a single
 * request instead of one call per product.
 */
const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAdmin } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');

const MAX_ROWS = 200;

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (!applyRateLimit(req, res, 60)) {
        return res.status(429).json({ error: { message: 'Too many requests' } });
    }
    if (req.method !== 'GET') {
        return res.status(405).json({ error: { message: 'Method not allowed' } });
    }

    try {
        const { db } = initFirebase();
        const adminUser = await requireAdmin(req, res);
        if (!adminUser) return;

        const contentSnap = await db.collection('product_content').limit(MAX_ROWS).get();
        const items = [];
        const totals = { drafts: 0, review: 0, ready: 0, published: 0, briefs: 0, articles: 0, stalled: 0 };
        const staleCutoff = Date.now() - 5 * 86400000;

        for (const doc of contentSnap.docs) {
            const content = doc.data();
            const productId = doc.id;

            let briefStatus = null;
            try {
                const briefSnap = await db.collection('blog_briefs').where('productId', '==', productId).get();
                if (!briefSnap.empty) briefStatus = briefSnap.docs[0].data().status || null;
            } catch (e) { /* brief lookup is garnish */ }

            let articles = [];
            try {
                const blogSnap = await db.collection('blog').where('relatedProductIds', 'array-contains', productId).get();
                articles = blogSnap.docs.map((d) => ({
                    id: d.id,
                    title: d.data().title || 'Untitled',
                    status: d.data().status || 'draft',
                    blogType: (d.data().seo && d.data().seo.blogType) || ''
                }));
            } catch (e) { /* article lookup is garnish */ }

            const types = {};
            for (const a of articles) if (a.blogType) types[a.blogType] = true;

            const updatedAt = content.updatedAt || content.createdAt || null;
            const stalled = (content.status === 'draft' || content.status === 'review_pending') &&
                updatedAt && new Date(updatedAt).getTime() <= staleCutoff;

            if (content.status === 'draft') totals.drafts++;
            if (content.status === 'review_pending') totals.review++;
            if (content.status === 'ready_to_publish') totals.ready++;
            if (content.status === 'published') totals.published++;
            if (briefStatus) totals.briefs++;
            totals.articles += articles.length;
            if (stalled) totals.stalled++;

            items.push({
                productId,
                title: (content.sections && content.sections.title) || '',
                contentStatus: content.status || 'draft',
                version: content.version || 1,
                updatedAt,
                stalled: !!stalled,
                briefStatus,
                articleCount: articles.length,
                blogTypes: Object.keys(types),
                articles: articles.slice(0, 8)
            });
        }

        items.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
        return res.status(200).json({ data: { items, totals } });
    } catch (error) {
        console.error('Content overview error:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
};
