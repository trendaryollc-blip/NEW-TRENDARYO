/**
 * TRENDARYO — Advanced Features System
 * Includes: Analytics, Search, Validation, Caching, Reviews, Wishlist
 * No external dependencies required
 */

// ═══════════════════════════════════════════════════════════════════════════
// ANALYTICS SYSTEM — Track user behavior, conversions, page views
// ═══════════════════════════════════════════════════════════════════════════

class AnalyticsManager {
  constructor() {
    this.sessionId = this.getOrCreateSessionId();
    this.events = [];
    this.pageViews = [];
    this.startTime = Date.now();
    this.loadFromStorage();
  }

  getOrCreateSessionId() {
    let sessionId = sessionStorage.getItem('trendaryo_session_id');
    if (!sessionId) {
      sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem('trendaryo_session_id', sessionId);
    }
    return sessionId;
  }

  trackEvent(eventName, eventData = {}) {
    const event = {
      id: 'event_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      name: eventName,
      data: eventData,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent.substring(0, 100)
    };
    this.events.push(event);
    this.saveToStorage();
    console.log('📊 Event tracked:', eventName, eventData);
  }

  trackPageView() {
    const pageView = {
      id: 'pv_' + Date.now(),
      page: window.location.pathname,
      title: document.title,
      timestamp: new Date().toISOString(),
      referrer: document.referrer,
      timeOnPage: 0
    };
    this.pageViews.push(pageView);
    this.saveToStorage();
  }

  trackConversion(conversionType, value = 0) {
    this.trackEvent('conversion', {
      type: conversionType,
      value: value,
      timestamp: new Date().toISOString()
    });
  }

  trackProductView(productId, productName) {
    this.trackEvent('product_view', {
      productId: productId,
      productName: productName
    });
  }

  trackAddToCart(productId, quantity, price) {
    this.trackEvent('add_to_cart', {
      productId: productId,
      quantity: quantity,
      price: price
    });
  }

  trackCheckout(cartTotal, itemCount) {
    this.trackEvent('checkout_started', {
      cartTotal: cartTotal,
      itemCount: itemCount
    });
  }

  getAnalytics() {
    return {
      sessionId: this.sessionId,
      sessionDuration: Math.round((Date.now() - this.startTime) / 1000),
      totalEvents: this.events.length,
      totalPageViews: this.pageViews.length,
      events: this.events.slice(-50), // Last 50 events
      pageViews: this.pageViews.slice(-20),
      conversionRate: this.calculateConversionRate(),
      topProducts: this.getTopProducts(),
      deviceInfo: this.getDeviceInfo()
    };
  }

  calculateConversionRate() {
    const conversions = this.events.filter(e => e.name === 'conversion').length;
    const pageViews = this.pageViews.length;
    return pageViews > 0 ? ((conversions / pageViews) * 100).toFixed(2) + '%' : '0%';
  }

  getTopProducts() {
    const productViews = {};
    this.events.filter(e => e.name === 'product_view').forEach(e => {
      const key = e.data.productId;
      productViews[key] = (productViews[key] || 0) + 1;
    });
    return Object.entries(productViews)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({ productId: id, views: count }));
  }

  getDeviceInfo() {
    const ua = navigator.userAgent;
    return {
      isMobile: /Mobile|Android|iPhone/.test(ua),
      isTablet: /iPad|Android/.test(ua),
      browser: ua.includes('Chrome') ? 'Chrome' : ua.includes('Firefox') ? 'Firefox' : ua.includes('Safari') ? 'Safari' : 'Other',
      os: ua.includes('Windows') ? 'Windows' : ua.includes('Mac') ? 'Mac' : ua.includes('Linux') ? 'Linux' : 'Other'
    };
  }

  saveToStorage() {
    try {
      localStorage.setItem('trendaryo_analytics', JSON.stringify({
        events: this.events.slice(-100),
        pageViews: this.pageViews.slice(-50)
      }));
    } catch (e) {
      console.warn('Analytics storage quota exceeded');
    }
  }

  loadFromStorage() {
    try {
      const stored = JSON.parse(localStorage.getItem('trendaryo_analytics') || '{}');
      this.events = stored.events || [];
      this.pageViews = stored.pageViews || [];
    } catch (e) {
      console.warn('Failed to load analytics');
    }
  }

  exportAnalytics() {
    const data = this.getAnalytics();
    const csv = this.convertToCSV(data.events);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  }

  convertToCSV(data) {
    const headers = ['Event ID', 'Event Name', 'Timestamp', 'URL', 'Data'];
    const rows = data.map(e => [
      e.id,
      e.name,
      e.timestamp,
      e.url,
      JSON.stringify(e.data)
    ]);
    return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ADVANCED SEARCH SYSTEM — Full-text search with filters
// ═══════════════════════════════════════════════════════════════════════════

class SearchEngine {
  constructor(products = []) {
    this.products = products;
    this.searchHistory = this.loadSearchHistory();
    this.buildIndex();
  }

  buildIndex() {
    this.index = {};
    this.products.forEach(product => {
      const text = `${product.name} ${product.description} ${product.category || ''} ${product.tags || ''}`.toLowerCase();
      const words = text.split(/\s+/);
      words.forEach(word => {
        if (word.length > 2) {
          if (!this.index[word]) this.index[word] = [];
          if (!this.index[word].includes(product.id)) {
            this.index[word].push(product.id);
          }
        }
      });
    });
  }

  search(query, filters = {}) {
    if (!query || query.length < 2) return [];

    const queryWords = query.toLowerCase().split(/\s+/);
    let results = new Set();

    queryWords.forEach(word => {
      const matchingIds = this.index[word] || [];
      if (results.size === 0) {
        matchingIds.forEach(id => results.add(id));
      } else {
        results = new Set([...results].filter(id => matchingIds.includes(id)));
      }
    });

    let products = Array.from(results).map(id => this.products.find(p => p.id == id));

    // Apply filters
    if (filters.minPrice !== undefined) {
      products = products.filter(p => p.price >= filters.minPrice);
    }
    if (filters.maxPrice !== undefined) {
      products = products.filter(p => p.price <= filters.maxPrice);
    }
    if (filters.category) {
      products = products.filter(p => p.category === filters.category);
    }
    if (filters.rating !== undefined) {
      products = products.filter(p => (p.rating || 0) >= filters.rating);
    }

    // Sort by relevance
    products.sort((a, b) => {
      const aMatches = queryWords.filter(w => a.name.toLowerCase().includes(w)).length;
      const bMatches = queryWords.filter(w => b.name.toLowerCase().includes(w)).length;
      return bMatches - aMatches;
    });

    this.addToSearchHistory(query);
    return products;
  }

  addToSearchHistory(query) {
    if (!this.searchHistory.includes(query)) {
      this.searchHistory.unshift(query);
      if (this.searchHistory.length > 20) this.searchHistory.pop();
      this.saveSearchHistory();
    }
  }

  getSearchHistory() {
    return this.searchHistory;
  }

  clearSearchHistory() {
    this.searchHistory = [];
    localStorage.removeItem('trendaryo_search_history');
  }

  saveSearchHistory() {
    localStorage.setItem('trendaryo_search_history', JSON.stringify(this.searchHistory));
  }

  loadSearchHistory() {
    try {
      return JSON.parse(localStorage.getItem('trendaryo_search_history') || '[]');
    } catch (e) {
      return [];
    }
  }

  getSuggestions(query) {
    if (!query || query.length < 2) return [];
    const lower = query.toLowerCase();
    return this.searchHistory.filter(h => h.toLowerCase().includes(lower)).slice(0, 5);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// INPUT VALIDATION SYSTEM — Comprehensive form validation
// ═══════════════════════════════════════════════════════════════════════════

class Validator {
  static email(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }

  static password(password) {
    return password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password);
  }

  static phone(phone) {
    const re = /^[\d\s\-\+\(\)]{10,}$/;
    return re.test(phone.replace(/\s/g, ''));
  }

  static creditCard(cc) {
    const re = /^[0-9]{13,19}$/;
    return re.test(cc.replace(/\s/g, ''));
  }

  static zipCode(zip) {
    const re = /^[0-9]{5}(-[0-9]{4})?$/;
    return re.test(zip);
  }

  static url(url) {
    try {
      new URL(url);
      return true;
    } catch (e) {
      return false;
    }
  }

  static required(value) {
    return value !== null && value !== undefined && value.toString().trim().length > 0;
  }

  static minLength(value, min) {
    return value.toString().length >= min;
  }

  static maxLength(value, max) {
    return value.toString().length <= max;
  }

  static number(value) {
    return !isNaN(value) && isFinite(value);
  }

  static validateForm(formData, rules) {
    const errors = {};
    Object.keys(rules).forEach(field => {
      const rule = rules[field];
      const value = formData[field];

      if (rule.required && !this.required(value)) {
        errors[field] = `${field} is required`;
      } else if (rule.email && !this.email(value)) {
        errors[field] = `${field} must be a valid email`;
      } else if (rule.password && !this.password(value)) {
        errors[field] = `${field} must be at least 8 characters with uppercase and numbers`;
      } else if (rule.phone && !this.phone(value)) {
        errors[field] = `${field} must be a valid phone number`;
      } else if (rule.minLength && !this.minLength(value, rule.minLength)) {
        errors[field] = `${field} must be at least ${rule.minLength} characters`;
      } else if (rule.maxLength && !this.maxLength(value, rule.maxLength)) {
        errors[field] = `${field} must be at most ${rule.maxLength} characters`;
      }
    });
    return { isValid: Object.keys(errors).length === 0, errors };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CSRF PROTECTION — Token-based CSRF prevention
// ═══════════════════════════════════════════════════════════════════════════

class CSRFProtection {
  static generateToken() {
    const token = 'csrf_' + Date.now() + '_' + Math.random().toString(36).substr(2, 20);
    sessionStorage.setItem('trendaryo_csrf_token', token);
    return token;
  }

  static getToken() {
    let token = sessionStorage.getItem('trendaryo_csrf_token');
    if (!token) {
      token = this.generateToken();
    }
    return token;
  }

  static validateToken(token) {
    const stored = sessionStorage.getItem('trendaryo_csrf_token');
    return stored && stored === token;
  }

  static addTokenToForms() {
    const token = this.getToken();
    document.querySelectorAll('form').forEach(form => {
      if (!form.querySelector('input[name="csrf_token"]')) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = 'csrf_token';
        input.value = token;
        form.appendChild(input);
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT REVIEWS SYSTEM — User reviews with ratings
// ═══════════════════════════════════════════════════════════════════════════

class ReviewsManager {
  constructor() {
    this.reviews = this.loadReviews();
  }

  addReview(productId, review) {
    const newReview = {
      id: 'review_' + Date.now(),
      productId: productId,
      author: review.author || 'Anonymous',
      rating: Math.min(5, Math.max(1, review.rating)),
      title: review.title || '',
      text: review.text || '',
      helpful: 0,
      timestamp: new Date().toISOString(),
      verified: review.verified || false
    };
    this.reviews.push(newReview);
    this.saveReviews();
    return newReview;
  }

  getProductReviews(productId) {
    return this.reviews.filter(r => r.productId == productId).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  getProductRating(productId) {
    const productReviews = this.getProductReviews(productId);
    if (productReviews.length === 0) return 0;
    const avg = productReviews.reduce((sum, r) => sum + r.rating, 0) / productReviews.length;
    return Math.round(avg * 10) / 10;
  }

  markHelpful(reviewId) {
    const review = this.reviews.find(r => r.id === reviewId);
    if (review) {
      review.helpful = (review.helpful || 0) + 1;
      this.saveReviews();
    }
  }

  deleteReview(reviewId) {
    this.reviews = this.reviews.filter(r => r.id !== reviewId);
    this.saveReviews();
  }

  saveReviews() {
    try {
      localStorage.setItem('trendaryo_reviews', JSON.stringify(this.reviews));
    } catch (e) {
      console.warn('Reviews storage quota exceeded');
    }
  }

  loadReviews() {
    try {
      return JSON.parse(localStorage.getItem('trendaryo_reviews') || '[]');
    } catch (e) {
      return [];
    }
  }

  getReviewStats(productId) {
    const reviews = this.getProductReviews(productId);
    const stats = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach(r => stats[r.rating]++);
    return {
      totalReviews: reviews.length,
      averageRating: this.getProductRating(productId),
      ratingDistribution: stats
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ENHANCED WISHLIST SYSTEM — Persistent wishlist with sharing
// ═══════════════════════════════════════════════════════════════════════════

class WishlistManager {
  constructor() {
    this.wishlist = this.loadWishlist();
  }

  addItem(product) {
    if (!this.wishlist.find(item => item.id === product.id)) {
      this.wishlist.push({
        ...product,
        addedAt: new Date().toISOString(),
        priority: 'medium'
      });
      this.saveWishlist();
      return true;
    }
    return false;
  }

  removeItem(productId) {
    this.wishlist = this.wishlist.filter(item => item.id !== productId);
    this.saveWishlist();
  }

  getWishlist() {
    return this.wishlist;
  }

  getWishlistCount() {
    return this.wishlist.length;
  }

  setPriority(productId, priority) {
    const item = this.wishlist.find(i => i.id === productId);
    if (item) {
      item.priority = priority;
      this.saveWishlist();
    }
  }

  moveToCart(productId) {
    const item = this.wishlist.find(i => i.id === productId);
    if (item) {
      this.removeItem(productId);
      return item;
    }
    return null;
  }

  shareWishlist() {
    const shareData = {
      id: 'wishlist_' + Date.now(),
      items: this.wishlist,
      createdAt: new Date().toISOString(),
      url: `${window.location.origin}?wishlist=${btoa(JSON.stringify(this.wishlist))}`
    };
    return shareData;
  }

  importWishlist(wishlistData) {
    try {
      const items = JSON.parse(atob(wishlistData));
      items.forEach(item => this.addItem(item));
      return true;
    } catch (e) {
      return false;
    }
  }

  saveWishlist() {
    try {
      localStorage.setItem('wishlist', JSON.stringify(this.wishlist));
    } catch (e) {
      console.warn('Wishlist storage quota exceeded');
    }
  }

  loadWishlist() {
    try {
      return JSON.parse(localStorage.getItem('wishlist') || '[]');
    } catch (e) {
      return [];
    }
  }

  exportWishlist() {
    const data = JSON.stringify(this.wishlist, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wishlist_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CACHING SYSTEM — Smart caching with expiration
// ═══════════════════════════════════════════════════════════════════════════

class CacheManager {
  constructor(ttl = 3600000) { // 1 hour default
    this.ttl = ttl;
  }

  set(key, value, customTTL = null) {
    const expiry = Date.now() + (customTTL || this.ttl);
    try {
      localStorage.setItem(`cache_${key}`, JSON.stringify({ value, expiry }));
    } catch (e) {
      console.warn('Cache storage quota exceeded');
    }
  }

  get(key) {
    try {
      const cached = JSON.parse(localStorage.getItem(`cache_${key}`) || '{}');
      if (cached.expiry && cached.expiry > Date.now()) {
        return cached.value;
      } else {
        this.remove(key);
        return null;
      }
    } catch (e) {
      return null;
    }
  }

  remove(key) {
    localStorage.removeItem(`cache_${key}`);
  }

  clear() {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('cache_')) {
        localStorage.removeItem(key);
      }
    });
  }

  getStats() {
    let size = 0;
    let count = 0;
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('cache_')) {
        count++;
        size += localStorage.getItem(key).length;
      }
    });
    return { count, size: (size / 1024).toFixed(2) + ' KB' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// IMAGE OPTIMIZATION — Lazy loading and responsive images
// ═══════════════════════════════════════════════════════════════════════════

class ImageOptimizer {
  static initLazyLoading() {
    if ('IntersectionObserver' in window) {
      const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            img.src = img.dataset.src;
            img.classList.add('loaded');
            observer.unobserve(img);
          }
        });
      });

      document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img);
      });
    }
  }

  static generateResponsiveImage(src, alt = '') {
    return `
      <img 
        data-src="${src}" 
        src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 300'%3E%3C/svg%3E"
        alt="${alt}"
        class="lazy-image"
        loading="lazy"
      />
    `;
  }

  static optimizeImageSize(width, height) {
    const maxWidth = window.innerWidth;
    const ratio = height / width;
    const newWidth = Math.min(width, maxWidth);
    const newHeight = newWidth * ratio;
    return { width: newWidth, height: newHeight };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ERROR TRACKING SYSTEM — Client-side error logging
// ═══════════════════════════════════════════════════════════════════════════

class ErrorTracker {
  constructor() {
    this.errors = this.loadErrors();
    this.setupGlobalErrorHandler();
  }

  setupGlobalErrorHandler() {
    window.addEventListener('error', (event) => {
      this.logError({
        type: 'uncaught_error',
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.logError({
        type: 'unhandled_rejection',
        message: event.reason?.message || String(event.reason),
        stack: event.reason?.stack
      });
    });
  }

  logError(errorData) {
    const error = {
      id: 'error_' + Date.now(),
      ...errorData,
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent.substring(0, 100)
    };
    this.errors.push(error);
    this.saveErrors();
    console.error('🚨 Error logged:', error);
  }

  getErrors() {
    return this.errors.slice(-50);
  }

  clearErrors() {
    this.errors = [];
    localStorage.removeItem('trendaryo_errors');
  }

  saveErrors() {
    try {
      localStorage.setItem('trendaryo_errors', JSON.stringify(this.errors.slice(-100)));
    } catch (e) {
      console.warn('Error storage quota exceeded');
    }
  }

  loadErrors() {
    try {
      return JSON.parse(localStorage.getItem('trendaryo_errors') || '[]');
    } catch (e) {
      return [];
    }
  }

  exportErrors() {
    const csv = this.convertToCSV(this.errors);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `errors_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  }

  convertToCSV(data) {
    const headers = ['Error ID', 'Type', 'Message', 'Timestamp', 'URL'];
    const rows = data.map(e => [e.id, e.type, e.message, e.timestamp, e.url]);
    return [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL INITIALIZATION
// ═══════════════════════════════════════════════════════════════════════════

// Create global instances
window.Analytics = new AnalyticsManager();
window.SearchEngine = new SearchEngine();
window.Validator = Validator;
window.CSRFProtection = CSRFProtection;
window.ReviewsManager = new ReviewsManager();
window.WishlistManager = new WishlistManager();
window.CacheManager = new CacheManager();
window.ImageOptimizer = ImageOptimizer;
window.ErrorTracker = new ErrorTracker();

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  Analytics.trackPageView();
  CSRFProtection.addTokenToForms();
  ImageOptimizer.initLazyLoading();
});

// Track page visibility
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    Analytics.trackEvent('page_hidden');
  } else {
    Analytics.trackEvent('page_visible');
  }
});

console.log('✅ Advanced Features System Loaded');
