const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAuth } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 60)) return res.status(429).json({ error: { message: 'Too many requests' } });

  try {
    const user = await requireAuth(req, res);
    if (!user) return;

    const { db } = initFirebase();
    const cartRef = db.collection('carts').doc(user.uid);

    if (req.method === 'GET') {
      const doc = await cartRef.get();
      const cartData = doc.exists ? doc.data() : { items: [] };
      return res.status(200).json({ data: cartData });
    }

    if (req.method === 'POST') {
      const { productId, quantity = 1, name, price, image, emoji } = req.body;

      if (!productId) {
        return res.status(400).json({ error: { message: 'Product ID is required' } });
      }

      const doc = await cartRef.get();
      let items = doc.exists ? doc.data().items || [] : [];

      const existingIndex = items.findIndex(item => item.productId === productId);
      if (existingIndex >= 0) {
        items[existingIndex].quantity += parseInt(quantity);
      } else {
        items.push({
          productId,
          quantity: parseInt(quantity),
          name: name || '',
          price: parseFloat(price) || 0,
          image: image || '',
          emoji: emoji || '',
          addedAt: new Date().toISOString(),
        });
      }

      await cartRef.set({ items, updatedAt: new Date().toISOString() });
      return res.status(200).json({ data: { items } });
    }

    if (req.method === 'PUT') {
      const { productId, quantity } = req.body;

      if (productId && quantity !== undefined) {
        const doc = await cartRef.get();
        let items = doc.exists ? doc.data().items || [] : [];

        const existingIndex = items.findIndex(item => item.productId === productId);
        if (existingIndex >= 0) {
          if (parseInt(quantity) <= 0) {
            items.splice(existingIndex, 1);
          } else {
            items[existingIndex].quantity = parseInt(quantity);
          }
        } else if (parseInt(quantity) > 0) {
          items.push({
            productId,
            quantity: parseInt(quantity),
            name: req.body.name || '',
            price: parseFloat(req.body.price) || 0,
            image: req.body.image || '',
            addedAt: new Date().toISOString(),
          });
        }

        await cartRef.set({ items, updatedAt: new Date().toISOString() });
        return res.status(200).json({ data: { items } });
      }

      const { items } = req.body;
      if (Array.isArray(items)) {
        await cartRef.set({ items, updatedAt: new Date().toISOString() });
        return res.status(200).json({ data: { items } });
      }

      return res.status(400).json({ error: { message: 'Product ID and quantity, or items array is required' } });
    }

    if (req.method === 'DELETE') {
      const { productId } = req.query;
      if (productId) {
        const doc = await cartRef.get();
        let items = doc.exists ? doc.data().items || [] : [];
        items = items.filter(item => item.productId !== productId);
        await cartRef.set({ items, updatedAt: new Date().toISOString() });
        return res.status(200).json({ data: { items } });
      } else {
        await cartRef.set({ items: [], updatedAt: new Date().toISOString() });
        return res.status(200).json({ data: { items: [] } });
      }
    }

    return res.status(405).json({ error: { message: 'Method not allowed' } });
  } catch (error) {
    console.error('Cart error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
