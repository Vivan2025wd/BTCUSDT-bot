const crypto = require('crypto');
const WebSocket = require('ws');
const axios = require('axios');
const EventEmitter = require('events');

class BinanceClient extends EventEmitter {
  constructor(apiKeys, settings = {}) {
    super();
    
    this.apiKey = apiKeys?.apiKey;
    this.apiSecret = apiKeys?.apiSecret;
    this.isTestnet = settings.testnet || true; // Default to testnet for safety
    
    // API endpoints
    this.baseURL = this.isTestnet 
      ? 'https://testnet.binance.vision/api/v3'
      : 'https://api.binance.com/api/v3';
      
    this.wsBaseURL = this.isTestnet
      ? 'wss://testnet.binance.vision/ws'
      : 'wss://stream.binance.com:9443/ws';
    
    this.wsStreams = new Map();
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.rateLimiter = new Map();
    
    // Request limits
    this.requestWeight = 0;
    this.requestLimit = 1200; // requests per minute
    this.orderLimit = 10; // orders per second
    this.lastOrderTime = 0;
    
    this.settings = {
      enableStopLoss: settings.enableStopLoss !== false,
      enableTakeProfit: settings.enableTakeProfit !== false,
      maxRetries: 3,
      retryDelay: 1000,
      ...settings
    };
  }

  async connect() {
    try {
      console.log(`Connecting to Binance ${this.isTestnet ? 'Testnet' : 'Mainnet'}...`);
      
      // Test API credentials
      if (this.apiKey && this.apiSecret) {
        await this.testConnectivity();
        console.log('API credentials validated');
      } else {
        console.warn('No API credentials provided - read-only mode');
      }
      
      this.isConnected = true;
      this.emit('connected');
      
    } catch (error) {
      console.error('Failed to connect to Binance:', error);
      throw new Error(`Binance connection failed: ${error.message}`);
    }
  }

  async disconnect() {
    console.log('Disconnecting from Binance...');
    
    this.isConnected = false;
    
    // Close all WebSocket connections
    this.wsStreams.forEach((ws, symbol) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });
    this.wsStreams.clear();
    
    this.emit('disconnected');
  }

  async testConnectivity() {
    try {
      // Test server time first
      const serverTime = await this.getServerTime();
      console.log('Server time sync successful');
      
      // Test account info if credentials are provided
      if (this.apiKey && this.apiSecret) {
        const account = await this.getAccountInfo();
        console.log(`Account connected: ${account.accountType}`);
        return account;
      }
      
      return { status: 'connected', mode: 'read-only' };
    } catch (error) {
      throw new Error(`Connectivity test failed: ${error.message}`);
    }
  }

  async getServerTime() {
    const response = await this.makeRequest('/time');
    return response.serverTime;
  }

  async getAccountInfo() {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error('API credentials required for account info');
    }
    
    return await this.makeSignedRequest('/account');
  }

  async getBalance(asset = 'USDT') {
    try {
      const account = await this.getAccountInfo();
      const balance = account.balances.find(b => b.asset === asset);
      return balance ? parseFloat(balance.free) : 0;
    } catch (error) {
      console.error(`Failed to get ${asset} balance:`, error);
      return 0;
    }
  }

  async getCurrentPrice(symbol) {
    try {
      const response = await this.makeRequest(`/ticker/price?symbol=${symbol}`);
      return parseFloat(response.price);
    } catch (error) {
      console.error(`Failed to get price for ${symbol}:`, error);
      throw error;
    }
  }

  async getKlines(symbol, interval = '5m', limit = 100) {
    try {
      const params = `symbol=${symbol}&interval=${interval}&limit=${limit}`;
      const response = await this.makeRequest(`/klines?${params}`);
      
      return response.map(kline => ({
        openTime: kline[0],
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5]),
        closeTime: kline[6],
        quoteVolume: parseFloat(kline[7]),
        trades: kline[8],
        baseAssetVolume: parseFloat(kline[9]),
        quoteAssetVolume: parseFloat(kline[10])
      }));
    } catch (error) {
      console.error(`Failed to get klines for ${symbol}:`, error);
      throw error;
    }
  }

  async createMarketOrder(orderParams) {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error('API credentials required for trading');
    }

    try {
      const { symbol, side, quantity, type = 'MARKET' } = orderParams;
      
      // Validate order parameters
      this.validateOrderParams(orderParams);
      
      // Rate limiting check
      await this.checkRateLimit();
      
      const params = {
        symbol,
        side,
        type,
        quantity: this.formatQuantity(quantity),
        timestamp: Date.now()
      };

      console.log(`Creating ${side} order for ${symbol}: ${quantity} @ MARKET`);
      
      const order = await this.makeSignedRequest('/order', 'POST', params);
      
      console.log(`Order executed: ${order.orderId} - Status: ${order.status}`);
      
      return {
        orderId: order.orderId,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: order.origQty,
        executedQty: order.executedQty,
        price: order.fills?.[0]?.price || order.price,
        status: order.status,
        timestamp: new Date()
      };
      
    } catch (error) {
      console.error('Failed to create market order:', error);
      throw new Error(`Order creation failed: ${error.message}`);
    }
  }

  async createStopOrder(orderParams) {
    if (!this.settings.enableStopLoss) {
      console.log('Stop orders disabled in settings');
      return null;
    }

    try {
      const { symbol, side, quantity, stopPrice, type = 'STOP_MARKET' } = orderParams;
      
      await this.checkRateLimit();
      
      const params = {
        symbol,
        side,
        type,
        quantity: this.formatQuantity(quantity),
        stopPrice: this.formatPrice(stopPrice),
        timestamp: Date.now()
      };

      console.log(`Creating stop order for ${symbol}: ${quantity} @ ${stopPrice}`);
      
      const order = await this.makeSignedRequest('/order', 'POST', params);
      
      return {
        orderId: order.orderId,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: order.origQty,
        stopPrice: order.stopPrice,
        status: order.status,
        timestamp: new Date()
      };
      
    } catch (error) {
      console.error('Failed to create stop order:', error);
      throw error;
    }
  }

  async createLimitOrder(orderParams) {
    try {
      const { symbol, side, quantity, price, type = 'LIMIT', timeInForce = 'GTC' } = orderParams;
      
      await this.checkRateLimit();
      
      const params = {
        symbol,
        side,
        type,
        quantity: this.formatQuantity(quantity),
        price: this.formatPrice(price),
        timeInForce,
        timestamp: Date.now()
      };

      const order = await this.makeSignedRequest('/order', 'POST', params);
      
      return {
        orderId: order.orderId,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        quantity: order.origQty,
        price: order.price,
        status: order.status,
        timestamp: new Date()
      };
      
    } catch (error) {
      console.error('Failed to create limit order:', error);
      throw error;
    }
  }

  async cancelOrder(symbol, orderId) {
    try {
      const params = {
        symbol,
        orderId,
        timestamp: Date.now()
      };

      const result = await this.makeSignedRequest('/order', 'DELETE', params);
      console.log(`Order cancelled: ${orderId}`);
      
      return result;
    } catch (error) {
      console.error('Failed to cancel order:', error);
      throw error;
    }
  }

  async getOpenOrders(symbol = null) {
    try {
      const params = {
        timestamp: Date.now()
      };
      
      if (symbol) {
        params.symbol = symbol;
      }

      return await this.makeSignedRequest('/openOrders', 'GET', params);
    } catch (error) {
      console.error('Failed to get open orders:', error);
      throw error;
    }
  }

  async get24hrStats(symbol) {
    try {
      const response = await this.makeRequest(`/ticker/24hr?symbol=${symbol}`);
      return {
        symbol: response.symbol,
        priceChange: parseFloat(response.priceChange),
        priceChangePercent: parseFloat(response.priceChangePercent),
        volume: parseFloat(response.volume),
        high: parseFloat(response.highPrice),
        low: parseFloat(response.lowPrice),
        open: parseFloat(response.openPrice),
        close: parseFloat(response.lastPrice)
      };
    } catch (error) {
      console.error(`Failed to get 24hr stats for ${symbol}:`, error);
      throw error;
    }
  }

  // WebSocket methods
  subscribeToTicker(symbol, callback) {
    const stream = `${symbol.toLowerCase()}@ticker`;
    const ws = new WebSocket(`${this.wsBaseURL}/${stream}`);
    
    ws.on('message', (data) => {
      try {
        const ticker = JSON.parse(data);
        callback({
          symbol: ticker.s,
          price: parseFloat(ticker.c),
          change: parseFloat(ticker.P),
          volume: parseFloat(ticker.v),
          high: parseFloat(ticker.h),
          low: parseFloat(ticker.l)
        });
      } catch (error) {
        console.error('Error parsing ticker data:', error);
      }
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for ${symbol}:`, error);
    });

    this.wsStreams.set(symbol, ws);
    return ws;
  }

  subscribeToKlines(symbol, interval, callback) {
    const stream = `${symbol.toLowerCase()}@kline_${interval}`;
    const ws = new WebSocket(`${this.wsBaseURL}/${stream}`);
    
    ws.on('message', (data) => {
      try {
        const klineData = JSON.parse(data);
        const kline = klineData.k;
        
        if (kline.x) { // Only completed klines
          callback({
            symbol: kline.s,
            openTime: kline.t,
            closeTime: kline.T,
            open: parseFloat(kline.o),
            high: parseFloat(kline.h),
            low: parseFloat(kline.l),
            close: parseFloat(kline.c),
            volume: parseFloat(kline.v)
          });
        }
      } catch (error) {
        console.error('Error parsing kline data:', error);
      }
    });

    this.wsStreams.set(`${symbol}_klines`, ws);
    return ws;
  }

  // Utility methods
  async makeRequest(endpoint, retries = 0) {
    try {
      const url = `${this.baseURL}${endpoint}`;
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'X-MBX-APIKEY': this.apiKey
        }
      });
      
      this.updateRequestWeight(response.headers);
      return response.data;
      
    } catch (error) {
      if (retries < this.settings.maxRetries && this.shouldRetry(error)) {
        console.log(`Retrying request (${retries + 1}/${this.settings.maxRetries})...`);
        await this.delay(this.settings.retryDelay * Math.pow(2, retries));
        return this.makeRequest(endpoint, retries + 1);
      }
      
      throw this.handleError(error);
    }
  }

  async makeSignedRequest(endpoint, method = 'GET', params = {}, retries = 0) {
    try {
      params.timestamp = Date.now();
      const queryString = this.buildQueryString(params);
      const signature = this.createSignature(queryString);
      
      const config = {
        method,
        url: `${this.baseURL}${endpoint}`,
        timeout: 10000,
        headers: {
          'X-MBX-APIKEY': this.apiKey
        }
      };

      if (method === 'GET' || method === 'DELETE') {
        config.url += `?${queryString}&signature=${signature}`;
      } else {
        config.data = `${queryString}&signature=${signature}`;
        config.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }

      const response = await axios(config);
      this.updateRequestWeight(response.headers);
      
      return response.data;
      
    } catch (error) {
      if (retries < this.settings.maxRetries && this.shouldRetry(error)) {
        await this.delay(this.settings.retryDelay * Math.pow(2, retries));
        return this.makeSignedRequest(endpoint, method, params, retries + 1);
      }
      
      throw this.handleError(error);
    }
  }

  createSignature(queryString) {
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(queryString)
      .digest('hex');
  }

  buildQueryString(params) {
    return Object.keys(params)
      .map(key => `${key}=${encodeURIComponent(params[key])}`)
      .join('&');
  }

  validateOrderParams({ symbol, side, quantity }) {
    if (!symbol || !side || !quantity) {
      throw new Error('Missing required order parameters');
    }
    
    if (!['BUY', 'SELL'].includes(side)) {
      throw new Error('Invalid order side');
    }
    
    if (quantity <= 0) {
      throw new Error('Invalid quantity');
    }
  }

  async checkRateLimit() {
    const now = Date.now();
    
    // Order rate limit (10/second)
    if (now - this.lastOrderTime < 100) {
      await this.delay(100 - (now - this.lastOrderTime));
    }
    this.lastOrderTime = Date.now();
    
    // Request weight limit
    if (this.requestWeight > this.requestLimit * 0.9) {
      console.log('Approaching rate limit, waiting...');
      await this.delay(60000); // Wait 1 minute
      this.requestWeight = 0;
    }
  }

  updateRequestWeight(headers) {
    if (headers['x-mbx-used-weight-1m']) {
      this.requestWeight = parseInt(headers['x-mbx-used-weight-1m']);
    }
  }

  shouldRetry(error) {
    if (!error.response) return true; // Network errors
    
    const status = error.response.status;
    return status === 429 || status >= 500; // Rate limit or server errors
  }

  handleError(error) {
    if (error.response?.data?.msg) {
      return new Error(`Binance API Error: ${error.response.data.msg}`);
    }
    return error;
  }

  formatQuantity(quantity) {
    return parseFloat(quantity).toFixed(8).replace(/\.?0+$/, '');
  }

  formatPrice(price) {
    return parseFloat(price).toFixed(8).replace(/\.?0+$/, '');
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = BinanceClient;