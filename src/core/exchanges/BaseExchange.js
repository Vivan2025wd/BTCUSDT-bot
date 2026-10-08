const crypto = require('crypto');
const https = require('https');

class BaseExchange {
  constructor(name, config = {}) {
    this.name = name;
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.testnet = config.testnet || false;
    this.baseUrl = config.baseUrl;
    this.rateLimit = config.rateLimit || 1200; // requests per minute
    this.lastRequestTime = 0;
  }

  // Abstract methods to be implemented by subclasses
  async getBalance() {
    throw new Error('getBalance() method must be implemented by subclass');
  }

  async getCurrentPrice(symbol) {
    throw new Error('getCurrentPrice() method must be implemented by subclass');
  }

  async placeBuyOrder(symbol, quantity, price = null) {
    throw new Error('placeBuyOrder() method must be implemented by subclass');
  }

  async placeSellOrder(symbol, quantity, price = null) {
    throw new Error('placeSellOrder() method must be implemented by subclass');
  }

  async getOpenOrders(symbol = null) {
    throw new Error('getOpenOrders() method must be implemented by subclass');
  }

  async cancelOrder(orderId, symbol) {
    throw new Error('cancelOrder() method must be implemented by subclass');
  }

  async getOrderHistory(symbol = null, limit = 100) {
    throw new Error('getOrderHistory() method must be implemented by subclass');
  }

  // Common utility methods
  async enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minInterval = (60 * 1000) / this.rateLimit; // ms between requests
    
    if (timeSinceLastRequest < minInterval) {
      const delay = minInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastRequestTime = Date.now();
  }

  createSignature(query, secret, algorithm = 'sha256') {
    return crypto.createHmac(algorithm, secret).update(query).digest('hex');
  }

  async makeRequest(method, endpoint, params = {}, signed = false) {
    await this.enforceRateLimit();

    const url = new URL(endpoint, this.baseUrl);
    const headers = {
      'Content-Type': 'application/json',
      'X-MBX-APIKEY': this.apiKey
    };

    if (signed) {
      params.timestamp = Date.now();
      const queryString = new URLSearchParams(params).toString();
      params.signature = this.createSignature(queryString, this.apiSecret);
    }

    if (method === 'GET' && Object.keys(params).length > 0) {
      Object.keys(params).forEach(key => {
        url.searchParams.append(key, params[key]);
      });
    }

    const options = {
      method,
      headers
    };

    if (method !== 'GET' && Object.keys(params).length > 0) {
      options.body = JSON.stringify(params);
    }

    try {
      const response = await this.httpRequest(url.toString(), options);
      return JSON.parse(response);
    } catch (error) {
      console.error(`${this.name} API Error:`, error);
      throw error;
    }
  }

  httpRequest(url, options) {
    return new Promise((resolve, reject) => {
      const req = https.request(url, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      
      if (options.body) {
        req.write(options.body);
      }
      
      req.end();
    });
  }

  // Validation methods
  validateSymbol(symbol) {
    if (!symbol || typeof symbol !== 'string') {
      throw new Error('Invalid symbol provided');
    }
    return symbol.toUpperCase();
  }

  validateQuantity(quantity) {
    const num = parseFloat(quantity);
    if (isNaN(num) || num <= 0) {
      throw new Error('Invalid quantity provided');
    }
    return num;
  }

  validatePrice(price) {
    if (price === null || price === undefined) return null;
    const num = parseFloat(price);
    if (isNaN(num) || num <= 0) {
      throw new Error('Invalid price provided');
    }
    return num;
  }

  // Test connection
  async testConnection() {
    try {
      await this.getBalance();
      return { success: true, message: 'Connection successful' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Format order response
  formatOrderResponse(orderData) {
    return {
      orderId: orderData.orderId,
      symbol: orderData.symbol,
      side: orderData.side.toLowerCase(),
      quantity: parseFloat(orderData.origQty),
      price: parseFloat(orderData.price),
      status: orderData.status.toLowerCase(),
      timestamp: new Date(orderData.time || orderData.transactTime),
      executedQty: parseFloat(orderData.executedQty || 0),
      success: true
    };
  }
}

module.exports = BaseExchange;export default Backtesting;
