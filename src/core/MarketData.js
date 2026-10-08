const EventEmitter = require('events');

class MarketData extends EventEmitter {
  constructor() {
    super();
    this.priceData = new Map(); // symbol -> { price, volume, timestamp, etc. }
    this.historicalData = new Map(); // symbol -> Array of OHLCV data
    this.subscriptions = new Set(); // Active symbol subscriptions
    this.dataBuffers = new Map(); // symbol -> circular buffer for indicators
    this.lastUpdate = new Map(); // symbol -> last update timestamp
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000; // 5 seconds
    
    // Data quality metrics
    this.metrics = {
      totalUpdates: 0,
      missedUpdates: 0,
      latencySum: 0,
      updateCount: 0
    };

    this.isConnected = false;
    this.activeExchange = null;
  }

  /**
   * Initialize market data connection
   * @param {Object} exchangeClient - Exchange client instance
   * @param {Array} symbols - Symbols to subscribe to
   */
  async initialize(exchangeClient, symbols = []) {
    try {
      this.activeExchange = exchangeClient;
      
      // Load historical data for each symbol
      for (const symbol of symbols) {
        await this.loadHistoricalData(symbol);
      }

      // Subscribe to real-time feeds
      await this.subscribeToFeeds(symbols);
      
      this.isConnected = true;
      this.emit('connected');
      
      console.log(`📊 MarketData initialized with ${symbols.length} symbols`);
      
    } catch (error) {
      console.error('❌ MarketData initialization failed:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Load historical data for analysis
   * @param {string} symbol - Trading symbol
   * @param {string} interval - Time interval (1m, 5m, 1h, etc.)
   * @param {number} limit - Number of candles to fetch
   */
  async loadHistoricalData(symbol, interval = '5m', limit = 200) {
    try {
      if (!this.activeExchange) {
        throw new Error('No exchange client available');
      }

      console.log(`📈 Loading historical data for ${symbol}...`);
      
      const candles = await this.activeExchange.getKlines(symbol, interval, limit);
      
      if (!candles || candles.length === 0) {
        throw new Error(`No historical data received for ${symbol}`);
      }

      // Store historical data
      this.historicalData.set(symbol, candles);
      
      // Initialize data buffer for indicators
      this.initializeDataBuffer(symbol, candles);
      
      // Set current price from latest candle
      const latestCandle = candles[candles.length - 1];
      this.updatePrice(symbol, {
        price: parseFloat(latestCandle.close),
        volume: parseFloat(latestCandle.volume),
        timestamp: latestCandle.closeTime,
        high: parseFloat(latestCandle.high),
        low: parseFloat(latestCandle.low),
        open: parseFloat(latestCandle.open)
      });

      this.emit('historicalDataLoaded', { symbol, candles: candles.length });
      
    } catch (error) {
      console.error(`❌ Failed to load historical data for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Initialize circular buffer for indicator calculations
   * @param {string} symbol - Trading symbol
   * @param {Array} initialData - Initial candle data
   */
  initializeDataBuffer(symbol, initialData) {
    const buffer = {
      prices: [],
      volumes: [],
      highs: [],
      lows: [],
      opens: [],
      maxSize: 500 // Keep last 500 data points
    };

    // Fill buffer with initial data
    initialData.forEach(candle => {
      buffer.prices.push(parseFloat(candle.close));
      buffer.volumes.push(parseFloat(candle.volume));
      buffer.highs.push(parseFloat(candle.high));
      buffer.lows.push(parseFloat(candle.low));
      buffer.opens.push(parseFloat(candle.open));
    });

    this.dataBuffers.set(symbol, buffer);
  }

  /**
   * Subscribe to real-time market data feeds
   * @param {Array} symbols - Symbols to subscribe to
   */
  async subscribeToFeeds(symbols) {
    try {
      if (!this.activeExchange) {
        throw new Error('No exchange client available');
      }

      for (const symbol of symbols) {
        this.subscriptions.add(symbol);
        
        // Subscribe to price updates
        await this.activeExchange.subscribeTicker(symbol, (data) => {
          this.handlePriceUpdate(symbol, data);
        });

        console.log(`🔔 Subscribed to ${symbol} price feed`);
      }

    } catch (error) {
      console.error('❌ Failed to subscribe to feeds:', error);
      this.handleConnectionError(error);
    }
  }

  /**
   * Handle incoming price updates
   * @param {string} symbol - Trading symbol
   * @param {Object} data - Price update data
   */
  handlePriceUpdate(symbol, data) {
    try {
      const timestamp = Date.now();
      const priceData = {
        price: parseFloat(data.price || data.c),
        volume: parseFloat(data.volume || data.v || 0),
        high: parseFloat(data.high || data.h || data.price),
        low: parseFloat(data.low || data.l || data.price),
        open: parseFloat(data.open || data.o || data.price),
        timestamp: timestamp,
        symbol: symbol
      };

      // Update price data
      this.updatePrice(symbol, priceData);
      
      // Update data buffer for indicators
      this.updateDataBuffer(symbol, priceData);
      
      // Calculate latency
      if (data.timestamp) {
        const latency = timestamp - data.timestamp;
        this.updateMetrics(latency);
      }

      // Emit price update event
      this.emit('priceUpdate', priceData);

    } catch (error) {
      console.error(`❌ Error handling price update for ${symbol}:`, error);
    }
  }

  /**
   * Update price data for a symbol
   * @param {string} symbol - Trading symbol
   * @param {Object} data - Price data
   */
  updatePrice(symbol, data) {
    const existing = this.priceData.get(symbol) || {};
    
    const updated = {
      ...existing,
      ...data,
      change: existing.price ? ((data.price - existing.price) / existing.price * 100) : 0,
      lastUpdate: data.timestamp
    };

    this.priceData.set(symbol, updated);
    this.lastUpdate.set(symbol, data.timestamp);
  }

  /**
   * Update data buffer for indicator calculations
   * @param {string} symbol - Trading symbol
   * @param {Object} data - Price data
   */
  updateDataBuffer(symbol, data) {
    const buffer = this.dataBuffers.get(symbol);
    if (!buffer) return;

    // Add new data point
    buffer.prices.push(data.price);
    buffer.volumes.push(data.volume);
    buffer.highs.push(data.high);
    buffer.lows.push(data.low);
    buffer.opens.push(data.open);

    // Maintain buffer size
    if (buffer.prices.length > buffer.maxSize) {
      buffer.prices.shift();
      buffer.volumes.shift();
      buffer.highs.shift();
      buffer.lows.shift();
      buffer.opens.shift();
    }
  }

  /**
   * Get current price for a symbol
   * @param {string} symbol - Trading symbol
   * @returns {Object|null} Price data
   */
  getCurrentPrice(symbol) {
    return this.priceData.get(symbol) || null;
  }

  /**
   * Get historical data for a symbol
   * @param {string} symbol - Trading symbol
   * @param {number} limit - Number of data points to return
   * @returns {Array} Historical data
   */
  getHistoricalData(symbol, limit = 100) {
    const data = this.historicalData.get(symbol) || [];
    return limit ? data.slice(-limit) : data;
  }

  /**
   * Get price data for indicator calculations
   * @param {string} symbol - Trading symbol
   * @param {string} type - Data type (prices, volumes, highs, lows, opens)
   * @param {number} periods - Number of periods to return
   * @returns {Array} Price data array
   */
  getPriceData(symbol, type = 'prices', periods = 50) {
    const buffer = this.dataBuffers.get(symbol);
    if (!buffer || !buffer[type]) {
      return [];
    }

    const data = buffer[type];
    return periods ? data.slice(-periods) : data;
  }

  /**
   * Check if symbol data is stale
   * @param {string} symbol - Trading symbol
   * @param {number} maxAge - Maximum age in milliseconds
   * @returns {boolean} True if data is stale
   */
  isDataStale(symbol, maxAge = 60000) { // 1 minute default
    const lastUpdate = this.lastUpdate.get(symbol);
    if (!lastUpdate) return true;
    
    return (Date.now() - lastUpdate) > maxAge;
  }

  /**
   * Get market summary for all subscribed symbols
   * @returns {Object} Market summary
   */
  getMarketSummary() {
    const summary = {};
    
    for (const [symbol, data] of this.priceData.entries()) {
      summary[symbol] = {
        price: data.price,
        change: data.change,
        volume: data.volume,
        lastUpdate: data.lastUpdate,
        isStale: this.isDataStale(symbol)
      };
    }

    return summary;
  }

  /**
   * Update performance metrics
   * @param {number} latency - Update latency in ms
   */
  updateMetrics(latency) {
    this.metrics.totalUpdates++;
    this.metrics.updateCount++;
    this.metrics.latencySum += latency;
  }

  /**
   * Get performance metrics
   * @returns {Object} Performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      averageLatency: this.metrics.updateCount > 0 ? 
        this.metrics.latencySum / this.metrics.updateCount : 0,
      isConnected: this.isConnected,
      activeSubscriptions: this.subscriptions.size,
      reconnectAttempts: this.reconnectAttempts
    };
  }

  /**
   * Handle connection errors
   * @param {Error} error - Connection error
   */
  handleConnectionError(error) {
    console.error('📡 Market data connection error:', error);
    this.isConnected = false;
    this.emit('disconnected', error);

    // Attempt reconnection
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      
      setTimeout(() => {
        console.log(`🔄 Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);
        this.reconnect();
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error('❌ Max reconnection attempts reached');
      this.emit('connectionFailed');
    }
  }

  /**
   * Attempt to reconnect to market data feeds
   */
  async reconnect() {
    try {
      if (this.activeExchange) {
        const symbols = Array.from(this.subscriptions);
        await this.subscribeToFeeds(symbols);
        
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        console.log('✅ Market data reconnected successfully');
        this.emit('reconnected');
      }
    } catch (error) {
      this.handleConnectionError(error);
    }
  }

  /**
   * Add new symbol subscription
   * @param {string} symbol - Symbol to subscribe to
   */
  async addSymbol(symbol) {
    if (this.subscriptions.has(symbol)) {
      console.log(`📊 Already subscribed to ${symbol}`);
      return;
    }

    try {
      await this.loadHistoricalData(symbol);
      
      if (this.activeExchange && this.isConnected) {
        await this.activeExchange.subscribeTicker(symbol, (data) => {
          this.handlePriceUpdate(symbol, data);
        });
      }

      this.subscriptions.add(symbol);
      console.log(`✅ Added subscription for ${symbol}`);
      
      this.emit('symbolAdded', symbol);
      
    } catch (error) {
      console.error(`❌ Failed to add symbol ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Remove symbol subscription
   * @param {string} symbol - Symbol to unsubscribe from
   */
  async removeSymbol(symbol) {
    if (!this.subscriptions.has(symbol)) {
      return;
    }

    try {
      // Unsubscribe from exchange feed
      if (this.activeExchange && this.isConnected) {
        await this.activeExchange.unsubscribeTicker(symbol);
      }

      // Clean up data
      this.subscriptions.delete(symbol);
      this.priceData.delete(symbol);
      this.dataBuffers.delete(symbol);
      this.lastUpdate.delete(symbol);

      console.log(`🗑️ Removed subscription for ${symbol}`);
      this.emit('symbolRemoved', symbol);
      
    } catch (error) {
      console.error(`❌ Failed to remove symbol ${symbol}:`, error);
    }
  }

  /**
   * Clean shutdown
   */
  async shutdown() {
    console.log('🛑 Shutting down market data service...');
    
    try {
      // Unsubscribe from all feeds
      for (const symbol of this.subscriptions) {
        if (this.activeExchange) {
          await this.activeExchange.unsubscribeTicker(symbol);
        }
      }

      // Clear all data
      this.subscriptions.clear();
      this.priceData.clear();
      this.dataBuffers.clear();
      this.lastUpdate.clear();
      this.historicalData.clear();

      this.isConnected = false;
      this.emit('shutdown');
      
      console.log('✅ Market data service shut down cleanly');
      
    } catch (error) {
      console.error('❌ Error during market data shutdown:', error);
    }
  }
}

module.exports = MarketData;
