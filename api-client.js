/**
 * API CLIENT
 * Centralized API communication layer for all frontend requests
 * Uses Firebase Auth ID tokens for server-side verification
 */

class APIClient {
  constructor(baseURL) {
    this.baseURL = baseURL || (window.TrendaryoConfig ? window.TrendaryoConfig.api.baseURL : '/api');
  }

  async getIdToken() {
    if (typeof firebase !== 'undefined' && firebase.auth) {
      const user = firebase.auth().currentUser;
      if (user) {
        try {
          return await user.getIdToken();
        } catch (e) {
          return null;
        }
      }
    }
    return null;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const token = await this.getIdToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const fetchOptions = {
        method: options.method || 'GET',
        headers,
      };

      if (options.body && options.method !== 'GET') {
        fetchOptions.body = JSON.stringify(options.body);
      }

      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('user_id');
          localStorage.removeItem('user');
          localStorage.removeItem('auth_token');
          setTimeout(() => {
            window.location.href = '/login.html';
          }, 1500);
        }

        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { error: { message: `HTTP ${response.status}` } };
        }

        const error = new Error(errorData.error?.message || 'API Error');
        error.response = { status: response.status, data: errorData };
        throw error;
      }

      return await response.json();
    } catch (error) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        console.warn('API unreachable:', endpoint);
      }
      throw error;
    }
  }

  async register(email, password, firstName, lastName) {
    return this.request('/auth/register', {
      method: 'POST',
      body: { email, password, firstName, lastName },
    });
  }

  async logout() {
    return this.request('/auth/logout', { method: 'POST' });
  }

  async forgotPassword(email) {
    return this.request('/auth/forgot-password', {
      method: 'POST',
      body: { email },
    });
  }

  async getProducts(page = 1, limit = 20, params = {}) {
    const query = new URLSearchParams({ page, limit, ...params }).toString();
    return this.request(`/products?${query}`);
  }

  async getProductById(id) {
    return this.request(`/products/${id}`);
  }

  async createProduct(productData) {
    return this.request('/products', { method: 'POST', body: productData });
  }

  async updateProduct(id, productData) {
    return this.request(`/products/${id}`, { method: 'PUT', body: productData });
  }

  async deleteProduct(id) {
    return this.request(`/products/${id}`, { method: 'DELETE' });
  }

  async getCart() {
    return this.request('/cart');
  }

  async addToCart(productId, quantity = 1, productInfo = {}) {
    return this.request('/cart', {
      method: 'POST',
      body: { productId, quantity, ...productInfo },
    });
  }

  async updateCartItem(productId, quantity, productInfo = {}) {
    return this.request('/cart', {
      method: 'PUT',
      body: { productId, quantity, ...productInfo },
    });
  }

  async removeFromCart(productId) {
    return this.request(`/cart?productId=${productId}`, { method: 'DELETE' });
  }

  async clearCart() {
    return this.request('/cart', { method: 'DELETE' });
  }

  async createOrder(orderData) {
    return this.request('/orders', { method: 'POST', body: orderData });
  }

  async getOrders(page = 1, limit = 20) {
    return this.request(`/orders?page=${page}&limit=${limit}`);
  }

  async getOrderById(id) {
    return this.request(`/orders/${id}`);
  }

  async updateOrder(id, data) {
    return this.request(`/orders/${id}`, { method: 'PUT', body: data });
  }

  /**
   * Create a Stripe PaymentIntent. The server prices the cart from Firestore,
   * so only item quantities are sent - never a client-computed amount.
   * @param {Array<{productId:string, quantity:number}>} items
   * @param {string} [couponCode]
   */
  async createPaymentIntent(items, couponCode) {
    return this.request('/payments/create-intent', {
      method: 'POST',
      body: { items, couponCode: couponCode || null },
    });
  }

  async validateCoupon(code, items) {
    return this.request('/coupons/validate', {
      method: 'POST',
      body: { code, items },
    });
  }

  async getSettings() {
    return this.request('/settings');
  }

  async subscribeNewsletter(email) {
    return this.request('/newsletter', { method: 'POST', body: { email } });
  }

  async cancelOrder(id, reason) {
    return this.request(`/orders/${id}`, { method: 'PUT', body: { status: 'cancelled', note: reason || 'Cancelled by customer' } });
  }

  async updateOrderStatus(id, payload) {
    return this.request(`/orders/${id}`, { method: 'PUT', body: payload });
  }

  async getAdminUser(id) {
    return this.request(`/admin/users/${id}`);
  }

  async updateAdminUser(id, payload) {
    return this.request(`/admin/users/${id}`, { method: 'PUT', body: payload });
  }

  async deleteAdminUser(id) {
    return this.request(`/admin/users/${id}`, { method: 'DELETE' });
  }

  async refundPayment(paymentId, amount, reason) {
    return this.request('/payments/refund', {
      method: 'POST',
      body: { paymentId, amount, reason },
    });
  }

  async getProfile() {
    return this.request('/users/profile');
  }

  async updateProfile(profileData) {
    return this.request('/users/profile', { method: 'PUT', body: profileData });
  }

  async getWishlist() {
    return this.request('/wishlist');
  }

  async addToWishlist(productId) {
    return this.request('/wishlist', { method: 'POST', body: { productId } });
  }

  async removeFromWishlist(productId) {
    return this.request(`/wishlist?productId=${productId}`, { method: 'DELETE' });
  }

  async getProductReviews(productId) {
    return this.request(`/reviews?productId=${productId}`);
  }

  async createReview(productId, rating, title, comment) {
    return this.request('/reviews', {
      method: 'POST',
      body: { productId, rating, title, comment },
    });
  }

  async getAdminStats() {
    return this.request('/admin/stats');
  }

  async getAdminUsers(page = 1, limit = 50, params = {}) {
    const query = new URLSearchParams({ page, limit, ...params }).toString();
    return this.request(`/admin/users?${query}`);
  }

  async getAdminOrders(page = 1, limit = 50, params = {}) {
    const query = new URLSearchParams({ page, limit, ...params }).toString();
    return this.request(`/admin/orders?${query}`);
  }

  async getAdminProducts(page = 1, limit = 50, params = {}) {
    const query = new URLSearchParams({ page, limit, ...params }).toString();
    return this.request(`/admin/products?${query}`);
  }

  async uploadFile(file, folder, type) {
    return this.request('/upload', {
      method: 'POST',
      body: { file, folder, type },
    });
  }
}

const API = new APIClient();
