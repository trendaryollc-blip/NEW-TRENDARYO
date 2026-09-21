/**
 * VERIFIED product photo library (development / mock data only).
 *
 * Every photo id below was confirmed to return HTTP 200 from
 * images.unsplash.com (browser-style request) before being added. The old
 * storefront photo ids silently 404'd, which is why products fell back to
 * emoji tiles. Real, loadable product photos are the fix — emoji stays only
 * as a data field / last-resort fallback.
 */

const URL = (id) => 'https://images.unsplash.com/' + id + '?auto=format&fit=max&w=900&q=80';

const PHOTOS = {
  electronics: [
    'photo-1546435770-a3e426bf472b', // headphones, black
    'photo-1470337458703-46ad1756a187', // audio gear
    'photo-1523293182086-7651a899d37f', // tech device
    'photo-1516035069371-29a1b244cc32', // camera
    'photo-1502920917128-1aa500764cbd', // camera on surface
    'photo-1518987048-93e29699e79a', // gadget on desk
    'photo-1499951360447-b19be8fe80f5', // laptop
    'photo-1517336714731-489689fd1ca8', // laptop silver
    'photo-1541807084-5c52b6b3adef', // laptop on table
    'photo-1603468620905-8de7d86b781e', // desk setup
    'photo-1587202372775-e229f172b9d7', // action cam / drone
  ],
  gaming: [
    'photo-1618384887929-16ec33fab9ef', // RGB keyboard
    'photo-1592840496694-26d035b52b48', // game controller
    'photo-1527864550417-7fd91fc51a46', // mouse
    'photo-1538481199705-c710c4e965fc', // gaming headset
  ],
  fashion: [
    'photo-1548036328-c9fa89d128fa', // urban backpack
    'photo-1578932750294-f5075e85f44a', // backpack
    'photo-1506126613408-eca07ce68773', // backpack
    'photo-1572635196237-14b3f281503f', // sunglasses
    'photo-1576566588028-4147f3842f27', // t-shirt
    'photo-1591047139829-d91aecb6caea', // fashion
    'photo-1543168256-418811576931', // jacket
    'photo-1571781926291-c477ebfd024b', // leather goods
    'photo-1595950653106-6c9ebd614d3a', // white sneakers
    'photo-1525966222134-fcfa99b8ae77', // sneaker
    'photo-1553413077-190dd305871c', // fashion
  ],
  home: [
    'photo-1495474472287-4d71bcdd2085', // coffee
    'photo-1510707577719-ae7c14805e3a', // coffee pour
    'photo-1574323347407-f5e1ad6d020b', // bottle
    'photo-1593810450967-f9c42742e326', // yoga mat
    'photo-1593642632823-8f785ba67e45', // smart speaker
    'photo-1540914124281-342587941389', // home interior
    'photo-1522708323590-d24dbb6b0267', // sofa / living room
    'photo-1529641484336-ef35148bab06', // interior
    'photo-1556910103-1c02745aae4d', // kitchen / home
  ],
  health: [
    'photo-1571019613454-1cb2f99b2d8b', // resistance bands
    'photo-1599058917212-d750089bc07e', // exercise
    'photo-1526506118085-60ce8714f8c5', // dumbbell
    'photo-1583454110551-21f2fa2afe61', // fitness
    'photo-1507652313519-d4e9174996dd', // workout
  ],
  accessories: [
    'photo-1585386959984-a4155224a1ad', // power bank
    'photo-1544724569-5f546fd6f2b5', // leather / small goods
    'photo-1526170375885-4d8ecf77b99f', // action camera body
  ],
};

/* Deterministic per-category pick: every product in a category gets a real,
   verified photo, cycling the pool so neighbours differ. */
function photoFor(category, n) {
  const arr = PHOTOS[category] || PHOTOS.electronics;
  return URL(arr[Math.abs(n) % arr.length]);
}

module.exports = { PHOTOS, URL, photoFor };