/**
 * Admin Manager - Complete Admin Operations System
 * Compatibility layer that routes every admin operation to the real
 * Firestore-backed API (/api/admin/*, /api/orders, /api/products,
 * /api/reviews, /api/settings). Methods that have no backend yet return
 * a clear unsupported error instead of 404ing silently.
 */

class AdminManager {
  constructor() {
    this.apiBase = '/api';
    this.adminToken = localStorage.getItem('adminToken');
    this.userRole = localStorage.getItem('userRole');
  }

  isAdmin() {
    return this.userRole === 'admin' && this.adminToken;
  }

  getAdminToken() {
    return this.adminToken;
  }

  async _token() {
    let token = this.adminToken;
    if (typeof FirebaseAuth !== 'undefined' && FirebaseAuth.getIdToken) {
      token = await FirebaseAuth.getIdToken();
    } else if (window.API && typeof window.API.getIdToken === 'function') {
      token = await window.API.getIdToken();
    }
    return token;
  }

  async adminRequest(endpoint, options = {}) {
    const token = await this._token();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    let body = options.body;
    if (body && typeof body !== 'string') body = JSON.stringify(body);

    try {
      const response = await fetch(`${this.apiBase}${endpoint}`, {
        ...options,
        headers,
        body,
      });

      if (!response.ok) {
        let message = `Admin request failed: ${response.status}`;
        try { const json = await response.json(); message = (json.error && json.error.message) || message; } catch (e) { /* fall through */ }
        throw new Error(message);
      }
      return await response.json();
    } catch (error) {
      console.error('Admin request error:', error);
      throw error;
    }
  }

  unsupported(name) {
    return () => Promise.reject(new Error(`${name} is not available yet`));
  }

  /* ==================== USER MANAGEMENT ==================== */

  async getAllUsers(page = 1, limit = 20, filters = {}) {
    const params = new URLSearchParams({ page, limit, ...filters });
    return this.adminRequest(`/admin/users?${params}`);
  }

  async getUserById(userId) {
    return this.adminRequest(`/admin/users/${encodeURIComponent(userId)}`);
  }

  async updateUser(userId, userData) {
    return this.adminRequest(`/admin/users/${encodeURIComponent(userId)}`, { method: 'PUT', body: userData });
  }

  async deactivateUser(userId, reason = '') {
    return this.updateUser(userId, { status: 'suspended', note: reason });
  }

  async reactivateUser(userId) {
    return this.updateUser(userId, { status: 'active' });
  }

  async resetUserPassword(userId) {
    // Not exposed through the API - ask the account owner to use forgot-password.
    return this.unsupported('Password reset')();
  }

  async getUserStats() {
    return this.adminRequest('/admin/stats');
  }

  async searchUsers(query) {
    const list = await this.getAllUsers(1, 1000);
    const q = String(query || '').toLowerCase();
    const data = ((list.data || []).filter((u) =>
      (u.email || '').toLowerCase().includes(q) ||
      ((u.firstName || '') + ' ' + (u.lastName || '')).toLowerCase().includes(q)
    ));
    return { data, pagination: { total: data.length } };
  }

  async exportUsers(filters = {}) {
    return this.getAllUsers(1, 1000, filters);
  }

  /* ==================== ORDER MANAGEMENT ==================== */

  async getAllOrders(page = 1, limit = 20, filters = {}) {
    const params = new URLSearchParams({ page, limit, ...filters });
    return this.adminRequest(`/admin/orders?${params}`);
  }

  async getOrderById(orderId) {
    return this.adminRequest(`/orders/${encodeURIComponent(orderId)}`);
  }

  async updateOrderStatus(orderId, status, notes = '') {
    return this.adminRequest(`/orders/${encodeURIComponent(orderId)}`, { method: 'PUT', body: { status, note: notes } });
  }

  async addTracking(orderId, trackingData) {
    return this.adminRequest(`/orders/${encodeURIComponent(orderId)}`, { method: 'PUT', body: trackingData });
  }

  async cancelOrder(orderId, reason = '') {
    return this.updateOrderStatus(orderId, 'cancelled', reason);
  }

  async getOrderStats() {
    return this.adminRequest('/admin/stats');
  }

  async getOrdersByDateRange(startDate, endDate) {
    const list = await this.getAllOrders(1, 1000);
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    const data = (list.data || []).filter((o) => {
      const t = o.createdAt ? new Date(o.createdAt).getTime() : 0;
      return t >= start && t <= end;
    });
    return { data, pagination: { total: data.length } };
  }

  async exportOrders(filters = {}) {
    return this.getAllOrders(1, 2000, filters);
  }

  /* ==================== PAYMENT MANAGEMENT ==================== */

  async getAllTransactions(page = 1, limit = 20, filters = {}) {
    const orders = await this.getAllOrders(page, limit, filters);
    // Transactions are embedded in orders (payments collection mirrors them).
    return orders;
  }

  async getTransactionById(transactionId) {
    try {
      return await this.getOrderById(transactionId);
    } catch (e) {
      const orders = await this.getAllOrders(1, 2000);
      const hit = (orders.data || []).find((o) => (o.paymentIntentId || o.id) === transactionId);
      if (!hit) throw new Error('Transaction not found');
      return { data: hit };
    }
  }

  processRefund() { return this.unsupported('Refunds')(); }

  async getPaymentStats() {
    return this.adminRequest('/admin/stats');
  }

  async getRevenueByDateRange(startDate, endDate) {
    const orders = await this.getOrdersByDateRange(startDate, endDate);
    const revenue = (orders.data || [])
      .filter((o) => o.paymentStatus === 'paid')
      .reduce((s, o) => s + (o.total || 0), 0);
    return { data: { revenue: Math.round(revenue * 100) / 100, range: [startDate, endDate] } };
  }

  async getPaymentMethodsBreakdown() {
    const orders = await this.getAllOrders(1, 2000);
    const map = {};
    (orders.data || []).forEach((o) => {
      const m = o.paymentMethod || 'card';
      map[m] = (map[m] || 0) + 1;
    });
    const data = Object.keys(map).map((k) => ({ method: k, count: map[k] }));
    return { data };
  }

  async exportTransactions(filters = {}) {
    return this.getAllOrders(1, 2000, filters);
  }

  /* ==================== EMAIL MANAGEMENT ==================== */

  getAllEmails() { return Promise.resolve({ data: [], pagination: { total: 0 } }); }
  getEmailById() { return this.unsupported('Email')(); }
  resendEmail() { return this.unsupported('Email resend')(); }
  getEmailTemplates() { return this.unsupported('Email templates')(); }
  updateEmailTemplate() { return this.unsupported('Email templates')(); }
  sendBulkEmail() { return this.unsupported('Bulk email')(); }
  getEmailStats() { return this.getUserStats(); }
  exportEmailHistory() { return this.getAllEmails(); }

  /* ==================== ANALYTICS ==================== */

  async getDashboardOverview() {
    return this.adminRequest('/admin/stats');
  }

  async getSalesAnalytics(period = 'month') {
    return this.adminRequest('/admin/stats');
  }

  async getCustomerAnalytics(period = 'month') {
    return this.adminRequest('/admin/stats');
  }

  async getProductAnalytics(period = 'month') {
    return this.adminRequest('/admin/products?limit=100');
  }

  getConversionAnalytics() { return this.unsupported('Conversion analytics')(); }
  getTrafficAnalytics() { return this.unsupported('Traffic analytics')(); }

  async getRevenueReport(startDate, endDate) {
    return this.getRevenueByDateRange(startDate, endDate);
  }

  async getTopProducts(limit = 10) {
    const orders = await this.getAllOrders(1, 2000);
    const map = {};
    (orders.data || []).forEach((o) => {
      if (o.status === 'cancelled' || o.status === 'refunded') return;
      (o.items || []).forEach((it) => {
        const id = it.productId || it.id;
        if (!map[id]) map[id] = { id, name: it.name || 'Product', units: 0, revenue: 0, orders: 0 };
        const qty = it.quantity || it.qty || 1;
        map[id].units += qty;
        map[id].revenue += (it.price || 0) * qty;
        map[id].orders += 1;
      });
    });
    const data = Object.values(map).sort((a, b) => b.units - a.units).slice(0, limit);
    return { data };
  }

  async getTopCustomers(limit = 10) {
    const orders = await this.getAllOrders(1, 2000);
    const map = {};
    (orders.data || []).forEach((o) => {
      const key = (o.shippingAddress && o.shippingAddress.email) || o.userId || 'guest';
      if (!map[key]) map[key] = {
        email: key, name: (o.shippingAddress && o.shippingAddress.fullName) || 'Guest', orders: 0, spend: 0,
      };
      map[key].orders += 1;
      map[key].spend += (o.total || 0);
    });
    const data = Object.values(map).sort((a, b) => b.spend - a.spend).slice(0, limit);
    return { data };
  }

  /* ==================== INVENTORY MANAGEMENT ==================== */

  async getAllProducts(page = 1, limit = 20, filters = {}) {
    const params = new URLSearchParams({ page, limit, ...filters });
    return this.adminRequest(`/admin/products?${params}`);
  }

  async getProductById(productId) {
    return this.adminRequest(`/products/${encodeURIComponent(productId)}`);
  }

  async updateProductStock(productId, quantity, reason = '') {
    return this.adminRequest(`/products/${encodeURIComponent(productId)}`, { method: 'PUT', body: { stock: Math.max(0, parseInt(quantity, 10) || 0) } });
  }

  async getLowStockProducts(threshold = 10) {
    const all = await this.getAllProducts(1, 1000);
    const data = (all.data || []).filter((p) => (p.stock || 0) <= Number(threshold));
    return { data };
  }

  async getOutOfStockProducts() {
    const all = await this.getAllProducts(1, 1000);
    const data = (all.data || []).filter((p) => !p.stock || p.stock <= 0);
    return { data };
  }

  async updateProduct(productId, productData) {
    return this.adminRequest(`/products/${encodeURIComponent(productId)}`, { method: 'PUT', body: productData });
  }

  async getInventoryStats() {
    return this.adminRequest('/admin/stats');
  }

  async exportInventory(filters = {}) {
    return this.getAllProducts(1, 2000, filters);
  }

  /* ==================== SYSTEM MANAGEMENT ==================== */

  async getSystemHealth() {
    return { data: { status: 'ok', uptime: 'n/a', api: '/api/health' } };
  }

  async getSystemLogs(page = 1, limit = 50, filters = {}) {
    try {
      const data = (window.TrendaryoAdminStore && window.TrendaryoAdminStore.logs(limit)) || [];
      return { data, pagination: { total: data.length } };
    } catch (e) {
      return { data: [], pagination: { total: 0 } };
    }
  }

  async getAuditTrail(page = 1, limit = 50, filters = {}) {
    return this.getSystemLogs(page, limit, filters);
  }

  async getSystemSettings() {
    return this.adminRequest('/settings');
  }

  async updateSystemSettings(settings) {
    return this.adminRequest('/settings', { method: 'PUT', body: settings });
  }

  async getBackupStatus() {
    return { data: { status: 'unknown', note: 'Backups are handled by Firestore automatically' } };
  }

  triggerBackup() { return this.unsupported('Backups')(); }

  async logAdminAction(action, details) {
    try {
      if (window.TrendaryoAdminStore) window.TrendaryoAdminStore.log(action, details || '');
    } catch (e) { /* ignore */ }
    return { data: { ok: true } };
  }

  /* ==================== UTILITY FUNCTIONS ==================== */

  formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  }

  formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  formatDateTime(date) {
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  getStatusColor(status) {
    const colors = {
      pending: '#FFA500', processing: '#4169E1', shipped: '#32CD32', delivered: '#228B22',
      cancelled: '#DC143C', refunded: '#FF69B4', active: '#32CD32', inactive: '#808080',
      suspended: '#DC143C', confirmed: '#00bcd4', packed: '#ffb320',
    };
    return colors[status] || '#808080';
  }

  exportToCSV(data, filename) {
    if (!data || data.length === 0) { alert('No data to export'); return; }
    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(','),
      ...data.map(row =>
        headers.map(header => {
          const value = row[header];
          if (typeof value === 'string' && value.includes(',')) return `"${value}"`;
          return value;
        }).join(',')
      ),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}-${Date.now()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(`${filename}`), 300);
  }

  generateReport(title, data, format = 'pdf') {
    console.log(`Generating ${format} report: ${title}`);
    return { title, data, format, generatedAt: new Date() };
  }

  sendNotification(title, message, type = 'info') {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body: message, icon: '/favicon.ico' });
    }
  }
}

window.AdminManager = new AdminManager();