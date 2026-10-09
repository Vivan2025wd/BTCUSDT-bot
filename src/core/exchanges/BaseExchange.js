'use strict';

const EventEmitter = require('events');
const WebSocket = require('ws');

class BinanceClient extends EventEmitter {
  constructor(config = {}) {
    super();

    this.testnet = config.testnet ?? false;
    this.apiKey = config.apiKey ?? null;
    this.apiSecret = config.apiSecret ?? null;

    // Public REST + WS endpoints
    this.restBase = this.testnet
      ? 'https://testnet.binance.vision'
      : 'https://api.binance.com';
    this.wsBase = this.testnet
      ? 'wss://stream.testnet.binance.vision'
      : 'wss://stream.binance.com:9443';

    // WS state
    this.ws = null;
    this.wsReady = false;
    this.wsReconnectTimer = null;
    this.wsReconnectAttempts = 0;
    this.maxWsReconnectAttempts = 10;

    // Subscriptions: symbol -> Set<callback>
    this.klineCallbacks = new Map();
    // symbol -> interval (current timeframe for that symbol)
    this.symbolIntervals = new Map();

    // HTTP timeout for fetch
    this.fetchTimeout = 15000;
  }

  /* ═══════════════════════════════════════════════════════════════
     REST — historical klines
     ═══════════════════════════════════════════════════════════════ */

  async getKlines(symbol, interval = '5m', limit = 200) {
    const url =
      `${this.restBase}/api/v3/klines` +
      `?symbol=${encodeURIComponent(symbol)}` +
      `&interval=${encodeURIComponent(interval)}` +
      `&limit=${Math.min(limit, 1000)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.fetchTimeout);

    let res;
    try {
      res = await fetch(url, { signal: controller.signal });
    } catch (err) {
      throw new Error(`Binance REST unreachable: ${err.message}`);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Binance REST ${res.status}: ${text.slice(0, 200)}`);
    }

    const raw = await res.json();
    if (!Array.isArray(raw)) {
      throw new Error('Binance REST: unexpected response shape');
    }

    // Map Binance's array-of-arrays to named fields
    return raw.map((c) => ({
      openTime:  c[0],
      open:      c[1],
      high:      c[2],
      low:       c[3],
      close:     c[4],
      volume:    c[5],
      closeTime: c[6],
      quoteVolume: c[7],
      trades:    c[8]
    }));
  }

  /* ═══════════════════════════════════════════════════════════════
     REST — 24h ticker (for exchange test / status)
     ═══════════════════════════════════════════════════════════════ */

  async getTickerPrice(symbol) {
    const url = `${this.restBase}/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Binance ticker ${res.status}`);
    return res.json();
  }

  async testConnection() {
    try {
      const r = await this.getTickerPrice('BTCUSDT');
      return { success: true, price: parseFloat(r.price) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     WebSocket — kline stream
     subscribeTicker(symbol, cb, { interval }) — cb fires on CLOSED candle only
     ═══════════════════════════════════════════════════════════════ */

  async subscribeTicker(symbol, callback, options = {}) {
    const interval = options.interval || '5m';
    const sym = symbol.toUpperCase();

    // Register callback
    if (!this.klineCallbacks.has(sym)) {
      this.klineCallbacks.set(sym, new Set());
    }
    this.klineCallbacks.get(sym).add(callback);

    // Track interval for this symbol
    this.symbolIntervals.set(sym, interval);

    // (Re)build the WebSocket with the new subscription set
    await this._rebuildWebSocket();

    return true;
  }

  async unsubscribeTicker(symbol) {
    const sym = symbol.toUpperCase();
    this.klineCallbacks.delete(sym);
    this.symbolIntervals.delete(sym);
    await this._rebuildWebSocket();
  }

  /* ═══════════════════════════════════════════════════════════════
     WS internals
     ═══════════════════════════════════════════════════════════════ */

  async _rebuildWebSocket() {
    // Close existing
    if (this.ws) {
      this.ws.removeAllListeners();
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }

    // Nothing to subscribe to
    if (this.klineCallbacks.size === 0) return;

    // Build combined stream URL
    // Example: /stream?streams=btcusdt@kline_5m/ethusdt@kline_5m
    const streams = [];
    for (const [sym, interval] of this.symbolIntervals.entries()) {
      streams.push(`${sym.toLowerCase()}@kline_${interval}`);
    }
    const url = `${this.wsBase}/stream?streams=${streams.join('/')}`;

    console.log(`[BinanceClient] Connecting WS (${streams.length} streams)…`);

    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      console.log('[BinanceClient] WS connected');
      this.wsReady = true;
      this.wsReconnectAttempts = 0;
      this.emit('ws-open');
    });

    this.ws.on('message', (buf) => this._handleWsMessage(buf));

    this.ws.on('ping', () => {
      // Respond with pong (ws lib usually does this automatically)
      try { this.ws.pong(); } catch {}
    });

    this.ws.on('error', (err) => {
      console.error('[BinanceClient] WS error:', err.message);
      this.emit('ws-error', err);
    });

    this.ws.on('close', (code, reason) => {
      this.wsReady = false;
      console.warn(`[BinanceClient] WS closed (${code} ${reason || ''})`);
      this.emit('ws-close', { code, reason: reason?.toString() });
      this._scheduleWsReconnect();
    });
  }

  _scheduleWsReconnect() {
    if (this.klineCallbacks.size === 0) return; // nothing to reconnect for
    if (this.wsReconnectAttempts >= this.maxWsReconnectAttempts) {
      console.error('[BinanceClient] Max WS reconnect attempts reached');
      this.emit('ws-give-up');
      return;
    }

    this.wsReconnectAttempts++;
    // Exponential backoff: 1s, 2s, 4s, 8s … capped at 30s
    const delay = Math.min(1000 * 2 ** (this.wsReconnectAttempts - 1), 30000);

    console.log(`[BinanceClient] Reconnecting in ${delay}ms (attempt ${this.wsReconnectAttempts})`);
    this.wsReconnectTimer = setTimeout(() => this._rebuildWebSocket(), delay);
  }

  _handleWsMessage(buf) {
    let msg;
    try {
      msg = JSON.parse(buf.toString());
    } catch {
      return;
    }

    // Combined stream format: { stream, data }
    const payload = msg.data ?? msg;
    if (!payload?.e) return;

    if (payload.e === 'kline') {
      const k = payload.k;
      const symbol = payload.s;

      // Only emit when the candle is CLOSED
      if (!k.x) return;

      const candle = {
        symbol,
        openTime:  k.t,
        closeTime: k.T,
        open:      parseFloat(k.o),
        high:      parseFloat(k.h),
        low:       parseFloat(k.l),
        close:     parseFloat(k.c),
        volume:    parseFloat(k.v),
        quoteVolume: parseFloat(k.q),
        trades:    k.n,
        interval:  k.i,
        closed:    k.x
      };

      // Notify all callbacks for this symbol
      const callbacks = this.klineCallbacks.get(symbol);
      if (callbacks) {
        for (const cb of callbacks) {
          try { cb(candle); }
          catch (err) {
            console.error(`[BinanceClient] callback error for ${symbol}:`, err);
          }
        }
      }

      this.emit('kline', candle);
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     Lifecycle
     ═══════════════════════════════════════════════════════════════ */

  async shutdown() {
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    this.klineCallbacks.clear();
    this.symbolIntervals.clear();
    this.wsReady = false;
  }
}

module.exports = BinanceClient;