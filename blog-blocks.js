/**
 * TRENDARYO - BLOG BLOCK RENDERER
 * ---------------------------------------------------------------------------
 * One renderer for the article body, shared by the storefront (blog-post.html)
 * and the admin editor preview. Blocks are structured objects, never raw HTML,
 * so an AI generation can never inject markup into the storefront.
 *
 * Block shapes:
 *   { type:'h2',    text }
 *   { type:'h3',    text }
 *   { type:'p',     text }
 *   { type:'ul',    items:[...] }
 *   { type:'quote', text, cite? }
 *   { type:'img',   src, alt?, caption? }
 *   { type:'cta',   title, text?, href?, label? }
 *   { type:'product', productId }
 *
 * Loaded as a plain global script so both the storefront and the admin deck
 * (framework-free) can use it without a build step.
 */
(function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function attr(s) {
        var v = String(s == null ? '' : s).trim();
        if (!/^https?:\/\//i.test(v) && !/^\/(?!\/)/.test(v) && !/^assets\//.test(v)) return '';
        return v.replace(/"/g, '&quot;');
    }

    function renderBlock(b, opts) {
        if (!b || !b.type) return '';
        var o = opts || {};
        switch (b.type) {
            case 'h2':
                return '<h2 class="bp-h2" id="' + slugId(b.text) + '">' + esc(b.text) + '</h2>';
            case 'h3':
                return '<h3 class="bp-h3">' + esc(b.text) + '</h3>';
            case 'p':
                return '<p>' + esc(b.text) + '</p>';
            case 'ul': {
                var items = Array.isArray(b.items) ? b.items : [];
                if (!items.length) return '';
                var li = '';
                for (var i = 0; i < items.length; i++) li += '<li>' + esc(items[i]) + '</li>';
                return '<ul class="bp-list">' + li + '</ul>';
            }
            case 'quote':
                return '<blockquote class="bp-quote"><p>' + esc(b.text) + '</p>' +
                    (b.cite ? '<cite>' + esc(b.cite) + '</cite>' : '') + '</blockquote>';
            case 'img': {
                var src = attr(b.src);
                if (!src) return '';
                return '<figure class="bp-fig"><img src="' + esc(src) + '" alt="' + esc(b.alt || '') + '" loading="lazy" decoding="async">' +
                    (b.caption ? '<figcaption>' + esc(b.caption) + '</figcaption>' : '') + '</figure>';
            }
            case 'cta':
                return '<div class="bp-cta"><div class="bp-cta__t">' + esc(b.title || 'Shop the guide') + '</div>' +
                    (b.text ? '<div class="bp-cta__x">' + esc(b.text) + '</div>' : '') +
                    '<a class="bp-cta__btn" href="' + esc(attr(b.href) || 'shop.html') + '">' + esc(b.label || 'Browse the shop') + '</a></div>';
            case 'product':
                if (o.productCard) {
                    var card = o.productCard(String(b.productId || ''));
                    if (card) return card;
                }
                return '<div class="bp-prod bp-prod--empty">Product #' + esc(b.productId) + '</div>';
            default:
                return '';
        }
    }

    function slugId(text) {
        return String(text || '').toLowerCase().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    }

    /**
     * Render a block array to HTML.
     * Falls back to the legacy plain `content` field when there are no blocks,
     * so old posts keep working.
     */
    function render(blocks, opts) {
        var html = '';
        if (Array.isArray(blocks) && blocks.length) {
            for (var i = 0; i < blocks.length; i++) html += renderBlock(blocks[i], opts);
        }
        if (!html && opts && opts.content) html = paragraphs(opts.content);
        return html;
    }

    /** Plain-text content -> safe <p> tags. */
    function paragraphs(text) {
        var parts = String(text || '').split(/\n{2,}/);
        var out = '';
        for (var i = 0; i < parts.length; i++) {
            var t = parts[i].trim();
            if (t) out += '<p>' + esc(t).replace(/\n/g, '<br>') + '</p>';
        }
        return out;
    }

    /** Blocks -> plain text, used as the AI brief for meta/tags/excerpt tasks. */
    function text(blocks, fallback) {
        if (!Array.isArray(blocks) || !blocks.length) return String(fallback || '');
        var out = [];
        for (var i = 0; i < blocks.length; i++) {
            var b = blocks[i];
            if (!b) continue;
            if (b.type === 'ul' && Array.isArray(b.items)) out.push(b.items.join('. '));
            else if (b.type === 'product' || b.type === 'img' || b.type === 'cta') continue;
            else out.push(b.text || '');
        }
        return out.filter(Boolean).join('\n\n');
    }

    /** Approximate reading time from blocks/plain content (200 wpm). */
    function readMinutes(blocks, content) {
        var words = text(blocks, content).split(/\s+/).filter(Boolean).length;
        return Math.max(1, Math.round(words / 200));
    }

    /**
     * Convert model output (markdown-ish) into blocks.
     * Used when an AI draft is applied from the admin so nothing arrives as
     * raw HTML.
     */
    function fromText(str) {
        var src = String(str || '').replace(/\r/g, '').split('\n');
        var blocks = [];
        var list = null;
        function flushList() { if (list && list.items.length) blocks.push(list); list = null; }

        for (var i = 0; i < src.length; i++) {
            var line = src[i].replace(/\s+$/, '');
            if (!line.trim()) { flushList(); continue; }

            if (/^#{4,}\s+/.test(line)) { flushList(); blocks.push({ type: 'h3', text: line.replace(/^#{4,}\s+/, '').trim() }); continue; }
            if (/^###\s+/.test(line)) { flushList(); blocks.push({ type: 'h3', text: line.replace(/^###\s+/, '').trim() }); continue; }
            if (/^##\s+/.test(line)) { flushList(); blocks.push({ type: 'h2', text: line.replace(/^##\s+/, '').trim() }); continue; }
            if (/^#\s+/.test(line)) { flushList(); blocks.push({ type: 'h2', text: line.replace(/^#\s+/, '').trim() }); continue; }
            if (/^>\s?/.test(line)) { flushList(); blocks.push({ type: 'quote', text: line.replace(/^>\s?/, '').trim() }); continue; }
            if (/^(?:[-*+]|\d+\.)\s+/.test(line)) {
                var item = line.replace(/^(?:[-*+]|\d+\.)\s+/, '').trim();
                if (!list) list = { type: 'ul', items: [] };
                list.items.push(item);
                continue;
            }
            if (/^\*\*(.+?)\*\*$/.test(line.trim())) { flushList(); blocks.push({ type: 'h3', text: line.trim().replace(/^\*\*|\*\*$/g, '') }); continue; }

            flushList();
            blocks.push({ type: 'p', text: line.trim().replace(/\*\*(.+?)\*\*/g, '$1') });
        }
        flushList();

        /* An AI draft that produced one paragraph per line of a single thought
           is better as consecutive paragraphs - no merge step needed. */
        return blocks;
    }

    /** Infer a read-time + excerpt for a card when the post has neither. */
    function excerptOf(post, max) {
        var limit = max || 160;
        var e = String((post && post.excerpt) || '').trim();
        if (!e) {
            e = text(post && post.blocks, post && post.content).replace(/\s+/g, ' ').trim();
            if (e.length > limit) e = e.slice(0, limit).replace(/\s+\S*$/, '') + '...';
        }
        return e;
    }

    window.BlogBlocks = {
        esc: esc,
        render: render,
        paragraphs: paragraphs,
        text: text,
        fromText: fromText,
        readMinutes: readMinutes,
        excerptOf: excerptOf
    };
})();
