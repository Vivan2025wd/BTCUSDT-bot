class BaseStrategy {
  constructor(name, parameters = {}) {
    this.name = name;
    this.parameters = parameters;
    this.isActive = false;
    this.positions = new Map();
    this.trades = [];
    this.performance = {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      totalPnL: 0,
      winRate: 0
    };
  }

  // Abstract methods to be implemented by subclasses
  async analyze(marketData) {
    throw new Error('analyze() method must be implemented by subclass');
  }

  async generateSignal(symbol, data) {
    throw new Error('generateSignal() method must be implemented by subclass');
  }

  // Common methods
  start() {
    this.isActive = true;
    console.log(`Strategy ${this.name} started`);
  }

  stop() {
    this.isActive = false;
    console.log(`Strategy ${this.name} stopped`);
  }

  updateParameters(newParameters) {
    this.parameters = { ...this.parameters, ...newParameters };
    console.log(`Strategy ${this.name} parameters updated:`, this.parameters);
  }

  recordTrade(trade) {
    this.trades.push({
      ...trade,
      timestamp: new Date(),
      strategy: this.name
    });
    this.updatePerformance();
  }

  updatePerformance() {
    const completedTrades = this.trades.filter(trade => trade.status === 'closed');
    this.performance.totalTrades = completedTrades.length;
    
    const winningTrades = completedTrades.filter(trade => trade.pnl > 0);
    const losingTrades = completedTrades.filter(trade => trade.pnl <= 0);
    
    this.performance.winningTrades = winningTrades.length;
    this.performance.losingTrades = losingTrades.length;
    this.performance.totalPnL = completedTrades.reduce((sum, trade) => sum + trade.pnl, 0);
    this.performance.winRate = completedTrades.length > 0 
      ? (winningTrades.length / completedTrades.length) * 100 
      : 0;
  }

  getPerformance() {
    return { ...this.performance };
  }

  getOpenPositions() {
    return Array.from(this.positions.values()).filter(pos => pos.status === 'open');
  }

  openPosition(symbol, side, quantity, price) {
    const positionId = `${symbol}-${Date.now()}`;
    const position = {
      id: positionId,
      symbol,
      side,
      quantity,
      entryPrice: price,
      timestamp: new Date(),
      status: 'open',
      pnl: 0
    };
    
    this.positions.set(positionId, position);
    console.log(`Position opened: ${JSON.stringify(position)}`);
    return position;
  }

  closePosition(positionId, exitPrice) {
    const position = this.positions.get(positionId);
    if (!position) {
      console.error(`Position ${positionId} not found`);
      return null;
    }

    position.exitPrice = exitPrice;
    position.status = 'closed';
    
    // Calculate P&L
    const multiplier = position.side === 'buy' ? 1 : -1;
    position.pnl = (exitPrice - position.entryPrice) * position.quantity * multiplier;
    
    this.recordTrade(position);
    console.log(`Position closed: ${JSON.stringify(position)}`);
    
    return position;
  }

  // Utility methods for common technical analysis
  calculateSMA(prices, period) {
    if (prices.length < period) return null;
    
    const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
  }

  calculateEMA(prices, period) {
    if (prices.length < period) return null;
    
    const multiplier = 2 / (period + 1);
    let ema = prices[0];
    
    for (let i = 1; i < prices.length; i++) {
      ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
    }
    
    return ema;
  }

  calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return null;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  // Risk management helpers
  calculatePositionSize(balance, riskPercent, stopLossPercent) {
    const riskAmount = balance * (riskPercent / 100);
    const positionSize = riskAmount / (stopLossPercent / 100);
    return Math.min(positionSize, balance * 0.1); // Max 10% of balance per trade
  }

  shouldEnterTrade(signal, currentPrice, balance) {
    if (!signal || !this.isActive) return false;
    
    // Check if we have enough balance
    const minBalance = this.parameters.minBalance || 100;
    if (balance < minBalance) return false;
    
    // Check position limits
    const maxPositions = this.parameters.maxPositions || 5;
    if (this.getOpenPositions().length >= maxPositions) return false;
    
    return true;
  }
}

module.exports = BaseStrategy;