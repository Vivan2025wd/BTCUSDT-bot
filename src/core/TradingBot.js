// src/core/TradingBot.js
'use strict';

const EventEmitter = require('events');

/* ═══════════════════════════════════════════════════════════════
   LAZY / RESILIENT REQUIRE
   We try to load every module, but degrade gracefully if some
   don't exist yet (during early development).
   ═══════════════════════════════════════════════════════════════ */

function tryRequire(path, label) {
  try {
    return require(path);
  } catch (err) {
    console.warn(`[TradingBot] Optional module "${label}" missing: ${err.message}`);
    return null;
  }
}

const Database       = tryRequire('../database/Database', 'Database');
const EMAStrategy    = tryRequire('./strategies/EMAStrategy', 'EMAStrategy');
const PositionSizer  = tryRequire('./risk/PositionSizer', 'PositionSizer');
const LoggingService = tryRequire('../services/LoggingService', 'LoggingService');
const MarketData     = tryRequire('./MarketData', 'MarketData');

/* ────────── tiny fallbacks ────────── */

const FallbackLogger = {
  info:  (...a) => console.log('[INFO ]', ...a),
  debug: (...a) => console.debug('[DEBUG]', ...a),
  warn:  (...a) => console.warn('[WARN ]', ...a),
  error: (...a) => console.error('[ERROR]', ...a)
};

class FallbackStrategy {
  constructor(settings = {}) { this.settings = settings; }
  async analyze() { return { action: 'HOLD', confidence: 0, reason: 'No strategy loaded' }; }
  updateSettings(s = {}) { this.settings = { ...this.settings, ...s }; }
}

class FallbackSizer {
  constructor(settings = {}) { this.settings = settings; }
  calculateSize(balance) {
    const pct = (this.settings.positionSizePercent ?? 2) / 100;
    return balance * pct;
  }
  updateSettings(s = {}) { this.settings = { ...this.settings, ...s }; }
}

/* ═══════════════════════════════════════════════════════════════
   TRADING BOT
   ═══════════════════════════════════════════════════════════════ */

class TradingBot extends EventEmitter {
  constructor(config = {}) {
    super();

    this.config = config;
    this.isRunning = false;
    this.positions = new Map();  // symbol -> position
    this.logger = LoggingService ? new LoggingService() : FallbackLogger;

    /* --- components --- */
    this.db = null; // lazy — created in start() if Database exists
    this.marketData = null;
    this.exchange = null; // for order placement only

    this.strategy = EMAStrategy
      ? new EMAStrategy(config.strategySettings || {})
      : new FallbackStrategy(config.strategySettings || {});

    this.positionSizer = PositionSizer
      ? new PositionSizer(config.riskSettings || {})
      : new FallbackSizer(config.riskSettings || {});

    /* --- trading config --- */
    this.pairs = config.tradingPairs || ['BTCUSDT', 'ETHUSDT'];
    this.timeframe = config.strategySettings?.timeframe || '5m';

    /* --- risk --- */
    this.riskSettings = config.riskSettings || {
      positionSizePercent: 2,
      stopLossPercent: 3,
      takeProfitPercent: 5,
      maxDailyLoss: 10
    };
    this.dailyLoss = 0;
    this.maxDailyLoss = this.riskSettings.maxDailyLoss ?? 10;
    this.lastResetDate = new Date().toDateString();

    /* --- stats --- */
    this.stats = {
      totalTrades: 0,
      profitableTrades: 0,
      totalProfit: 0,
      totalLoss: 0,
      winRate: 0,
      startTime: null,
      lastUpdateTime: null
    };

    /* --- balance --- */
    this.startBalance = 0;
    this.currentBalance = 0;

    /* --- candles log (keeps last N per symbol for debugging) --- */
    this.candleCount = new Map();

    /* --- bind handlers so we can remove them cleanly --- */
    this._boundOnPriceUpdate = this._onPriceUpdate.bind(this);
  }

  /* ═══════════════════════════════════════════════════════════════
     LIFECYCLE
     ═══════════════════════════════════════════════════════════════ */

  async start() {
    if (this.isRunning) throw new Error('Bot is already running');

    try {
      this.emit('status', { message: 'Initializing…', type: 'info' });

      /* --- 1. DB (optional) --- */
      if (Database) {
        try {
          this.db = new Database();
          await this.db.connect();
          this.logger.info('Database connected');
        } catch (err) {
          this.logger.warn('Database unavailable:', err.message);
          this.db = null;
        }
      }

      /* --- 2. Market data (WebSocket) --- */
      if (!MarketData) {
        throw new Error('MarketData module is missing — cannot fetch prices');
      }

      this.marketData = new MarketData({
        exchange: this.config.exchangeSettings?.name || 'binance',
        testnet:  this.config.exchangeSettings?.testnet ?? true,
        interval: this.timeframe,
        historyLimit: 200
      });

      // Bridge market events to bot events
      this.marketData.on('connected', () => {
        this.emit('status', { message: 'Market data connected', type: 'success' });
      });
      this.marketData.on('ws-error', (err) => {
        this.logger.warn('Market WS error:', err.message);
      });
      this.marketData.on('ws-close', () => {
        this.emit('status', { message: 'Market data disconnected — reconnecting…', type: 'warning' });
      });
      this.marketData.on('ws-give-up', () => {
        this.emit('status', { message: 'Market data connection lost', type: 'error' });
      });

      // The important one: react to closed candles
      this.marketData.on('priceUpdate', this._boundOnPriceUpdate);

      /* --- 3. Exchange client (for order placement) --- */
      // Only load if we have API keys + the module exists
      if (this.config.apiKeys?.apiKey && this.config.apiKeys?.apiSecret) {
        const ExchangeModule = this._pickExchangeModule();
        if (ExchangeModule) {
          try {
            this.exchange = new ExchangeModule({
              testnet: this.config.exchangeSettings?.testnet ?? true,
              apiKey: this.config.apiKeys.apiKey,
              apiSecret: this.config.apiKeys.apiSecret
            });
            this.logger.info(`Exchange client loaded: ${this.exchange.constructor.name}`);
          } catch (err) {
            this.logger.warn('Exchange client failed to load:', err.message);
          }
        }
      } else {
        this.logger.info('No API keys configured — running in PAPER mode');
      }

      /* --- 4. Initial balance --- */
      this.startBalance = await this._fetchBalance();
      this.currentBalance = this.startBalance;

      /* --- 5. Kick off market data --- */
      await this.marketData.initialize(this.pairs);

      /* --- 6. Balance monitor (light polling — WS doesn't push balance) --- */
      this._startBalanceMonitor();

      this.isRunning = true;
      this.stats.startTime = new Date();

      this.logger.info(`Bot started — ${this.startBalance.toFixed(2)} USDT, pairs: ${this.pairs.join(', ')}`);
      this.emit('status', {
        message: `Bot started · ${this.startBalance.toFixed(2)} USDT · ${this.pairs.length} pairs`,
        type: 'success'
      });
      this.emit('started');

      // Push an initial balance update
      this.emit('balance-update', this._balanceSnapshot());

    } catch (err) {
      this.logger.error('Failed to start bot:', err);
      this.emit('error', err);
      // Clean up partial state
      await this._teardown();
      throw err;
    }
  }

  async stop() {
    if (!this.isRunning) throw new Error('Bot is not running');

    this.logger.info('Stopping bot…');
    this.emit('status', { message: 'Stopping…', type: 'info' });
    this.isRunning = false;

    try {
      // Close all open positions
      if (this.positions.size > 0) {
        this.logger.info(`Closing ${this.positions.size} open position(s)…`);
        await Promise.all(
          Array.from(this.positions.keys()).map((pair) => this.forceClosePosition(pair))
        );
      }

      await this._teardown();

      this.logger.info('Bot stopped');
      this.emit('status', { message: 'Bot stopped', type: 'info' });
      this.emit('stopped');
    } catch (err) {
      this.logger.error('Error stopping bot:', err);
      this.emit('error', err);
      throw err;
    }
  }

  /** Shared cleanup for start() failure and stop() */
  async _teardown() {
    if (this.balanceTimer) {
      clearInterval(this.balanceTimer);
      this.balanceTimer = null;
    }

    if (this.marketData) {
      this.marketData.off('priceUpdate', this._boundOnPriceUpdate);
      try { await this.marketData.shutdown(); } catch {}
      this.marketData = null;
    }

    if (this.exchange?.shutdown) {
      try { await this.exchange.shutdown(); } catch {}
    }

    if (this.db) {
      try { await this.db.close(); } catch {}
      this.db = null;
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     EVENT HANDLER — called for every CLOSED candle from MarketData
     ═══════════════════════════════════════════════════════════════ */

  async _onPriceUpdate(update) {
    if (!this.isRunning) return;

    const { symbol: pair, price, change } = update;

    try {
      // Reset daily loss if the calendar day rolled over
      this._checkDailyReset();

      // Daily loss circuit breaker
      if (this.dailyLoss >= this.maxDailyLoss) {
        if (this.positions.has(pair)) {
          this.logger.warn(`Daily loss limit hit — force-closing ${pair}`);
          await this.forceClosePosition(pair);
        }
        return;
      }

      // Build candle array for the strategy
      const candles = this.marketData.getCandles(pair, 100);

      this.candleCount.set(pair, (this.candleCount.get(pair) || 0) + 1);
      this.logger.debug(
        `${pair} candle #${this.candleCount.get(pair)} — ${price} (${change >= 0 ? '+' : ''}${change.toFixed(3)}%)`
      );

      // 1) If we hold a position, check stop-loss / take-profit FIRST
      if (this.positions.has(pair)) {
        const closed = await this._checkExitConditions(pair, price);
        if (closed) return;
      }

      // 2) Ask the strategy
      const signal = await this.strategy.analyze(candles, {
        pair,
        currentPrice: price,
        volume: update.volume
      });

      if (!signal) return;

      // 3) Act on the signal
      if (signal.action === 'BUY'
          && !this.positions.has(pair)
          && (signal.confidence ?? 0) > 60) {
        await this.executeBuyOrder(pair, { ...signal, price });
      } else if (signal.action === 'SELL' && this.positions.has(pair)) {
        await this.executeSellOrder(pair, { ...signal, price });
      }

    } catch (err) {
      this.logger.error(`Error handling ${pair} update:`, err);
      this.emit('error', err);
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     ORDER EXECUTION
     ═══════════════════════════════════════════════════════════════ */

  async executeBuyOrder(pair, signal) {
    try {
      // Position sizing
      const balance = await this._fetchBalance();
      const positionUSDT = this.positionSizer.calculateSize(balance, signal.price);

      if (positionUSDT < 10) {
        this.logger.debug(`Position too small for ${pair}: ${positionUSDT.toFixed(2)} USDT`);
        return;
      }

      const quantity = positionUSDT / signal.price;

      this.logger.info(`BUY ${pair} — ${quantity.toFixed(6)} @ ~${signal.price}`);

      // Place order (paper mode if no exchange)
      const order = await this._placeOrder({
        symbol: pair,
        side: 'BUY',
        quantity,
        type: 'MARKET'
      });

      const entryPrice = order.price || signal.price;
      const filledQty = order.executedQty || quantity;

      // Compute SL/TP
      const slPct = (this.riskSettings.stopLossPercent ?? 3) / 100;
      const tpPct = (this.riskSettings.takeProfitPercent ?? 5) / 100;

      const stopLoss   = entryPrice * (1 - slPct);
      const takeProfit = entryPrice * (1 + tpPct);

      const position = {
        pair,
        side: 'BUY',
        entryPrice,
        quantity: filledQty,
        stopLoss,
        takeProfit,
        openedAt: new Date().toISOString(),
        orderId: order.orderId ?? null,
        paper: !!order.paper,
        signal: {
          confidence: signal.confidence,
          reason: signal.reason
        }
      };

      this.positions.set(pair, position);
      this.stats.totalTrades++;
      this.stats.lastUpdateTime = new Date();

      // Persist (optional)
      if (this.db?.saveTrade) {
        try {
          await this.db.saveTrade({
            pair,
            side: 'BUY',
            price: entryPrice,
            quantity: filledQty,
            timestamp: position.openedAt,
            reason: signal.reason
          });
        } catch (err) {
          this.logger.warn('DB saveTrade failed:', err.message);
        }
      }

      this.emit('trade', {
        type: 'BUY',
        pair,
        position,
        signal
      });

      this.emit('status', {
        message: `Bought ${pair} @ ${entryPrice} (SL ${stopLoss.toFixed(4)} / TP ${takeProfit.toFixed(4)})`,
        type: 'success'
      });

    } catch (err) {
      this.logger.error(`BUY order failed for ${pair}:`, err);
      this.emit('error', err);
    }
  }

  async executeSellOrder(pair, signal) {
    const position = this.positions.get(pair);
    if (!position) return;

    try {
      this.logger.info(`SELL ${pair} — ${position.quantity} @ ~${signal.price}`);

      const order = await this._placeOrder({
        symbol: pair,
        side: 'SELL',
        quantity: position.quantity,
        type: 'MARKET'
      });

      const exitPrice = order.price || signal.price;
      const pnl = (exitPrice - position.entryPrice) * position.quantity;
      const pnlPct = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;

      // Update stats
      this.stats.totalTrades++;
      if (pnl > 0) {
        this.stats.profitableTrades++;
        this.stats.totalProfit += pnl;
      } else {
        this.stats.totalLoss += Math.abs(pnl);
        this.dailyLoss += Math.abs(pnl);
      }
      this.stats.winRate = this.stats.totalTrades
        ? (this.stats.profitableTrades / this.stats.totalTrades) * 100
        : 0;
      this.stats.lastUpdateTime = new Date();

      this.positions.delete(pair);

      if (this.db?.saveTrade) {
        try {
          await this.db.saveTrade({
            pair,
            side: 'SELL',
            price: exitPrice,
            quantity: position.quantity,
            pnl,
            pnlPercent: pnlPct,
            timestamp: new Date().toISOString(),
            reason: signal.reason
          });
        } catch (err) {
          this.logger.warn('DB saveTrade failed:', err.message);
        }
      }

      this.emit('trade', {
        type: 'SELL',
        pair,
        position: { ...position, exitPrice },
        pnl,
        pnlPercent: pnlPct,
        signal
      });

      this.emit('status', {
        message: `Sold ${pair} — ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT (${pnlPct.toFixed(2)}%)`,
        type: pnl > 0 ? 'success' : 'warning'
      });

    } catch (err) {
      this.logger.error(`SELL order failed for ${pair}:`, err);
      this.emit('error', err);
    }
  }

  async _checkExitConditions(pair, currentPrice) {
    const pos = this.positions.get(pair);
    if (!pos) return false;

    if (currentPrice <= pos.stopLoss) {
      this.logger.info(`Stop-loss hit on ${pair}: ${currentPrice} ≤ ${pos.stopLoss}`);
      await this.executeSellOrder(pair, {
        action: 'SELL',
        price: currentPrice,
        reason: 'Stop Loss'
      });
      return true;
    }

    if (currentPrice >= pos.takeProfit) {
      this.logger.info(`Take-profit hit on ${pair}: ${currentPrice} ≥ ${pos.takeProfit}`);
      await this.executeSellOrder(pair, {
        action: 'SELL',
        price: currentPrice,
        reason: 'Take Profit'
      });
      return true;
    }

    return false;
  }

  async forceClosePosition(pair) {
    const pos = this.positions.get(pair);
    if (!pos) return;

    const current = this.marketData?.getCurrentPrice(pair)?.price ?? pos.entryPrice;
    await this.executeSellOrder(pair, {
      action: 'SELL',
      price: current,
      reason: 'Force close'
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     EXCHANGE PLUMBING
     ═══════════════════════════════════════════════════════════════ */

  _pickExchangeModule() {
    const name = this.config.exchangeSettings?.name || 'binance';
    const path = name === 'bybit'
      ? './exchanges/BybitClient'
      : './exchanges/BinanceClient';
    return tryRequire(path, name);
  }

  /**
   * Place a market order.
   * If no exchange is configured, returns a paper-trade fake response
   * so the rest of the pipeline (stats, DB, UI) works end-to-end.
   */
  async _placeOrder(order) {
    if (!this.exchange) {
      // PAPER TRADE — simulate immediate fill at current market price
      const md = this.marketData?.getCurrentPrice(order.symbol);
      return {
        orderId: `paper-${Date.now()}`,
        symbol: order.symbol,
        side: order.side,
        type: order.type,
        price: md?.price ?? 0,
        executedQty: order.quantity,
        status: 'FILLED',
        paper: true
      };
    }

    if (typeof this.exchange.createMarketOrder === 'function') {
      return this.exchange.createMarketOrder(order);
    }

    if (typeof this.exchange.placeOrder === 'function') {
      return this.exchange.placeOrder(order);
    }

    throw new Error('Exchange client has no order method (createMarketOrder / placeOrder)');
  }

  async _fetchBalance() {
    // If exchange offers balance, use it; else fall back to configured starting balance
    if (this.exchange?.getBalance) {
      try {
        return await this.exchange.getBalance('USDT');
      } catch (err) {
        this.logger.warn('getBalance failed:', err.message);
      }
    }
    return this.config.riskSettings?.startingBalance ?? 1000;
  }

  _balanceSnapshot() {
    const change = this.currentBalance - this.startBalance;
    return {
      current: this.currentBalance,
      start: this.startBalance,
      change,
      changePercent: this.startBalance > 0
        ? (change / this.startBalance) * 100
        : 0
    };
  }

  _startBalanceMonitor() {
    // Balance can't come from WebSocket — poll every 15s
    this.balanceTimer = setInterval(async () => {
      if (!this.isRunning) return;
      try {
        const fresh = await this._fetchBalance();
        if (Math.abs(fresh - this.currentBalance) > 0.01) {
          this.currentBalance = fresh;
          this.emit('balance-update', this._balanceSnapshot());
        }
      } catch (err) {
        this.logger.warn('Balance poll failed:', err.message);
      }
    }, 15_000);
  }

  /* ═══════════════════════════════════════════════════════════════
     DAILY LOSS CIRCUIT BREAKER
     ═══════════════════════════════════════════════════════════════ */

  _checkDailyReset() {
    const today = new Date().toDateString();
    if (today !== this.lastResetDate) {
      this.dailyLoss = 0;
      this.lastResetDate = today;
      this.logger.info('Daily loss counter reset');
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC READERS (used by IPC handlers)
     ═══════════════════════════════════════════════════════════════ */

  async getTradeHistory(limit = 100) {
    if (!this.db?.getTradeHistory) return [];
    try {
      return await this.db.getTradeHistory(limit);
    } catch (err) {
      this.logger.error('getTradeHistory failed:', err);
      return [];
    }
  }

  getStats() {
    const runTime = this.stats.startTime ? Date.now() - this.stats.startTime : 0;
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
      monitoredPairs: this.pairs.length,
      currentBalance: this.currentBalance,
      startBalance: this.startBalance
    };
  }

  getPositions() {
    return Array.from(this.positions.values()).map((pos) => {
      const live = this.marketData?.getCurrentPrice(pos.pair)?.price ?? pos.entryPrice;
      const unrealizedPnL = (live - pos.entryPrice) * pos.quantity;
      const unrealizedPnLPercent =
        ((live - pos.entryPrice) / pos.entryPrice) * 100;

      return {
        ...pos,
        currentPrice: live,
        unrealizedPnL,
        unrealizedPnLPercent
      };
    });
  }

  getCurrentPrices() {
    if (!this.marketData) return {};
    return this.marketData.getMarketSummary();
  }

  getCandles(pair, limit = 100) {
    if (!this.marketData) return [];
    return this.marketData.getCandles(pair, limit);
  }

  /** Portfolio shape matching the Portfolio.jsx component */
  getPortfolio() {
    const prices = this.getCurrentPrices();
    const positions = this.getPositions();

    const unrealized = positions.reduce((sum, p) => sum + (p.unrealizedPnL || 0), 0);
    const realized = this.stats.totalProfit - this.stats.totalLoss;
    const totalPnL = realized + unrealized;
    const totalPnLPercent = this.startBalance > 0
      ? (totalPnL / this.startBalance) * 100
      : 0;

    // Simple asset allocation — just USDT + open position notionals
    const assets = [
      { asset: 'USDT', balance: this.currentBalance.toFixed(2), usdValue: this.currentBalance, price: 1, change24h: 0 }
    ];
    for (const p of positions) {
      const notional = p.entryPrice * p.quantity;
      assets.push({
        asset: p.pair.replace('USDT', ''),
        balance: p.quantity.toFixed(6),
        usdValue: notional,
        price: p.entryPrice,
        change24h: p.unrealizedPnLPercent ?? 0
      });
    }

    return {
      totalBalance: this.currentBalance,
      totalPnL,
      totalPnLPercent,
      assets,
      positions: positions.map((p) => ({
        symbol: p.pair,
        side: p.side === 'BUY' ? 'long' : 'short',
        size: p.quantity,
        entryPrice: p.entryPrice,
        markPrice: p.currentPrice,
        unrealizedPnl: p.unrealizedPnL,
        pnlPercent: p.unrealizedPnLPercent
      }))
    };
  }

  /* ═══════════════════════════════════════════════════════════════
     CONFIG UPDATES + EMERGENCY STOP
     ═══════════════════════════════════════════════════════════════ */

  async updateConfig(newConfig = {}) {
    this.config = { ...this.config, ...newConfig };

    if (newConfig.strategySettings && this.strategy.updateSettings) {
      this.strategy.updateSettings(newConfig.strategySettings);
    }
    if (newConfig.riskSettings) {
      this.riskSettings = { ...this.riskSettings, ...newConfig.riskSettings };
      if (this.positionSizer.updateSettings) {
        this.positionSizer.updateSettings(this.riskSettings);
      }
      this.maxDailyLoss = this.riskSettings.maxDailyLoss ?? this.maxDailyLoss;
    }

    // Reconcile pairs if running
    if (newConfig.tradingPairs && this.marketData) {
      const oldSet = new Set(this.pairs);
      const newSet = new Set(newConfig.tradingPairs);

      for (const p of oldSet) if (!newSet.has(p)) await this.marketData.removeSymbol(p);
      for (const p of newSet) if (!oldSet.has(p)) await this.marketData.addSymbol(p);

      this.pairs = newConfig.tradingPairs;
    }

    this.logger.info('Config updated');
    this.emit('config-updated', this.config);
  }

  async emergencyStop() {
    this.logger.warn('🚨 Emergency stop initiated');
    this.emit('status', { message: 'Emergency stop initiated', type: 'error' });

    try {
      await Promise.all(
        Array.from(this.positions.keys()).map((pair) => this.forceClosePosition(pair))
      );
      await this.stop();
      this.emit('status', { message: 'Emergency stop completed', type: 'info' });
    } catch (err) {
      this.logger.error('Emergency stop failed:', err);
      this.emit('error', err);
    }
  }
}

module.exports = TradingBot;