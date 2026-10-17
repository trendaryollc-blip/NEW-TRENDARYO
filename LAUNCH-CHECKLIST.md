# TRENDARYO — Launch Checklist

One page. Do it in order. Nothing here is optional.

## 1. Freeze the code
- [ ] `git add -A` review: 100+ changed/untracked files on `main`, including all of `admin/core`, `admin/views`, `api/**`, `tests/**`
- [ ] Commit on `main`, push, confirm the Vercel build succeeds (not just deploys)
- [ ] `npm test` passes on the commit (176+ tests; script is `node --test "tests/*.test.js"`)

## 2. Production environment (Vercel dashboard — never commit these)
- [ ] `STRIPE_SECRET_KEY` = **live** `sk_live_...` (example file still shows test keys)
- [ ] `STRIPE_PUBLISHABLE_KEY` = **live** `pk_live_...`
- [ ] `STRIPE_WEBHOOK_SECRET` = live `whsec_...`, webhook endpoint = `https://<domain>/api/payments/webhook`
- [ ] Firebase service account (`FIREBASE_*`) for the **production** project
- [ ] Cloudinary live credentials, Resend API key + verified sender domain
- [ ] `CORS_ORIGIN=https://<domain>`, `NODE_ENV=production`
- [ ] `CRON_SECRET` set, and every cron caller sends it (`Authorization: Bearer`)
- [ ] `grep -r "sk_test\|pk_test" --include="*.js" --include="*.html" .` returns nothing

## 3. Firebase (production project)
- [ ] `firebase deploy --only firestore:rules,firestore:indexes` (the `?productId=` article filter needs its composite index or related articles 500)
- [ ] `npm run seed` — idempotent; builds products/categories/coupons (never `seed:fresh` in prod)
- [ ] `npm run admin:create -- <email>` — without a `role: admin` user row, every admin call 403s
- [ ] Sign in at `/admin-login.html` as that admin; open Products, Blog, Content, Automations — all load with data

## 4. End-to-end smoke (do this on the production deployment)
- [ ] **New product flow**: add a product in admin → confirm "synced to the catalog" toast → auto content draft appears → submit → approve → **publish succeeds** (this exercises the clientId bridge)
- [ ] **Blog flow**: Create SEO Blog from the product → generate brief → generate article → publish → article live at `/blog-post.html?slug=...` with product cards + related reads
- [ ] **Money flow**: live-mode test purchase → order created → Stripe webhook delivered (check `stripe_events`) → refund from admin works
- [ ] **Crons observed firing once**: `publish-posts`, `automations`, `reconciliation`, `abandoned-checkout`, `backup` (check `system_health` probes)

## 5. Storefront verification
- [ ] `node scripts/console-sweep.js` — zero console errors on index/shop/product/cart/checkout/blog
- [ ] `node scripts/visual-regression.js` — no unexpected diffs
- [ ] Related-articles rail renders on a product with published articles
- [ ] Validate one product page + one article in Google's Rich Results Test (Product/Offer/Article/FAQ schema)
- [ ] `/sitemap.xml` and `/rss.xml` return 200 with current content

## 6. AI content engine readiness
- [ ] Paste an AI provider key in Admin → Settings → AI configuration, run the connection test (or consciously accept Offline Studio drafts)
- [ ] Content Command Center (`#/content`) shows the pipeline with correct counts
- [ ] `missing-brief-backfill` + `content-draft-escalation` rules enabled in Automations

## 7. Rollback plan
- [ ] Know the previous good Vercel deployment; `vercel rollback` is one command
- [ ] Firestore backup exists before any reseed (`/api/cron/backup` or console export)
- [ ] `/api/admin/health` is green and `system_health` probes are fresh post-launch

Fixed pre-launch (no action needed): `npm test` script, `/upload` admin gate,
product create `clientId` bridge, dead Products bulk-bar bindings.
