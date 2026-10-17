/**
 * TRENDARYO API - Shared blog-brief creator (Phase 12 + Phase 27)
 * ---------------------------------------------------------------------------
 * One implementation for both call sites: the publish endpoint
 * (api/products/[id]/content.js) and the missing-brief-backfill automation
 * rule (api/_lib/automations.js). Idempotent: an enriched brief keeps its
 * keywords, titles and H2 plan - only the source snapshot refreshes.
 */

function nowIso() { return new Date().toISOString(); }

async function ensureBlogBrief(db, productId, published, adminUser, product) {
    try {
        const live = published || {};
        const sections = live.sections || {};
        const seo = live.seo || {};
        const price = Number(product && product.price) || 0;
        const category = (product && product.category) || '';
        const existing = await db.collection('blog_briefs').where('productId', '==', productId).get();
        if (!existing.empty) {
            const doc = existing.docs[0];
            await doc.ref.update({
                source: {
                    contentTitle: sections.title || '',
                    shortDescription: sections.shortDescription || '',
                    keywords: (seo.keywords || []).slice(0, 20),
                    price,
                    category,
                    publishedAt: live.publishedAt || nowIso()
                },
                updatedAt: nowIso()
            });
            return { id: doc.id, created: false };
        }
        const brief = {
            productId,
            productName: sections.title || '',
            status: 'READY_FOR_GENERATION',
            primaryKeyword: (seo.keywords || [])[0] || '',
            secondaryKeywords: (seo.keywords || []).slice(1, 8),
            longTailKeywords: (seo.longTailKeywords || []).slice(0, 12),
            searchIntent: seo.searchIntent || 'commercial',
            seoOpportunities: [],
            competitorTopics: [],
            suggestedTitles: [],
            metaDescription: seo.metaDescription || '',
            recommendedSlug: '',
            h1Suggestions: [],
            h2Suggestions: [],
            faqs: (live.faqs || []).slice(0, 10).map((f) => ({ q: f.q, a: f.a })),
            internalLinkingIdeas: [],
            contentOpportunities: [],
            blogType: '',
            source: {
                contentTitle: sections.title || '',
                shortDescription: sections.shortDescription || '',
                keywords: (seo.keywords || []).slice(0, 20),
                price,
                category,
                publishedAt: live.publishedAt || nowIso()
            },
            createdAt: nowIso(),
            updatedAt: nowIso(),
            createdBy: (adminUser && (adminUser.email || adminUser.uid)) || 'system'
        };
        await db.collection('blog_briefs').doc('brief-' + productId).set(brief);
        return { id: 'brief-' + productId, created: true };
    } catch (e) {
        console.error('[content] blog brief creation failed:', e.message);
        return null;
    }
}

/* The backfill rule: published content without any brief in blog_briefs. */
async function missingBriefs(db, limit) {
    const out = [];
    const published = await db.collection('product_content')
        .where('status', '==', 'published')
        .limit(limit || 100)
        .get();
    for (const doc of published.docs) {
        const content = doc.data();
        const check = await db.collection('blog_briefs').where('productId', '==', doc.id).get();
        if (check.empty) out.push({ id: doc.id, ...content });
    }
    return out;
}

module.exports = { ensureBlogBrief, missingBriefs };
