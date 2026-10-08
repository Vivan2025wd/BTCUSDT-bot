const EventEmitter = require('events');
const Database = require('../database/Database');
const EMAStrategy = require('./strategies/EMAStrategy');
const BinanceClient = require('./exchanges/BinanceClient');
const PositionSizer = require('./risk/PositionSizer');
const LoggingService = require('../services/LoggingService');

class TradingBot extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.isRunning = false;
    this.positions = new Map();
    this.stats = {
      totalTrades: 0,
      profitableTrades: 0,
      totalProfit: 0,
      totalLoss: 0,
      winRate: 0,
      startTime: null,
      lastUpdateTime: null
    };
    
    // Initialize components
    this.db = new Database();
    this.strategy = new EMAStrategy(config.strategySettings);
    this.exchange = new BinanceClient(config.apiKeys, config.exchangeSettings);
    this.positionSizer = new PositionSizer(config.riskSettings);
    this.logger = new LoggingService();
    
    // Trading pairs to monitor
    this.pairs = config.tradingPairs || ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
    this.intervals = new Map();
    this.priceCache = new Map();
    
    // Risk management
    this.dailyLoss = 0;
    this.maxDailyLoss = config.riskSettings.maxDailyLoss || 10;
    this.lastResetDate = new Date().toDateString();
    
    // Performance tracking
    this.startBalance = 0;
    this.currentBalance = 0;
  }

  async start() {
    if (this.isRunning) {
      throw new Error('Bot is already running');
    }
    
    try {
      this.logger.info('Starting trading bot...');
      this.emit('status', { message: 'Initializing...', type: 'info' });
      
      // Initialize database
      await this.db.connect();
      this.logger.info('Database connected');
      
      // Connect to exchange
      await this.exchange.connect();
      this.logger.info('Exchange connected');
      
      // Get initial balance
      this.startBalance = await this.exchange.getBalance('USDT');
      this.currentBalance = this.startBalance;
      
      this.isRunning = true;
      this.stats.startTime = new Date();
      
      this.logger.info(`Trading bot started with ${this.startBalance} USDT balance`);
      this.emit('status', { 
        message: `Bot started - Balance: ${this.startBalance} USDT`, 
        type: 'success' 
      });
      
      // Start monitoring each pair
      this.pairs.forEach(pair => {
        this.startPairMonitoring(pair);
      });
      
      // Start balance monitoring
      this.startBalanceMonitoring();
      
      this.emit('started');
      
    } catch (error) {
      this.logger.error('Failed to start bot:', error);
      this.emit('error', error);
      throw error;
    }
  }

  async stop() {
    if (!this.isRunning) {
      throw new Error('Bot is not running');
    }
    
    try {
      this.logger.info('Stopping trading bot...');
      this.emit('status', { message: 'Stopping...', type: 'info' });
      
      this.isRunning = false;
      
      // Clear all intervals
      this.intervals.forEach(interval => clearInterval(interval));
      this.intervals.clear();
      
      // Close any open positions (emergency stop)
      if (this.positions.size > 0) {
        this.logger.info('Closing open positions...');
        for (const [pair] of this.positions) {
          await this.forceClosePosition(pair);
        }
      }
      
      await this.exchange.disconnect();
      await this.db.close();
      
      this.logger.info('Trading bot stopped');
      this.emit('status', { message: 'Bot stopped', type: 'info' });
      this.emit('stopped');
      
    } catch (error) {
      this.logger.error('Error stopping bot:', error);
      this.emit('error', error);
      throw error;
    }
  }

  startPairMonitoring(pair) {
    this.logger.info(`Starting monitoring for ${pair}`);
    
    const interval = setInterval(async () => {
      if (!this.isRunning) return;
      
      try {
        await this.analyzeAndTrade(pair);
      } catch (error) {
        this.logger.error(`Error analyzing ${pair}:`, error);
        this.emit('error', new Error(`Analysis failed for ${pair}: ${error.message}`));
      }
    }, 30000); // Check every 30 seconds
    
    this.intervals.set(pair, interval);
  }

  startBalanceMonitoring() {
    const interval = setInterval(async () => {
      if (!this.isRunning) return;
      
      try {
        const newBalance = await this.exchange.getBalance('USDT');
        if (Math.abs(newBalance - this.currentBalance) > 0.01) {
          this.currentBalance = newBalance;
          this.emit('balance-update', {
            current: this.currentBalance,
            start: this.startBalance,
            change: this.currentBalance - this.startBalance,
            changePercent: ((this.currentBalance - this.startBalance) / this.startBalance) * 100
          });
        }
      } catch (error) {
        this.logger.error('Error updating balance:', error);
      }
    }, 10000); // Update every 10 seconds
    
    this.intervals.set('balance', interval);
  }

  async analyzeAndTrade(pair) {
    try {
      // Reset daily loss if new day
      this.checkDailyReset();
      
      // Check daily loss limit
      if (this.dailyLoss >= this.maxDailyLoss) {
        if (this.positions.has(pair)) {
          await this.forceClosePosition(pair);
        }
        return;
      }

      // Get market data
      const candles = await this.exchange.getKlines(pair, '5m', 100);
      const currentPrice = await this.exchange.getCurrentPrice(pair);
      
      // Cache current price
      this.priceCache.set(pair, {
        price: currentPrice,
        timestamp: new Date()
      });
      
      // Run strategy analysis
      const signal = await this.strategy.analyze(candles, {
        pair,
        currentPrice,
        volume: candles[candles.length - 1].volume
      });

      this.logger.debug(`${pair} Signal: ${signal.action} (confidence: ${signal.confidence}%)`);
      
      // Execute trades based on signals
      if (signal.action === 'BUY' && !this.positions.has(pair) && signal.confidence > 60) {
        await this.executeBuyOrder(pair, signal);
      } else if (signal.action === 'SELL' && this.positions.has(pair)) {
        await this.executeSellOrder(pair, signal);
      } else if (this.positions.has(pair)) {
        // Check stop loss and take profit
        await this.checkExitConditions(pair, currentPrice);
      }
      
    } catch (error) {
      this.logger.error(`Error in analyzeAndTrade for ${pair}:`, error);
      throw error;
    }
  }

  async executeBuyOrder(pair, signal) {
    try {
      const balance = await this.exchange.getBalance('USDT');
      const positionSize = this.positionSizer.calculateSize(balance, signal.price);
      
      // Minimum order check
      if (positionSize < 10) {
        this.logger.debug(`Position size too small for ${pair}: ${positionSize} USDT`);
        return;
      }
      
      const quantity = positionSize / signal.price;
      
      this.logger.info(`Executing BUY order: ${pair} - ${quantity} @ ${signal.price}`);
      
      const order = await this.exchange.createMarketOrder({
        symbol: pair,
        side: 'BUY',
        quantity: quantity,
        type: 'MARKET'
      });
      
      // Calculate stop loss and take profit
      const stopLoss = signal.price * (1 - this.config.riskSettings.stopLossPercent / 100);
      const takeProfit = signal.price * (1 + this.config.riskSettings.takeProfitPercent / 100);
      
      // Store position
      const position = {
        pair,
        side: 'BUY',
        entryPrice: order.price || signal.price,
        quantity: order.executedQty || quantity,
        stopLoss,
        takeProfit,
        timestamp: new Date(),
        orderId: order.orderId,
        signal: signal
      };
      
      this.positions.set(pair, position);
      
      // Save trade to database
      await this.db.saveTrade({
        pair,
        side: 'BUY',
        price: position.entryPrice,
        quantity: position.quantity,
        timestamp: position.timestamp,
        signal: signal.reason
      });
      
      this.stats.totalTrades++;
      this.stats.lastUpdateTime = new Date();
      
      this.logger.info(`BUY order executed: ${pair} at ${position.entryPrice}, SL: ${stopLoss.toFixed(4)}, TP: ${takeProfit.toFixed(4)}`);
      
      this.emit('trade', { 
        type: 'BUY', 
        pair, 
        position,
        signal 
      });
      
      this.emit('status', { 
        message: `Bought ${pair} at ${position.entryPrice}`, 
        type: 'success' 
      });
      
    } catch (error) {
      this.logger.error(`Failed to execute BUY order for ${pair}:`, error);
      this.emit('error', new Error(`Buy order failed for ${pair}: ${error.message}`));
    }
  }

  async executeSellOrder(pair, signal) {
    const position = this.positions.get(pair);
    if (!position) return;
    
    try {
      this.logger.info(`Executing SELL order: ${pair} - ${position.quantity} @ ${signal.price}`);
      
      const order = await this.exchange.createMarketOrder({
        symbol: pair,
        side: 'SELL',
        quantity: position.quantity,
        type: 'MARKET'
      });
      
      const exitPrice = order.price || signal.price;
      
      // Calculate P&L
      const pnl = (exitPrice - position.entryPrice) * position.quantity;
      const pnlPercent = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;
      
      // Update stats
      this.stats.totalTrades++;
      if (pnl > 0) {
        this.stats.profitableTrades++;
        this.stats.totalProfit += pnl;
      } else {
        this.stats.totalLoss += Math.abs(pnl);
        this.dailyLoss += Math.abs(pnl);
      }
      
      this.stats.winRate = (this.stats.profitableTrades / this.stats.totalTrades) * 100;
      this.stats.lastUpdateTime = new Date();
      
      // Remove position
      this.positions.delete(pair);
      
      // Save trade to database
      await this.db.saveTrade({
        pair,
        side: 'SELL',
        price: exitPrice,
        quantity: position.quantity,
        pnl,
        pnlPercent,
        timestamp: new Date(),
        signal: signal.reason
      });
      
      this.logger.info(`SELL order executed: ${pair} at ${exitPrice}, P&L: ${pnl.toFixed(2)} USDT (${pnlPercent.toFixed(2)}%)`);
      
      this.emit('trade', { 
        type: 'SELL', 
        pair, 
        position: { ...position, exitPrice }, 
        pnl, 
        pnlPercent,
        signal 
      });
      
      const statusType = pnl > 0 ? 'success' : 'warning';
      this.emit('status', { 
        message: `Sold ${pair} - P&L: ${pnl.toFixed(2)} USDT (${pnlPercent.toFixed(1)}%)`, 
        type: statusType 
      });
      
    } catch (error) {
      this.logger.error(`Failed to execute SELL order for ${pair}:`, error);
      this.emit('error', new Error(`Sell order failed for ${pair}: ${error.message}`));
    }
  }

  async checkExitConditions(pair, currentPrice) {
    const position = this.positions.get(pair);
    if (!position) return;
    
    // Check stop loss
    if (currentPrice <= position.stopLoss) {
      this.logger.info(`Stop loss triggered for ${pair}: ${currentPrice} <= ${position.stopLoss}`);
      await this.executeSellOrder(pair, {
        action: 'SELL',
        price: currentPrice,
        reason: 'Stop Loss triggered'
      });
      return;
    }
    
    // Check take profit
    if (currentPrice >= position.takeProfit) {
      this.logger.info(`Take profit triggered for ${pair}: ${currentPrice} >= ${position.takeProfit}`);
      await this.executeSellOrder(pair, {
        action: 'SELL',
        price: currentPrice,
        reason: 'Take Profit triggered'
      });
      return;
    }
  }

  async forceClosePosition(pair) {
    const position = this.positions.get(pair);
    if (!position) return;
    
    try {
      const currentPrice = await this.exchange.getCurrentPrice(pair);
      await this.executeSellOrder(pair, {
        action: 'SELL',
        price: currentPrice,
        reason: 'Force close'
      });
    } catch (error) {
      this.logger.error(`Failed to force close position for ${pair}:`, error);
    }
  }

  checkDailyReset() {
    const today = new Date().toDateString();
    if (today !== this.lastResetDate) {
      this.dailyLoss = 0;
      this.lastResetDate = today;
      this.logger.info('Daily loss counter reset');
    }
  }

  async getTradeHistory(limit = 100) {
    try {
      return await this.db.getTradeHistory(limit);
    } catch (error) {
      this.logger.error('Failed to get trade history:', error);
      return [];
    }
  }

  getStats() {
    const runTime = this.stats.startTime ? new Date() - this.stats.startTime : 0;
    const totalPnL = this.stats.totalProfit - this.stats.totalLoss;
    const roi = this.startBalance > 0 ? (totalPnL / this.startBalance) * 100 : 0;
    
    return {
      ...this.stats,
      runTime,
      totalPnL,
      roi,
      averageTrade: this.stats.totalTrades > 0 ? totalPnL / this.stats.totalTrades : 0,
      maxDailyLoss: this.maxDailyLoss,
      currentDailyLoss: this.dailyLoss,
      openPositions: this.positions.size,
      monitoredPairs: this.pairs.length
    };
  }

  getCurrentPrices() {
    const prices = {};
    this.priceCache.forEach((data, pair) => {
      prices[pair] = data;
    });
    return prices;
  }

  getPositions() {
    return Array.from(this.positions.entries()).map(([pair, position]) => {
      const currentData = this.priceCache.get(pair);
      const currentPrice = currentData ? currentData.price : position.entryPrice;
      const unrealizedPnL = (currentPrice - position.entryPrice) * position.quantity;
      const unrealizedPnLPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
      
      return {
        ...position,
        currentPrice,
        unrealizedPnL,
        unrealizedPnLPercent
      };
    });
  }

  async emergencyStop() {
    this.logger.warn('Emergency stop initiated!');
    this.emit('status', { message: 'Emergency stop initiated!', type: 'error' });
    
    try {
      // Close all positions immediately
      const closePromises = Array.from(this.positions.keys()).map(pair => 
        this.forceClosePosition(pair)
      );
      
      await Promise.all(closePromises);
      await this.stop();
      
      this.logger.info('Emergency stop completed');
      this.emit('status', { message: 'Emergency stop completed', type: 'info' });
    } catch (error) {
      this.logger.error('Error during emergency stop:', error);
      this.emit('error', new Error(`Emergency stop failed: ${error.message}`));
    }
  }

  async updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Update components
    if (newConfig.strategySettings) {
      this.strategy.updateSettings(newConfig.strategySettings);
    }
    
    if (newConfig.riskSettings) {
      this.positionSizer.updateSettings(newConfig.riskSettings);
      this.maxDailyLoss = newConfig.riskSettings.maxDailyLoss || 10;
    }
    
    if (newConfig.tradingPairs) {
      // Stop monitoring old pairs
      this.pairs.forEach(pair => {
        if (!newConfig.tradingPairs.includes(pair)) {
          const interval = this.intervals.get(pair);
          if (interval) {
            clearInterval(interval);
            this.intervals.delete(pair);
          }
        }
      });
      
      // Start monitoring new pairs
      newConfig.tradingPairs.forEach(pair => {
        if (!this.pairs.includes(pair)) {
          this.startPairMonitoring(pair);
        }
      });
      
      this.pairs = newConfig.tradingPairs;
    }
    
    this.logger.info('Bot configuration updated');
    this.emit('config-updated', newConfig);
  }
}

module.exports = TradingBot;