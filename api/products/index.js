const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAdmin } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 60)) return res.status(429).json({ error: { message: 'Too many requests' } });

  try {
    const { db } = initFirebase();

    if (req.method === 'GET') {
      const { page = 1, limit = 20, category, minPrice, maxPrice, search, sort, status = 'active' } = req.query;

      let query = db.collection('products');
      if (status !== 'all') query = query.where('status', '==', status);
      if (category) query = query.where('category', '==', category);

      const snapshot = await query.get();
      let products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      if (minPrice) products = products.filter(p => p.price >= parseFloat(minPrice));
      if (maxPrice) products = products.filter(p => p.price <= parseFloat(maxPrice));
      if (search) {
        const q = search.toLowerCase();
        products = products.filter(p =>
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.description && p.description.toLowerCase().includes(q)) ||
          (p.brand && p.brand.toLowerCase().includes(q))
        );
      }

      if (sort === 'price_asc') products.sort((a, b) => a.price - b.price);
      else if (sort === 'price_desc') products.sort((a, b) => b.price - a.price);
      else if (sort === 'newest') products.sort((a, b) => {
        const aTime = a.createdAt ? (typeof a.createdAt === 'string' ? new Date(a.createdAt).getTime() : a.createdAt.seconds * 1000) : 0;
        const bTime = b.createdAt ? (typeof b.createdAt === 'string' ? new Date(b.createdAt).getTime() : b.createdAt.seconds * 1000) : 0;
        return bTime - aTime;
      });
      else if (sort === 'rating') products.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      else if (sort === 'name') products.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      else products.sort((a, b) => {
        const aTime = a.createdAt ? (typeof a.createdAt === 'string' ? new Date(a.createdAt).getTime() : a.createdAt.seconds * 1000) : 0;
        const bTime = b.createdAt ? (typeof b.createdAt === 'string' ? new Date(b.createdAt).getTime() : b.createdAt.seconds * 1000) : 0;
        return bTime - aTime;
      });

      const total = products.length;
      const p = parseInt(page);
      const l = parseInt(limit);
      const paginated = products.slice((p - 1) * l, p * l);

      return res.status(200).json({
        data: paginated,
        pagination: { page: p, limit: l, total, pages: Math.ceil(total / l) },
      });
    }

    if (req.method === 'POST') {
      const adminUser = await requireAdmin(req, res);
      if (!adminUser) return;

      const { name, description, price, originalPrice, category, brand, stock, images, image, features, sku, status: prodStatus } = req.body;

      if (!name || price === undefined) {
        return res.status(400).json({ error: { message: 'Name and price are required' } });
      }

      const productData = {
        name,
        description: description || '',
        price: parseFloat(price),
        originalPrice: originalPrice ? parseFloat(originalPrice) : null,
        category: category || 'general',
        brand: brand || '',
        stock: parseInt(stock) || 0,
        image: image || '',
        images: images || [],
        features: features || [],
        sku: sku || '',
        rating: 0,
        reviewCount: 0,
        status: prodStatus || 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const docRef = await db.collection('products').add(productData);
      return res.status(201).json({ data: { id: docRef.id, ...productData } });
    }

    return res.status(405).json({ error: { message: 'Method not allowed' } });
  } catch (error) {
    console.error('Products error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
