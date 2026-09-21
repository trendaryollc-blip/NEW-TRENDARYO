#!/usr/bin/env node
/* Generate large staged Trendaryo product catalogues for load-testing every
   storefront + admin feature before a real drop-shipping feed is connected.

   The records intentionally match the schema consumed by products-data.js
   (and the frontend mapping in backend-bridge.js: toFrontendProduct), with the
   same variety a real 500+ item store needs:
     - all four badges (hot / trending / new / premium) + none
     - price bands spanning cheap accessories to premium tech
     - rating 3.5–4.9 and review counts from a handful to ~1000
     - every record gets a real, verified product photo (no emoji tiles)
     - ~8% out-of-stock / low-stock (exercise "Only a few left" + disable flows)
     - category, brand, sku, specs, features like the backend catalogue

   Usage:
     node scripts/generate-catalog.js --count 1200 --out catalog.json
     node scripts/generate-catalog.js --count 300            (prints to stdout)

   Offline seeding of the storefront (no server needed):
     node scripts/generate-catalog.js --count 1500 --seed    prints a snippet to
     paste into the browser console, which puts the catalogue in
     localStorage['trendaryo_catalog_cache'] so products-data.js serves it.
*/
'use strict';

var fs = require('fs');
var path = require('path');
var PHOTO = require('./data/product-images');

var PREFIXES = [
  'Pro ', 'Ultra ', 'Elite ', 'Smart ', 'Portable ', 'Wireless ', 'Premium ',
  'Compact ', 'Professional ', 'Mini ', 'Max ', 'Advanced ', '5G ', 'Solar ',
  'Eco ', 'Rugged ', 'Foldable ', 'Rechargeable '
];

var SUFFIXES = [
  ' Edition', ' Series', ' X', ' II', ' Pro Max', ' Lite', ' 2026', ' Titanium',
  ' Carbon', ' Studio', ' Deluxe', ' Plus', ' Air', ' XL'
];

var POOLS = [
  { cat: 'electronics', words: ['Headphones', 'Earbuds', 'Speaker', 'Keyboard', 'Mouse',
    'Display', 'Monitor', 'Camera', 'Drone', 'Power Bank', 'Charger', 'Hub', 'Router',
    'SSD Drive', 'Webcam', 'Microphone', 'Game Controller', 'Tablet', 'Laptop Stand',
    'LED Strip', 'Smart Plug', 'Wi-Fi Extender'] },
  { cat: 'fashion', words: ['Sneakers', 'Boots', 'Backpack', 'Wallet', 'Sunglasses',
    'Jacket', 'Watch Strap', 'Cap', 'Belt', 'Hoodie', 'T-Shirt', 'Duffel Bag',
    'Crossbody Bag', 'Scarf', 'Gloves'] },
  { cat: 'home', words: ['Coffee Maker', 'Kettle', 'Blender', 'Air Purifier', 'Robot Vacuum',
    'Desk Lamp', 'Storage Organizer', 'Yoga Mat', 'Bottle', 'Mug', 'Cutting Board',
    'Humidifier', 'Standing Desk', 'Chair Mat', 'Toaster', 'Espresso Machine'] },
  { cat: 'health', words: ['Fitness Band', 'Smart Scale', 'Blood Pressure Monitor',
    'Massage Gun', 'Resistance Bands', 'Posture Corrector', 'Sleep Mask', 'Pulse Oximeter',
    'Electric Toothbrush', 'Hair Dryer', 'Trimmer'] }
];

var EMOJI = {
  electronics: { o: ['🎧', '🔊', '⌨️', '🖱️', '🖥️', '📷', '🚁', '🔋', '🔌', '💻', '🎮', '📱', '💡', '📡'] },
  fashion:     { o: ['👟', '🥾', '🎒', '👜', '🕶️', '🧥', '⌚', '🧢', '👕', '🎽'] },
  home:        { o: ['☕', '🫖', '🧊', '🌀', '🤖', '💡', '🗄️', '🧘', '🍶', '☕', '🔪', '🪑', '🍞'] },
  health:      { o: ['⌚', '⚖️', '💓', '💆', '🏋️', '🧍', '😴', '🩸', '🦷', '💇'] }
};

var BADGES = ['hot', 'trending', 'new', 'premium'];

/* Deterministic PRNG (mulberry32) so a given --count reproduces the same list. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rnd, arr) { return arr[Math.floor(rnd() * arr.length)]; }
function between(rnd, lo, hi) { return lo + Math.floor(rnd() * (hi - lo + 1)); }

function makeProduct(rnd, n, seen) {
  var pool = POOLS[Math.floor(rnd() * POOLS.length)];
  var name;
  do {
    name = pick(rnd, PREFIXES) + pick(rnd, pool.words) + pick(rnd, SUFFIXES);
  } while (seen[name.toLowerCase()] && n < 5000);
  seen[name.toLowerCase()] = 1;

  var price = between(rnd, pool.cat === 'electronics' ? 15 : 9, 1499);
  var discounted = rnd() < 0.55;
  var oldPrice = discounted ? Math.round((price * (100 + between(rnd, 10, 60))) / 5) * 5 : undefined;
  var hasPhoto = true;
  var rating = Math.round((3.5 + rnd() * 1.4) * 10) / 10;
  var reviews = between(rnd, 3, 998);
  var stock = rnd() < 0.05 ? 0 : (rnd() < 0.08 ? between(rnd, 2, 8) : between(rnd, 25, 900));
  var specCount = between(rnd, 2, 4);

  var rec = {
    id: 'p-' + n,
    name: name,
    description: pool.cat + ' ' + pick(rnd, pool.words) +
      ' — ' + pick(rnd, ['engineered', 'affordable', 'premium', 'weather-proof']) +
      ' build with ' + between(rnd, 1, 12) + '-month warranty. Ships worldwide.',
    price: price,
    emoji: pick(rnd, EMOJI[pool.cat].o),
    badge: rnd() < 0.2 ? null : pick(rnd, BADGES),
    rating: rating,
    reviews: reviews,
    category: pool.cat,
    brand: pick(rnd, ['TechCore', 'NovaWear', 'UrbanFleet', 'VoltEdge', 'ApexLine', 'OmniGrip']),
    stock: stock,
    sku: pool.cat.slice(0, 4).toUpperCase() + '-' + String(between(rnd, 10000, 99999)),
    specs: (function () {
      var out = [];
      for (var i = 0; i < specCount; i++) {
        out.push(['spec' + (i + 1), between(rnd, 1, 9999) + ' ' + pick(rnd, ['units', 'W', 'mA', 'mm', 'Hz', 'GB', 'h'])]);
      }
      return out;
    })()
  };
  if (oldPrice) rec.oldPrice = oldPrice;
  if (hasPhoto) {
    rec.image = PHOTO.photoFor(pool.cat, n);
  } else {
    rec.emoji = rec.emoji;
  }
  return rec;
}

function parseArgs(argv) {
  var out = { count: 500, out: null, seed: false };
  for (var i = 0; i < argv.length; i++) {
    if (argv[i] === '--count') out.count = parseInt(argv[++i], 10) || 500;
    else if (argv[i] === '--out') out.out = argv[++i];
    else if (argv[i] === '--seed') out.seed = true;
  }
  return out;
}

function build(count) {
  var rnd = mulberry32(1337 + count * 97);
  var seen = {};
  var list = [];
  for (var n = 1; n <= count; n++) list.push(makeProduct(rnd, n, seen));
  return list;
}

function summary(list) {
  var byCat = {}, byBadge = {}, outOfStock = 0, noPhoto = 0, minRating = 5, maxReviews = 0;
  var hist = [0, 0, 0, 0, 0];
  list.forEach(function (p) {
    byCat[p.category] = (byCat[p.category] || 0) + 1;
    byBadge[p.badge || 'none'] = (byBadge[p.badge || 'none'] || 0) + 1;
    if (p.stock === 0) outOfStock++;
    if (!p.image) noPhoto++;
    if (p.rating < minRating) minRating = p.rating;
    if (p.reviews > maxReviews) maxReviews = p.reviews;
    var bw = Math.min(4, Math.floor(p.price / 300));
    hist[bw]++;
  });
  return {
    total: list.length,
    categories: byCat,
    badges: byBadge,
    outOfStock: outOfStock,
    noPhoto: noPhoto,
    ratingMin: minRating,
    reviewsMax: maxReviews,
    priceBands: { '<300': hist[0], '300-599': hist[1], '600-899': hist[2], '900-1199': hist[3], '1200+': hist[4] }
  };
}

var args = parseArgs(process.argv.slice(2));
var catalog = build(args.count);
var sum = summary(catalog);

if (args.out) {
  fs.writeFileSync(path.resolve(process.cwd(), args.out), JSON.stringify(catalog, null, 2), 'utf8');
  console.log('Wrote ' + sum.total + ' products to ' + args.out);
} else {
  process.stdout.write(JSON.stringify(catalog, null, 2) + '\n');
}

if (args.seed) {
  console.log('\nSeed snippet (paste into the browser console):\n');
  console.log('localStorage.setItem(\'trendaryo_catalog_cache\', ' +
    JSON.stringify(JSON.stringify(catalog)) + ');\n' +
    'localStorage.setItem(\'trendaryo_catalog_version\', JSON.stringify(Date.now()));\n' +
    'location.reload();');
}

console.log('\nSummary:');
console.log('  total      : ' + sum.total);
console.log('  categories : ' + JSON.stringify(sum.categories));
console.log('  badges     : ' + JSON.stringify(sum.badges));
console.log('  price bands: ' + JSON.stringify(sum.priceBands));
console.log('  out-of-stock: ' + sum.outOfStock + '   no-photo(emoji): ' + sum.noPhoto +
  '   rating min: ' + sum.ratingMin + '   reviews max: ' + sum.reviewsMax);