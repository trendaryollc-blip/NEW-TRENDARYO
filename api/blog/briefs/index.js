/**
 * TRENDARYO API - Blog briefs (Phase 12)
 * ---------------------------------------------------------------------------
 * A blog brief is created automatically when a product's content is
 * published (see api/products/[id]/content.js): it carries the approved
 * product context forward so the Blog Generator starts fully loaded and the
 * admin never pastes product data by hand (Phase 14).
 *
 * Brief statuses: READY_FOR_GENERATION -> BRIEF_READY -> USED
 * Admin-only: briefs are internal planning documents, never public.
 */
const { initFirebase } = require('../../_lib/firebase');
const { handleCors } = require('../../_lib/cors');
const { requireAdmin } = require('../../_lib/auth');
const { applyRateLimit } = require('../../_lib/security');
const { logAudit } = require('../../_lib/audit');

function clean(value, max) {
    return String(value == null ? '' : value).trim().slice(0, max);
}

function cleanList(value, maxItems, maxLen) {
    if (!Array.isArray(value)) return [];
    const out = [];
    for (const item of value) {
        const text = clean(item, maxLen);
        if (text && out.length < maxItems) out.push(text);
    }
    return out;
}

function cleanSections(value, maxItems) {
    /* H1/H2 suggestions arrive as [{ text }] or plain strings. */
    if (!Array.isArray(value)) return [];
    const out = [];
    for (const item of value) {
        if (item && typeof item === 'object') {
            const text = clean(item.text || item.h1 || item.h2, 160);
            const note = clean(item.note || item.context, 300);
            if (text && out.length < maxItems) out.push({ text, note });
        } else {
            const text = clean(item, 160);
            if (text && out.length < maxItems) out.push({ text, note: '' });
        }
    }
    return out;
}

function cleanFaqs(value) {
    if (!Array.isArray(value)) return [];
    const out = [];
    for (const item of value) {
        if (!item) continue;
        const q = item && typeof item === 'object' ? clean(item.q || item.question, 300) : clean(item, 300);
        const a = item && typeof item === 'object' ? clean(item.a || item.answer, 2000) : '';
        if (q && out.length < 20) out.push({ q, a });
    }
    return out;
}

const BRIEF_STATUSES = ['READY_FOR_GENERATION', 'BRIEF_READY', 'USED'];

function cleanBrief(body, productId, existing) {
    const b = (body && typeof body === 'object') ? body : {};
    return {
        productId,
        productName: clean(b.productName, 200),
        status: BRIEF_STATUSES.indexOf(b.status) >= 0 ? b.status : (existing && existing.status) || 'READY_FOR_GENERATION',
        primaryKeyword: clean(b.primaryKeyword, 120),
        secondaryKeywords: cleanList(b.secondaryKeywords, 15, 80),
        longTailKeywords: cleanList(b.longTailKeywords, 20, 100),
        searchIntent: clean(b.searchIntent, 40),
        seoOpportunities: cleanList(b.seoOpportunities, 15, 300),
        competitorTopics: cleanList(b.competitorTopics, 15, 300),
        suggestedTitles: cleanList(b.suggestedTitles, 10, 140),
        metaDescription: clean(b.metaDescription, 180),
        recommendedSlug: clean(b.recommendedSlug, 100),
        h1Suggestions: cleanSections(b.h1Suggestions, 8),
        h2Suggestions: cleanSections(b.h2Suggestions, 16),
        faqs: cleanFaqs(b.faqs),
        internalLinkingIdeas: cleanList(b.internalLinkingIdeas, 15, 300),
        contentOpportunities: cleanList(b.contentOpportunities, 15, 300),
        blogType: clean(b.blogType, 40),
        /* The approved product snapshot the brief was built from. */
        source: b.source && typeof b.source === 'object' ? {
            contentTitle: clean((b.source.contentTitle || ''), 200),
            shortDescription: clean((b.source.shortDescription || ''), 2000),
            keywords: cleanList(b.source.keywords, 20, 60),
            price: Number(b.source.price) || 0,
            category: clean(b.source.category, 60),
            publishedAt: clean(b.source.publishedAt, 40)
        } : (existing && existing.source) || null,
        updatedAt: new Date().toISOString()
    };
}

function nowISO() { return new Date().toISOString(); }

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (!applyRateLimit(req, res, 60)) {
        return res.status(429).json({ error: { message: 'Too many requests' } });
    }

    try {
        const { db } = initFirebase();
        const col = db.collection('blog_briefs');

        /* GET: admin-only listing, optionally filtered by product. */
        if (req.method === 'GET') {
            const adminUser = await requireAdmin(req, res);
            if (!adminUser) return;

            let q = col;
            if (req.query.productId) q = q.where('productId', '==', String(req.query.productId));
            const snapshot = await q.get();
            const briefs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
            briefs.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
            return res.status(200).json({ data: briefs, pagination: { total: briefs.length } });
        }

        /* POST: create or refresh the brief for a product (upsert by productId). */
        if (req.method === 'POST') {
            const adminUser = await requireAdmin(req, res);
            if (!adminUser) return;

            const body = req.body || {};
            const productId = clean(body.productId, 200);
            if (!productId) return res.status(400).json({ error: { message: 'A productId is required' } });

            const existingSnap = await col.where('productId', '==', productId).get();
            const existing = (!existingSnap.empty && existingSnap.docs[0].data()) || null;
            const brief = Object.assign(cleanBrief(body, productId, existing), {
                createdAt: (existing && existing.createdAt) || nowISO()
            });

            const id = existing ? existingSnap.docs[0].id : 'brief-' + productId;
            await col.doc(id).set(brief);
            await logAudit(db, 'blog.brief.saved', { id, productId, status: brief.status }, adminUser);
            return res.status(existing ? 200 : 201).json({ data: { id, ...brief } });
        }

        return res.status(405).json({ error: { message: 'Method not allowed' } });
    } catch (error) {
        console.error('Blog briefs error:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
};
