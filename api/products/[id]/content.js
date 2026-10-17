/**
 * TRENDARYO API - Product content engine (Phases 4-11)
 * ---------------------------------------------------------------------------
 * The server-side home of every AI-generated product asset:
 *
 *   product_content   working sections + review workflow status + the
 *                     immutable snapshot of what is currently live
 *   product_faqs      buyer questions and answers (working copy)
 *   product_images    alt text, SEO alt, captions, descriptions (working copy)
 *   product_seo       meta / OG / Twitter package + generated JSON-LD schema
 *
 * Rules that never bend:
 *  - Every write is admin-only (requireAdmin); the client never writes here.
 *  - Content is NEVER auto-published. draft -> review_pending -> ready_to_publish
 *    -> published, one human click at a time, enforced server-side.
 *  - Editing published work creates a new draft; the live snapshot only
 *    changes when a human publishes again. Published is the only state the
 *    storefront can read.
 *  - Schema is generated from the Firestore product row at publish time,
 *    never from client input.
 */
const { initFirebase } = require('../../_lib/firebase');
const { handleCors } = require('../../_lib/cors');
const { requireAdmin } = require('../../_lib/auth');
const { applyRateLimit } = require('../../_lib/security');
const ProductSchema = require('../../../product-schema');

/* ---------- workflow (Phase 9): legal transitions only ---------- */

const TRANSITIONS = {
    submit: { from: ['draft'], to: 'review_pending' },
    approve: { from: ['review_pending'], to: 'ready_to_publish' },
    reject: { from: ['review_pending'], to: 'draft' },
    publish: { from: ['ready_to_publish'], to: 'published' },
    unpublish: { from: ['published'], to: 'draft' }
};

const STATUSES = ['draft', 'review_pending', 'ready_to_publish', 'published'];

/* ---------- input sanitising: nothing oversized reaches the database ---------- */

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

function cleanFaqs(value) {
    if (!Array.isArray(value)) return [];
    const out = [];
    for (const item of value) {
        if (!item || typeof item !== 'object') continue;
        const q = clean(item.q || item.question, 300);
        const a = clean(item.a || item.answer, 2000);
        if (q && a && out.length < 30) out.push({ q, a });
    }
    return out;
}

function cleanImages(value) {
    if (!Array.isArray(value)) return [];
    const out = [];
    for (const item of value) {
        if (!item || typeof item !== 'object') continue;
        const url = clean(item.url || item.src, 2000);
        if (!url || !/^https?:\/\//i.test(url)) continue;
        out.push({
            url,
            alt: clean(item.alt, 300),
            seoAlt: clean(item.seoAlt, 300),
            caption: clean(item.caption, 300),
            description: clean(item.description, 500)
        });
        if (out.length >= 20) break;
    }
    return out;
}

function cleanSpecs(value) {
    if (!Array.isArray(value)) return [];
    const out = [];
    for (const row of value) {
        if (Array.isArray(row)) {
            const label = clean(row[0], 120);
            if (label) out.push({ label, value: clean(row[1], 400) });
        } else if (row && typeof row === 'object') {
            const label = clean(row.label, 120);
            if (label) out.push({ label, value: clean(row.value, 400) });
        }
        if (out.length >= 40) break;
    }
    return out;
}

function cleanCanonical(value) {
    const raw = clean(value, 500);
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return raw;
    return 'https://trendaryo.com/' + raw.replace(/^\/+/, '');
}

function cleanSeo(value) {
    const s = (value && typeof value === 'object') ? value : {};
    const twitter = (s.twitter && typeof s.twitter === 'object') ? s.twitter : {};
    const card = ['summary', 'summary_large_image'].indexOf(String(twitter.card)) >= 0
        ? String(twitter.card)
        : 'summary_large_image';
    return {
        metaTitle: clean(s.metaTitle, 70),
        metaDescription: clean(s.metaDescription, 180),
        keywords: cleanList(s.keywords, 20, 60),
        longTailKeywords: cleanList(s.longTailKeywords, 20, 80),
        searchIntent: clean(s.searchIntent, 60),
        canonicalUrl: cleanCanonical(s.canonicalUrl),
        ogTitle: clean(s.ogTitle, 70),
        ogDescription: clean(s.ogDescription, 180),
        twitter: {
            card,
            title: clean(twitter.title, 70),
            description: clean(twitter.description, 180)
        }
    };
}

function cleanSections(value) {
    const s = (value && typeof value === 'object') ? value : {};
    return {
        title: clean(s.title, 200),
        shortDescription: clean(s.shortDescription, 2000),
        longDescription: clean(s.longDescription, 20000),
        features: cleanList(s.features, 40, 500),
        benefits: cleanList(s.benefits, 40, 500),
        useCases: cleanList(s.useCases, 40, 500),
        whyChoose: clean(s.whyChoose, 4000),
        specifications: cleanSpecs(s.specifications),
        shipping: clean(s.shipping, 2000),
        returns: clean(s.returns, 2000),
        summary: clean(s.summary, 2000)
    };
}

function now() { return new Date().toISOString(); }

async function audit(db, entry) {
    try {
        const { log } = require('../../_lib/audit');
        await log(db, entry);
    } catch (e) { /* audit is best-effort */ }
}

/* Phase 12: publishing product content automatically creates the blog brief
   for that product from the approved snapshot. Idempotent - a brief that
   already exists keeps its AI-enriched keywords and titles. */
async function ensureBlogBrief(db, productId, published, adminUser, product) {
    const { ensureBlogBrief } = require('../../_lib/content-briefs');
    return ensureBlogBrief(db, productId, published, adminUser, product);
}

/* The public shape: what the storefront receives. Only ever the snapshot. */
function publishedPayload(id, content) {
    const live = (content && content.published) || {};
    return {
        productId: id,
        status: 'published',
        sections: live.sections || {},
        faqs: live.faqs || [],
        images: live.images || [],
        publishedAt: live.publishedAt || null,
        version: live.version || null,
        seo: {
            metaTitle: (live.seo && live.seo.metaTitle) || '',
            metaDescription: (live.seo && live.seo.metaDescription) || '',
            keywords: (live.seo && live.seo.keywords) || [],
            longTailKeywords: (live.seo && live.seo.longTailKeywords) || [],
            searchIntent: (live.seo && live.seo.searchIntent) || '',
            canonicalUrl: (live.seo && live.seo.canonicalUrl) || '',
            ogTitle: (live.seo && live.seo.ogTitle) || '',
            ogDescription: (live.seo && live.seo.ogDescription) || '',
            twitter: (live.seo && live.seo.twitter) || {},
            schema: (live.seo && live.seo.schema) || null
        }
    };
}

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (!applyRateLimit(req, res, 60)) {
        return res.status(429).json({ error: { message: 'Too many requests' } });
    }

    const id = clean(req.query.id, 200);
    if (!id) return res.status(400).json({ error: { message: 'A product id is required' } });

    try {
        const { db } = initFirebase();
        const contentRef = db.collection('product_content').doc(id);
        const faqsRef = db.collection('product_faqs').doc(id);
        const imagesRef = db.collection('product_images').doc(id);
        const seoRef = db.collection('product_seo').doc(id);

        /* ---------- GET: a token gets the working copy, everyone else gets the frozen snapshot ---------- */
        if (req.method === 'GET') {
            const snap = await contentRef.get();
            if (!snap.exists) {
                return res.status(404).json({ error: { message: 'No content draft for this product yet' } });
            }
            const content = snap.data();
            const live = content.published || null;

            /* The admin UI always sends a Bearer token: it reads the working
               copy plus the state of what is currently live. */
            if (String(req.headers.authorization || '').indexOf('Bearer ') === 0) {
                const adminUser = await requireAdmin(req, res);
                if (!adminUser) return; /* 401/403 already written */
                const faqsDoc = (await faqsRef.get()).data() || { items: [] };
                const imagesDoc = (await imagesRef.get()).data() || { items: [] };
                const seo = (await seoRef.get()).data() || {};
                return res.status(200).json({
                    data: {
                        productId: id,
                        status: content.status,
                        sections: content.sections || {},
                        faqs: faqsDoc.items || [],
                        images: imagesDoc.items || [],
                        version: content.version || 1,
                        createdAt: content.createdAt || null,
                        updatedAt: content.updatedAt || null,
                        approvedAt: content.approvedAt || null,
                        approvedBy: content.approvedBy || null,
                        publishedAt: content.publishedAt || null,
                        live: live ? { version: live.version, publishedAt: live.publishedAt } : null,
                        seo: {
                            metaTitle: seo.metaTitle || '',
                            metaDescription: seo.metaDescription || '',
                            keywords: seo.keywords || [],
                            longTailKeywords: seo.longTailKeywords || [],
                            searchIntent: seo.searchIntent || '',
                            canonicalUrl: seo.canonicalUrl || '',
                            ogTitle: seo.ogTitle || '',
                            ogDescription: seo.ogDescription || '',
                            twitter: seo.twitter || {},
                            schema: seo.schema || null
                        }
                    }
                });
            }

            /* Storefront: the frozen snapshot, and nothing else. A pending
               draft never leaks and never disturbs the live copy. */
            if (live) {
                return res.status(200).json({ data: publishedPayload(id, content) });
            }
            /* No snapshot: reuse requireAdmin so the caller gets the proper
               401/403 instead of a silent empty 200. */
            const adminUser = await requireAdmin(req, res);
            if (!adminUser) return;
            return res.status(404).json({ error: { message: 'No published content for this product yet' } });
        }

        /* ---------- everything below is admin-only ---------- */
        const adminUser = await requireAdmin(req, res);
        if (!adminUser) return;

        /* ---------- POST: save (or resave) the working draft ---------- */
        if (req.method === 'POST') {
            const body = req.body || {};
            const sections = cleanSections(body.sections);
            if (!sections.title) {
                return res.status(400).json({ error: { message: 'The draft needs a title' } });
            }

            const existing = (await contentRef.get()).data() || {};
            /* A live snapshot is never touched by a save: edits build a new
               draft and the storefront keeps serving the published copy. */
            const status = body.submitForReview === true ? 'review_pending' : 'draft';

            await contentRef.set({
                productId: id,
                status,
                sections,
                published: existing.published || null,
                version: Number(existing.version || 0) + 1,
                updatedAt: now(),
                createdAt: existing.createdAt || now(),
                approvedAt: null,
                approvedBy: null,
                publishedAt: existing.publishedAt || null,
                updatedBy: adminUser.email || adminUser.uid || 'admin'
            });
            await faqsRef.set({ productId: id, items: cleanFaqs(body.faqs), updatedAt: now() });
            await imagesRef.set({ productId: id, items: cleanImages(body.images), updatedAt: now() });
            if (body.seo && Object.keys(body.seo).length) {
                const prevSeo = (await seoRef.get()).data() || {};
                await seoRef.set(Object.assign({}, prevSeo, cleanSeo(body.seo), { productId: id, updatedAt: now() }));
            }

            await audit(db, {
                actorUid: adminUser.uid,
                actorEmail: adminUser.email || null,
                action: 'product.content.saved',
                targetType: 'product',
                targetId: id,
                meta: { status, version: Number(existing.version || 0) + 1 },
                ip: req.headers['x-forwarded-for'] || null,
                userAgent: req.headers['user-agent'] || null
            });
            return res.status(200).json({ data: { productId: id, status, sections } });
        }

        /* ---------- PUT: workflow moves + publish (Phase 10) ---------- */
        if (req.method === 'PUT') {
            const action = clean(req.body && req.body.action, 40);
            const rule = TRANSITIONS[action];
            if (!rule) {
                return res.status(400).json({
                    error: { message: 'Unknown workflow action. Use one of: ' + Object.keys(TRANSITIONS).join(', ') }
                });
            }
            const snap = await contentRef.get();
            if (!snap.exists) {
                return res.status(404).json({ error: { message: 'No content draft to move' } });
            }
            const content = snap.data();
            if (rule.from.indexOf(content.status) < 0) {
                return res.status(409).json({
                    error: { message: 'Cannot ' + action + ' from ' + content.status + ' (allowed: ' + rule.from.join(', ') + ')' }
                });
            }

            const patch = { status: rule.to, updatedAt: now(), updatedBy: adminUser.email || adminUser.uid || 'admin' };
            let productRow = null;

            if (action === 'publish') {
                /* Phase 10: save content, generate URL + metadata + schema from
                   the stored product row (never the request), push to store. */
                const productDoc = await db.collection('products').doc(id).get();
                if (!productDoc.exists) {
                    return res.status(409).json({ error: { message: 'The product must exist in the catalog before publishing content' } });
                }
                productRow = productDoc.data();
                const faqsDoc = (await faqsRef.get()).data() || { items: [] };
                const imagesDoc = (await imagesRef.get()).data() || { items: [] };
                const seo = (await seoRef.get()).data() || {};
                const canonical = seo.canonicalUrl || ('https://trendaryo.com/product.html?id=' + encodeURIComponent(id));
                const schema = ProductSchema.build(
                    { id, ...productRow },
                    { seo, content: content.sections || {}, url: canonical }
                );

                await seoRef.set({
                    productId: id,
                    schema,
                    schemaGeneratedAt: now(),
                    canonicalUrl: canonical,
                    updatedAt: now()
                }, { merge: true });

                patch.published = {
                    sections: content.sections || {},
                    faqs: faqsDoc.items || [],
                    images: imagesDoc.items || [],
                    seo: Object.assign(cleanSeo(seo), { schema, canonicalUrl: canonical }),
                    version: content.version || 1,
                    publishedAt: now()
                };
                patch.publishedAt = patch.published.publishedAt;
                patch.approvedAt = now();
                patch.approvedBy = adminUser.email || adminUser.uid || 'admin';
            }

            if (action === 'unpublish') {
                patch.published = null;
            }

            await contentRef.update(patch);
            await audit(db, {
                actorUid: adminUser.uid,
                actorEmail: adminUser.email || null,
                action: 'product.content.' + action,
                targetType: 'product',
                targetId: id,
                meta: { from: content.status, to: rule.to },
                ip: req.headers['x-forwarded-for'] || null,
                userAgent: req.headers['user-agent'] || null
            });

            /* Phase 12: the moment content is published, a blog brief is
               created automatically from the approved snapshot - the admin
               never pastes product data into the generator by hand. */
            if (action === 'publish') {
                await ensureBlogBrief(db, id, patch.published, adminUser, productRow);
            }
            return res.status(200).json({ data: { productId: id, status: rule.to } });
        }

        /* ---------- DELETE: remove every generated asset for the product ---------- */
        if (req.method === 'DELETE') {
            await contentRef.delete();
            await faqsRef.delete();
            await imagesRef.delete();
            await seoRef.delete();
            await audit(db, {
                actorUid: adminUser.uid,
                actorEmail: adminUser.email || null,
                action: 'product.content.deleted',
                targetType: 'product',
                targetId: id,
                ip: req.headers['x-forwarded-for'] || null,
                userAgent: req.headers['user-agent'] || null
            });
            return res.status(200).json({ data: { message: 'Generated content removed' } });
        }

        return res.status(405).json({ error: { message: 'Method not allowed' } });
    } catch (error) {
        console.error('Product content error:', error);
        res.status(500).json({ error: { message: 'Internal server error' } });
    }
};

module.exports.STATUSES = STATUSES;
module.exports.TRANSITIONS = TRANSITIONS;
module.exports.cleanSections = cleanSections;
module.exports.cleanSeo = cleanSeo;
module.exports.cleanFaqs = cleanFaqs;
module.exports.cleanImages = cleanImages;
module.exports.publishedPayload = publishedPayload;
