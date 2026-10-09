'use strict';

const EventEmitter = require('events');
const crypto       = require('crypto');
const WebSocket    = require('ws');

class BinanceClient extends EventEmitter {
  constructor(config = {}) {
    super();

    this.testnet   = config.testnet ?? false;
    this.apiKey    = config.apiKey || null;
    this.apiSecret = config.apiSecret || null;
    this.recvWindow = 5000;

    // REST endpoints
    this.restBase = this.testnet
      ? 'https://testnet.binance.vision'
      : 'https://api.binance.com';

    // WS endpoints
    this.wsBase = this.testnet
      ? 'wss://stream.testnet.binance.vision'
      : 'wss://stream.binance.com:9443';

    this.fetchTimeout = 15000;

    // WS state
    this.ws = null;
    this.wsReady = false;
    this.wsReconnectTimer = null;
    this.wsReconnectAttempts = 0;
    this.maxWsReconnectAttempts = 10;
    this.klineCallbacks = new Map();
    this.symbolIntervals = new Map();

    // Server-time offset (ms). Binance rejects requests >1000ms off.
    this._timeOffset = 0;
    this._timeSyncedAt = 0;
  }

  /* ═══════════════════════════════════════════════════════════
     SIGNING
     ═══════════════════════════════════════════════════════════ */

  /** Sync local clock with Binance server time. */
  async _syncTime() {
    // Only re-sync every 30 minutes
    if (Date.now() - this._timeSyncedAt < 30 * 60 * 1000) return;

    try {
      const r = await this._fetchPublic('/api/v3/time');
      if (r?.serverTime) {
        this._timeOffset = r.serverTime - Date.now();
        this._timeSyncedAt = Date.now();
      }
    } catch (err) {
      console.warn('[Binance] Time sync failed:', err.message);
    }
  }

  _timestamp() {
    return Date.now() + this._timeOffset;
  }

  _sign(queryString) {
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(queryString)
      .digest('hex');
  }

  _requireKeys() {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error('Binance API keys not configured');
    }
  }

  /* ═══════════════════════════════════════════════════════════
     HTTP HELPERS
     ═══════════════════════════════════════════════════════════ */

  async _fetchPublic(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.fetchTimeout);
    try {
      const r = await fetch(`${this.restBase}${path}`, { signal: controller.signal });
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        throw new Error(`Binance REST ${r.status}: ${text.slice(0, 200)}`);
      }
      return r.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async _fetchSigned(method, path, params = {}) {
    this._requireKeys();
    await this._syncTime();

    const signed = {
      ...params,
      timestamp: this._timestamp(),
      recvWindow: this.recvWindow
    };
    const query = new URLSearchParams(signed).toString();
    const signature = this._sign(query);
    const url = `${this.restBase}${path}?${query}&signature=${signature}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.fetchTimeout);
    try {
      const r = await fetch(url, {
        method,
        headers: {
          'X-MBX-APIKEY': this.apiKey
        },
        signal: controller.signal
      });
      const text = await r.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }

      if (!r.ok) {
        // Binance returns { code, msg }
        const msg = data?.msg || data?.raw || `HTTP ${r.status}`;
        const code = data?.code;
        throw new Error(`Binance ${r.status}${code ? ` [${code}]` : ''}: ${msg}`);
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ═══════════════════════════════════════════════════════════
     PUBLIC API — account info
     ═══════════════════════════════════════════════════════════ */

  async getAccountInfo() {
    return this._fetchSigned('GET', '/api/v3/account');
  }

  /** Get balance for one asset (e.g. 'USDT'). Returns free amount as Number. */
  async getBalance(asset = 'USDT') {
    const info = await this.getAccountInfo();
    const bal = (info.balances || []).find(
      (b) => b.asset.toUpperCase() === asset.toUpperCase()
    );
    return bal ? parseFloat(bal.free) : 0;
  }

  /** Get all non-zero balances. */
  async getAllBalances() {
    const info = await this.getAccountInfo();
    return (info.balances || [])
      .filter((b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
      .map((b) => ({
        asset:  b.asset,
        free:   parseFloat(b.free),
        locked: parseFloat(b.locked)
      }));
  }

  /* ═══════════════════════════════════════════════════════════
     PUBLIC API — market data
     ═══════════════════════════════════════════════════════════ */

  async getTickerPrice(symbol) {
    return this._fetchPublic(`/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`);
  }

  async getKlines(symbol, interval = '5m', limit = 200) {
    const url = `/api/v3/klines?symbol=${encodeURIComponent(symbol)}` +
                `&interval=${interval}&limit=${Math.min(limit, 1000)}`;
    const raw = await this._fetchPublic(url);
    if (!Array.isArray(raw)) throw new Error('Binance klines: unexpected shape');
    return raw.map((c) => ({
      openTime:  c[0],
      open:      c[1],
      high:      c[2],
      low:       c[3],
      close:     c[4],
      volume:    c[5],
      closeTime: c[6]
    }));
  }

  async getExchangeInfo(symbol = null) {
    const path = symbol
      ? `/api/v3/exchangeInfo?symbol=${encodeURIComponent(symbol)}`
      : '/api/v3/exchangeInfo';
    return this._fetchPublic(path);
  }

  /* ═══════════════════════════════════════════════════════════
     TEST CONNECTION
     ═══════════════════════════════════════════════════════════ */

  async testConnection() {
    try {
      // 1. Public API reachable?
      const price = await this.getTickerPrice('BTCUSDT');
      const priceNum = parseFloat(price?.price || 0);

      // 2. Authenticated API reachable?
      if (this.apiKey && this.apiSecret) {
        await this.getAccountInfo();
        return {
          success: true,
          price: priceNum,
          authenticated: true,
          testnet: this.testnet
        };
      }

      return {
        success: true,
        price: priceNum,
        authenticated: false,
        testnet: this.testnet,
        warning: 'Public endpoints only — no API keys'
      };
    } catch (err) {
      // Common errors — translate to friendly messages
      let message = err.message;
      if (/Invalid API-key/i.test(message)) message = 'Invalid API key — check for typos';
      if (/Signature/i.test(message))          message = 'Invalid signature — secret may be wrong';
      if (/IP/i.test(message))                 message = 'Your IP is not whitelisted on Binance';
      if (/Timestamp/i.test(message))          message = 'Clock skew — try again';
      return { success: false, error: message };
    }
  }

  /* ═══════════════════════════════════════════════════════════
     ORDER PLACEMENT
     ═══════════════════════════════════════════════════════════ */

  /**
   * Place an order. Matches the shape expected by TradingBot:
   *   createMarketOrder({ symbol, side, quantity, type })
   */
  async createMarketOrder(order) {
    const { symbol, side, quantity, type = 'MARKET' } = order;

    if (!symbol || !side || !quantity) {
      throw new Error('createMarketOrder: symbol, side, quantity required');
    }

    // Binance requires quantity precision to match the symbol's LOT_SIZE step
    const qty = await this._roundToStepSize(symbol, quantity);

    const params = {
      symbol,
      side:     String(side).toUpperCase(),   // BUY or SELL
      type:     String(type).toUpperCase(),
      quantity: qty
    };

    const res = await this._fetchSigned('POST', '/api/v3/order', params);

    // Normalize to TradingBot's expected response
    return {
      orderId:     res.orderId,
      clientOrderId: res.clientOrderId,
      symbol:      res.symbol,
      side:        res.side,
      type:        res.type,
      status:      res.status,
      price:       res.fills?.[0] ? parseFloat(res.fills[0].price) : null,
      executedQty: parseFloat(res.executedQty || qty),
      cummulativeQuoteQty: parseFloat(res.cummulativeQuoteQty || 0),
      fills:       res.fills || []
    };
  }

  /**
   * Round quantity DOWN to the symbol's stepSize.
   * Binance rejects orders that don't align with LOT_SIZE.
   */
  async _roundToStepSize(symbol, quantity) {
    try {
      const info = await this.getExchangeInfo(symbol);
      const filter = info?.symbols?.[0]?.filters?.find(
        (f) => f.filterType === 'LOT_SIZE'
      );
      if (!filter) return quantity;

      const stepSize = parseFloat(filter.stepSize);
      if (!stepSize || stepSize <= 0) return quantity;

      const precision = Math.round(-Math.log10(stepSize));
      const rounded = Math.floor(quantity / stepSize) * stepSize;

      return parseFloat(rounded.toFixed(precision));
    } catch (err) {
      console.warn('[Binance] stepSize lookup failed:', err.message);
      // Fallback: 6 decimals — safe for BTC/ETH
      return parseFloat(quantity.toFixed(6));
    }
  }

  /* ═══════════════════════════════════════════════════════════
     WEBSOCKET — real-time klines (only CLOSED candles emitted)
     ═══════════════════════════════════════════════════════════ */

  async subscribeTicker(symbol, callback, options = {}) {
    const interval = options.interval || '5m';
    const sym = symbol.toUpperCase();

    if (!this.klineCallbacks.has(sym)) this.klineCallbacks.set(sym, new Set());
    this.klineCallbacks.get(sym).add(callback);
    this.symbolIntervals.set(sym, interval);

    await this._rebuildWebSocket();
    return true;
  }

  async unsubscribeTicker(symbol) {
    const sym = symbol.toUpperCase();
    this.klineCallbacks.delete(sym);
    this.symbolIntervals.delete(sym);
    await this._rebuildWebSocket();
  }

  async _rebuildWebSocket() {
    if (this.ws) {
      this.ws.removeAllListeners();
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }
    if (this.klineCallbacks.size === 0) return;

    const streams = [];
    for (const [sym, interval] of this.symbolIntervals.entries()) {
      streams.push(`${sym.toLowerCase()}@kline_${interval}`);
    }
    const url = `${this.wsBase}/stream?streams=${streams.join('/')}`;

    console.log(`[Binance] WS connecting (${streams.length} streams)`);
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      this.wsReady = true;
      this.wsReconnectAttempts = 0;
      console.log('[Binance] WS connected');
    });

    this.ws.on('message', (buf) => {
      let msg;
      try { msg = JSON.parse(buf.toString()); } catch { return; }
      const p = msg.data ?? msg;
      if (p?.e !== 'kline') return;
      const k = p.k;
      if (!k?.x) return; // not closed

      const candle = {
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

      const cbs = this.klineCallbacks.get(p.s);
      if (cbs) cbs.forEach((cb) => {
        try { cb(candle); } catch (e) { console.error('[Binance] cb error:', e); }
      });
    });

    this.ws.on('error', (err) => {
      console.error('[Binance] WS error:', err.message);
    });

    this.ws.on('close', () => {
      this.wsReady = false;
      this._scheduleWsReconnect();
    });
  }

  _scheduleWsReconnect() {
    if (this.klineCallbacks.size === 0) return;
    if (this.wsReconnectAttempts >= this.maxWsReconnectAttempts) return;

    this.wsReconnectAttempts++;
    const delay = Math.min(1000 * 2 ** (this.wsReconnectAttempts - 1), 30000);
    this.wsReconnectTimer = setTimeout(() => this._rebuildWebSocket(), delay);
  }

  /* ═══════════════════════════════════════════════════════════
     LIFECYCLE
     ═══════════════════════════════════════════════════════════ */

  async shutdown() {
    if (this.wsReconnectTimer) clearTimeout(this.wsReconnectTimer);
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