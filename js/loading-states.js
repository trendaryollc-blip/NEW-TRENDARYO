/**
 * LOADING STATES SYSTEM
 * Universal loading indicators for all async operations
 */

class LoadingStates {
  constructor() {
    this.activeLoaders = new Set();
    this.init();
  }

  init() {
    // Inject loading styles
    const style = document.createElement('style');
    style.textContent = `
      .loading-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(5px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.3s ease;
      }

      .loading-overlay.active {
        opacity: 1;
        pointer-events: all;
      }

      .loading-spinner {
        width: 60px;
        height: 60px;
        border: 4px solid rgba(0, 240, 255, 0.2);
        border-top-color: #00f0ff;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      .loading-inline {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
      }

      .loading-inline-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(0, 240, 255, 0.3);
        border-top-color: #00f0ff;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
      }

      .loading-button {
        position: relative;
        pointer-events: none;
        opacity: 0.7;
      }

      .loading-button::after {
        content: '';
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
      }

      .skeleton-loader {
        background: linear-gradient(
          90deg,
          rgba(255, 255, 255, 0.05) 25%,
          rgba(255, 255, 255, 0.1) 50%,
          rgba(255, 255, 255, 0.05) 75%
        );
        background-size: 200% 100%;
        animation: shimmer 1.5s infinite;
        border-radius: 8px;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      @keyframes shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
    `;
    document.head.appendChild(style);

    // Create overlay element
    this.overlay = document.createElement('div');
    this.overlay.className = 'loading-overlay';
    this.overlay.innerHTML = '<div class="loading-spinner"></div>';
    document.body.appendChild(this.overlay);
  }

  /**
   * Show full-screen loading overlay
   */
  showOverlay(id = 'default') {
    this.activeLoaders.add(id);
    this.overlay.classList.add('active');
  }

  /**
   * Hide full-screen loading overlay
   */
  hideOverlay(id = 'default') {
    this.activeLoaders.delete(id);
    if (this.activeLoaders.size === 0) {
      this.overlay.classList.remove('active');
    }
  }

  /**
   * Add loading state to button
   */
  loadButton(button) {
    if (!button) return;
    button.classList.add('loading-button');
    button.disabled = true;
    button.dataset.originalText = button.textContent;
  }

  /**
   * Remove loading state from button
   */
  unloadButton(button) {
    if (!button) return;
    button.classList.remove('loading-button');
    button.disabled = false;
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
    }
  }

  /**
   * Create inline loading indicator
   */
  createInlineLoader(text = 'Loading...') {
    const loader = document.createElement('div');
    loader.className = 'loading-inline';
    loader.innerHTML = `
      <div class="loading-inline-spinner"></div>
      <span>${text}</span>
    `;
    return loader;
  }

  /**
   * Create skeleton loader for content
   */
  createSkeleton(width = '100%', height = '20px') {
    const skeleton = document.createElement('div');
    skeleton.className = 'skeleton-loader';
    skeleton.style.width = width;
    skeleton.style.height = height;
    return skeleton;
  }

  /**
   * Show skeleton loaders in container
   */
  showSkeletons(container, count = 3, height = '100px') {
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
      container.appendChild(this.createSkeleton('100%', height));
      if (i < count - 1) {
        container.appendChild(document.createElement('br'));
      }
    }
  }

  /**
   * Wrap async function with loading state
   */
  async withLoading(asyncFn, options = {}) {
    const {
      overlay = false,
      button = null,
      container = null,
      skeletonCount = 3,
      loaderId = 'default'
    } = options;

    try {
      if (overlay) this.showOverlay(loaderId);
      if (button) this.loadButton(button);
      if (container) this.showSkeletons(container, skeletonCount);

      const result = await asyncFn();
      return result;
    } finally {
      if (overlay) this.hideOverlay(loaderId);
      if (button) this.unloadButton(button);
    }
  }
}

// Create global instance
window.LoadingStates = new LoadingStates();
