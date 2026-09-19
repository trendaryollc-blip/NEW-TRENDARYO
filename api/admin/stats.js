const { initFirebase } = require('../_lib/firebase');
const { handleCors } = require('../_lib/cors');
const { requireAdmin } = require('../_lib/auth');
const { applyRateLimit } = require('../_lib/security');

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;
  if (!applyRateLimit(req, res, 30)) return res.status(429).json({ error: { message: 'Too many requests' } });

  try {
    const adminUser = await requireAdmin(req, res);
    if (!adminUser) return;

    const { db } = initFirebase();

    const [usersSnapshot, ordersSnapshot, productsSnapshot, paymentsSnapshot] = await Promise.all([
      db.collection('users').get(),
      db.collection('orders').get(),
      db.collection('products').where('status', '==', 'active').get(),
      db.collection('payments').get(),
    ]);

    const users = usersSnapshot.docs.map(d => d.data());
    const orders = ordersSnapshot.docs.map(d => d.data());
    const products = productsSnapshot.docs.map(d => d.data());
    const payments = paymentsSnapshot.docs.map(d => d.data());

    const totalRevenue = orders
      .filter(o => o.paymentStatus === 'paid')
      .reduce((sum, o) => sum + (o.total || 0), 0);

    const totalUsers = users.length;
    const totalOrders = orders.length;
    const totalProducts = products.length;
    const pendingOrders = orders.filter(o => o.status === 'pending').length;
    const shippedOrders = orders.filter(o => o.status === 'shipped').length;
    const deliveredOrders = orders.filter(o => o.status === 'delivered').length;

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentOrders = orders.filter(o => {
      const created = o.createdAt ? new Date(o.createdAt) : null;
      return created && created > thirtyDaysAgo;
    });
    const recentRevenue = recentOrders
      .filter(o => o.paymentStatus === 'paid')
      .reduce((sum, o) => sum + (o.total || 0), 0);

    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    res.status(200).json({
      data: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalUsers,
        totalOrders,
        totalProducts,
        pendingOrders,
        shippedOrders,
        deliveredOrders,
        recentOrdersCount: recentOrders.length,
        recentRevenue: Math.round(recentRevenue * 100) / 100,
        avgOrderValue: Math.round(avgOrderValue * 100) / 100,
        recentUsers: users.filter(u => {
          const created = u.createdAt ? new Date(u.createdAt) : null;
          return created && created > thirtyDaysAgo;
        }).length,
      },
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
};
