const BaseExchange = require('./BaseExchange');
const crypto = require('crypto');

class BybitClient extends BaseExchange {
  constructor(config) {
    const baseUrl = config.testnet 
      ? 'https://api-testnet.bybit.com'
      : 'https://api.bybit.com';
      
    super('Bybit', { ...config, baseUrl });
    this.recvWindow = 5000;
  }

  createSignature(timestamp, apiKey, recvWindow, queryString) {
    const param_str = timestamp + apiKey + recvWindow + queryString;
    return crypto.createHmac('sha256', this.apiSecret).update(param_str).digest('hex');
  }

  async makeSignedRequest(method, endpoint, params = {}) {
    const timestamp = Date.now();
    const queryString = new URLSearchParams(params).toString();
    
    const signature = this.createSignature(
      timestamp,
      this.apiKey,
      this.recvWindow,
      queryString
    );

    const headers = {
      'X-BAPI-API-KEY': this.apiKey,
      'X-BAPI-TIMESTAMP': timestamp.toString(),
      'X-BAPI-RECV-WINDOW': this.recvWindow.toString(),
      'X-BAPI-SIGN': signature,
      'Content-Type': 'application/json'
    };

    const url = `${this.baseUrl}${endpoint}`;
    
    const options = {
      method,
      headers
    };

    if (method === 'GET' && queryString) {
      const fullUrl = `${url}?${queryString}`;
      const response = await this.httpRequest(fullUrl, options);
      return JSON.parse(response);
    }

    if (method === 'POST' && Object.keys(params).length > 0) {
      options.body = JSON.stringify(params);
    }

    const response = await this.httpRequest(url, options);
    return JSON.parse(response);
  }

  async getBalance() {
    try {
      const response = await this.makeSignedRequest('GET', '/v5/account/wallet-balance', {
        accountType: 'UNIFIED'
      });

      if (response.retCode !== 0) {
        throw new Error(`Bybit API Error: ${response.retMsg}`);
      }

      const balances = response.result.list[0]?.coin || [];
      return balances.map(coin => ({
        asset: coin.coin,
        free: parseFloat(coin.availableToWithdraw || 0),
        locked: parseFloat(coin.locked || 0),
        total: parseFloat(coin.walletBalance || 0)
      }));
    } catch (error) {
      console.error('Bybit getBalance error:', error);
      throw error;
    }
  }

  async getCurrentPrice(symbol) {
    try {
      const response = await this.httpRequest(
        `${this.baseUrl}/v5/market/tickers?category=spot&symbol=${symbol}`,
        { method: 'GET' }
      );

      const data = JSON.parse(response);
      if (data.retCode !== 0) {
        throw new Error(`Bybit API Error: ${data.retMsg}`);
      }

      const ticker = data.result.list[0];
      return {
        symbol: ticker.symbol,
        price: parseFloat(ticker.lastPrice),
        bid: parseFloat(ticker.bid1Price),
        ask: parseFloat(ticker.ask1Price),
        volume: parseFloat(ticker.volume24h),
        change: parseFloat(ticker.price24hPcnt)
      };
    } catch (error) {
      console.error('Bybit getCurrentPrice error:', error);
      throw error;
    }
  }

  async placeBuyOrder(symbol, quantity, price = null) {
    return this.placeOrder(symbol, 'Buy', quantity, price);
  }

  async placeSellOrder(symbol, quantity, price = null) {
    return this.placeOrder(symbol, 'Sell', quantity, price);
  }

  async placeOrder(symbol, side, quantity, price = null) {
    try {
      const params = {
        category: 'spot',
        symbol: this.validateSymbol(symbol),
        side,
        orderType: price ? 'Limit' : 'Market',
        qty: this.validateQuantity(quantity).toString()
      };

      if (price) {
        params.price = this.validatePrice(price).toString();
      }

      const response = await this.makeSignedRequest('POST', '/v5/order/create', params);

      if (response.retCode !== 0) {
        throw new Error(`Bybit Order Error: ${response.retMsg}`);
      }

      return {
        orderId: response.result.orderId,
        symbol: symbol,
        side: side.toLowerCase(),
        quantity: quantity,
        price: price || 0,
        status: 'pending',
        timestamp: new Date(),
        success: true
      };
    } catch (error) {
      console.error('Bybit placeOrder error:', error);
      return { success: false, error: error.message };
    }
  }

  async getOpenOrders(symbol = null) {
    try {
      const params = {
        category: 'spot',
        openOnly: 1
      };

      if (symbol) {
        params.symbol = this.validateSymbol(symbol);
      }

      const response = await this.makeSignedRequest('GET', '/v5/order/realtime', params);

      if (response.retCode !== 0) {
        throw new Error(`Bybit API Error: ${response.retMsg}`);
      }

      return response.result.list.map(order => ({
        orderId: order.orderId,
        symbol: order.symbol,
        side: order.side.toLowerCase(),
        quantity: parseFloat(order.qty),
        price: parseFloat(order.price),
        executedQty: parseFloat(order.cumExecQty),
        status: this.mapOrderStatus(order.orderStatus),
        timestamp: new Date(parseInt(order.createdTime))
      }));
    } catch (error) {
      console.error('Bybit getOpenOrders error:', error);
      throw error;
    }
  }

  async cancelOrder(orderId, symbol) {
    try {
      const params = {
        category: 'spot',
        orderId,
        symbol: this.validateSymbol(symbol)
      };

      const response = await this.makeSignedRequest('POST', '/v5/order/cancel', params);

      if (response.retCode !== 0) {
        throw new Error(`Bybit Cancel Error: ${response.retMsg}`);
      }

      return { success: true, orderId };
    } catch (error) {
      console.error('Bybit cancelOrder error:', error);
      return { success: false, error: error.message };
    }
  }

  async getOrderHistory(symbol = null, limit = 100) {
    try {
      const params = {
        category: 'spot',
        limit: Math.min(limit, 50) // Bybit max is 50
      };

      if (symbol) {
        params.symbol = this.validateSymbol(symbol);
      }

      const response = await this.makeSignedRequest('GET', '/v5/order/history', params);

      if (response.retCode !== 0) {
        throw new Error(`Bybit API Error: ${response.retMsg}`);
      }

      return response.result.list.map(order => ({
        orderId: order.orderId,
        symbol: order.symbol,
        side: order.side.toLowerCase(),
        quantity: parseFloat(order.qty),
        price: parseFloat(order.price),
        executedQty: parseFloat(order.cumExecQty),
        status: this.mapOrderStatus(order.orderStatus),
        timestamp: new Date(parseInt(order.createdTime)),
        updateTime: new Date(parseInt(order.updatedTime))
      }));
    } catch (error) {
      console.error('Bybit getOrderHistory error:', error);
      throw error;
    }
  }
} // <-- closes BybitClient class

// ----------------------
// Helper functions
// ----------------------
export const formatOrderSide = (side) => {
  return side?.toLowerCase() === 'buy' ? 'BUY' : 'SELL';
};

export const formatPriceChange = (current, previous) => {
  if (!current || !previous || current === previous) {
    return { change: 0, changePercent: 0 };
  }

  const change = current - previous;
  const changePercent = (change / previous) * 100;

  return { change, changePercent };
};

export const getColorForValue = (value, theme = 'default') => {
  if (value > 0) return theme === 'tailwind' ? 'text-green-400' : '#10B981';
  if (value < 0) return theme === 'tailwind' ? 'text-red-400' : '#EF4444';
  return theme === 'tailwind' ? 'text-gray-400' : '#9CA3AF';
};

export const formatSymbol = (symbol) => {
  if (!symbol) return '';
  const commonQuotes = ['USDT', 'BUSD', 'BTC', 'ETH', 'BNB'];
  let baseAsset = symbol;
  let quoteAsset = '';

  for (const quote of commonQuotes) {
    if (symbol.endsWith(quote)) {
      baseAsset = symbol.slice(0, -quote.length);
      quoteAsset = quote;
      break;
    }
  }

  return quoteAsset ? `${baseAsset}/${quoteAsset}` : symbol;
};
