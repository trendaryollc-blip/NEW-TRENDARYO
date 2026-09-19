# TRENDARYO - Premium E-Commerce Platform

A fully functional, enterprise-grade e-commerce platform with 3D UI effects, Firebase backend, Stripe payments, and Cloudinary media storage.

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS with Three.js 3D effects
- **Backend**: Vercel Serverless Functions (Node.js)
- **Database**: Cloud Firestore
- **Authentication**: Firebase Auth
- **Payments**: Stripe (PaymentIntents + Webhooks)
- **Media Storage**: Cloudinary
- **Deployment**: Vercel

## Features

- Full shopping cart with localStorage + Firestore sync
- Stripe payment integration (Credit/Debit cards + COD) with server-side pricing
- Firebase Authentication (login, register, password reset, email verification)
- Admin dashboard (admin.html) with product/order/user/coupon/review/newsletter management backed by the live API
- Cloudinary image/video uploads
- 60+ responsive pages with dark cosmic theme
- Three.js 3D background effects
- SEO optimized with sitemap and meta tags

## Security

- **Server-side pricing**: client never sends amounts. Orders and PaymentIntents are priced on the server from Firestore (`api/_lib/pricing.js`), and payments are verified (`payment_intent.succeeded`, amount, metadata) before an order is created.
- **Firestore rules**: all commerce writes are blocked to the client SDK (Admin SDK only). Users cannot self-elevate to admin or modify their role/status/email. See `firestore.rules`.
- **Admin API**: every admin endpoint enforces a server-side role check (`requireAdmin`) against Firestore, not client-stored flags.

## Setup

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd trendaryo
npm install
```

### 2. Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
cp .env.example .env
```

Required variables:
- `FIREBASE_PROJECT_ID` - Your Firebase project ID
- `FIREBASE_CLIENT_EMAIL` - Firebase service account email
- `FIREBASE_PRIVATE_KEY` - Firebase service account private key
- `STRIPE_SECRET_KEY` - Stripe secret key
- `STRIPE_PUBLISHABLE_KEY` - Stripe publishable key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook signing secret
- `CLOUDINARY_CLOUD_NAME` - Cloudinary cloud name
- `CLOUDINARY_API_KEY` - Cloudinary API key
- `CLOUDINARY_API_SECRET` - Cloudinary API secret

### 3. Firebase Setup

1. Create a Firebase project at https://console.firebase.google.com
2. Enable Firestore, Firebase Auth (Email/Password)
3. Create a service account and download the key
4. Update the `firebaseConfig` in `firebase-config.js` with your project credentials
5. Deploy Firestore rules **and indexes**:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

### 4. Seed the database & create the first admin

```bash
# Builds a service account from .env and seeds products, categories,
# coupons, settings, demo reviews, orders, and 3 demo customers.
npm run seed        # idempotent upsert
npm run seed:fresh  # wipe + reseed (dev only)
```

```bash
# Creates (or promotes) an admin user. Must already exist in Firebase Auth.
npm run admin:create -- admin@trendaryo.com
# optional password argument: npm run admin:create -- admin@trendaryo.com mypass
```

The default admin can then sign in at `admin-login.html`.

### 5. Stripe Setup

1. Create a Stripe account at https://stripe.com
2. Get your API keys from the Stripe dashboard
3. Create a webhook endpoint pointing to `/api/payments/webhook`
4. Subscribe to `payment_intent.succeeded` and `payment_intent.payment_failed` events

### 6. Cloudinary Setup

1. Create a Cloudinary account at https://cloudinary.com
2. Get your cloud name, API key, and API secret from the dashboard

### 7. Deploy to Vercel

```bash
vercel deploy --prod
```

Or connect your GitHub repo to Vercel for automatic deployments.

## API Endpoints

### Auth
- `POST /api/auth/register` - Register new user
- `POST /api/auth/logout` - Logout
- `POST /api/auth/forgot-password` - Send password reset email
- `GET /api/auth/me` - Current user (server-read role)

### Products
- `GET /api/products` - List products (with filters)
- `POST /api/products` - Create product (admin)
- `GET /api/products/[id]` - Get product
- `PUT /api/products/[id]` - Update product (admin)
- `DELETE /api/products/[id]` - Delete product (admin)

### Cart
- `GET /api/cart` - Get user cart
- `POST /api/cart` - Add to cart
- `PUT /api/cart` - Update cart
- `DELETE /api/cart` - Clear cart

### Orders
- `GET /api/orders` - List user orders
- `POST /api/orders` - Create order
- `GET /api/orders/[id]` - Get order
- `PUT /api/orders/[id]` - Update order

### Payments
- `POST /api/payments/create-intent` - Create Stripe PaymentIntent (server-priced)
- `POST /api/payments/webhook` - Stripe webhook handler
- `POST /api/payments/refund` - Process refund (admin)

### Coupons
- `POST /api/coupons/validate` - Validate a coupon code against a cart

### Reviews
- `GET /api/reviews?productId=xxx` - Get product reviews
- `GET /api/reviews` - Get all reviews (admin)
- `POST /api/reviews` - Create review
- `PUT /api/reviews/[id]` - Update review
- `DELETE /api/reviews/[id]` - Delete review

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update profile

### Admin
- `GET /api/admin/stats` - Dashboard statistics
- `GET /api/admin/users` - List users
- `GET /api/admin/orders` - List all orders
- `GET /api/admin/products` - List all products
- `PUT/DELETE /api/admin/users/[id]` - Update/delete user (admin)

### Config
- `GET /api/config/public` - Public config (Stripe publishable key)

### Settings / Newsletter
- `GET /api/settings` - Store settings (public)
- `PUT /api/settings` - Update settings (admin)
- `POST /api/newsletter` - Subscribe email
- `DELETE /api/newsletter?email=x` - Unsubscribe (admin)

### Upload
- `POST /api/upload` - Upload file to Cloudinary

## Project Structure

```
/
├── api/                    # Vercel serverless functions
│   ├── _lib/              # Shared utilities
│   │   ├── firebase.js    # Firebase Admin SDK
│   │   ├── stripe.js      # Stripe client
│   │   ├── pricing.js     # Server-side pricing (orders, coupons)
│   │   ├── auth.js        # Auth middleware (requireAuth, requireAdmin)
│   │   └── cors.js        # CORS handler
│   ├── auth/              # Auth routes
│   ├── products/          # Product routes
│   ├── cart/              # Cart routes
│   ├── orders/            # Order routes
│   ├── payments/          # Stripe payment routes
│   ├── reviews/           # Review routes
│   ├── coupons/           # Coupon validation
│   ├── users/             # User routes
│   ├── admin/             # Admin routes
│   │   ├── orders.js      # List all orders
│   │   ├── users.js       # List users
│   │   └── stats.js       # Dashboard statistics
│   ├── settings.js        # Store settings
│   └── upload.js          # Cloudinary upload
├── admin/                 # Admin SPA (admin.html + backend-sync.js)
├── scripts/               # Seed & admin bootstrap
│   ├── data/catalog.js    # Seed catalog (products/categories/coupons/settings)
│   ├── seed-firestore.js  # npm run seed (idempotent)
│   └── create-admin.js    # npm run admin:create
├── assets/                # Static assets
├── js/                    # Utility scripts
├── public/                # Public files (sitemap)
├── *.html                 # Frontend pages
├── *.js                   # Frontend scripts
│   ├── api-client.js      # API client (Firebase token auth)
│   ├── backend-bridge.js  # Storefront <-> backend sync
│   ├── products-data.js   # Catalog (backend-cache first)
│   └── config.js          # Async /api/config/public fetch
├── *.css                  # Stylesheets
├── firestore.rules        # Firestore security rules
├── firestore.indexes.json # Firestore indexes
├── vercel.json            # Vercel config
└── package.json           # Dependencies + seed/admin scripts
```

## License

MIT
