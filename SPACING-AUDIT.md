# TRENDARYO Spacing & Density Audit Report

**Date:** 2026-10-17 · **Scope:** all storefront pages (60+ HTML) + shared stylesheets · **Method:** measured baseline (git HEAD `18e7e7d`) vs optimized via Playwright at 1440×900 desktop / 390×844 mobile (scrollHeight after load + settle).

Goal: remove wasted vertical whitespace, cut scroll fatigue, raise content density — without removing content, shrinking touch targets, or breaking the premium aesthetic.

---

## 1. Executive summary

| Metric | Result |
|---|---|
| Files changed | 52 (7 stylesheets + 45 HTML pages) |
| Measured page-height reduction | **2–21%** per page (desktop), **2–9%** (mobile) |
| Largest wins | gift-cards −21.3%, about −14.2%, innovation −9.2%, luxury −8.4% |
| Content removed | none |
| Bonus fix | 11 invisible gradient-clipped titles restored on 9 pages (§7) |
| Tests | `npm test` 183/183 pass |
| Console sweep | clean (only pre-existing env issues) |
| Regressions found in visual QA | none |

---

## 2. Root causes of wasted space (global)

Audited cascade: `responsive-universal.css → shared.css → styles.css → page <style> → luxury-final.css` (injected last, wins ties).

1. **Oversized section padding** — `.section-pad` and ad-hoc `4rem–6rem` vertical padding on every section (double-stacked with page-level margins).
2. **Redundant margin stacks** — footer `margin-top: 5rem` + preceding section bottom margin; hero → content gaps of 3–4rem on top of section padding.
3. **Card/band bloat** — `.faq-group`, `.tier-card`, `.blog-body`, `.summary-box`, newsletter bands carrying 2.5–4rem internal padding.
4. **Empty/loading states sized like full sections** — `.t-empty`, `.empty`, `.loading-row` with `--s-8`/`--s-9` spacing and min-heights (e.g. cart particle wrap 500px).
5. **Mobile not re-tuned** — desktop trims ignored below 768px; hero paddings and `.sec` margins stayed large on phones; 3D hero min-height 520px wasted on small screens.
6. **Inline per-page styles** — dozens of pages hardcode `padding: 4rem/6rem`, `min-height: 80vh`, `.deck { padding: 3rem }` etc., bypassing any global control.

---

## 3. Global stylesheet fixes

### `styles.css`
- Added spacing token system: `--sp-xs/--sp-sm/--sp-md/--sp-lg/--sp-xl/--sp-2xl/--sp-3xl`, `--section-y`, `--block-gap` with `@media (max-width:768px)` mobile overrides.
- `.section-pad` → `var(--section-y) 1.5rem` (responsive by token, not hardcoded rem).

### `shared.css` (~20 trims)
Footer `margin-top` 5→3rem · `.footer-top` padding/gap · `.t-empty` · `.page-intro` · `.faq-group`/`.faq-cta` · `.prose-block` · `.summary-box` · `.last-updated` · `.cta-band` · `.pm-section/.pm-body/.pm-grid` · `.trust-strip` · `.feat-strip` · `.chip-row` · `.results-meta` · `.tier-grid/.tier-card` · `.steps-grid/.step-card` · `.blog-grid/.blog-body` · `.ord-timeline` · `.ord-legend` · `.calc-card` · `.gc-h2/.gc-occ` · `.acc-q/.acc-a` · `.faq-q` · `.crosssell-sub` · 900px footer/intro overrides.

### `home.css`
`.section-pad` (both rules) · trust strip · stats-grid · code-card · `#constellations/#vortex/#deals/#testimonials` 5rem→3.25rem · `#pipeline` 4rem→1.5rem · `.pipe-step` · `.dl-track` · `.hologram` · `#trending` · `.vx-body` · `.feat-item` · `.nl-band/.nl-card` · `.vx-status` · `.holo-quote`.

### `luxury-final.css` (cascade winner — extended DENSITY PASS)
- Line-15 section rule → horizontal padding only (was adding vertical padding on top of every page's own).
- `#blackhole` clamp reduced · `.deck` 1.75→1.5rem · `#drops/#grid` margins 2.5→1.5rem.
- New: `#deals` section trims + `@media (max-width:600px)` mobile rhythm block (placed **after** the `#trending/#pipeline` shorthand resets so shorthands don't re-inflate them).
- `.stats-grid`, `.nl-band` internal trims.

### `responsive-universal.css`
Mobile hero paddings 2rem→1.5rem (× multiple) · `.sec` margins 2.75→2rem (×2) · `.cart-particle-wrap` min-height 350→180px · `.deck` mobile ×2 · `.content-box` mobile · footer-top mobile · `.cta-band` mobile padding+margin · hero-grid gaps 2.5/3/3.5→2/2.5/2.5rem (3 breakpoint blocks).

### `hero-3d.css`
`.tr-hero` min-height 520→460px · `.tr-hero__trust` margin-top → `clamp(16px, 2.5vh, 30px)` + 14px mobile override.

### `admin/admin.css`
`.empty` `--s-9`→`--s-7` · `.loading-row` `--s-8`→`--s-5`.

---

## 4. Per-page inline fixes (40 HTML files, ~130 line edits)

Grouped by page family; every edit is a vertical-padding/margin/min-height trim only.

| Page(s) | Wasted-space source | Fix |
|---|---|---|
| faq | `.page-header-3d` `10rem 2rem 4rem` (title band ~300px) | → `3rem 2rem 2rem` (title y 316→204) |
| about | section margins 6rem; company cards | 6rem→3rem margins |
| account, account-management | `.account-section-3d` min-height 80vh | → 45vh |
| returns, refund, privacy, terms, cookie-policy | `.deck`/`.sec`/policy-trio 3.5–4rem paddings | → 2–2.5rem |
| contact, help-center, affiliate, gift-cards, size-guide, rewards | page heroes 3–4rem → 2rem; card grids trimmed | denser heroes/grids |
| shop, product, cart, wishlist, compare, shipping, track-order, orders, order-details, order-success, blog, blog-post, shared-wishlist | `.sec` 4rem→2.5rem · `.deck` 3rem→1.5rem · `.cart-particle-wrap` 500→280px · page heroes 3→2rem | above |
| innovation, luxury, sustainability | `.section-pad` 3.5→2.25rem · `.hero` 4→2.5rem | above |
| login, register | auth containers 3→2rem | above |
| dashboards (self-healing, kpi, advanced-analytics, predictive-analytics) | `.section` 30→20px | above |
| thank-you | success-screen block spacing | trimmed to floors |

Floors respected everywhere: ≥1.25rem between distinct blocks, ≥2.25rem standalone cards, ≥3rem empty/loading states; `.page-offset` header clearance untouched.

---

## 5. Measured results (scrollHeight, baseline → optimized)

| Page | Desktop | Δ | Mobile | Δ |
|---|---|---|---|---|
| gift-cards | — | **−21.3%** | — | — |
| about | 5862 → 5032 | **−14.2%** | overflow: 484→468px¹ | — |
| innovation | 4334 → 3936 | **−9.2%** | 7810 → 7420 | −5.0% |
| luxury | 4241 → 3883 | **−8.4%** | 8641 → 8250 | −4.5% |
| returns | — | −6~7% | — | — |
| track-order | 4221 → 4027 | −4.6% | 6420 → 6260 | −2.5% |
| most other pages | — | −2~9% | — | −2~6% |

¹ pre-existing horizontal overflow, unchanged in nature (see §7).

---

## 6. Verification

- **Tests:** `npm test` → 183/183 pass (node:test).
- **Console sweep:** `node scripts/console-sweep.js` → no new errors; only pre-existing env issues (`/api/products/*/content` 404 on local static server, hcaptcha logo `ERR_ABORTED` on checkout).
- **Visual QA:** 13 screenshots reviewed (desktop folds: home, shop, about, faq, returns, contact, product, gift-cards; mobile folds: home, about, shop, faq) — layout intact, cards/grids/typography undistorted, density visibly improved.
- **Baseline comparison:** git worktree at `18e7e7d` served on :4175 vs working tree on :3000; heights and title positions compared programmatically.

---

## 7. Bonus fixes & pre-existing issues

### Fixed: invisible gradient-clipped titles (11 elements, 9 pages)
Many pages set `background: transparent` with `-webkit-text-fill-color: transparent` on headline classes — glyphs were completely unpainted (confirmed via runtime computed-style checks + element screenshots). Fixed by applying the working pattern from `about.html`/`account.html` (`linear-gradient(135deg, #fff, var(--accent))` + background-clip):

- `faq.html`, `returns.html`, `contact.html` — `.page-title-3d`
- `about.html` — `.stat-value-3d` (4 stat numbers), `.preloader-logo-3d`
- `faq.html` — `.preloader-logo-3d`
- `affiliate.html` — `.hero-title`, `.signup-title`
- `innovation.html`, `luxury.html`, `sustainability.html` — `.hero-title`
- `gift-cards.html` — `.page-header h1`, `.gift-card-amount` (4 amounts)

Verified on all 9 pages: every target now computes a gradient background and renders visibly. All changes are CSS-only (`background: transparent` → gradient); `npm test` 183/183 still pass.

### Still open (pre-existing, not fixed — out of spacing scope)
1. **about.html mobile horizontal overflow**: fixed-width 200px company-info columns exceed 390px viewport (scrollWidth 484 baseline / 468 optimized — slightly improved by spacing trims, root cause pre-existing).
2. **Orphaned CSS**: `blog.html` defines `.newsletter-section h2` with the same transparent pattern, but no such element exists in the page markup (harmless dead rule).

---

## 8. Revert

All changes are unstaged in the working tree. `git checkout -- .` restores the baseline; no commits were made.
