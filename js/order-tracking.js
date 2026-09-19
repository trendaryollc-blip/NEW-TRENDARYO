/**
 * ORDER TRACKING SYSTEM
 * Real-time order tracking with visual timeline and status updates
 */

class OrderTracking {
  constructor() {
    this.trackingData = new Map();
    this.statusSteps = [
      { key: 'pending', label: 'Order Placed', icon: '📝' },
      { key: 'processing', label: 'Processing', icon: '⚙️' },
      { key: 'shipped', label: 'Shipped', icon: '📦' },
      { key: 'out_for_delivery', label: 'Out for Delivery', icon: '🚚' },
      { key: 'delivered', label: 'Delivered', icon: '✅' }
    ];
    this.init();
  }

  init() {
    // Inject tracking styles
    const style = document.createElement('style');
    style.textContent = `
      .tracking-timeline {
        position: relative;
        padding: 2rem 0;
      }

      .tracking-steps {
        display: flex;
        justify-content: space-between;
        position: relative;
        margin-bottom: 3rem;
      }

      .tracking-line {
        position: absolute;
        top: 30px;
        left: 0;
        right: 0;
        height: 4px;
        background: rgba(255, 255, 255, 0.1);
        z-index: 0;
      }

      .tracking-line-progress {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        background: linear-gradient(90deg, #00f0ff, #00ff88);
        transition: width 0.5s ease;
        box-shadow: 0 0 20px rgba(0, 240, 255, 0.5);
      }

      .tracking-step {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        flex: 1;
      }

      .tracking-step-icon {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.05);
        border: 3px solid rgba(255, 255, 255, 0.2);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5rem;
        margin-bottom: 1rem;
        transition: all 0.3s ease;
      }

      .tracking-step.active .tracking-step-icon {
        background: linear-gradient(135deg, #00f0ff, #00ff88);
        border-color: #00f0ff;
        box-shadow: 0 0 30px rgba(0, 240, 255, 0.5);
        animation: pulse 2s infinite;
      }

      .tracking-step.completed .tracking-step-icon {
        background: rgba(0, 255, 136, 0.2);
        border-color: #00ff88;
      }

      .tracking-step-label {
        font-size: 0.85rem;
        font-weight: 700;
        text-align: center;
        color: rgba(255, 255, 255, 0.6);
        transition: color 0.3s ease;
      }

      .tracking-step.active .tracking-step-label,
      .tracking-step.completed .tracking-step-label {
        color: #fff;
      }

      .tracking-step-date {
        font-size: 0.75rem;
        color: rgba(255, 255, 255, 0.4);
        margin-top: 0.25rem;
      }

      .tracking-details {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        padding: 2rem;
        margin-top: 2rem;
      }

      .tracking-info-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1.5rem;
        margin-bottom: 2rem;
      }

      .tracking-info-item {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .tracking-info-label {
        font-size: 0.85rem;
        color: rgba(255, 255, 255, 0.6);
        text-transform: uppercase;
        letter-spacing: 1px;
      }

      .tracking-info-value {
        font-weight: 700;
        color: #fff;
        font-size: 1.1rem;
      }

      .tracking-updates {
        margin-top: 2rem;
      }

      .tracking-updates-title {
        font-family: 'Orbitron', sans-serif;
        font-size: 1.2rem;
        font-weight: 800;
        margin-bottom: 1rem;
        color: #00f0ff;
      }

      .tracking-update-item {
        display: flex;
        gap: 1rem;
        padding: 1rem;
        border-left: 3px solid rgba(0, 240, 255, 0.3);
        margin-bottom: 1rem;
        background: rgba(0, 240, 255, 0.05);
        border-radius: 8px;
      }

      .tracking-update-time {
        font-size: 0.85rem;
        color: rgba(255, 255, 255, 0.6);
        min-width: 120px;
      }

      .tracking-update-message {
        flex: 1;
        color: #fff;
      }

      .tracking-map {
        margin-top: 2rem;
        height: 300px;
        background: rgba(0, 0, 0, 0.3);
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(255, 255, 255, 0.5);
      }

      @keyframes pulse {
        0%, 100% {
          transform: scale(1);
        }
        50% {
          transform: scale(1.05);
        }
      }

      @media (max-width: 768px) {
        .tracking-steps {
          flex-direction: column;
          gap: 2rem;
        }

        .tracking-line {
          width: 4px;
          height: 100%;
          left: 30px;
          top: 0;
        }

        .tracking-step {
          flex-direction: row;
          justify-content: flex-start;
          text-align: left;
        }

        .tracking-step-icon {
          margin-bottom: 0;
          margin-right: 1rem;
        }
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Track order by ID
   */
  async trackOrder(orderId) {
    try {
      await window.LoadingStates.withLoading(
        async () => {
          // Try to get tracking from API
          if (window.API) {
            const response = await window.API.getOrderById(orderId);
            if (response.success && response.data) {
              this.trackingData.set(orderId, response.data);
              return response.data;
            }
          }

          // Fallback to local data
          const localTracking = this.getLocalTracking(orderId);
          this.trackingData.set(orderId, localTracking);
          return localTracking;
        },
        { overlay: true, loaderId: 'order-tracking' }
      );

      return this.trackingData.get(orderId);
    } catch (error) {
      console.error('Failed to track order:', error);
      throw error;
    }
  }

  /**
   * Get local tracking data (fallback)
   */
  getLocalTracking(orderId) {
    // Try to get from OrderManager
    if (window.OrderManager) {
      const order = window.OrderManager.getOrderById(orderId);
      if (order) {
        return {
          orderId: order.id,
          status: order.status,
          trackingNumber: order.trackingNumber || 'TRK' + orderId.substring(0, 8).toUpperCase(),
          estimatedDelivery: order.estimatedDelivery || this.calculateEstimatedDelivery(order.createdAt),
          carrier: order.carrier || 'Standard Shipping',
          updates: this.generateTrackingUpdates(order)
        };
      }
    }

    // Generate mock tracking data
    return {
      orderId,
      status: 'processing',
      trackingNumber: 'TRK' + orderId.substring(0, 8).toUpperCase(),
      estimatedDelivery: this.calculateEstimatedDelivery(new Date()),
      carrier: 'Standard Shipping',
      updates: []
    };
  }

  /**
   * Calculate estimated delivery date
   */
  calculateEstimatedDelivery(orderDate) {
    const date = new Date(orderDate);
    date.setDate(date.getDate() + 5); // 5 days from order
    return date.toISOString();
  }

  /**
   * Generate tracking updates based on order status
   */
  generateTrackingUpdates(order) {
    const updates = [];
    const orderDate = new Date(order.createdAt);

    updates.push({
      timestamp: orderDate.toISOString(),
      message: 'Order placed successfully'
    });

    if (['processing', 'shipped', 'out_for_delivery', 'delivered'].includes(order.status)) {
      const processingDate = new Date(orderDate);
      processingDate.setHours(processingDate.getHours() + 2);
      updates.push({
        timestamp: processingDate.toISOString(),
        message: 'Order is being processed'
      });
    }

    if (['shipped', 'out_for_delivery', 'delivered'].includes(order.status)) {
      const shippedDate = new Date(orderDate);
      shippedDate.setDate(shippedDate.getDate() + 1);
      updates.push({
        timestamp: shippedDate.toISOString(),
        message: 'Package shipped from warehouse'
      });
    }

    if (['out_for_delivery', 'delivered'].includes(order.status)) {
      const outForDeliveryDate = new Date(orderDate);
      outForDeliveryDate.setDate(outForDeliveryDate.getDate() + 4);
      updates.push({
        timestamp: outForDeliveryDate.toISOString(),
        message: 'Out for delivery'
      });
    }

    if (order.status === 'delivered') {
      const deliveredDate = new Date(orderDate);
      deliveredDate.setDate(deliveredDate.getDate() + 5);
      updates.push({
        timestamp: deliveredDate.toISOString(),
        message: 'Package delivered successfully'
      });
    }

    return updates.reverse(); // Most recent first
  }

  /**
   * Render tracking timeline
   */
  renderTimeline(containerId, orderId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const tracking = this.trackingData.get(orderId);
    if (!tracking) {
      container.innerHTML = '<p>No tracking data available</p>';
      return;
    }

    const currentStepIndex = this.statusSteps.findIndex(step => step.key === tracking.status);
    const progress = ((currentStepIndex + 1) / this.statusSteps.length) * 100;

    container.innerHTML = `
      <div class="tracking-timeline">
        <div class="tracking-steps">
          <div class="tracking-line">
            <div class="tracking-line-progress" style="width: ${progress}%"></div>
          </div>
          ${this.statusSteps.map((step, index) => {
            const isCompleted = index < currentStepIndex;
            const isActive = index === currentStepIndex;
            const statusClass = isCompleted ? 'completed' : (isActive ? 'active' : '');
            
            return `
              <div class="tracking-step ${statusClass}">
                <div class="tracking-step-icon">${step.icon}</div>
                <div class="tracking-step-label">${step.label}</div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="tracking-details">
          <div class="tracking-info-grid">
            <div class="tracking-info-item">
              <div class="tracking-info-label">Tracking Number</div>
              <div class="tracking-info-value">${tracking.trackingNumber}</div>
            </div>
            <div class="tracking-info-item">
              <div class="tracking-info-label">Carrier</div>
              <div class="tracking-info-value">${tracking.carrier}</div>
            </div>
            <div class="tracking-info-item">
              <div class="tracking-info-label">Status</div>
              <div class="tracking-info-value">${tracking.status.toUpperCase()}</div>
            </div>
            <div class="tracking-info-item">
              <div class="tracking-info-label">Est. Delivery</div>
              <div class="tracking-info-value">${this.formatDate(tracking.estimatedDelivery)}</div>
            </div>
          </div>

          ${tracking.updates && tracking.updates.length > 0 ? `
            <div class="tracking-updates">
              <div class="tracking-updates-title">📍 Tracking Updates</div>
              ${tracking.updates.map(update => `
                <div class="tracking-update-item">
                  <div class="tracking-update-time">${this.formatDateTime(update.timestamp)}</div>
                  <div class="tracking-update-message">${update.message}</div>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  /**
   * Format date
   */
  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  /**
   * Format date and time
   */
  formatDateTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  /**
   * Get status icon
   */
  getStatusIcon(status) {
    const step = this.statusSteps.find(s => s.key === status);
    return step ? step.icon : '📦';
  }
}

// Create global instance
window.OrderTracking = new OrderTracking();
