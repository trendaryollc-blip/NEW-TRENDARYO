/**
 * MOCK CATALOGUE for development only.
 *
 * Generates deterministic, catalogue-realistic products in exactly the same
 * Firestore `products` document shape as scripts/data/catalog.js, so a dev
 * storefront can exercise search, filters, sorting, stock states, badges, SEO
 * meta and pagination against a realistic 155+ item catalogue.
 *
 * DEVELOPMENT DATA — must be removed before launch. Nothing here ever reaches
 * users of the production store (see scripts/purge-mock.js).
 */

const { settings, enrich } = require('./catalog');

/* Deterministic PRNG (mulberry32) — the same count always yields the same list. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POOLS = [
  { cat: 'electronics', brands: ['AudioTech', 'FitPro', 'VisionPro', 'NovaTech', 'SoundWave', 'SkyLine'],
    kinds: ['Wireless Earbuds', 'Smart Fitness Band', 'Action Camera', 'Bluetooth Speaker', 'Noise-Cancel Headphones',
      'Webcam HD', 'Graphic Tablet', 'NAS Drive', 'USB-C Hub', 'Mechanical Keyboard', 'Air Purifier Fan',
      'Portable Monitor 15.6"', 'E-Reader', 'Robot Vacuum', 'Smart Doorbell', 'Wi-Fi Camera',
      'Laptop Docking Station', 'Power Strip Surge', 'Car Dash Cam', 'Smart Thermostat', 'Projector Mini',
      'Wireless Microphone Kit', 'Solar Power Bank', 'Digital Voice Recorder'],
    price: [49, 89, 129, 159, 219, 279, 349, 449, 599, 699, 899] },
  { cat: 'gaming', brands: ['GamePro', 'KeyMaster', 'NovaTech', 'ApexLine', 'VoltEdge'],
    kinds: ['Gaming Controller', 'RGB Headset Stand', 'Mechanical Keycaps', 'Gaming Chair', 'Gaming Desk Pad',
      'Controller Charging Dock', 'Capture Card 4K', 'MMO Mouse', 'RGB Mouse Pad', 'Stream Deck Mini', 'Gaming Router',
      'Console Cooling Stand', 'Arcade Stick', 'VR Mount', 'Cable Organizer'],
    price: [39, 59, 79, 99, 129, 189, 249, 329, 449] },
  { cat: 'fashion', brands: ['StyleCo', 'Urban', 'ZenFlow', 'LuxeLine', 'ApexLine'],
    kinds: ['Leather Crossbody Bag', 'Smart Watch Strap', 'Quilted Puffer Jacket', 'Canvas Tote', 'Minimalist Belt',
      'Cashmere Scarf', 'Hiking Boots', 'Runner Shorts', 'Ripstop Windbreaker', 'Vegan Leather Backpack', 'Oversized Knit Hoodie',
      'Structured Handbag', 'Travel Duffle 40L', 'Bucket Hat', 'Perforated Leather Sneakers'],
    price: [29, 45, 59, 79, 99, 129, 159, 199, 249] },
  { cat: 'home', brands: ['HomeLink', 'ZenFlow', 'BrewMaster', 'CozyHome'],
    kinds: ['Espresso Grinder', 'French Press', 'Smart Kettle', 'Air Fryer 5L', 'Standing Fan Tower',
      'Memory Foam Pillow', 'Weighted Blanket', 'Aromatherapy Diffuser', 'Robot Mop', 'Smart Light Strip',
      'Humidifier 3L', 'Non-Stick Cookware Set', 'Kitchen Scale', 'Slow Juicer', 'Bamboo Storage Organizer'],
    price: [19, 29, 39, 59, 79, 99, 139, 179, 229] },
  { cat: 'health', brands: ['FitPro', 'ZenFlow', 'WellCore', 'NatureLab'],
    kinds: ['Smart Scale', 'Massage Gun Pro', 'Posture Corrector', 'Blood Pressure Monitor', 'Pulse Oximeter',
      'Electric Toothbrush', 'Water Flosser', 'Fitness Resistance Bands', 'Foam Roller', 'Sleep Aid Headband',
      'Breathing Trainer Lung', 'Finger Pulse Monitor', 'Reusable Ice Pack', 'Therapy Heat Pad', 'Digital Luggage Scale'],
    price: [15, 25, 35, 49, 69, 89, 129, 169] },
  { cat: 'accessories', brands: ['PowerTech', 'StyleCo', 'NatureLab', 'Urban'],
    kinds: ['65W GaN Charger', 'Magnetic Phone Mount', 'Braided USB-C Cable 2m', 'Stainless Bottle 750ml',
      'Travel Electronics Kit', 'RFID Passport Holder', 'Foldable Laptop Stand', 'Anti-Slip Ring Tripod',
      'Patch Cord Organizer', 'Key Finder Tag', 'Bike Phone Mount', 'Cordless Car Vacuum', 'Luggage Scale Digital',
      'Universal Travel Adapter', 'Mini Bluetooth Tracker'],
    price: [12, 19, 24, 32, 42, 55, 69, 85] },
];

const EMOJI = {
  electronics: ['🎧', '📷', '🔊', '⌨️', '🖥️', '💻', '📡', '🔋', '💡', '🧹', '📹'],
  gaming: ['🎮', '🎧', '⌨️', '🖱️', '🪑', '🕹️', '📺'],
  fashion: ['👜', '⌚', '🧥', '🎒', '👟', '🧢', '🥾', '🧣'],
  home: ['☕', '🫖', '🍳', '🛋️', '💤', '🌬️', '🤖', '⚖️', '🥤', '🧹'],
  health: ['⚖️', '💆', '🧍', '💓', '🩸', '🦷', '🏋️', '🧘'],
  accessories: ['🔌', '🧲', '🔋', '🍶', '🧳', '📎', '🚗', '🧰'],
};

const CATEGORY_META = {
  electronics: { tag: 'tech', desc: 'Audio, wearables and everyday tech' },
  gaming: { tag: 'gaming', desc: 'Gear built for play' },
  fashion: { tag: 'style', desc: 'Bags, footwear and accessories' },
  home: { tag: 'living', desc: 'Kitchen, wellness and smart home' },
  health: { tag: 'wellness', desc: 'Fitness, health and recovery' },
  accessories: { tag: 'gear', desc: 'Power, cables and travel kit' },
};

const BADGES = ['hot', 'trending', 'new', 'premium'];
const IMG = (seedId) => 'https://picsum.photos/seed/' + seedId + '/900/900';
const FREE_SHIPPING_THRESHOLD = settings.freeShippingThreshold || 50;

function pick(rnd, arr) { return arr[Math.floor(rnd() * arr.length)]; }
function between(rnd, lo, hi) { return lo + Math.floor(rnd() * (hi - lo + 1)); }

/* Build `targetCount` mock product documents (slug-ids unique). */
function generateMockProducts(targetCount) {
  const rnd = mulberry32(0x7e57); // fixed seed → reproducible
  const seen = new Set();
  const out = [];

  let n = 0;
  let attempts = 0;
  while (out.length < targetCount && attempts < targetCount * 40) {
    attempts++;
    n++;
    const pool = POOLS[n % POOLS.length];
    const kind = pool.kinds[n % pool.kinds.length];
    const name = pick(rnd, ['Pro', 'Ultra', 'Elite', 'Smart', 'Premium', 'Compact', 'Wireless', 'Foldable',
      'Rechargeable', 'Mini', 'Max', 'Professional']) + ' ' + kind +
      pick(rnd, ['', ' 2.0', ' X', ' Edition', ' Series', ' Lite', ' Plus', ' 2026', ' Max', ' Pro']);

    const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '');
    if (seen.has(slugBase)) continue; // regenerate on collision
    seen.add(slugBase);

    const brand = pick(rnd, pool.brands);
    const category = pool.cat;
    const emoji = pick(rnd, EMOJI[category]);
    const price = pick(rnd, pool.price);
    const discounted = rnd() < 0.55;
    const originalPrice = discounted ? Math.round((price * (100 + between(rnd, 10, 60))) / 5) * 5 : null;
    const hasPhoto = rnd() > 0.22; // ~22% no-photo → exercises emoji fallback
    const rating = Math.round((3.5 + rnd() * 1.45) * 10) / 10;
    const reviewCount = between(rnd, 2, 820);
    const stock = rnd() < 0.05 ? 0 : (rnd() < 0.09 ? between(rnd, 2, 8) : between(rnd, 15, 900));
    const status = rnd() < 0.04 ? 'draft' : (rnd() < 0.02 ? 'archived' : 'active');
    const badge = rnd() < 0.2 ? null : pick(rnd, BADGES);
    const meta = CATEGORY_META[category];

    const description = kind + ' by ' + brand + ' — ' + pick(rnd, ['engineered for daily use', 'a crowd favourite',
      'built to last', 'great value', 'premium finishing', 'purpose-built']) +
      '. Free shipping over $' + FREE_SHIPPING_THRESHOLD + '. ' + meta.desc + '. Ships worldwide.';

    const specCount = between(rnd, 2, 4);
    const specs = [];
    for (let i = 0; i < specCount; i++) {
      specs.push({
        label: pick(rnd, ['Material', 'Warranty', 'Battery', 'Connectivity', 'Output', 'Capacity', 'Weight', 'Compatibility', 'Colour']),
        value: between(rnd, 1, 9999) + ' ' + pick(rnd, ['g', 'W', 'h', 'mm', 'L', 'm', '%', 'GB', 'units', 'cm']),
      });
    }

    const features = [kind + ' upgrade',
      pick(rnd, ['1-year warranty', '2-year warranty', '3-year warranty']),
      pick(rnd, ['fast delivery', 'free 30-day returns', 'eco packaging'])];

    const doc = {
      name,
      slug: slugBase,
      description,
      category,
      brand,
      emoji,
      price,
      originalPrice,
      image: hasPhoto ? IMG('trendaryo-' + attempts) : '',
      images: hasPhoto ? [IMG('trendaryo-' + attempts)] : [],
      badge,
      rating,
      reviewCount,
      stock,
      sku: category.slice(0, 4).toUpperCase() + '-' + String(1000 + attempts).padStart(4, '0'),
      status,
      specs,
      features,
      tags: [meta.tag, pick(rnd, ['best-seller', 'featured', 'eco', 'gift-idea'])],
      weight: between(rnd, 80, 3500),
      vendor: pick(rnd, ['Trendaryo Global', 'OceanWay Supply', 'Summit Trading', 'Aurora Imports']),
    };

    out.push(enrich(doc));
  }
  return out;
}

module.exports = { generateMockProducts };