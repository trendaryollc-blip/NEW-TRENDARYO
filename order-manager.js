/**
 * ORDER MANAGEMENT SYSTEM
 * Handles order creation, tracking, history, and status management
 * Uses the API client for server-side operations with Firebase Auth
 */

class OrderManager {
  constructor() {
    this.ORDERS_KEY = 'trendaryo_orders';
    this.loadOrdersFromStorage();
  }

  async getAuthToken() {
    if (typeof FirebaseAuth !== 'undefined' && FirebaseAuth.getIdToken) {
      return await FirebaseAuth.getIdToken();
    }
    return null;
  }

  async makeRequest(endpoint, options = {}) {
    const token = await this.getAuthToken();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const url = endpoint.startsWith('http') ? endpoint : `/api${endpoint}`;
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || `HTTP ${response.status}`);
    }
    return data;
  }

  async createOrder(orderData) {
    try {
      const data = await this.makeRequest('/orders', {
        method: 'POST',
        body: orderData,
      });
      if (data.data) {
        this.addOrderToStorage(data.data);
      }
      return { success: true, data: data.data };
    } catch (error) {
      console.error('[OrderManager] createOrder error:', error);
      return { success: false, error: error.message };
    }
  }

  async getOrders(limit = 20, page = 1) {
    try {
      const data = await this.makeRequest(`/orders?limit=${limit}&page=${page}`);
      return { success: true, data: data };
    } catch (error) {
      console.error('[OrderManager] getOrders error:', error);
      return { success: false, error: error.message };
    }
  }

  async getOrderById(orderId) {
    try {
      if (!orderId) throw new Error('Order ID is required');
      const data = await this.makeRequest(`/orders/${orderId}`);
      return { success: true, data: data.data };
    } catch (error) {
      console.error('[OrderManager] getOrderById error:', error);
      return { success: false, error: error.message };
    }
  }

  async updateOrderStatus(orderId, status, note) {
    try {
      const data = await this.makeRequest(`/orders/${orderId}`, {
        method: 'PUT',
        body: { status, note },
      });
      return { success: true, data: data.data };
    } catch (error) {
      console.error('[OrderManager] updateOrderStatus error:', error);
      return { success: false, error: error.message };
    }
  }

  // Local storage fallback methods
  loadOrdersFromStorage() {
    try {
      this.localOrders = JSON.parse(localStorage.getItem(this.ORDERS_KEY) || '[]');
    } catch (e) {
      this.localOrders = [];
    }
  }

  addOrderToStorage(order) {
    try {
      const existing = this.localOrders.findIndex(o => o.id === order.id);
      if (existing >= 0) {
        this.localOrders[existing] = order;
      } else {
        this.localOrders.unshift(order);
      }
      localStorage.setItem(this.ORDERS_KEY, JSON.stringify(this.localOrders));
    } catch (e) {}
  }

  getLocalOrders() {
    return this.localOrders || [];
  }

  getLocalOrder(orderId) {
    return this.localOrders.find(o => o.id === orderId || o.orderNumber === orderId) || null;
  }

  find(orderId) {
    return this.getLocalOrder(orderId);
  }

  list() {
    return this.localOrders || [];
  }

  getOrdersByStatus() {
    const orders = this.localOrders || [];
    return {
      pending: orders.filter(o => o.status === 'pending').length,
      confirmed: orders.filter(o => o.status === 'confirmed').length,
      shipped: orders.filter(o => o.status === 'shipped').length,
      delivered: orders.filter(o => o.status === 'delivered').length,
      cancelled: orders.filter(o => o.status === 'cancelled').length,
    };
  }

  getOrderCount() {
    return (this.localOrders || []).length;
  }

  getTotalSpent() {
    return (this.localOrders || []).reduce((sum, o) => {
      if (o.paymentStatus === 'paid') return sum + (o.total || 0);
      return sum;
    }, 0);
  }

  getAverageOrderValue() {
    const paid = (this.localOrders || []).filter(o => o.paymentStatus === 'paid');
    if (paid.length === 0) return 0;
    return paid.reduce((sum, o) => sum + (o.total || 0), 0) / paid.length;
  }

  getStatusIcon(status) {
    const icons = {
      pending: '⏳',
      confirmed: '✅',
      processing: '🔄',
      shipped: '🚚',
      delivered: '📦',
      cancelled: '❌',
      refunded: '💰',
      returned: '↩️'
    };
    return icons[status] || '📋';
  }

  formatOrderDate(dateStr) {
    if (!dateStr) return 'N/A';
    try {
      var d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  }

  sortOrdersByDate(ascending) {
    var orders = (this.localOrders || []).slice();
    orders.sort(function (a, b) {
      var da = new Date(a.createdAt || 0).getTime();
      var db = new Date(b.createdAt || 0).getTime();
      return ascending ? da - db : db - da;
    });
    return orders;
  }

  sortOrdersByAmount(ascending) {
    var orders = (this.localOrders || []).slice();
    orders.sort(function (a, b) {
      return ascending ? (a.total || 0) - (b.total || 0) : (b.total || 0) - (a.total || 0);
    });
    return orders;
  }
}

window.OrderManager = new OrderManager();
