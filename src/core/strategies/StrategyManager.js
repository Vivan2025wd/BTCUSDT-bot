'use strict';

const EMAStrategy  = require('./EMAStrategy');
const BaseStrategy = require('./BaseStrategy');

class StrategyManager {
  constructor() {
    this.strategies = new Map();
    this.activeStrategy = null;
    this.marketData = new Map();
    this._isRunning = false;
  }

  /* ─── registration ─── */

  registerStrategy(name, StrategyClass, parameters = {}) {
    this.strategies.set(name, { StrategyClass, parameters });
    return true;
  }

  initializeStrategies() {
    this.registerStrategy('EMA', EMAStrategy, {
      emaFast: 12,
      emaSlow: 26,
      rsiPeriod: 14,
      volumeThreshold: 1.5,
      minConfidence: 60
    });
    return true;
  }

  /* ─── active strategy lifecycle ─── */

  setActiveStrategy(name, parameters = {}) {
    const entry = this.strategies.get(name);
    if (!entry) throw new Error(`Strategy ${name} not found`);

    if (this.activeStrategy) this.activeStrategy.stop();

    const merged = { ...entry.parameters, ...parameters };
    // ✅ ONE argument — the settings object
    this.activeStrategy = new entry.StrategyClass(merged);
    return this.activeStrategy;
  }

  getActiveStrategy() { return this.activeStrategy; }

  startStrategy() {
    if (!this.activeStrategy) throw new Error('No active strategy set');
    this.activeStrategy.start();
    this._isRunning = true;
    return true;
  }

  stopStrategy() {
    if (!this.activeStrategy) return false;
    this.activeStrategy.stop();
    this._isRunning = false;
    return true;
  }

  /* ─── market data buffering ─── */

  updateMarketData(symbol, tick) {
    if (!this.marketData.has(symbol)) this.marketData.set(symbol, []);
    const arr = this.marketData.get(symbol);
    arr.push(tick);
    if (arr.length > 1000) arr.splice(0, arr.length - 1000);
  }

  /** Latest close for a symbol, or null. */
  getLatestPrice(symbol) {
    const arr = this.marketData.get(symbol);
    return arr?.length ? Number(arr[arr.length - 1].close) : null;
  }

  /* ─── analysis ─── */

  /**
   * Runs the active strategy against buffered data for each symbol.
   * Returns signals in the same shape as EMAStrategy.analyze().
   */
  async analyzeMarket(symbols = []) {
    if (!this.activeStrategy || !this.activeStrategy.isActive) return [];

    const signals = [];
    for (const symbol of symbols) {
      const data = this.marketData.get(symbol);
      if (!data || data.length < 50) continue;

      try {
        const currentPrice = this.getLatestPrice(symbol);
        const signal = await this.activeStrategy.analyze(data, {
          pair: symbol,
          currentPrice,
          volume: data[data.length - 1].volume
        });
        if (signal && signal.action !== 'HOLD') {
          signals.push({
            symbol,
            signal,
            timestamp: new Date(),
            strategy: this.activeStrategy.name
          });
        }
      } catch (err) {
        console.error(`[StrategyManager] analyze ${symbol} failed:`, err);
      }
    }
    return signals;
  }

  /* ─── performance / positions passthrough ─── */

  getPerformance() {
    return this.activeStrategy ? this.activeStrategy.getPerformance() : null;
  }

  getOpenPositions() {
    return this.activeStrategy ? this.activeStrategy.getOpenPositions() : [];
  }

  updateStrategyParameters(params = {}) {
    if (!this.activeStrategy) return false;
    this.activeStrategy.updateParameters(params);
    return true;
  }

  /* ─── execution ─── */

  /**
   * Execute a trade based on a signal from analyzeMarket().
   * Fixes:
   *   • action is uppercase ('BUY'/'SELL'), not lowercase
   *   • uses exchangeClient.createMarketOrder (matches BinanceClient/BybitClient)
   *   • routes through strategy.openPosition() so positions land in the right place
   */
  async executeTrade(signalEnvelope, exchangeClient, balance) {
    if (!this.activeStrategy) throw new Error('No active strategy available');

    const { symbol, signal } = signalEnvelope;
    const price = this.getLatestPrice(symbol);
    if (!price) throw new Error(`No price data for ${symbol}`);

    if (!this.activeStrategy.shouldEnterTrade(signal, price, balance)) return null;

    const riskPct = this.activeStrategy.settings?.positionSizePercent
      ?? this.activeStrategy.parameters?.positionSizePercent
      ?? 2;
    const slPct = this.activeStrategy.settings?.stopLossPercent
      ?? this.activeStrategy.parameters?.stopLossPercent
      ?? 3;

    const positionValue = this.activeStrategy.calculatePositionSize(balance, riskPct, slPct);
    const quantity = positionValue / price;
    const side = signal.action; // 'BUY' | 'SELL'

    // Order placement — try both naming conventions
    let orderResult;
    if (typeof exchangeClient.createMarketOrder === 'function') {
      orderResult = await exchangeClient.createMarketOrder({
        symbol,
        side,
        quantity,
        type: 'MARKET'
      });
    } else if (typeof exchangeClient.placeBuyOrder === 'function' && side === 'BUY') {
      orderResult = await exchangeClient.placeBuyOrder(symbol, quantity);
    } else if (typeof exchangeClient.placeSellOrder === 'function' && side === 'SELL') {
      orderResult = await exchangeClient.placeSellOrder(symbol, quantity);
    } else {
      throw new Error('Exchange client has no order method');
    }

    if (!orderResult) return null;

    const fillPrice = orderResult.price ?? price;
    const position = this.activeStrategy.openPosition(
      symbol,
      side === 'BUY' ? 'buy' : 'sell',
      quantity,
      fillPrice
    );

    return position;
  }

  getAvailableStrategies() { return Array.from(this.strategies.keys()); }
}

module.exports = StrategyManager;