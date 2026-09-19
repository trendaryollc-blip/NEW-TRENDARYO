/**
 * Advanced Analytics Engine - Real-time Data Processing & Aggregation
 * Handles complex analytics calculations, predictions, and reporting
 */

class AnalyticsEngine {
  constructor() {
    this.apiBase = '/api';
    this.adminToken = localStorage.getItem('adminToken');
    this.cache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
  }

  // ==================== CORE ANALYTICS ====================

  /**
   * Get comprehensive dashboard metrics
   */
  async getDashboardMetrics(period = 'month') {
    const cacheKey = `dashboard_${period}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const [sales, customers, orders, revenue] = await Promise.all([
        this.getSalesMetrics(period),
        this.getCustomerMetrics(period),
        this.getOrderMetrics(period),
        this.getRevenueMetrics(period)
      ]);

      const metrics = {
        sales,
        customers,
        orders,
        revenue,
        timestamp: new Date()
      };

      this.cache.set(cacheKey, metrics);
      setTimeout(() => this.cache.delete(cacheKey), this.cacheExpiry);

      return metrics;
    } catch (error) {
      console.error('Error getting dashboard metrics:', error);
      throw error;
    }
  }

  /**
   * Get sales metrics
   */
  async getSalesMetrics(period) {
    const data = await this.apiRequest('/analytics/sales', { period });
    return {
      totalSales: data.totalSales || 0,
      avgDailySales: data.avgDailySales || 0,
      peakSalesDay: data.peakSalesDay || null,
      salesTrend: data.trend || [],
      growth: this.calculateGrowth(data.current, data.previous)
    };
  }

  /**
   * Get customer metrics
   */
  async getCustomerMetrics(period) {
    const data = await this.apiRequest('/analytics/customers', { period });
    return {
      totalCustomers: data.totalCustomers || 0,
      newCustomers: data.newCustomers || 0,
      returningCustomers: data.returningCustomers || 0,
      churnRate: data.churnRate || 0,
      retentionRate: data.retentionRate || 0,
      avgCustomerLifetimeValue: data.avgCLV || 0,
      growth: this.calculateGrowth(data.current, data.previous)
    };
  }

  /**
   * Get order metrics
   */
  async getOrderMetrics(period) {
    const data = await this.apiRequest('/analytics/orders', { period });
    return {
      totalOrders: data.totalOrders || 0,
      avgOrderValue: data.avgOrderValue || 0,
      medianOrderValue: data.medianOrderValue || 0,
      orderFrequency: data.orderFrequency || 0,
      repeatOrderRate: data.repeatOrderRate || 0,
      growth: this.calculateGrowth(data.current, data.previous)
    };
  }

  /**
   * Get revenue metrics
   */
  async getRevenueMetrics(period) {
    const data = await this.apiRequest('/analytics/revenue', { period });
    return {
      totalRevenue: data.totalRevenue || 0,
      avgDailyRevenue: data.avgDailyRevenue || 0,
      revenueBySource: data.bySource || {},
      revenueByCategory: data.byCategory || {},
      growth: this.calculateGrowth(data.current, data.previous)
    };
  }

  // ==================== ADVANCED ANALYTICS ====================

  /**
   * Get customer segmentation analysis
   */
  async getCustomerSegmentation() {
    try {
      const data = await this.apiRequest('/analytics/segmentation');
      return {
        segments: {
          vip: data.vip || { count: 0, revenue: 0, avgValue: 0 },
          loyal: data.loyal || { count: 0, revenue: 0, avgValue: 0 },
          atrisk: data.atrisk || { count: 0, revenue: 0, avgValue: 0 },
          inactive: data.inactive || { count: 0, revenue: 0, avgValue: 0 },
          new: data.new || { count: 0, revenue: 0, avgValue: 0 }
        },
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error getting customer segmentation:', error);
      throw error;
    }
  }

  /**
   * Get product performance analysis
   */
  async getProductPerformance(limit = 20) {
    try {
      const data = await this.apiRequest('/analytics/products', { limit });
      return {
        topPerformers: (data.topPerformers || []).map(p => ({
          id: p.id,
          name: p.name,
          unitsSold: p.unitsSold,
          revenue: p.revenue,
          margin: p.margin,
          rating: p.rating,
          trend: p.trend
        })),
        underperformers: (data.underperformers || []).map(p => ({
          id: p.id,
          name: p.name,
          unitsSold: p.unitsSold,
          revenue: p.revenue,
          margin: p.margin,
          trend: p.trend
        })),
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error getting product performance:', error);
      throw error;
    }
  }

  /**
   * Get conversion funnel analysis
   */
  async getConversionFunnel() {
    try {
      const data = await this.apiRequest('/analytics/funnel');
      return {
        stages: {
          visitors: data.visitors || 0,
          addedToCart: data.addedToCart || 0,
          initiatedCheckout: data.initiatedCheckout || 0,
          completed: data.completed || 0
        },
        conversionRates: {
          visitorToCart: this.calculateRate(data.addedToCart, data.visitors),
          cartToCheckout: this.calculateRate(data.initiatedCheckout, data.addedToCart),
          checkoutToComplete: this.calculateRate(data.completed, data.initiatedCheckout),
          overall: this.calculateRate(data.completed, data.visitors)
        },
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error getting conversion funnel:', error);
      throw error;
    }
  }

  /**
   * Get cohort analysis
   */
  async getCohortAnalysis(cohortType = 'monthly') {
    try {
      const data = await this.apiRequest('/analytics/cohorts', { type: cohortType });
      return {
        cohorts: data.cohorts || [],
        retentionMatrix: data.retentionMatrix || [],
        avgRetention: data.avgRetention || 0,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error getting cohort analysis:', error);
      throw error;
    }
  }

  /**
   * Get RFM (Recency, Frequency, Monetary) analysis
   */
  async getRFMAnalysis() {
    try {
      const data = await this.apiRequest('/analytics/rfm');
      return {
        segments: {
          champions: data.champions || [],
          loyal: data.loyal || [],
          potential: data.potential || [],
          atrisk: data.atrisk || [],
          lost: data.lost || []
        },
        distribution: data.distribution || {},
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error getting RFM analysis:', error);
      throw error;
    }
  }

  // ==================== PREDICTIVE ANALYTICS ====================

  /**
   * Forecast sales for next period
   */
  async forecastSales(periods = 12) {
    try {
      const data = await this.apiRequest('/analytics/forecast/sales', { periods });
      return {
        forecast: data.forecast || [],
        confidence: data.confidence || 0.85,
        trend: data.trend || 'stable',
        seasonality: data.seasonality || [],
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error forecasting sales:', error);
      throw error;
    }
  }

  /**
   * Predict customer churn
   */
  async predictChurn() {
    try {
      const data = await this.apiRequest('/analytics/predict/churn');
      return {
        atRiskCustomers: data.atRiskCustomers || [],
        churnProbability: data.churnProbability || {},
        recommendations: data.recommendations || [],
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error predicting churn:', error);
      throw error;
    }
  }

  /**
   * Predict demand for products
   */
  async predictDemand(productId = null) {
    try {
      const params = productId ? { productId } : {};
      const data = await this.apiRequest('/analytics/predict/demand', params);
      return {
        predictions: data.predictions || [],
        confidence: data.confidence || 0.80,
        recommendations: data.recommendations || [],
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error predicting demand:', error);
      throw error;
    }
  }

  /**
   * Predict customer lifetime value
   */
  async predictCLV(customerId = null) {
    try {
      const params = customerId ? { customerId } : {};
      const data = await this.apiRequest('/analytics/predict/clv', params);
      return {
        predictions: data.predictions || [],
        segments: data.segments || {},
        recommendations: data.recommendations || [],
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error predicting CLV:', error);
      throw error;
    }
  }

  // ==================== CUSTOM REPORTS ====================

  /**
   * Generate custom report
   */
  async generateCustomReport(config) {
    try {
      const data = await this.apiRequest('/analytics/reports/custom', {
        method: 'POST',
        body: JSON.stringify(config)
      });
      return {
        reportId: data.reportId,
        title: config.title,
        data: data.data || [],
        summary: data.summary || {},
        generatedAt: new Date()
      };
    } catch (error) {
      console.error('Error generating custom report:', error);
      throw error;
    }
  }

  /**
   * Get saved reports
   */
  async getSavedReports() {
    try {
      const data = await this.apiRequest('/analytics/reports');
      return data.reports || [];
    } catch (error) {
      console.error('Error getting saved reports:', error);
      throw error;
    }
  }

  /**
   * Delete report
   */
  async deleteReport(reportId) {
    try {
      await this.apiRequest(`/analytics/reports/${reportId}`, {
        method: 'DELETE'
      });
      return true;
    } catch (error) {
      console.error('Error deleting report:', error);
      throw error;
    }
  }

  /**
   * Schedule report
   */
  async scheduleReport(config) {
    try {
      const data = await this.apiRequest('/analytics/reports/schedule', {
        method: 'POST',
        body: JSON.stringify(config)
      });
      return {
        scheduleId: data.scheduleId,
        nextRun: data.nextRun,
        frequency: config.frequency
      };
    } catch (error) {
      console.error('Error scheduling report:', error);
      throw error;
    }
  }

  // ==================== EXPORT & DISTRIBUTION ====================

  /**
   * Export report to PDF
   */
  async exportToPDF(reportId, filename) {
    try {
      const response = await fetch(`${this.apiBase}/analytics/reports/${reportId}/pdf`, {
        headers: { 'Authorization': `Bearer ${this.adminToken}` }
      });
      const blob = await response.blob();
      this.downloadFile(blob, `${filename}.pdf`);
      return true;
    } catch (error) {
      console.error('Error exporting to PDF:', error);
      throw error;
    }
  }

  /**
   * Export report to Excel
   */
  async exportToExcel(reportId, filename) {
    try {
      const response = await fetch(`${this.apiBase}/analytics/reports/${reportId}/excel`, {
        headers: { 'Authorization': `Bearer ${this.adminToken}` }
      });
      const blob = await response.blob();
      this.downloadFile(blob, `${filename}.xlsx`);
      return true;
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      throw error;
    }
  }

  /**
   * Email report
   */
  async emailReport(reportId, recipients, subject) {
    try {
      await this.apiRequest(`/analytics/reports/${reportId}/email`, {
        method: 'POST',
        body: JSON.stringify({ recipients, subject })
      });
      return true;
    } catch (error) {
      console.error('Error emailing report:', error);
      throw error;
    }
  }

  // ==================== KPI & ALERTS ====================

  /**
   * Get KPI dashboard
   */
  async getKPIDashboard() {
    try {
      const data = await this.apiRequest('/analytics/kpis');
      return {
        kpis: data.kpis || [],
        alerts: data.alerts || [],
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error getting KPI dashboard:', error);
      throw error;
    }
  }

  /**
   * Set KPI alert
   */
  async setKPIAlert(kpiId, threshold, condition) {
    try {
      const data = await this.apiRequest('/analytics/kpis/alerts', {
        method: 'POST',
        body: JSON.stringify({ kpiId, threshold, condition })
      });
      return data;
    } catch (error) {
      console.error('Error setting KPI alert:', error);
      throw error;
    }
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts() {
    try {
      const data = await this.apiRequest('/analytics/alerts');
      return data.alerts || [];
    } catch (error) {
      console.error('Error getting active alerts:', error);
      throw error;
    }
  }

  // ==================== UTILITY FUNCTIONS ====================

  /**
   * Calculate growth percentage
   */
  calculateGrowth(current, previous) {
    if (!previous || previous === 0) return 0;
    return ((current - previous) / previous * 100).toFixed(2);
  }

  /**
   * Calculate conversion rate
   */
  calculateRate(numerator, denominator) {
    if (!denominator || denominator === 0) return 0;
    return ((numerator / denominator) * 100).toFixed(2);
  }

  /**
   * Format currency
   */
  formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  }

  /**
   * Format percentage
   */
  formatPercentage(value) {
    return `${parseFloat(value).toFixed(2)}%`;
  }

  /**
   * Download file
   */
  downloadFile(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  /**
   * Make API request
   */
  async apiRequest(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.adminToken}`,
      ...options.headers
    };

    try {
      const response = await fetch(`${this.apiBase}${endpoint}`, {
        ...options,
        headers
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API request error:', error);
      throw error;
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

// Initialize and expose globally
window.AnalyticsEngine = new AnalyticsEngine();
