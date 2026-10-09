'use strict';

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

  /* ─── abstract ─── */
  async analyze(/* candles, marketData */) {
    throw new Error('analyze() must be implemented by subclass');
  }

  /* ─── lifecycle ─── */
  start() { this.isActive = true;  return true; }
  stop()  { this.isActive = false; return true; }

  updateParameters(newParams = {}) {
    this.parameters = { ...this.parameters, ...newParams };
    if (typeof this.updateSettings === 'function') {
      this.updateSettings(newParams);
    }
  }

  /* ─── trade bookkeeping ─── */
  recordTrade(trade) {
    this.trades.push({
      ...trade,
      closedAt: new Date(),
      strategy: this.name
    });
    this._recalcPerformance();
    return this.performance;
  }

  _recalcPerformance() {
    const closed = this.trades;
    const wins = closed.filter((t) => (t.pnl ?? 0) > 0);
    const losses = closed.filter((t) => (t.pnl ?? 0) <= 0);

    this.performance = {
      totalTrades: closed.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      totalPnL: closed.reduce((s, t) => s + (t.pnl ?? 0), 0),
      winRate: closed.length ? (wins.length / closed.length) * 100 : 0
    };
    return this.performance;
  }

  getPerformance() { return { ...this.performance }; }

  getOpenPositions() {
    return Array.from(this.positions.values()).filter((p) => p.status === 'open');
  }

  openPosition(symbol, side, quantity, price) {
    const id = `${symbol}-${Date.now()}`;
    const position = {
      id, symbol, side, quantity,
      entryPrice: price,
      openedAt: new Date(),
      status: 'open',
      pnl: 0
    };
    this.positions.set(id, position);
    return position;
  }

  closePosition(positionId, exitPrice) {
    const position = this.positions.get(positionId);
    if (!position) return null;

    position.exitPrice = exitPrice;
    position.status = 'closed';
    position.closedAt = new Date();

    const mult = position.side === 'buy' || position.side === 'BUY' ? 1 : -1;
    position.pnl = (exitPrice - position.entryPrice) * position.quantity * mult;

    this.recordTrade(position);
    return position;
  }

  /* ─── utility indicators ─── */
  calculateSMA(prices, period) {
    if (!Array.isArray(prices) || prices.length < period) return null;
    return prices.slice(-period).reduce((a, b) => a + b, 0) / period;
  }

  /** EMA seeded with SMA of first `period` values (standard). */
  calculateEMA(prices, period) {
    if (!Array.isArray(prices) || prices.length < period) return null;
    const k = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
    }
    return ema;
  }

  calculateRSI(prices, period = 14) {
    if (!Array.isArray(prices) || prices.length < period + 1) return null;
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const d = prices[i] - prices[i - 1];
      if (d > 0) gains += d;
      else losses += -d;
    }
    const avgGain = gains / period;
    const avgLoss = losses / period;
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  /* ─── risk helpers ─── */
  calculatePositionSize(balance, riskPercent, stopLossPercent) {
    const riskAmount = balance * (riskPercent / 100);
    const positionSize = riskAmount / (stopLossPercent / 100);
    return Math.min(positionSize, balance * 0.1);
  }

  shouldEnterTrade(signal, currentPrice, balance) {
    if (!signal || !this.isActive) return false;
    if (balance < (this.parameters.minBalance ?? 100)) return false;
    const max = this.parameters.maxPositions ?? 5;
    if (this.getOpenPositions().length >= max) return false;
    return true;
  }
}

module.exports = BaseStrategy;