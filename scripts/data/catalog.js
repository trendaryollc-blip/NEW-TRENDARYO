/**
 * Canonical demo catalogue for Trendaryo.
 *
 * Imported by:
 *   - scripts/seed-firestore.js  (writes it into Firestore)
 *
 * Shape matches the Firestore `products` collection exactly, so once seeded the
 * storefront renders it with zero extra mapping.
 */

const IMG = (id) =>
  'https://images.unsplash.com/' + id + '?auto=format&fit=max&w=900&q=80';

const categories = [
  { id: 'electronics', name: 'Electronics', description: 'Audio, wearables, cameras and everyday tech.', order: 1, status: 'active' },
  { id: 'gaming', name: 'Gaming', description: 'Gear built for play.', order: 2, status: 'active' },
  { id: 'fashion', name: 'Fashion', description: 'Bags, footwear and accessories.', order: 3, status: 'active' },
  { id: 'home', name: 'Home & Living', description: 'Kitchen, wellness and smart home.', order: 4, status: 'active' },
  { id: 'accessories', name: 'Accessories', description: 'The small things that matter.', order: 5, status: 'active' },
];

/* Deterministic pseudo-random derived from a string (best-effort stable values
   like weight / popularity across re-seeds, per product rather than random). */
function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
  return Math.abs(h);
}

/* Turn a raw product record into the canonical Firestore `products` document.
   Convention mirrors what big catalogues do:
     - doc id      = SEO slug (shopify-style handle): sony-wh-1000xm5
     - searchTerms = lowercase token array for array-contains queries
     - nameLower / brandLower / categoryLower for fast case-insensitive sort+filter
     - metaTitle / metaDescription / tags for SEO and on-platform search */
function enrich(data) {
  // Doc id = clean SEO slug derived from the NAME only (stable, preserves the
  // original 25 curated handles that pages already link to).
  const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');

  // Search tokens from name + brand + category + specs + features + tags.
  const words = new Set();
  const hay = data.name + ' ' + (data.brand || '') + ' ' + (data.category || '');
  hay.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).forEach((w) => words.add(w));
  (data.specs || []).forEach((s) => {
    String(s.value || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).forEach((w) => words.add(w));
  });
  (data.features || []).forEach((f) => {
    f.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).forEach((w) => words.add(w));
  });
  (data.tags || []).forEach((t) => words.add(String(t).toLowerCase()));
  const searchTerms = Array.from(words).filter((w) => w.length > 1).slice(0, 40);

  const h = hashCode(slug);
  return {
    slug,
    currency: 'USD',
    status: data.status || 'active',
    brand: data.brand || 'Trendaryo',
    images: data.images || [data.image].filter(Boolean),
    features: data.features || [],
    specs: data.specs || [],
    // Search & SEO
    searchTerms,
    nameLower: data.name.toLowerCase(),
    brandLower: (data.brand || '').toLowerCase(),
    categoryLower: (data.category || '').toLowerCase(),
    metaTitle: (data.metaTitle || data.name + ' | Trendaryo'),
    metaDescription: (data.metaDescription || String(data.description || '').slice(0, 150)),
    tags: data.tags || [],
    // Logistics / dropshipping
    weight: data.weight != null ? data.weight : 100 + (h % 140) + (h % 7) * 100,
    vendor: data.vendor || '',
    ...data,
  };
}

function p(data) {
  return enrich(data);
}

const products = [
  p({
    name: 'Wireless Headphones', description: 'Premium ANC headphones with 30-hour battery and Hi-Res audio.',
    price: 149, originalPrice: 199, category: 'electronics', brand: 'AudioTech', stock: 42, sku: 'AUDIO-001',
    emoji: '🎧', badge: 'hot', rating: 4.8, reviewCount: 234,
    image: IMG('photo-1546435770-a3e426bf472b'),
    features: ['Hybrid active noise cancelling', '30-hour battery life', 'Bluetooth 5.3 + 3.5mm', 'Foldable design'],
    specs: [{ label: 'Driver size', value: '40mm dynamic' }, { label: 'Battery', value: '30 hours' }, { label: 'Weight', value: '254 g' }, { label: 'Warranty', value: '2 years' }],
  }),
  p({
    name: 'Smart Fitness Band', description: 'Track steps, heart rate, sleep and GPS with 7-day battery life.',
    price: 79, originalPrice: 129, category: 'electronics', brand: 'FitPro', stock: 65, sku: 'WEAR-001',
    emoji: '⌚', badge: 'trending', rating: 4.5, reviewCount: 156,
    image: IMG('photo-1583454110551-21f2fa2afe61'),
    specs: [{ label: 'Display', value: '1.47" AMOLED' }, { label: 'Battery', value: '7 days' }, { label: 'Water resistance', value: '5 ATM' }],
  }),
  p({
    name: 'Designer Backpack', description: 'Water-resistant 30L backpack with USB charging port and laptop sleeve.',
    price: 199, originalPrice: 299, category: 'fashion', brand: 'StyleCo', stock: 30, sku: 'FASH-001',
    emoji: '🎒', badge: 'premium', rating: 4.7, reviewCount: 189,
    image: IMG('photo-1548036328-c9fa89d128fa'),
    specs: [{ label: 'Capacity', value: '30 litres' }, { label: 'Material', value: '900D water-resistant' }, { label: 'Laptop', value: 'Up to 16"' }],
  }),
  p({
    name: 'Gaming Laptop', description: 'RTX 4060, 16GB RAM, 1TB SSD — built for high-performance gaming.',
    price: 1299, originalPrice: 1599, category: 'gaming', brand: 'NovaTech', stock: 12, sku: 'GAME-100',
    emoji: '💻', badge: 'premium', rating: 4.9, reviewCount: 312,
    image: IMG('photo-1499951360447-b19be8fe80f5'),
    specs: [{ label: 'GPU', value: 'RTX 4060 8GB' }, { label: 'CPU', value: 'Intel i7 13th gen' }, { label: 'Memory', value: '16GB DDR5' }, { label: 'Storage', value: '1TB NVMe' }],
  }),
  p({
    name: 'Wireless Earbuds', description: 'True wireless with 28-hour total battery and IPX5 water resistance.',
    price: 89, originalPrice: 149, category: 'electronics', brand: 'AudioTech', stock: 88, sku: 'AUDIO-003',
    emoji: '🎵', badge: 'trending', rating: 4.6, reviewCount: 267,
    image: IMG('photo-1470337458703-46ad1756a187'),
    specs: [{ label: 'Battery', value: '8h + 28h case' }, { label: 'Water resistance', value: 'IPX5' }, { label: 'Charging', value: 'USB-C + wireless' }],
  }),
  p({
    name: 'Smart Watch Pro', description: 'ECG, SpO2, GPS and 5-day battery in a sleek titanium case.',
    price: 299, originalPrice: 399, category: 'electronics', brand: 'FitPro', stock: 24, sku: 'WEAR-002',
    emoji: '⌚', badge: 'hot', rating: 4.8, reviewCount: 445,
    image: IMG('photo-1523293182086-7651a899d37f'),
    specs: [{ label: 'Case', value: 'Grade-5 titanium' }, { label: 'Sensors', value: 'ECG, SpO2, GPS' }, { label: 'Battery', value: '5 days' }],
  }),
  p({
    name: 'Premium Sneakers', description: 'Lightweight foam sole with breathable knit upper for all-day comfort.',
    price: 159, originalPrice: 229, category: 'fashion', brand: 'Urban', stock: 54, sku: 'FASH-002',
    emoji: '👟', badge: 'trending', rating: 4.4, reviewCount: 198,
    image: IMG('photo-1595950653106-6c9ebd614d3a'),
    specs: [{ label: 'Upper', value: 'Engineered knit' }, { label: 'Midsole', value: 'Responsive EVA' }, { label: 'Sizes', value: 'UK 5 – 13' }],
  }),
  p({
    name: 'Portable Speaker', description: '360° sound, IPX7 waterproof, 20-hour playtime, built-in powerbank.',
    price: 119, originalPrice: 179, category: 'electronics', brand: 'SoundWave', stock: 47, sku: 'AUDIO-004',
    emoji: '🔊', badge: 'hot', rating: 4.7, reviewCount: 223,
    image: IMG('photo-1518987048-93e29699e79a'),
    specs: [{ label: 'Output', value: '30W stereo 360°' }, { label: 'Battery', value: '20 hours' }, { label: 'Water resistance', value: 'IPX7' }],
  }),
  p({
    name: '4K Action Camera', description: '4K/60fps, 20MP, HyperSmooth stabilisation and 170° wide lens.',
    price: 349, category: 'electronics', brand: 'VisionPro', stock: 20, sku: 'CAM-001',
    emoji: '📷', badge: 'new', rating: 4.8, reviewCount: 98,
    image: IMG('photo-1526170375885-4d8ecf77b99f'),
    specs: [{ label: 'Video', value: '4K 60fps' }, { label: 'Sensor', value: '20MP' }, { label: 'Waterproof', value: '10 m' }],
  }),
  p({
    name: 'Mechanical Keyboard', description: 'RGB per-key lighting, hot-swap switches, aluminium frame.',
    price: 129, originalPrice: 159, category: 'gaming', brand: 'KeyMaster', stock: 38, sku: 'GAME-002',
    emoji: '⌨️', badge: 'trending', rating: 4.6, reviewCount: 142,
    image: IMG('photo-1618384887929-16ec33fab9ef'),
    specs: [{ label: 'Switches', value: 'Hot-swappable' }, { label: 'Layout', value: 'Full-size 104 keys' }, { label: 'Lighting', value: 'Per-key RGB' }],
  }),
  p({
    name: 'Gaming Mouse', description: '25,600 DPI optical sensor, 11 programmable buttons, 70-hour battery.',
    price: 79, category: 'gaming', brand: 'GamePro', stock: 96, sku: 'GAME-003',
    emoji: '🖱️', badge: 'hot', rating: 4.7, reviewCount: 176,
    image: IMG('photo-1527864550417-7fd91fc51a46'),
    specs: [{ label: 'Sensor', value: '25,600 DPI' }, { label: 'Buttons', value: '11 programmable' }, { label: 'Battery', value: '70 hours' }],
  }),
  p({
    name: 'Ultrawide Monitor', description: '34" 3440×1440 IPS, 144Hz, 1ms, HDR400, USB-C 65W charging.',
    price: 699, category: 'electronics', brand: 'VisionPro', stock: 14, sku: 'ELEC-010',
    emoji: '🖥️', badge: 'premium', rating: 4.9, reviewCount: 87,
    image: IMG('photo-1517336714731-489689fd1ca8'),
    specs: [{ label: 'Panel', value: '34" IPS 3440×1440' }, { label: 'Refresh', value: '144Hz / 1ms' }, { label: 'Ports', value: 'USB-C 65W, HDMI, DP' }],
  }),
  p({
    name: 'Noise-Cancel Earphones', description: 'Hybrid ANC, 10mm drivers, 32-hour battery, multipoint pairing.',
    price: 199, category: 'electronics', brand: 'AudioTech', stock: 51, sku: 'AUDIO-005',
    emoji: '🎶', badge: 'new', rating: 4.5, reviewCount: 64,
    image: IMG('photo-1516035069371-29a1b244cc32'),
    specs: [{ label: 'ANC', value: 'Hybrid' }, { label: 'Battery', value: '32 hours' }, { label: 'Pairing', value: 'Multipoint' }],
  }),
  p({
    name: 'Smart Home Hub', description: 'Controls 100+ devices, works with Alexa, Google & HomeKit.',
    price: 99, category: 'home', brand: 'HomeLink', stock: 73, sku: 'HOME-001',
    emoji: '🏠', badge: 'trending', rating: 4.3, reviewCount: 118,
    image: IMG('photo-1593642632823-8f785ba67e45'),
    specs: [{ label: 'Compatibility', value: '100+ devices, Matter' }, { label: 'Assistants', value: 'Alexa, Google, HomeKit' }, { label: 'Connectivity', value: 'Wi-Fi, BT, Zigbee' }],
  }),
  p({
    name: 'Drone Mini Pro', description: '4K camera, 34-min flight, obstacle avoidance, foldable design.',
    price: 599, category: 'electronics', brand: 'SkyLine', stock: 9, sku: 'DRN-001',
    emoji: '🚁', badge: 'premium', rating: 4.8, reviewCount: 93,
    image: IMG('photo-1587202372775-e229f172b9d7'),
    specs: [{ label: 'Camera', value: '4K 30fps gimbal' }, { label: 'Flight time', value: '34 minutes' }, { label: 'Weight', value: '249 g' }],
  }),
  p({
    name: 'Portable Charger 20K', description: '20,000mAh, 65W PD, charges laptop + 2 phones simultaneously.',
    price: 59, category: 'accessories', brand: 'PowerTech', stock: 140, sku: 'ACC-001',
    emoji: '🔋', badge: 'hot', rating: 4.6, reviewCount: 204,
    image: IMG('photo-1585386959984-a4155224a1ad'),
    specs: [{ label: 'Capacity', value: '20,000 mAh' }, { label: 'Output', value: '65W USB-C PD' }, { label: 'Ports', value: '2× USB-C, 1× USB-A' }],
  }),
  p({
    name: 'Leather Wallet', description: 'Full-grain leather, RFID blocking, slim profile, 8 card slots.',
    price: 49, category: 'fashion', brand: 'StyleCo', stock: 110, sku: 'FASH-003',
    emoji: '👜', badge: 'new', rating: 4.4, reviewCount: 76,
    image: IMG('photo-1571781926291-c477ebfd024b'),
    specs: [{ label: 'Material', value: 'Full-grain leather' }, { label: 'Security', value: 'RFID blocking' }, { label: 'Slots', value: '8 card slots' }],
  }),
  p({
    name: 'Sunglasses UV400', description: 'Polarised lenses, TR90 frame, 100% UV protection, unisex design.',
    price: 89, category: 'fashion', brand: 'Urban', stock: 84, sku: 'FASH-004',
    emoji: '🕶️', badge: 'trending', rating: 4.5, reviewCount: 132,
    image: IMG('photo-1572635196237-14b3f281503f'),
    specs: [{ label: 'Lens', value: 'Polarised UV400' }, { label: 'Frame', value: 'TR90 polymer' }, { label: 'Protection', value: '100% UVA/UVB' }],
  }),
  p({
    name: 'Coffee Maker Pro', description: '15-bar espresso, built-in grinder, milk frother, 1.8L tank.',
    price: 249, category: 'home', brand: 'HomeLink', stock: 26, sku: 'HOME-002',
    emoji: '☕', badge: 'premium', rating: 4.7, reviewCount: 85,
    image: IMG('photo-1495474472287-4d71bcdd2085'),
    specs: [{ label: 'Pressure', value: '15-bar' }, { label: 'Grinder', value: 'Conical burr' }, { label: 'Tank', value: '1.8 litres' }],
  }),
  p({
    name: 'Yoga Mat Premium', description: '6mm thick, non-slip surface, alignment lines, carry strap included.',
    price: 45, category: 'home', brand: 'ZenFlow', stock: 130, sku: 'HOME-003',
    emoji: '🧘', badge: 'new', rating: 4.3, reviewCount: 59,
    image: IMG('photo-1593810450967-f9c42742e326'),
    specs: [{ label: 'Thickness', value: '6 mm' }, { label: 'Surface', value: 'Non-slip' }, { label: 'Size', value: '183 × 61 cm' }],
  }),
  p({
    name: 'Running Shoes X', description: 'Carbon fibre plate, responsive foam, breathable mesh upper.',
    price: 179, category: 'fashion', brand: 'Urban', stock: 62, sku: 'FASH-005',
    emoji: '👟', badge: 'hot', rating: 4.8, reviewCount: 167,
    image: IMG('photo-1525966222134-fcfa99b8ae77'),
    specs: [{ label: 'Plate', value: 'Carbon fibre' }, { label: 'Midsole', value: 'Super foam' }, { label: 'Weight', value: '232 g' }],
  }),
  p({
    name: 'Wireless Charger Pad', description: '15W fast charge, Qi-certified, works with all Qi devices.',
    price: 35, category: 'accessories', brand: 'PowerTech', stock: 175, sku: 'ACC-002',
    emoji: '⚡', badge: 'trending', rating: 4.4, reviewCount: 188,
    image: IMG('photo-1544724569-5f546fd6f2b5'),
    specs: [{ label: 'Output', value: '15W' }, { label: 'Standard', value: 'Qi-certified' }, { label: 'Cable', value: '1.2 m USB-C' }],
  }),
  p({
    name: 'Smart LED Strip 5m', description: '16M colours, music sync, app control, works with Alexa & Google.',
    price: 29, category: 'home', brand: 'HomeLink', stock: 0, sku: 'HOME-004',
    emoji: '💡', badge: 'new', rating: 4.2, reviewCount: 71,
    image: IMG('photo-1529641484336-ef35148bab06'),
    specs: [{ label: 'Length', value: '5 metres' }, { label: 'Colours', value: '16 million' }, { label: 'Control', value: 'App, voice' }],
  }),
  p({
    name: 'Stainless Steel Bottle', description: '500ml, triple-wall insulated, keeps cold 24h / hot 12h, BPA-free.',
    price: 39, category: 'accessories', brand: 'ZenFlow', stock: 210, sku: 'ACC-003',
    emoji: '🍶', badge: 'trending', rating: 4.6, reviewCount: 149,
    image: IMG('photo-1574323347407-f5e1ad6d020b'),
    specs: [{ label: 'Capacity', value: '500 ml' }, { label: 'Insulation', value: 'Triple-wall vacuum' }, { label: 'Material', value: '18/8 stainless' }],
  }),
  p({
    name: 'Tablet 10.5"', description: '2K display, 8-core CPU, 8GB RAM, 256GB, 8000mAh, stylus support.',
    price: 449, originalPrice: 499, category: 'electronics', brand: 'NovaTech', stock: 33, sku: 'ELEC-020',
    emoji: '📱', badge: 'premium', rating: 4.7, reviewCount: 104,
    image: IMG('photo-1541807084-5c52b6b3adef'),
    specs: [{ label: 'Display', value: '10.5" 2K' }, { label: 'Memory', value: '8GB / 256GB' }, { label: 'Battery', value: '8000 mAh' }],
  }),
];

const coupons = [
  { id: 'WELCOME10', code: 'WELCOME10', type: 'percent', value: 10, minSubtotal: 0, active: true, description: '10% off your first order', usageLimit: null, usedCount: 0, expiresAt: null },
  { id: 'SAVE20', code: 'SAVE20', type: 'percent', value: 20, minSubtotal: 100, active: true, description: '20% off orders over $100', usageLimit: null, usedCount: 0, expiresAt: null },
  { id: 'FREESHIP', code: 'FREESHIP', type: 'fixed', value: 9.99, minSubtotal: 0, active: true, description: 'Free standard shipping', usageLimit: null, usedCount: 0, expiresAt: null },
  { id: 'VIP50', code: 'VIP50', type: 'fixed', value: 50, minSubtotal: 300, active: true, description: '$50 off orders over $300', usageLimit: 100, usedCount: 0, expiresAt: null },
];

const settings = {
  storeName: 'Trendaryo',
  currency: 'usd',
  taxRate: 0.08,
  shippingFlat: 9.99,
  freeShippingThreshold: 50,
  codEnabled: true,
  lowStock: 8,
  announcement: 'Free shipping on orders over $50 — use code WELCOME10 for 10% off',
  supportEmail: 'support@trendaryo.com',
  supportPhone: '+1 (555) 010-2030',
};

const reviewSamples = [
  { rating: 5, title: 'Exactly as described', comment: 'Fast delivery and the quality is excellent. Would buy again.' },
  { rating: 4, title: 'Great value', comment: 'Very happy with this purchase. Minor packaging dent but product is perfect.' },
  { rating: 5, title: 'Better than expected', comment: 'Superb build quality and it arrived two days early.' },
  { rating: 3, title: 'Decent', comment: 'Does the job, though I expected slightly better finish for the price.' },
  { rating: 5, title: 'Love it', comment: 'This has become part of my daily routine. Highly recommended.' },
];

module.exports = { products, categories, coupons, settings, reviewSamples, enrich, p };
