/**
 * ANALYTICS SYSTEM
 * Track user behavior, conversions, and engagement
 */

class AnalyticsSystem {
  constructor() {
    this.events = [];
    this.sessionId = this.generateSessionId();
    this.userId = localStorage.getItem('user_id') || null;
    this.pageViews = [];
    this.conversions = [];
    this.init();
  }

  init() {
    // Track page view
    this.trackPageView();

    // Track session duration
    this.trackSessionDuration();

    // Track user interactions
    this.trackInteractions();

    // Send analytics on page unload
    window.addEventListener('beforeunload', () => {
      this.sendAnalytics();
    });

    // Periodic analytics send (every 30 seconds)
    setInterval(() => this.sendAnalytics(), 30000);
  }

  /**
   * Generate session ID
   */
  generateSessionId() {
    const existing = sessionStorage.getItem('session_id');
    if (existing) return existing;

    const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    sessionStorage.setItem('session_id', sessionId);
    return sessionId;
  }

  /**
   * Track page view
   */
  trackPageView() {
    const pageData = {
      url: window.location.href,
      path: window.location.pathname,
      title: document.title,
      referrer: document.referrer,
      timestamp: new Date().toISOString()
    };

    this.pageViews.push(pageData);
    this.trackEvent('page_view', pageData);
  }

  /**
   * Track event
   */
  trackEvent(eventName, eventData = {}) {
    const event = {
      name: eventName,
      data: eventData,
      sessionId: this.sessionId,
      userId: this.userId,
      timestamp: new Date().toISOString(),
      page: window.location.pathname
    };

    this.events.push(event);
    console.log('Analytics event:', event);

    // Send to analytics service
    this.sendEventToService(event);
  }

  /**
   * Track product view
   */
  trackProductView(productId, productData = {}) {
    this.trackEvent('product_view', {
      productId,
      ...productData
    });
  }

  /**
   * Track add to cart
   */
  trackAddToCart(productId, quantity, price) {
    this.trackEvent('add_to_cart', {
      productId,
      quantity,
      price,
      value: price * quantity
    });
  }

  /**
   * Track remove from cart
   */
  trackRemoveFromCart(productId, quantity, price) {
    this.trackEvent('remove_from_cart', {
      productId,
      quantity,
      price,
      value: price * quantity
    });
  }

  /**
   * Track checkout started
   */
  trackCheckoutStarted(cartData) {
    this.trackEvent('checkout_started', {
      itemCount: cartData.items?.length || 0,
      totalValue: cartData.total || 0,
      items: cartData.items || []
    });
  }

  /**
   * Track purchase
   */
  trackPurchase(orderData) {
    const conversion = {
      orderId: orderData.id,
      value: orderData.total,
      items: orderData.items,
      timestamp: new Date().toISOString()
    };

    this.conversions.push(conversion);
    this.trackEvent('purchase', conversion);
  }

  /**
   * Track search
   */
  trackSearch(query, resultsCount = 0) {
    this.trackEvent('search', {
      query,
      resultsCount
    });
  }

  /**
   * Track wishlist action
   */
  trackWishlistAdd(productId) {
    this.trackEvent('wishlist_add', { productId });
  }

  trackWishlistRemove(productId) {
    this.trackEvent('wishlist_remove', { productId });
  }

  /**
   * Track user registration
   */
  trackRegistration(userId) {
    this.userId = userId;
    this.trackEvent('registration', { userId });
  }

  /**
   * Track user login
   */
  trackLogin(userId) {
    this.userId = userId;
    this.trackEvent('login', { userId });
  }

  /**
   * Track user logout
   */
  trackLogout() {
    this.trackEvent('logout', { userId: this.userId });
    this.userId = null;
  }

  /**
   * Track session duration
   */
  trackSessionDuration() {
    const startTime = Date.now();

    window.addEventListener('beforeunload', () => {
      const duration = Date.now() - startTime;
      this.trackEvent('session_end', {
        duration: Math.round(duration / 1000), // seconds
        pageViews: this.pageViews.length
      });
    });
  }

  /**
   * Track user interactions
   */
  trackInteractions() {
    // Track clicks on important elements
    document.addEventListener('click', (e) => {
      const target = e.target.closest('[data-track]');
      if (target) {
        const trackData = target.dataset.track;
        this.trackEvent('click', {
          element: trackData,
          text: target.textContent?.trim().substring(0, 50)
        });
      }
    });

    // Track form submissions
    document.addEventListener('submit', (e) => {
      const form = e.target;
      if (form.dataset.trackForm) {
        this.trackEvent('form_submit', {
          formName: form.dataset.trackForm
        });
      }
    });

    // Track scroll depth
    this.trackScrollDepth();
  }

  /**
   * Track scroll depth
   */
  trackScrollDepth() {
    let maxScroll = 0;
    const depths = [25, 50, 75, 100];
    const tracked = new Set();

    const checkScroll = () => {
      const scrollPercent = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100;
      
      if (scrollPercent > maxScroll) {
        maxScroll = scrollPercent;
      }

      depths.forEach(depth => {
        if (scrollPercent >= depth && !tracked.has(depth)) {
          tracked.add(depth);
          this.trackEvent('scroll_depth', { depth });
        }
      });
    };

    window.addEventListener('scroll', window.PerformanceOptimizer?.throttle(checkScroll, 1000) || checkScroll);
  }

  /**
   * Track time on page
   */
  trackTimeOnPage() {
    const startTime = Date.now();

    return () => {
      const timeSpent = Math.round((Date.now() - startTime) / 1000);
      this.trackEvent('time_on_page', {
        seconds: timeSpent,
        page: window.location.pathname
      });
    };
  }

  /**
   * Send event to analytics service
   */
  sendEventToService(event) {
    // In production, send to Google Analytics, Mixpanel, etc.
    
    // Google Analytics 4 example
    if (window.gtag) {
      window.gtag('event', event.name, event.data);
    }

    // Facebook Pixel example
    if (window.fbq) {
      window.fbq('track', event.name, event.data);
    }

    // Custom analytics endpoint
    if (window.API) {
      // Don't await, fire and forget
      fetch('/api/analytics/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
      }).catch(err => console.warn('Failed to send analytics:', err));
    }
  }

  /**
   * Send all analytics data
   */
  sendAnalytics() {
    if (this.events.length === 0) return;

    const analyticsData = {
      sessionId: this.sessionId,
      userId: this.userId,
      events: this.events,
      pageViews: this.pageViews,
      conversions: this.conversions,
      timestamp: new Date().toISOString()
    };

    // Send to backend
    if (window.API) {
      fetch('/api/analytics/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(analyticsData)
      }).catch(err => console.warn('Failed to send analytics batch:', err));
    }

    // Clear sent events
    this.events = [];
  }

  /**
   * Get analytics summary
   */
  getAnalyticsSummary() {
    return {
      sessionId: this.sessionId,
      userId: this.userId,
      totalEvents: this.events.length,
      pageViews: this.pageViews.length,
      conversions: this.conversions.length,
      eventTypes: this.getEventTypes()
    };
  }

  /**
   * Get event types count
   */
  getEventTypes() {
    const types = {};
    this.events.forEach(event => {
      types[event.name] = (types[event.name] || 0) + 1;
    });
    return types;
  }

  /**
   * Calculate conversion rate
   */
  getConversionRate() {
    const checkoutStarts = this.events.filter(e => e.name === 'checkout_started').length;
    const purchases = this.conversions.length;
    
    if (checkoutStarts === 0) return 0;
    return ((purchases / checkoutStarts) * 100).toFixed(2);
  }

  /**
   * Get user journey
   */
  getUserJourney() {
    return this.pageViews.map(pv => ({
      page: pv.path,
      title: pv.title,
      timestamp: pv.timestamp
    }));
  }

  /**
   * Export analytics data
   */
  exportAnalytics() {
    const data = {
      summary: this.getAnalyticsSummary(),
      events: this.events,
      pageViews: this.pageViews,
      conversions: this.conversions,
      journey: this.getUserJourney(),
      conversionRate: this.getConversionRate()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-${this.sessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Enable debug mode
   */
  enableDebugMode() {
    console.log('Analytics Debug Mode Enabled');
    
    // Log all events to console
    const originalTrackEvent = this.trackEvent.bind(this);
    this.trackEvent = function(eventName, eventData) {
      console.log(`[Analytics] ${eventName}:`, eventData);
      return originalTrackEvent(eventName, eventData);
    };
  }
}

// Create global instance
window.Analytics = new AnalyticsSystem();

// Auto-track cart events
window.addEventListener('cart-updated', (e) => {
  if (e.detail.action === 'add') {
    window.Analytics.trackAddToCart(
      e.detail.productId,
      e.detail.quantity,
      e.detail.price
    );
  } else if (e.detail.action === 'remove') {
    window.Analytics.trackRemoveFromCart(
      e.detail.productId,
      e.detail.quantity,
      e.detail.price
    );
  }
});

// Auto-track wishlist events
window.addEventListener('wishlist-updated', (e) => {
  // Track based on count change
  const prevCount = parseInt(sessionStorage.getItem('wishlist_count') || '0');
  const newCount = e.detail.count;
  
  if (newCount > prevCount) {
    window.Analytics.trackWishlistAdd(e.detail.items[e.detail.items.length - 1]?.id);
  }
  
  sessionStorage.setItem('wishlist_count', newCount);
});

// Auto-track auth events
window.addEventListener('auth-changed', (e) => {
  if (e.detail.loggedIn) {
    window.Analytics.trackLogin(e.detail.userId);
  } else {
    window.Analytics.trackLogout();
  }
});
