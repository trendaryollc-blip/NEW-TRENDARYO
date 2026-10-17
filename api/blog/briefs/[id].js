/**
 * TRENDARYO API - Blog brief detail (Phase 12)
 * GET / PUT / DELETE a single brief. Admin-only: briefs are internal.
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
    if (!Array.isArray(value)) return [];
    const out = [];
    for (const item of value) {
        if (item && typeof item === 'object') {
            const text = clean(item.text || item.h1 || item.h2, 160);
            if (text && out.length < maxItems) out.push({ text, note: clean(item.note || item.context, 300) });
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

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (!applyRateLimit(req, res, 60)) {
        return res.status(429).json({ error: { message: 'Too many requests' } });
    }

    try {
        const { db } = initFirebase();
        const id = clean(req.query.id, 200);
        if (!id) return res.status(400).json({ error: { message: 'Brief ID required' } });

        const docRef = db.collection('blog_briefs').doc(id);

        if (req.method === 'GET') {
            const adminUser = await requireAdmin(req, res);
            if (!adminUser) return;
            const snap = await docRef.get();
            if (!snap.exists) return res.status(404).json({ error: { message: 'Brief not found' } });
            return res.status(200).json({ data: { id: snap.id, ...snap.data() } });
        }

        if (req.method === 'PUT') {
            const adminUser = await requireAdmin(req, res);
            if (!adminUser) return;

            const snap = await docRef.get();
            if (!snap.exists) return res.status(404).json({ error: { message: 'Brief not found' } });
            const current = snap.data();
            const b = req.body || {};

            const patch = {
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
                updatedAt: new Date().toISOString()
            };
            if (BRIEF_STATUSES.indexOf(b.status) >= 0) patch.status = b.status;
            if (b.productName !== undefined) patch.productName = clean(b.productName, 200);
            if (b.source !== undefined && b.source) {
                patch.source = {
                    contentTitle: clean(b.source.contentTitle, 200),
                    shortDescription: clean(b.source.shortDescription, 2000),
                    keywords: cleanList(b.source.keywords, 20, 60),
                    price: Number(b.source.price) || 0,
                    category: clean(b.source.category, 60),
                    publishedAt: clean(b.source.publishedAt, 40)
                };
            }

            await docRef.update(patch);
            await logAudit(db, 'blog.brief.updated', { id, changes: Object.keys(patch) }, adminUser);
            const fresh = await docRef.get();
            return res.status(200).json({ data: { id: fresh.id, ...fresh.data() } });
        }

        if (req.method === 'DELETE') {
            const adminUser = await requireAdmin(req, res);
            if (!adminUser) return;
            const snap = await docRef.get();
            if (!snap.exists) return res.status(404).json({ error: { message: 'Brief not found' } });
            await docRef.delete();
            await logAudit(db, 'blog.brief.deleted', { id }, adminUser);
            return res.status(200).json({ data: { message: 'Brief deleted' } });
        }

        return res.status(405).json({ error: { message: 'Method not allowed' } });
    } catch (error) {
        console.error('Blog brief detail error:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
};

module.exports.BRIEF_STATUSES = BRIEF_STATUSES;
