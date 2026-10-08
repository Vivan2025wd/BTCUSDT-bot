const crypto = require('crypto');

class TakeProfitManager {
  constructor(config = {}) {
    this.defaultTakeProfitPercent = config.defaultTakeProfitPercent || 5;
    this.maxTakeProfitPercent = config.maxTakeProfitPercent || 20;
    this.partialTakeProfitEnabled = config.partialTakeProfitEnabled ?? true;
    this.partialTakeProfitLevels = config.partialTakeProfitLevels || [3, 6, 9]; // Percentages
    this.partialTakeProfitSizes = config.partialTakeProfitSizes || [0.25, 0.5, 0.25]; // Portion of position
  }

  // Calculate fixed percentage take profit
  calculateFixedTakeProfit(entryPrice, side, takeProfitPercent = null) {
    const percent = takeProfitPercent || this.defaultTakeProfitPercent;
    const multiplier = side === 'buy' ? 1 + percent / 100 : 1 - percent / 100;

    return {
      type: 'fixed',
      targetPrice: entryPrice * multiplier,
      percent: percent,
      side: side === 'buy' ? 'sell' : 'buy'
    };
  }

  // Calculate risk-reward based take profit
  calculateRiskRewardTakeProfit(entryPrice, stopLossPrice, side, riskRewardRatio = 2) {
    const riskAmount = Math.abs(entryPrice - stopLossPrice);
    const rewardAmount = riskAmount * riskRewardRatio;

    const targetPrice = side === 'buy'
      ? entryPrice + rewardAmount
      : entryPrice - rewardAmount;

    const percent = Math.abs((targetPrice - entryPrice) / entryPrice) * 100;

    return {
      type: 'risk_reward',
      targetPrice: Math.max(0, targetPrice),
      percent: percent,
      riskRewardRatio: riskRewardRatio,
      riskAmount: riskAmount,
      rewardAmount: rewardAmount,
      side: side === 'buy' ? 'sell' : 'buy'
    };
  }

  // Calculate support/resistance based take profit
  calculateSupportResistanceTakeProfit(entryPrice, side, targetLevel, buffer = 0.1) {
    const bufferAmount = targetLevel * (buffer / 100);
    const targetPrice = side === 'buy'
      ? targetLevel - bufferAmount
      : targetLevel + bufferAmount;

    const percent = Math.abs((targetPrice - entryPrice) / entryPrice) * 100;

    return {
      type: 'support_resistance',
      targetPrice: targetPrice,
      percent: percent,
      side: side === 'buy' ? 'sell' : 'buy'
    };
  }

  // Placeholder for fetching Kline data
  async getKlineData(symbol, interval = '5', limit = 100) {
    try {
      const response = await this.httpRequest(
        `${this.baseUrl}/v5/market/kline?category=spot&symbol=${symbol}&interval=${interval}&limit=${limit}`,
        { method: 'GET' }
      );

      const data = JSON.parse(response);
      if (data.retCode !== 0) {
        throw new Error(`Bybit API Error: ${data.retMsg}`);
      }

      return data.result.list.map(kline => ({
        timestamp: parseInt(kline[0]),
        open: parseFloat(kline[1]),
        high: parseFloat(kline[2]),
        low: parseFloat(kline[3]),
        close: parseFloat(kline[4]),
        volume: parseFloat(kline[5])
      })).reverse(); // Oldest first
    } catch (error) {
      console.error('Bybit getKlineData error:', error);
      throw error;
    }
  }

  mapOrderStatus(bybitStatus) {
    const statusMap = {
      'New': 'pending',
      'PartiallyFilled': 'partially_filled',
      'Filled': 'filled',
      'Cancelled': 'cancelled',
      'Rejected': 'rejected'
    };
    return statusMap[bybitStatus] || bybitStatus.toLowerCase();
  }

  // WebSocket helpers
  getWebSocketUrl() {
    return this.testnet
      ? 'wss://stream-testnet.bybit.com/v5/public/spot'
      : 'wss://stream.bybit.com/v5/public/spot';
  }

  createWebSocketAuth() {
    const expires = Date.now() + 10000;
    const signature = crypto
      .createHmac('sha256', this.apiSecret)
      .update(`GET/realtime${expires}`)
      .digest('hex');

    return {
      op: 'auth',
      args: [this.apiKey, expires, signature]
    };
  }

  subscribeToTicker(symbol) {
    return {
      op: 'subscribe',
      args: [`tickers.${symbol}`]
    };
  }

  subscribeToKline(symbol, interval = '5') {
    return {
      op: 'subscribe',
      args: [`kline.${interval}.${symbol}`]
    };
  }
}

module.exports = TakeProfitManager;
