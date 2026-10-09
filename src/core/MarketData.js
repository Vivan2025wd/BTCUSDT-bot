// src/core/MarketData.js
'use strict';

const EventEmitter = require('events');
const WebSocket = require('ws');

/* ═══════════════════════════════════════════════════════════════
   EXCHANGE ADAPTERS
   Each adapter knows how to:
     - fetch historical klines (REST)
     - build a WebSocket URL
     - subscribe to kline streams
     - parse incoming messages
   ═══════════════════════════════════════════════════════════════ */

const ADAPTERS = {
  binance: {
    name: 'binance',

    restUrl: (testnet) =>
      testnet ? 'https://testnet.binance.vision' : 'https://api.binance.com',

    wsUrl: (testnet) =>
      testnet
        ? 'wss://stream.testnet.binance.vision'
        : 'wss://stream.binance.com:9443',

    async fetchKlines({ symbol, interval, limit, testnet }) {
      const base = this.restUrl(testnet);
      const url = `${base}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${Math.min(limit, 1000)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Binance REST ${res.status}`);
      const raw = await res.json();
      return raw.map((c) => ({
        openTime:  c[0],
        open:      parseFloat(c[1]),
        high:      parseFloat(c[2]),
        low:       parseFloat(c[3]),
        close:     parseFloat(c[4]),
        volume:    parseFloat(c[5]),
        closeTime: c[6],
        interval,
        closed: true
      }));
    },

    // Combined stream: /stream?streams=btcusdt@kline_5m/ethusdt@kline_5m
    buildStreamUrl({ testnet, symbols, interval }) {
      const base = this.wsUrl(testnet);
      const streams = symbols.map((s) => `${s.toLowerCase()}@kline_${interval}`).join('/');
      return `${base}/stream?streams=${streams}`;
    },

    // Returns a normalized candle if the message is a CLOSED kline, else null
    parseMessage(msg) {
      const p = msg.data ?? msg;
      if (p?.e !== 'kline') return null;
      const k = p.k;
      if (!k?.x) return null; // not closed
      return {
        symbol:    p.s,
        openTime:  k.t,
        closeTime: k.T,
        open:      parseFloat(k.o),
        high:      parseFloat(k.h),
        low:       parseFloat(k.l),
        close:     parseFloat(k.c),
        volume:    parseFloat(k.v),
        interval:  k.i,
        closed:    true
      };
    },

    ping() { return null; }
  },

  bybit: {
    name: 'bybit',

    restUrl: (testnet) =>
      testnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com',

    wsUrl: (testnet) =>
      testnet
        ? 'wss://stream-testnet.bybit.com/v5/public/spot'
        : 'wss://stream.bybit.com/v5/public/spot',

    // Bybit uses "5" for 5m, "60" for 1h, "D" for 1d
    mapInterval(tf) {
      const m = {
        '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
        '1h': '60', '2h': '120', '4h': '240', '6h': '360', '12h': '720',
        '1d': 'D', '1w': 'W', '1M': 'M'
      };
      return m[tf] || tf;
    },

    async fetchKlines({ symbol, interval, limit, testnet }) {
      const base = this.restUrl(testnet);
      const iv = this.mapInterval(interval);
      const url = `${base}/v5/market/kline?category=spot&symbol=${symbol}&interval=${iv}&limit=${Math.min(limit, 1000)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Bybit REST ${res.status}`);
      const json = await res.json();
      if (json.retCode !== 0) throw new Error(`Bybit: ${json.retMsg}`);
      const list = json.result?.list ?? [];
      // newest first → reverse
      return list.reverse().map((c) => ({
        openTime:  parseInt(c[0], 10),
        open:      parseFloat(c[1]),
        high:      parseFloat(c[2]),
        low:       parseFloat(c[3]),
        close:     parseFloat(c[4]),
        volume:    parseFloat(c[5]),
        closeTime: parseInt(c[0], 10) + 60_000,
        interval,
        closed: true
      }));
    },

    buildStreamUrl({ testnet }) {
      return this.wsUrl(testnet);
    },

    // Bybit sends subscription commands — we must send them after open
    subscriptionMessage({ symbols, interval }) {
      const iv = this.mapInterval(interval);
      return JSON.stringify({
        op: 'subscribe',
        args: symbols.map((s) => `kline.${iv}.${s}`)
      });
    },

    parseMessage(msg) {
      if (msg.op === 'pong') return null;
      if (!msg.topic?.startsWith('kline.')) return null;
      const k = msg.data?.[0];
      if (!k?.confirm) return null;
      return {
        symbol:    k.symbol,
        openTime:  k.start,
        closeTime: k.end,
        open:      parseFloat(k.open),
        high:      parseFloat(k.high),
        low:       parseFloat(k.low),
        close:     parseFloat(k.close),
        volume:    parseFloat(k.volume),
        interval:  k.interval,
        closed:    true
      };
    },

    // Bybit requires ping every 20s
    ping(ws) {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ op: 'ping' })); } catch {}
      }
    }
  }
};

/* ═══════════════════════════════════════════════════════════════
   MARKET DATA
   ═══════════════════════════════════════════════════════════════ */

class MarketData extends EventEmitter {
  constructor(config = {}) {
    super();

    this.exchange = config.exchange || 'binance';
    this.testnet = config.testnet ?? false;
    this.interval = config.interval || '5m';
    this.historyLimit = config.historyLimit || 200;

    if (!ADAPTERS[this.exchange]) {
      throw new Error(`Unsupported exchange: ${this.exchange}`);
    }
    this.adapter = ADAPTERS[this.exchange];

    // Data stores
    this.priceData = new Map();      // symbol -> latest tick
    this.historicalData = new Map(); // symbol -> [candles]
    this.dataBuffers = new Map();    // symbol -> { prices, volumes, ... }
    this.lastUpdate = new Map();     // symbol -> timestamp
    this.subscriptions = new Set();  // subscribed symbols

    // WS state
    this.ws = null;
    this.wsReady = false;
    this.wsReconnectAttempts = 0;
    this.maxWsReconnectAttempts = 10;
    this.wsReconnectTimer = null;
    this.pingTimer = null;

    // Metrics
    this.metrics = {
      totalUpdates: 0,
      latencySum: 0,
      updateCount: 0
    };

    this.isConnected = false;
  }

  /* ═══════════════════════════════════════════════════════════════
     PUBLIC API
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Initialize — fetch history + open WebSocket.
   * @param {string|Array<string>} symbols
   */
  async initialize(symbols) {
    const list = Array.isArray(symbols) ? symbols : [symbols];

    try {
      // 1. Load history for each symbol (parallel)
      await Promise.all(list.map((s) => this.loadHistoricalData(s)));

      // 2. Register subscriptions + open WS
      list.forEach((s) => this.subscriptions.add(s));
      await this._openWebSocket();

      this.isConnected = true;
      this.emit('connected');
      console.log(`📊 MarketData[${this.exchange}] ready — ${list.join(', ')} @ ${this.interval}`);
    } catch (err) {
      console.error('❌ MarketData init failed:', err.message);
      this.emit('error', err);
      throw err;
    }
  }

  /**
   * Fetch history for a symbol.
   */
  async loadHistoricalData(symbol, interval = this.interval, limit = this.historyLimit) {
    console.log(`📈 ${this.exchange} klines: ${symbol} ${interval} × ${limit}`);

    const candles = await this.adapter.fetchKlines({
      symbol, interval, limit, testnet: this.testnet
    });

    if (!candles?.length) {
      throw new Error(`No candles for ${symbol}`);
    }

    this.historicalData.set(symbol, candles);
    this._initBuffer(symbol, candles);

    const last = candles[candles.length - 1];
    this._updatePrice(symbol, {
      price: last.close,
      open: last.open,
      high: last.high,
      low: last.low,
      volume: last.volume,
      timestamp: last.closeTime,
      closeTime: last.closeTime,
      openTime: last.openTime,
      interval
    });

    this.emit('historicalDataLoaded', { symbol, count: candles.length });
    return candles;
  }

  /**
   * Add a new symbol live.
   */
  async addSymbol(symbol) {
    if (this.subscriptions.has(symbol)) return;

    await this.loadHistoricalData(symbol);
    this.subscriptions.add(symbol);

    // Rebuild WS with the new subscription set
    await this._openWebSocket();

    this.emit('symbolAdded', symbol);
  }

  /**
   * Remove a symbol.
   */
  async removeSymbol(symbol) {
    if (!this.subscriptions.has(symbol)) return;

    this.subscriptions.delete(symbol);
    this.priceData.delete(symbol);
    this.dataBuffers.delete(symbol);
    this.historicalData.delete(symbol);
    this.lastUpdate.delete(symbol);

    await this._openWebSocket(); // rebuild with one less symbol
    this.emit('symbolRemoved', symbol);
  }

  /* ═══════════════════════════════════════════════════════════════
     GETTERS
     ═══════════════════════════════════════════════════════════════ */

  getCurrentPrice(symbol) {
    return this.priceData.get(symbol) || null;
  }

  getHistoricalData(symbol, limit = 100) {
    const data = this.historicalData.get(symbol) || [];
    return limit ? data.slice(-limit) : data;
  }

  /**
   * Get an array from the rolling buffer.
   * type: 'prices' | 'volumes' | 'highs' | 'lows' | 'opens'
   */
  getPriceData(symbol, type = 'prices', periods = 50) {
    const buf = this.dataBuffers.get(symbol);
    if (!buf || !buf[type]) return [];
    return periods ? buf[type].slice(-periods) : buf[type];
  }

  /**
   * Full OHLC candles reconstructed from the buffer.
   * Useful for indicator modules that need candles, not just closes.
   */
  getCandles(symbol, periods = 100) {
    const buf = this.dataBuffers.get(symbol);
    if (!buf) return [];
    const n = Math.min(periods, buf.prices.length);
    const out = [];
    for (let i = buf.prices.length - n; i < buf.prices.length; i++) {
      out.push({
        open: buf.opens[i],
        high: buf.highs[i],
        low: buf.lows[i],
        close: buf.prices[i],
        volume: buf.volumes[i]
      });
    }
    return out;
  }

  isDataStale(symbol, maxAge = 60_000) {
    const last = this.lastUpdate.get(symbol);
    return !last || Date.now() - last > maxAge;
  }

  getMarketSummary() {
    const out = {};
    for (const [symbol, d] of this.priceData) {
      out[symbol] = {
        price: d.price,
        change: d.change ?? 0,
        volume: d.volume,
        lastUpdate: d.timestamp,
        isStale: this.isDataStale(symbol)
      };
    }
    return out;
  }

  getMetrics() {
    return {
      ...this.metrics,
      averageLatency: this.metrics.updateCount
        ? this.metrics.latencySum / this.metrics.updateCount
        : 0,
      isConnected: this.isConnected,
      wsConnected: this.wsReady,
      subscriptions: this.subscriptions.size,
      exchange: this.exchange,
      interval: this.interval
    };
  }

  /* ═══════════════════════════════════════════════════════════════
     WEBSOCKET
     ═══════════════════════════════════════════════════════════════ */

  async _openWebSocket() {
    // Close any existing socket
    if (this.ws) {
      this.ws.removeAllListeners();
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }

    if (this.subscriptions.size === 0) return;

    const symbols = Array.from(this.subscriptions);
    const url = this.adapter.buildStreamUrl({
      testnet: this.testnet,
      symbols,
      interval: this.interval
    });

    console.log(`🔌 [${this.exchange}] WS → ${symbols.length} symbol(s)`);

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      this.wsReady = true;
      this.wsReconnectAttempts = 0;
      console.log(`✅ [${this.exchange}] WS connected`);
      this.emit('ws-open');

      // Bybit needs an explicit subscribe command
      if (this.adapter.subscriptionMessage) {
        try {
          this.ws.send(this.adapter.subscriptionMessage({
            symbols,
            interval: this.interval
          }));
        } catch (err) {
          console.error('WS subscribe failed:', err.message);
        }
      }

      // Bybit needs periodic ping
      if (this.adapter.ping) {
        this.pingTimer = setInterval(() => {
          try { this.adapter.ping(this.ws); } catch {}
        }, 20_000);
      }
    });

    this.ws.on('message', (buf) => {
      let msg;
      try { msg = JSON.parse(buf.toString()); } catch { return; }

      const candle = this.adapter.parseMessage(msg);
      if (candle) this._handleCandle(candle);
    });

    this.ws.on('error', (err) => {
      console.error(`[${this.exchange}] WS error:`, err.message);
      this.emit('ws-error', err);
    });

    this.ws.on('close', (code, reason) => {
      this.wsReady = false;
      if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
      console.warn(`[${this.exchange}] WS closed (${code} ${reason || ''})`);
      this.emit('ws-close', { code });
      this._scheduleReconnect();
    });
  }

  _scheduleReconnect() {
    if (this.subscriptions.size === 0) return;

    if (this.wsReconnectAttempts >= this.maxWsReconnectAttempts) {
      console.error(`[${this.exchange}] Max WS reconnects reached`);
      this.emit('ws-give-up');
      return;
    }

    this.wsReconnectAttempts++;
    const delay = Math.min(1000 * 2 ** (this.wsReconnectAttempts - 1), 30_000);
    console.log(`[${this.exchange}] Reconnect in ${delay}ms (attempt ${this.wsReconnectAttempts})`);

    this.wsReconnectTimer = setTimeout(() => {
      this._openWebSocket().catch((err) => console.error('Reconnect failed:', err.message));
    }, delay);
  }

  /* ═══════════════════════════════════════════════════════════════
     DATA HANDLING
     ═══════════════════════════════════════════════════════════════ */

  _handleCandle(candle) {
    const { symbol } = candle;

    // Compute change vs previous close
    const prev = this.priceData.get(symbol);
    const change = prev?.price
      ? ((candle.close - prev.price) / prev.price) * 100
      : 0;

    const priceData = {
      price: candle.close,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      volume: candle.volume,
      change,
      symbol,
      timestamp: candle.closeTime || Date.now(),
      openTime: candle.openTime,
      closeTime: candle.closeTime,
      interval: candle.interval,
      closed: true
    };

    this._updatePrice(symbol, priceData);
    this._updateBuffer(symbol, priceData);

    // Latency
    if (candle.closeTime) {
      const latency = Date.now() - candle.closeTime;
      this.metrics.totalUpdates++;
      this.metrics.updateCount++;
      this.metrics.latencySum += Math.max(latency, 0);
    }

    // Append to historical list too
    const hist = this.historicalData.get(symbol) || [];
    hist.push(candle);
    if (hist.length > 1000) hist.shift();
    this.historicalData.set(symbol, hist);

    this.emit('priceUpdate', priceData);
    this.emit('candle', { symbol, candle });
  }

  _updatePrice(symbol, data) {
    const existing = this.priceData.get(symbol) || {};
    this.priceData.set(symbol, { ...existing, ...data });
    this.lastUpdate.set(symbol, data.timestamp || Date.now());
  }

  _initBuffer(symbol, candles) {
    const buf = {
      prices: [],
      volumes: [],
      highs: [],
      lows: [],
      opens: [],
      maxSize: 500
    };
    for (const c of candles) {
      buf.prices.push(c.close);
      buf.volumes.push(c.volume);
      buf.highs.push(c.high);
      buf.lows.push(c.low);
      buf.opens.push(c.open);
    }
    this.dataBuffers.set(symbol, buf);
  }

  _updateBuffer(symbol, data) {
    const buf = this.dataBuffers.get(symbol);
    if (!buf) return;

    buf.prices.push(data.price);
    buf.volumes.push(data.volume);
    buf.highs.push(data.high);
    buf.lows.push(data.low);
    buf.opens.push(data.open);

    if (buf.prices.length > buf.maxSize) {
      buf.prices.shift();
      buf.volumes.shift();
      buf.highs.shift();
      buf.lows.shift();
      buf.opens.shift();
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     SHUTDOWN
     ═══════════════════════════════════════════════════════════════ */

  async shutdown() {
    console.log('🛑 MarketData shutdown…');

    if (this.wsReconnectTimer) { clearTimeout(this.wsReconnectTimer); this.wsReconnectTimer = null; }
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.ws) {
      this.ws.removeAllListeners();
      try { this.ws.close(); } catch {}
      this.ws = null;
    }

    this.subscriptions.clear();
    this.priceData.clear();
    this.dataBuffers.clear();
    this.historicalData.clear();
    this.lastUpdate.clear();

    this.isConnected = false;
    this.wsReady = false;
    this.emit('shutdown');
    console.log('✅ MarketData shut down');
  }
}

module.exports = MarketData;