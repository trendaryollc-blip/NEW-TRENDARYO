# AGENTS.md — TRENDARYO project memory

Read this FIRST. It is the distilled core of the project — do not re-explore the codebase from scratch unless you need file-level detail.

## What this is

TRENDARYO: a production e-commerce platform (60+ pages) — vanilla HTML/CSS/JS frontend, Vercel serverless functions, Firebase backend, Stripe payments, Cloudinary media.

- **Frontend**: vanilla HTML/CSS/JS at repo root (no framework, no bundler). Three.js 3D effects in `hero-3d*.js`, `bg.js`.
- **Backend**: `api/` = Vercel serverless functions (Node.js, CommonJS).
- **DB**: Cloud Firestore, accessed server-side only via Admin SDK (`api/_lib/firebase.js`).
- **Auth**: Firebase Auth (email/password) — client gets a token, API verifies it.
- **Payments**: Stripe PaymentIntents + webhooks (`api/payments/`).
- **Media**: Cloudinary (`api/upload.js`).
- **Deploy**: Vercel (`vercel.json`), Firebase rules (`firestore.rules`, `firestore.indexes.json`).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | local dev server (`scripts/dev-server.js`) |
| `npm run dev:vercel` | `vercel dev` (real serverless runtime) |
| `npm test` | `node --test tests/` (node:test, no framework) |
| `npm run seed` / `seed:fresh` | `scripts/seed-firestore.js` — idempotent seed / wipe+reseed |
| `npm run admin:create -- <email>` | `scripts/create-admin.js` — create/promote admin |
| `node scripts/visual-regression.js` | Playwright screenshot diffing (`visual-diff/`) |
| `node scripts/console-sweep.js` | scan pages for console errors (`console-sweep/`) |

## Architecture map (where things live)

```
api/
  _lib/          firebase.js (Admin SDK), stripe.js, pricing.js (server-side pricing),
                 auth.js (requireAuth/requireAdmin), cors.js, + shared helpers
  auth/          register, logout, forgot-password, me
  products/ cart/ orders/ reviews/ coupons/ users/ wishlist/ blog/ contact/
  products/[id]/content.js   AI content engine: drafts, SEO/images/FAQs, publish workflow
  blog/briefs/               AI blog briefs (auto-created when product content publishes)
  checkout/quote.js   authoritative price/discount/tax/shipping quote
  payments/      create-intent.js, webhook.js, refund.js
  admin/         stats, users, orders, products, audit, supplier*, reorder, health
  cron/          abandoned-checkout, automations, backup, reconciliation, supplier-sync
  config/public.js    public runtime config (Stripe publishable key, flags)
  settings.js upload.js ai.js health.js index.js
admin/           admin SPA (admin.html + backend-sync.js)
  core/product-context.js  Product Context Engine - one canonical product context
                           shared by every AI module (pure, node-testable)
  views/product-detail.js  Product Details page (#/product-detail/<id>) - the
                           source-of-truth page for content/SEO/images/workflow
  views/command.js         Content Command Center (#/content) - one screen for
                           the whole pipeline (API: /api/admin/content-overview)
scripts/         seed-firestore.js, create-admin.js, dev-server.js, data/catalog.js (seed catalog)
*.html           storefront pages (index, shop, product, cart, checkout, account, admin-*)
*.js (root)      api-client.js (fetch + Firebase token), checkout.js (checkout flow),
                 backend-bridge.js (storefront↔API sync), products-data.js (catalog cache),
                 product-schema.js (JSON-LD builder, shared by API + storefront),
                 blog-schema.js (Article/FAQ/Breadcrumb JSON-LD, shared by API + storefront),
                 seo-analysis.js (deterministic SEO/readability scoring + revision suggestions),
                 config.js, components.js, firebase-config.js
tests/           node:test suites (webhook, order-state, stock, risk, supplier-sla, blog-*, product-*)
```

**AI content engine (Milestone 2+)**: AI tasks live in `admin/core/ai.js` (live providers via BYO key, same-origin relay fallback `/api/ai`, Offline Studio deterministic fallback). Generated product content is saved through `POST/PUT/DELETE /api/products/:id/content` — admin-only, workflow `draft → review_pending → ready_to_publish → published` enforced server-side, published snapshots frozen (edits create new drafts, never touch live copy). Collections: `product_content`, `product_faqs`, `product_images`, `product_seo` — Admin-SDK-only writes (see firestore.rules). Storefront reads the frozen snapshot from the same route and renders approved copy + JSON-LD from `product-schema.js`. **Content is never auto-published** — every publish is a human click.

**Blog engine (Milestone 3)**: publishing product content auto-creates a `blog_briefs` doc (status READY_FOR_GENERATION). The Blog Generator (`#/blog/generate?product=<id>`, `admin/views/blog-generate.js`) loads the approved snapshot + brief, offers 8 blog types / length / tone / custom instructions, runs the `blogBrief` + `blogArticle` tasks, and saves the result as a **draft** post via `POST /api/blog` (never published). Article create/publish writes `product_blog_relations` rows and generates Article/FAQ/Breadcrumb JSON-LD into `post.seo.schema` (from `blog-schema.js`), which the storefront injects.

**Clusters, related content, bulk, automation (Milestone 5)**: the generator's topic cluster panel groups a product's articles by `post.seo.blogType` (8 types) with one-click generation for gaps, and new pieces link to cluster siblings. The storefront product page pulls `GET /api/blog?productId=<id>` for related articles; blog posts render same-category related reads. Bulk content (`AI content pack` in Products, `admin/views/catalog.js`) generates content drafts + briefs + blog drafts sequentially, all as drafts. Automation rules `missing-brief-backfill` + `content-draft-escalation` (in `api/_lib/automations.js`, shared brief logic in `api/_lib/content-briefs.js`) keep the pipeline gap-free. **Everything AI-generated lands as a draft** — every publish is a human click.

## Non-negotiable conventions

1. **Server-side pricing**: the client NEVER sends amounts. Prices/discounts/tax are computed on the server from Firestore (`api/_lib/pricing.js`, `api/checkout/quote.js`). Keep it that way for any order/payment change.
2. **Firestore rules block all client-side commerce writes** — Admin SDK only. Users cannot self-elevate role/status/email (`firestore.rules`).
3. **Every admin endpoint must call `requireAdmin`** (`api/_lib/auth.js`) — role checked server-side against Firestore, never client flags.
4. **Stripe webhooks are the source of truth** for payment success — verify signature + amount + metadata before creating/updating an order.
5. **Frontend is framework-free** — plain DOM, no npm build step for client code. Match the existing style (ES modules/global scripts as used per file).
6. **All commerce state syncs through `backend-bridge.js` / `api-client.js`** — don't add parallel fetch paths.

## Environment

Config comes from `.env` (see `.env.example`): Firebase service account, Stripe keys, Cloudinary keys. Local dev must have `.env` populated; public config is exposed only via `GET /api/config/public`.

## When working here

- Change backend behavior → check matching `tests/` file; run `npm test`.
- Change storefront UI → run `npm run dev` and check affected page; use visual-regression/console-sweep for regressions.
- API route shape: Vercel-style `module.exports = async (req, res)` with `res.status(...).json(...)`; dynamic segments via `[id].js`.
- Full endpoint list and setup steps: see `README.md`.
