/**
 * TRENDARYO API - Internal links graph (Phase 26)
 * ---------------------------------------------------------------------------
 * Articles carry their internal links inside the post (seo.internalLinks),
 * and that array is mirrored here as one row per link so clusters and the
 * link graph are queryable: which articles point at which product pages,
 * guides and comparisons.
 *
 * Rows are derived data - written by the blog API on create/update/delete
 * only. Admin SDK writes; clients never touch this collection.
 */

function clean(value, max) {
    return String(value == null ? '' : value).trim().slice(0, max);
}

function normalizeLinks(internalLinks) {
    if (!Array.isArray(internalLinks)) return [];
    const out = [];
    for (const link of internalLinks) {
        if (!link || typeof link !== 'object') continue;
        const anchor = clean(link.anchor, 160);
        const path = clean(link.path, 400);
        if (!anchor || !path) continue;
        out.push({ anchor, path, why: clean(link.why, 300) });
        if (out.length >= 12) break;
    }
    return out;
}

/* Rewrite the rows for one blog: delete the old set, write the new one. */
async function syncLinks(db, blogId, internalLinks, slugs) {
    const col = db.collection('internal_links');
    try {
        const existing = await col.where('fromBlog', '==', blogId).get();
        for (const doc of existing.docs) {
            try { await doc.ref.delete(); } catch (e) { /* best-effort */ }
        }
        const links = normalizeLinks(internalLinks);
        const createdAt = new Date().toISOString();
        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            await col.doc(blogId + '-' + i).set({
                fromBlog: blogId,
                fromSlug: (slugs && slugs[blogId]) || blogId,
                anchor: link.anchor,
                path: link.path,
                why: link.why,
                targetType: targetTypeOf(link.path),
                createdAt
            });
        }
        return links.length;
    } catch (e) {
        console.error('[internal-links] sync failed:', e.message);
        return 0;
    }
}

function targetTypeOf(path) {
    const p = String(path || '').toLowerCase();
    if (/^product\.html/.test(p)) return 'product';
    if (/^blog-post\.html/.test(p)) return 'article';
    if (/^blog\.html/.test(p)) return 'blog-index';
    if (/^shop\.html/.test(p)) return 'shop';
    if (/^category|collection/.test(p)) return 'category';
    return 'page';
}

async function clearLinks(db, blogId) {
    try {
        const existing = await db.collection('internal_links').where('fromBlog', '==', blogId).get();
        for (const doc of existing.docs) {
            try { await doc.ref.delete(); } catch (e) { /* best-effort */ }
        }
    } catch (e) { /* best-effort */ }
}

module.exports = { syncLinks, clearLinks, normalizeLinks, targetTypeOf };
