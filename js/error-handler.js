/**
 * ERROR HANDLING SYSTEM
 * Comprehensive error handling with user-friendly messages and retry logic
 */

class ErrorHandler {
  constructor() {
    this.errorLog = [];
    this.maxLogSize = 100;
    this.retryAttempts = 3;
    this.retryDelay = 1000;
    this.init();
  }

  init() {
    // Inject error notification styles
    const style = document.createElement('style');
    style.textContent = `
      .error-notification {
        position: fixed;
        top: 100px;
        right: 20px;
        max-width: 400px;
        background: rgba(255, 107, 107, 0.15);
        border: 1px solid rgba(255, 107, 107, 0.3);
        border-radius: 12px;
        padding: 1rem 1.5rem;
        color: #ff6b6b;
        font-family: 'Rajdhani', sans-serif;
        font-weight: 600;
        z-index: 10002;
        backdrop-filter: blur(20px);
        box-shadow: 0 10px 40px rgba(255, 107, 107, 0.2);
        animation: slideInRight 0.3s ease;
        display: flex;
        align-items: flex-start;
        gap: 1rem;
      }

      .error-notification.success {
        background: rgba(0, 255, 136, 0.15);
        border-color: rgba(0, 255, 136, 0.3);
        color: #00ff88;
        box-shadow: 0 10px 40px rgba(0, 255, 136, 0.2);
      }

      .error-notification.warning {
        background: rgba(255, 215, 0, 0.15);
        border-color: rgba(255, 215, 0, 0.3);
        color: #ffd700;
        box-shadow: 0 10px 40px rgba(255, 215, 0, 0.2);
      }

      .error-notification.info {
        background: rgba(0, 240, 255, 0.15);
        border-color: rgba(0, 240, 255, 0.3);
        color: #00f0ff;
        box-shadow: 0 10px 40px rgba(0, 240, 255, 0.2);
      }

      .error-icon {
        font-size: 1.5rem;
        flex-shrink: 0;
      }

      .error-content {
        flex: 1;
      }

      .error-title {
        font-weight: 800;
        margin-bottom: 0.25rem;
        font-size: 1rem;
      }

      .error-message {
        font-size: 0.9rem;
        opacity: 0.9;
        line-height: 1.4;
      }

      .error-actions {
        display: flex;
        gap: 0.5rem;
        margin-top: 0.75rem;
      }

      .error-btn {
        padding: 0.4rem 0.8rem;
        border-radius: 6px;
        border: 1px solid currentColor;
        background: transparent;
        color: inherit;
        font-family: inherit;
        font-size: 0.85rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .error-btn:hover {
        background: rgba(255, 255, 255, 0.1);
      }

      .error-close {
        background: none;
        border: none;
        color: inherit;
        font-size: 1.5rem;
        cursor: pointer;
        opacity: 0.7;
        transition: opacity 0.2s ease;
        padding: 0;
        line-height: 1;
      }

      .error-close:hover {
        opacity: 1;
      }

      @keyframes slideInRight {
        from {
          transform: translateX(100%);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }

      @keyframes slideOutRight {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(100%);
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);

    // Global error handler
    window.addEventListener('error', (event) => {
      this.handleGlobalError(event.error, event.message);
    });

    // Unhandled promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
      this.handleGlobalError(event.reason, 'Unhandled Promise Rejection');
    });
  }

  /**
   * Handle global errors
   */
  handleGlobalError(error, message) {
    console.error('Global error:', error);
    this.logError({
      type: 'global',
      message: message || error?.message || 'Unknown error',
      stack: error?.stack,
      timestamp: new Date().toISOString()
    });

    // Don't show notification for every error (can be overwhelming)
    // Only show for critical errors
    if (this.isCriticalError(error)) {
      this.showNotification({
        type: 'error',
        title: 'Something went wrong',
        message: 'We encountered an unexpected error. Please refresh the page.',
        actions: [
          { label: 'Refresh', onClick: () => window.location.reload() }
        ]
      });
    }
  }

  /**
   * Check if error is critical
   */
  isCriticalError(error) {
    const criticalPatterns = [
      /network/i,
      /failed to fetch/i,
      /timeout/i,
      /not defined/i
    ];

    const errorMessage = error?.message || String(error);
    return criticalPatterns.some(pattern => pattern.test(errorMessage));
  }

  /**
   * Handle API errors
   */
  handleAPIError(error, context = {}) {
    const errorInfo = {
      type: 'api',
      message: error?.message || 'API request failed',
      status: error?.status,
      endpoint: context.endpoint,
      timestamp: new Date().toISOString()
    };

    this.logError(errorInfo);

    // Map status codes to user-friendly messages
    const statusMessages = {
      400: 'Invalid request. Please check your input.',
      401: 'You need to log in to continue.',
      403: 'You don\'t have permission to do that.',
      404: 'The requested resource was not found.',
      429: 'Too many requests. Please try again later.',
      500: 'Server error. Please try again later.',
      503: 'Service temporarily unavailable.'
    };

    const userMessage = statusMessages[error?.status] || 'Something went wrong. Please try again.';

    this.showNotification({
      type: 'error',
      title: 'Request Failed',
      message: userMessage,
      actions: error?.status === 401 ? [
        { label: 'Login', onClick: () => window.location.href = '/login.html' }
      ] : []
    });

    return { success: false, error: userMessage };
  }

  /**
   * Handle network errors
   */
  handleNetworkError(error) {
    this.logError({
      type: 'network',
      message: error?.message || 'Network error',
      timestamp: new Date().toISOString()
    });

    this.showNotification({
      type: 'error',
      title: 'Connection Error',
      message: 'Unable to connect to the server. Please check your internet connection.',
      actions: [
        { label: 'Retry', onClick: () => window.location.reload() }
      ]
    });

    return { success: false, error: 'Network error' };
  }

  /**
   * Handle validation errors
   */
  handleValidationError(errors) {
    const errorMessages = Array.isArray(errors) 
      ? errors.map(e => e.message).join(', ')
      : errors.message || 'Validation failed';

    this.showNotification({
      type: 'warning',
      title: 'Validation Error',
      message: errorMessages
    });

    return { success: false, error: errorMessages };
  }

  /**
   * Retry async operation
   */
  async retry(asyncFn, options = {}) {
    const {
      attempts = this.retryAttempts,
      delay = this.retryDelay,
      onRetry = null
    } = options;

    let lastError;

    for (let i = 0; i < attempts; i++) {
      try {
        return await asyncFn();
      } catch (error) {
        lastError = error;
        
        if (i < attempts - 1) {
          if (onRetry) onRetry(i + 1, attempts);
          await this.sleep(delay * (i + 1)); // Exponential backoff
        }
      }
    }

    throw lastError;
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Show notification
   */
  showNotification(options) {
    const {
      type = 'error',
      title,
      message,
      actions = [],
      duration = 5000
    } = options;

    const icons = {
      error: '❌',
      success: '✅',
      warning: '⚠️',
      info: 'ℹ️'
    };

    const notification = document.createElement('div');
    notification.className = `error-notification ${type}`;
    notification.innerHTML = `
      <div class="error-icon">${icons[type]}</div>
      <div class="error-content">
        ${title ? `<div class="error-title">${title}</div>` : ''}
        <div class="error-message">${message}</div>
        ${actions.length > 0 ? `
          <div class="error-actions">
            ${actions.map(action => `
              <button class="error-btn" data-action="${action.label}">
                ${action.label}
              </button>
            `).join('')}
          </div>
        ` : ''}
      </div>
      <button class="error-close">×</button>
    `;

    // Add event listeners
    const closeBtn = notification.querySelector('.error-close');
    closeBtn.addEventListener('click', () => this.removeNotification(notification));

    actions.forEach(action => {
      const btn = notification.querySelector(`[data-action="${action.label}"]`);
      if (btn) {
        btn.addEventListener('click', () => {
          action.onClick();
          this.removeNotification(notification);
        });
      }
    });

    document.body.appendChild(notification);

    // Auto-remove after duration
    if (duration > 0) {
      setTimeout(() => this.removeNotification(notification), duration);
    }

    return notification;
  }

  /**
   * Remove notification
   */
  removeNotification(notification) {
    notification.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }

  /**
   * Log error
   */
  logError(errorInfo) {
    this.errorLog.push(errorInfo);

    // Keep log size manageable
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }

    // Send to analytics/monitoring service
    this.reportError(errorInfo);
  }

  /**
   * Report error to monitoring service
   */
  reportError(errorInfo) {
    // In production, send to error monitoring service (Sentry, LogRocket, etc.)
    if (window.Analytics) {
      window.Analytics.trackEvent('error', errorInfo);
    }

    // Also log to console in development
    if (process?.env?.NODE_ENV === 'development') {
      console.error('Error logged:', errorInfo);
    }
  }

  /**
   * Get error log
   */
  getErrorLog() {
    return [...this.errorLog];
  }

  /**
   * Clear error log
   */
  clearErrorLog() {
    this.errorLog = [];
  }

  /**
   * Export error log
   */
  exportErrorLog() {
    const data = JSON.stringify(this.errorLog, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `error-log-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// Create global instance
window.ErrorHandler = new ErrorHandler();

// Enhance API client with error handling
if (window.API) {
  const originalRequest = window.API.request;
  window.API.request = async function(...args) {
    try {
      return await window.ErrorHandler.retry(
        () => originalRequest.apply(this, args),
        {
          attempts: 2,
          onRetry: (attempt, total) => {
            console.log(`Retrying request (${attempt}/${total})...`);
          }
        }
      );
    } catch (error) {
      if (error.message?.includes('fetch')) {
        return window.ErrorHandler.handleNetworkError(error);
      } else {
        return window.ErrorHandler.handleAPIError(error, {
          endpoint: args[0]
        });
      }
    }
  };
}
