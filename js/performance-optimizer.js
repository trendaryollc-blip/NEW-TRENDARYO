/**
 * PERFORMANCE OPTIMIZER
 * Lazy loading, image optimization, and caching strategies
 */

class PerformanceOptimizer {
  constructor() {
    this.imageCache = new Map();
    this.lazyLoadObserver = null;
    this.performanceMetrics = {
      pageLoadTime: 0,
      apiCalls: [],
      imageLoads: []
    };
    this.init();
  }

  init() {
    // Measure page load time
    window.addEventListener('load', () => {
      this.performanceMetrics.pageLoadTime = performance.now();
      console.log(`Page loaded in ${this.performanceMetrics.pageLoadTime.toFixed(2)}ms`);
    });

    // Initialize lazy loading
    this.initLazyLoading();

    // Preload critical resources
    this.preloadCriticalResources();

    // Optimize images
    this.optimizeImages();
  }

  /**
   * Initialize lazy loading for images
   */
  initLazyLoading() {
    if ('IntersectionObserver' in window) {
      this.lazyLoadObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            this.loadImage(entry.target);
            this.lazyLoadObserver.unobserve(entry.target);
          }
        });
      }, {
        rootMargin: '50px' // Start loading 50px before entering viewport
      });

      // Observe all lazy images
      this.observeLazyImages();
    } else {
      // Fallback for browsers without IntersectionObserver
      this.loadAllImages();
    }
  }

  /**
   * Observe lazy images
   */
  observeLazyImages() {
    const lazyImages = document.querySelectorAll('img[data-src], img[loading="lazy"]');
    lazyImages.forEach(img => {
      this.lazyLoadObserver.observe(img);
    });
  }

  /**
   * Load image
   */
  loadImage(img) {
    const src = img.dataset.src || img.src;
    
    if (!src) return;

    const startTime = performance.now();

    // Check cache first
    if (this.imageCache.has(src)) {
      img.src = this.imageCache.get(src);
      img.classList.add('loaded');
      return;
    }

    // Load image
    const tempImg = new Image();
    tempImg.onload = () => {
      img.src = src;
      img.classList.add('loaded');
      this.imageCache.set(src, src);
      
      const loadTime = performance.now() - startTime;
      this.performanceMetrics.imageLoads.push({
        src,
        loadTime,
        timestamp: new Date().toISOString()
      });
    };

    tempImg.onerror = () => {
      console.error('Failed to load image:', src);
      img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23ddd" width="100" height="100"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999"%3EImage%3C/text%3E%3C/svg%3E';
    };

    tempImg.src = src;
  }

  /**
   * Load all images (fallback)
   */
  loadAllImages() {
    const lazyImages = document.querySelectorAll('img[data-src]');
    lazyImages.forEach(img => this.loadImage(img));
  }

  /**
   * Optimize images
   */
  optimizeImages() {
    // Add loading="lazy" to all images without it
    const images = document.querySelectorAll('img:not([loading])');
    images.forEach(img => {
      img.loading = 'lazy';
    });

    // Add responsive image attributes
    this.addResponsiveImages();
  }

  /**
   * Add responsive images
   */
  addResponsiveImages() {
    const images = document.querySelectorAll('img[data-responsive]');
    images.forEach(img => {
      const baseSrc = img.dataset.src || img.src;
      
      // Create srcset for different sizes
      const srcset = [
        `${baseSrc}?w=400 400w`,
        `${baseSrc}?w=800 800w`,
        `${baseSrc}?w=1200 1200w`
      ].join(', ');

      img.srcset = srcset;
      img.sizes = '(max-width: 600px) 400px, (max-width: 1200px) 800px, 1200px';
    });
  }

  /**
   * Preload critical resources
   */
  preloadCriticalResources() {
    const criticalResources = [
      { href: '/api-client.js', as: 'script' },
      { href: '/js/loading-states.js', as: 'script' },
      { href: '/shared.css', as: 'style' }
    ];

    criticalResources.forEach(resource => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.href = resource.href;
      link.as = resource.as;
      document.head.appendChild(link);
    });
  }

  /**
   * Debounce function
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Throttle function
   */
  throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /**
   * Cache API response
   */
  cacheAPIResponse(key, data, ttl = 300000) { // 5 minutes default
    const cacheData = {
      data,
      timestamp: Date.now(),
      ttl
    };

    try {
      localStorage.setItem(`api_cache_${key}`, JSON.stringify(cacheData));
    } catch (error) {
      console.warn('Failed to cache API response:', error);
    }
  }

  /**
   * Get cached API response
   */
  getCachedAPIResponse(key) {
    try {
      const cached = localStorage.getItem(`api_cache_${key}`);
      if (!cached) return null;

      const cacheData = JSON.parse(cached);
      const age = Date.now() - cacheData.timestamp;

      // Check if cache is still valid
      if (age < cacheData.ttl) {
        return cacheData.data;
      } else {
        // Cache expired, remove it
        localStorage.removeItem(`api_cache_${key}`);
        return null;
      }
    } catch (error) {
      console.warn('Failed to get cached API response:', error);
      return null;
    }
  }

  /**
   * Clear API cache
   */
  clearAPICache() {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('api_cache_')) {
        localStorage.removeItem(key);
      }
    });
  }

  /**
   * Measure API call performance
   */
  measureAPICall(endpoint, duration) {
    this.performanceMetrics.apiCalls.push({
      endpoint,
      duration,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get performance report
   */
  getPerformanceReport() {
    const avgAPITime = this.performanceMetrics.apiCalls.length > 0
      ? this.performanceMetrics.apiCalls.reduce((sum, call) => sum + call.duration, 0) / this.performanceMetrics.apiCalls.length
      : 0;

    const avgImageLoadTime = this.performanceMetrics.imageLoads.length > 0
      ? this.performanceMetrics.imageLoads.reduce((sum, img) => sum + img.loadTime, 0) / this.performanceMetrics.imageLoads.length
      : 0;

    return {
      pageLoadTime: this.performanceMetrics.pageLoadTime,
      apiCalls: {
        total: this.performanceMetrics.apiCalls.length,
        averageTime: avgAPITime.toFixed(2) + 'ms'
      },
      imageLoads: {
        total: this.performanceMetrics.imageLoads.length,
        averageTime: avgImageLoadTime.toFixed(2) + 'ms'
      },
      cacheSize: this.imageCache.size
    };
  }

  /**
   * Log performance report
   */
  logPerformanceReport() {
    const report = this.getPerformanceReport();
    console.table(report);
  }

  /**
   * Optimize scroll performance
   */
  optimizeScrollPerformance() {
    let ticking = false;

    window.addEventListener('scroll', () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          // Your scroll handling code here
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  /**
   * Prefetch links
   */
  prefetchLinks() {
    const links = document.querySelectorAll('a[data-prefetch]');
    
    if ('IntersectionObserver' in window) {
      const prefetchObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const link = entry.target;
            const href = link.href;
            
            // Create prefetch link
            const prefetchLink = document.createElement('link');
            prefetchLink.rel = 'prefetch';
            prefetchLink.href = href;
            document.head.appendChild(prefetchLink);
            
            prefetchObserver.unobserve(link);
          }
        });
      });

      links.forEach(link => prefetchObserver.observe(link));
    }
  }

  /**
   * Reduce layout shifts
   */
  reduceLayoutShifts() {
    // Add aspect ratio to images
    const images = document.querySelectorAll('img:not([width]):not([height])');
    images.forEach(img => {
      img.style.aspectRatio = '16 / 9'; // Default aspect ratio
    });
  }

  /**
   * Enable service worker
   */
  enableServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js')
        .then(registration => {
          console.log('Service Worker registered:', registration);
        })
        .catch(error => {
          console.error('Service Worker registration failed:', error);
        });
    }
  }

  /**
   * Compress data before storing
   */
  compressData(data) {
    return JSON.stringify(data);
  }

  /**
   * Decompress data
   */
  decompressData(compressed) {
    return JSON.parse(compressed);
  }
}

// Create global instance
window.PerformanceOptimizer = new PerformanceOptimizer();

// Enhance API client with caching
if (window.API) {
  const originalRequest = window.API.request;
  window.API.request = async function(endpoint, options = {}) {
    const cacheKey = `${endpoint}_${JSON.stringify(options)}`;
    const startTime = performance.now();

    // Check cache for GET requests
    if (!options.method || options.method === 'GET') {
      const cached = window.PerformanceOptimizer.getCachedAPIResponse(cacheKey);
      if (cached) {
        console.log('Using cached response for:', endpoint);
        return cached;
      }
    }

    // Make request
    const response = await originalRequest.apply(this, arguments);
    const duration = performance.now() - startTime;

    // Measure performance
    window.PerformanceOptimizer.measureAPICall(endpoint, duration);

    // Cache successful GET responses
    if (response.success && (!options.method || options.method === 'GET')) {
      window.PerformanceOptimizer.cacheAPIResponse(cacheKey, response);
    }

    return response;
  };
}

// Auto-observe new images
const imageObserver = new MutationObserver((mutations) => {
  mutations.forEach(mutation => {
    mutation.addedNodes.forEach(node => {
      if (node.tagName === 'IMG') {
        if (window.PerformanceOptimizer.lazyLoadObserver) {
          window.PerformanceOptimizer.lazyLoadObserver.observe(node);
        }
      }
    });
  });
});

imageObserver.observe(document.body, {
  childList: true,
  subtree: true
});
