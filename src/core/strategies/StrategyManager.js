const EMAStrategy = require('./EMAStrategy');
const BaseStrategy = require('./BaseStrategy');

class StrategyManager {
  constructor() {
    this.strategies = new Map();
    this.activeStrategy = null;
    this.marketData = new Map();
  }

  // Register available strategies
  registerStrategy(name, strategyClass, parameters = {}) {
    this.strategies.set(name, { class: strategyClass, parameters });
    console.log(`Strategy registered: ${name}`);
  }

  // Initialize default strategies
  initializeStrategies() {
    this.registerStrategy('EMA', EMAStrategy, {
      fastPeriod: 12,
      slowPeriod: 26,
      riskPercent: 2,
      stopLossPercent: 3,
      takeProfitPercent: 5
    });

    // Register other strategies here as they're implemented
    console.log('Default strategies initialized');
  }

  // Set active strategy
  setActiveStrategy(name, parameters = {}) {
    const strategyConfig = this.strategies.get(name);
    if (!strategyConfig) {
      throw new Error(`Strategy ${name} not found`);
    }

    // Stop current strategy if active
    if (this.activeStrategy) {
      this.activeStrategy.stop();
    }

    // Create new strategy instance
    const mergedParams = { ...strategyConfig.parameters, ...parameters };
    this.activeStrategy = new strategyConfig.class(name, mergedParams);
    
    console.log(`Active strategy set to: ${name}`);
    return this.activeStrategy;
  }

  // Get current active strategy
  getActiveStrategy() {
    return this.activeStrategy;
  }

  // Start active strategy
  startStrategy() {
    if (!this.activeStrategy) {
      throw new Error('No active strategy set');
    }
    
    this.activeStrategy.start();
    return true;
  }

  // Stop active strategy
  stopStrategy() {
    if (this.activeStrategy) {
      this.activeStrategy.stop();
      return true;
    }
    return false;
  }

  // Update market data for analysis
  updateMarketData(symbol, data) {
    if (!this.marketData.has(symbol)) {
      this.marketData.set(symbol, []);
    }
    
    const symbolData = this.marketData.get(symbol);
    symbolData.push(data);
    
    // Keep only last 1000 data points
    if (symbolData.length > 1000) {
      symbolData.splice(0, symbolData.length - 1000);
    }
    
    this.marketData.set(symbol, symbolData);
  }

  // Analyze market and generate signals
  async analyzeMarket(symbols) {
    if (!this.activeStrategy || !this.activeStrategy.isActive) {
      return [];
    }

    const signals = [];
    
    for (const symbol of symbols) {
      const data = this.marketData.get(symbol);
      if (!data || data.length < 50) continue; // Need minimum data points
      
      try {
        const signal = await this.activeStrategy.generateSignal(symbol, data);
        if (signal) {
          signals.push({
            symbol,
            signal,
            timestamp: new Date(),
            strategy: this.activeStrategy.name
          });
        }
      } catch (error) {
        console.error(`Error analyzing ${symbol}:`, error);
      }
    }
    
    return signals;
  }

  // Get strategy performance
  getPerformance() {
    if (!this.activeStrategy) return null;
    return this.activeStrategy.getPerformance();
  }

  // Get open positions
  getOpenPositions() {
    if (!this.activeStrategy) return [];
    return this.activeStrategy.getOpenPositions();
  }

  // Execute trade based on signal
  async executeTrade(signal, exchangeClient, balance) {
    if (!this.activeStrategy) {
      throw new Error('No active strategy available');
    }

    const { symbol, signal: tradeSignal } = signal;
    const currentPrice = this.getLatestPrice(symbol);
    
    if (!currentPrice) {
      throw new Error(`No price data available for ${symbol}`);
    }

    // Check if we should enter trade
    if (!this.activeStrategy.shouldEnterTrade(tradeSignal, currentPrice, balance)) {
      return null;
    }

    // Calculate position size
    const positionSize = this.activeStrategy.calculatePositionSize(
      balance,
      this.activeStrategy.parameters.riskPercent,
      this.activeStrategy.parameters.stopLossPercent
    );

    const quantity = positionSize / currentPrice;

    try {
      // Place order through exchange
      let orderResult;
      if (tradeSignal.action === 'buy') {
        orderResult = await exchangeClient.placeBuyOrder(symbol, quantity);
      } else if (tradeSignal.action === 'sell') {
        orderResult = await exchangeClient.placeSellOrder(symbol, quantity);
      }

      if (orderResult && orderResult.success) {
        // Record position in strategy
        const position = this.activeStrategy.openPosition(
          symbol,
          tradeSignal.action,
          quantity,
          orderResult.price
        );

        console.log(`Trade executed: ${JSON.stringify(position)}`);
        return position;
      }
    } catch (error) {
      console.error('Failed to execute trade:', error);
      throw error;
    }

    return null;
  }

  // Get latest price for symbol
  getLatestPrice(symbol) {
    const data = this.marketData.get(symbol);
    return data && data.length > 0 ? data[data.length - 1].close : null;
  }

  // Get available strategies
  getAvailableStrategies() {
    return Array.from(this.strategies.keys());
  }

  // Update strategy parameters
  updateStrategyParameters(parameters) {
    if (this.activeStrategy) {
      this.activeStrategy.updateParameters(parameters);
    }
  }
}

module.exports = StrategyManager;
