'use strict';

const EventEmitter = require('events');
const crypto       = require('crypto');
const WebSocket    = require('ws');

class BybitClient extends EventEmitter {
  constructor(config = {}) {
    super();

    this.testnet   = config.testnet ?? false;
    this.apiKey    = config.apiKey || null;
    this.apiSecret = config.apiSecret || null;
    this.recvWindow = 5000;

    this.restBase = this.testnet
      ? 'https://api-testnet.bybit.com'
      : 'https://api.bybit.com';

    this.wsBase = this.testnet
      ? 'wss://stream-testnet.bybit.com/v5/public/spot'
      : 'wss://stream.bybit.com/v5/public/spot';

    this.fetchTimeout = 15000;

    this.ws = null;
    this.wsReady = false;
    this.wsReconnectTimer = null;
    this.wsReconnectAttempts = 0;
    this.maxWsReconnectAttempts = 10;
    this.klineCallbacks = new Map();
    this.symbolIntervals = new Map();
    this.pingTimer = null;
  }

  /* ═══════════════════════════════════════════════════════════
     SIGNING
     ═══════════════════════════════════════════════════════════ */

  _sign(timestamp, params) {
    const payload = `${timestamp}${this.apiKey}${this.recvWindow}${params}`;
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(payload)
      .digest('hex');
  }

  _requireKeys() {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error('Bybit API keys not configured');
    }
  }

  async _fetchPublic(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.fetchTimeout);
    try {
      const r = await fetch(`${this.restBase}${path}`, { signal: controller.signal });
      if (!r.ok) throw new Error(`Bybit REST ${r.status}`);
      const json = await r.json();
      if (json.retCode !== 0) throw new Error(`Bybit: ${json.retMsg}`);
      return json.result;
    } finally {
      clearTimeout(timer);
    }
  }

  async _fetchSigned(method, path, params = {}) {
    this._requireKeys();

    const timestamp = Date.now();
    let queryString = '';

    let url, body;
    if (method === 'GET') {
      queryString = new URLSearchParams(params).toString();
      url = `${this.restBase}${path}${queryString ? `?${queryString}` : ''}`;
    } else {
      queryString = JSON.stringify(params);
      url = `${this.restBase}${path}`;
      body = queryString;
    }

    const signature = this._sign(timestamp, queryString);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.fetchTimeout);
    try {
      const r = await fetch(url, {
        method,
        headers: {
          'X-BAPI-API-KEY':     this.apiKey,
          'X-BAPI-TIMESTAMP':   String(timestamp),
          'X-BAPI-SIGN':        signature,
          'X-BAPI-RECV-WINDOW': String(this.recvWindow),
          'Content-Type':       'application/json'
        },
        body,
        signal: controller.signal
      });

      const json = await r.json();

      if (!r.ok || json.retCode !== 0) {
        const msg = json.retMsg || `HTTP ${r.status}`;
        throw new Error(`Bybit ${json.retCode || r.status}: ${msg}`);
      }
      return json.result;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ═══════════════════════════════════════════════════════════
     MARKET DATA
     ═══════════════════════════════════════════════════════════ */

  async getTickerPrice(symbol) {
    const result = await this._fetchPublic(
      `/v5/market/tickers?category=spot&symbol=${encodeURIComponent(symbol)}`
    );
    const row = result?.list?.[0];
    return row ? { price: row.lastPrice } : null;
  }

  async getKlines(symbol, interval = '5m', limit = 200) {
    const bybitInterval = this._mapInterval(interval);
    const result = await this._fetchPublic(
      `/v5/market/kline?category=spot&symbol=${encodeURIComponent(symbol)}` +
      `&interval=${bybitInterval}&limit=${Math.min(limit, 1000)}`
    );
    const list = result?.list ?? [];
    // Newest first → reverse for chronological
    return list.reverse().map((c) => ({
      openTime:  parseInt(c[0], 10),
      open:      parseFloat(c[1]),
      high:      parseFloat(c[2]),
      low:       parseFloat(c[3]),
      close:     parseFloat(c[4]),
      volume:    parseFloat(c[5]),
      closeTime: parseInt(c[0], 10) + this._intervalMs(interval)
    }));
  }

  /* ═══════════════════════════════════════════════════════════
     ACCOUNT
     ═══════════════════════════════════════════════════════════ */

  async getWalletBalance(accountType = 'UNIFIED') {
    return this._fetchSigned('GET', '/v5/account/wallet-balance', {
      accountType
    });
  }

  async getBalance(asset = 'USDT') {
    const res = await this.getWalletBalance('UNIFIED');
    const coins = res?.list?.[0]?.coin || [];
    const c = coins.find(
      (x) => x.coin.toUpperCase() === asset.toUpperCase()
    );
    if (!c) return 0;
    return parseFloat(c.walletBalance || c.availableToWithdraw || 0);
  }

  async getAllBalances() {
    const res = await this.getWalletBalance('UNIFIED');
    const coins = res?.list?.[0]?.coin || [];
    return coins
      .filter((c) => parseFloat(c.walletBalance) > 0)
      .map((c) => ({
        asset:  c.coin,
        free:   parseFloat(c.availableToWithdraw || c.walletBalance),
        locked: parseFloat(c.locked || 0)
      }));
  }

  /* ═══════════════════════════════════════════════════════════
     TEST
     ═══════════════════════════════════════════════════════════ */

  async testConnection() {
    try {
      const price = await this.getTickerPrice('BTCUSDT');
      const priceNum = parseFloat(price?.price || 0);

      if (this.apiKey && this.apiSecret) {
        await this.getWalletBalance('UNIFIED');
        return { success: true, price: priceNum, authenticated: true, testnet: this.testnet };
      }

      return {
        success: true,
        price: priceNum,
        authenticated: false,
        testnet: this.testnet,
        warning: 'Public endpoints only — no API keys'
      };
    } catch (err) {
      let message = err.message;
      if (/invalid api key/i.test(message)) message = 'Invalid API key';
      if (/sign/i.test(message))             message = 'Invalid signature';
      if (/ip/i.test(message))               message = 'IP not whitelisted';
      return { success: false, error: message };
    }
  }

  /* ═══════════════════════════════════════════════════════════
     ORDER PLACEMENT
     ═══════════════════════════════════════════════════════════ */

  async createMarketOrder(order) {
    const { symbol, side, quantity } = order;

    if (!symbol || !side || !quantity) {
      throw new Error('createMarketOrder: symbol, side, quantity required');
    }

    const qty = await this._roundToStepSize(symbol, quantity);

    const params = {
      category:  'spot',
      symbol,
      side:      String(side).toUpperCase() === 'BUY' ? 'Buy' : 'Sell',
      orderType: 'Market',
      qty:       String(qty)
    };

    const res = await this._fetchSigned('POST', '/v5/order/create', params);

    return {
      orderId:     res.orderId,
      orderLinkId: res.orderLinkId,
      symbol,
      side:        String(side).toUpperCase(),
      type:        'MARKET',
      status:      'FILLED',
      executedQty: qty
    };
  }

  async _roundToStepSize(symbol, quantity) {
    try {
      const info = await this._fetchPublic(
        `/v5/market/instruments-info?category=spot&symbol=${encodeURIComponent(symbol)}`
      );
      const row = info?.list?.[0];
      const step = row?.lotSizeFilter?.basePrecision;
      if (!step) return quantity;

      const stepNum = parseFloat(step);
      const precision = Math.round(-Math.log10(stepNum));
      const rounded = Math.floor(quantity / stepNum) * stepNum;
      return parseFloat(rounded.toFixed(precision));
    } catch {
      return parseFloat(quantity.toFixed(6));
    }
  }

  /* ═══════════════════════════════════════════════════════════
     WEBSOCKET
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
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.wsReconnectTimer) { clearTimeout(this.wsReconnectTimer); this.wsReconnectTimer = null; }
    if (this.klineCallbacks.size === 0) return;

    console.log(`[Bybit] WS connecting (${this.klineCallbacks.size} symbols)`);
    this.ws = new WebSocket(this.wsBase);

    this.ws.on('open', () => {
      this.wsReady = true;
      this.wsReconnectAttempts = 0;
      console.log('[Bybit] WS connected');

      const args = [];
      for (const [sym, interval] of this.symbolIntervals.entries()) {
        args.push(`kline.${this._mapInterval(interval)}.${sym}`);
      }
      try {
        this.ws.send(JSON.stringify({ op: 'subscribe', args }));
      } catch (e) { console.error('[Bybit] sub failed:', e.message); }

      this.pingTimer = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          try { this.ws.send(JSON.stringify({ op: 'ping' })); } catch {}
        }
      }, 20000);
    });

    this.ws.on('message', (buf) => {
      let msg;
      try { msg = JSON.parse(buf.toString()); } catch { return; }
      if (msg.op === 'pong') return;
      if (!msg.topic?.startsWith('kline.')) return;
      const k = msg.data?.[0];
      if (!k?.confirm) return;

      const candle = {
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

      const cbs = this.klineCallbacks.get(k.symbol);
      if (cbs) cbs.forEach((cb) => {
        try { cb(candle); } catch (e) { console.error('[Bybit] cb error:', e); }
      });
    });

    this.ws.on('error', (err) => console.error('[Bybit] WS error:', err.message));

    this.ws.on('close', () => {
      this.wsReady = false;
      if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
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

  _mapInterval(tf) {
    const m = {
      '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30',
      '1h': '60', '2h': '120', '4h': '240', '6h': '360', '12h': '720',
      '1d': 'D', '1w': 'W', '1M': 'M'
    };
    return m[tf] || tf;
  }

  _intervalMs(tf) {
    const m = {
      '1m': 60e3, '5m': 300e3, '15m': 900e3,
      '1h': 3600e3, '4h': 4 * 3600e3, '1d': 86400e3
    };
    return m[tf] || 300e3;
  }

  async shutdown() {
    if (this.wsReconnectTimer) clearTimeout(this.wsReconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
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

module.exports = BybitClient;