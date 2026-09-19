/**
 * MOBILE RESPONSIVENESS ENHANCEMENTS
 * Ensure perfect display on all devices
 */

class MobileOptimizer {
  constructor() {
    this.isMobile = this.detectMobile();
    this.isTablet = this.detectTablet();
    this.orientation = this.getOrientation();
    this.init();
  }

  init() {
    // Add device classes to body
    this.addDeviceClasses();

    // Optimize touch interactions
    this.optimizeTouchInteractions();

    // Handle orientation changes
    this.handleOrientationChange();

    // Optimize viewport
    this.optimizeViewport();

    // Add mobile-specific styles
    this.injectMobileStyles();

    // Prevent zoom on input focus (iOS)
    this.preventInputZoom();

    // Optimize scrolling
    this.optimizeScrolling();
  }

  /**
   * Detect mobile device
   */
  detectMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  /**
   * Detect tablet
   */
  detectTablet() {
    return /iPad|Android/i.test(navigator.userAgent) && window.innerWidth >= 768;
  }

  /**
   * Get orientation
   */
  getOrientation() {
    return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
  }

  /**
   * Add device classes
   */
  addDeviceClasses() {
    document.body.classList.add(
      this.isMobile ? 'is-mobile' : 'is-desktop',
      this.isTablet ? 'is-tablet' : '',
      `orientation-${this.orientation}`
    );
  }

  /**
   * Optimize touch interactions
   */
  optimizeTouchInteractions() {
    // Add touch-friendly tap targets
    const buttons = document.querySelectorAll('button, a, [role="button"]');
    buttons.forEach(btn => {
      if (!btn.style.minHeight) {
        btn.style.minHeight = '44px';
      }
      if (!btn.style.minWidth) {
        btn.style.minWidth = '44px';
      }
    });

    // Prevent 300ms click delay on mobile
    document.addEventListener('touchstart', () => {}, { passive: true });

    // Add active states for touch
    document.addEventListener('touchstart', (e) => {
      const target = e.target.closest('button, a, [role="button"]');
      if (target) {
        target.classList.add('touch-active');
      }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
      const target = e.target.closest('button, a, [role="button"]');
      if (target) {
        setTimeout(() => target.classList.remove('touch-active'), 150);
      }
    }, { passive: true });
  }

  /**
   * Handle orientation change
   */
  handleOrientationChange() {
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        this.orientation = this.getOrientation();
        document.body.classList.remove('orientation-portrait', 'orientation-landscape');
        document.body.classList.add(`orientation-${this.orientation}`);
        
        window.dispatchEvent(new CustomEvent('orientation-changed', {
          detail: { orientation: this.orientation }
        }));
      }, 100);
    });
  }

  /**
   * Optimize viewport
   */
  optimizeViewport() {
    let viewport = document.querySelector('meta[name="viewport"]');
    if (!viewport) {
      viewport = document.createElement('meta');
      viewport.name = 'viewport';
      document.head.appendChild(viewport);
    }

    viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes';
  }

  /**
   * Inject mobile styles
   */
  injectMobileStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .is-mobile button,
      .is-mobile a,
      .is-mobile [role="button"] {
        min-height: 44px;
        min-width: 44px;
        padding: 0.75rem 1rem;
      }

      .touch-active {
        opacity: 0.7;
        transform: scale(0.98);
        transition: all 0.1s ease;
      }

      .is-mobile button,
      .is-mobile [role="button"] {
        -webkit-user-select: none;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
      }

      .is-mobile {
        -webkit-overflow-scrolling: touch;
      }

      .is-mobile input,
      .is-mobile textarea,
      .is-mobile select {
        font-size: 16px !important;
      }

      @media (max-width: 768px) {
        .products-grid,
        .wishlist-grid-3d {
          grid-template-columns: 1fr !important;
        }

        .page-offset {
          padding-top: 100px !important;
        }

        h1 {
          font-size: 2rem;
        }

        h2 {
          font-size: 1.5rem;
        }
      }

      @media (min-width: 769px) and (max-width: 1024px) {
        .products-grid {
          grid-template-columns: repeat(2, 1fr) !important;
        }
      }

      @supports (padding: max(0px)) {
        .store-header {
          padding-left: max(1rem, env(safe-area-inset-left));
          padding-right: max(1rem, env(safe-area-inset-right));
        }
      }

      .is-mobile body {
        overflow-x: hidden;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Prevent input zoom on iOS
   */
  preventInputZoom() {
    if (this.isMobile) {
      const inputs = document.querySelectorAll('input, textarea, select');
      inputs.forEach(input => {
        if (!input.style.fontSize || parseInt(input.style.fontSize) < 16) {
          input.style.fontSize = '16px';
        }
      });
    }
  }

  /**
   * Optimize scrolling
   */
  optimizeScrolling() {
    document.body.style.webkitOverflowScrolling = 'touch';
  }

  /**
   * Get device info
   */
  getDeviceInfo() {
    return {
      isMobile: this.isMobile,
      isTablet: this.isTablet,
      orientation: this.orientation,
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      pixelRatio: window.devicePixelRatio
    };
  }
}

// Create global instance
window.MobileOptimizer = new MobileOptimizer();
