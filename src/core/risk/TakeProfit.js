'use strict';

class TakeProfitManager {
  constructor(config = {}) {
    // Accept both naming conventions
    this.defaultTakeProfitPercent = config.takeProfitPercent ?? config.defaultTakeProfitPercent ?? 5;
    this.maxTakeProfitPercent     = config.maxTakeProfitPercent ?? 20;
    this.partialTakeProfitEnabled = config.partialTakeProfitEnabled ?? false; // OFF by default (safer)
    this.partialTakeProfitLevels  = config.partialTakeProfitLevels ?? [3, 6, 9]; // % gains
    this.partialTakeProfitSizes   = config.partialTakeProfitSizes ?? [0.25, 0.5, 0.25]; // portion of position
  }

  /** Called by TradingBot.updateConfig() */
  updateSettings(newConfig = {}) {
    if (newConfig.takeProfitPercent != null)       this.defaultTakeProfitPercent = newConfig.takeProfitPercent;
    if (newConfig.maxTakeProfitPercent != null)    this.maxTakeProfitPercent = newConfig.maxTakeProfitPercent;
    if (newConfig.partialTakeProfitEnabled != null) this.partialTakeProfitEnabled = newConfig.partialTakeProfitEnabled;
    if (newConfig.partialTakeProfitLevels)         this.partialTakeProfitLevels = newConfig.partialTakeProfitLevels;
    if (newConfig.partialTakeProfitSizes)          this.partialTakeProfitSizes = newConfig.partialTakeProfitSizes;
  }

  calculateFixedTakeProfit(entryPrice, side, takeProfitPercent = null) {
    const percent = takeProfitPercent ?? this.defaultTakeProfitPercent;
    const mult = side === 'buy' ? 1 + percent / 100 : 1 - percent / 100;
    return {
      type: 'fixed',
      targetPrice: entryPrice * mult,
      percent,
      entryPrice,
      side: side === 'buy' ? 'sell' : 'buy'
    };
  }

  calculateRiskRewardTakeProfit(entryPrice, stopLossPrice, side, riskRewardRatio = 2) {
    const risk = Math.abs(entryPrice - stopLossPrice);
    const reward = risk * riskRewardRatio;
    const targetPrice = side === 'buy' ? entryPrice + reward : entryPrice - reward;
    const percent = Math.abs((targetPrice - entryPrice) / entryPrice) * 100;
    return {
      type: 'risk_reward',
      targetPrice: Math.max(0, targetPrice),
      percent,
      riskRewardRatio,
      riskAmount: risk,
      rewardAmount: reward,
      entryPrice,
      side: side === 'buy' ? 'sell' : 'buy'
    };
  }

  calculateSupportResistanceTakeProfit(entryPrice, side, targetLevel, buffer = 0.1) {
    const bufferAmount = targetLevel * (buffer / 100);
    const targetPrice = side === 'buy' ? targetLevel - bufferAmount : targetLevel + bufferAmount;
    const percent = Math.abs((targetPrice - entryPrice) / entryPrice) * 100;
    return {
      type: 'support_resistance',
      targetPrice,
      percent,
      targetLevel,
      buffer,
      entryPrice,
      side: side === 'buy' ? 'sell' : 'buy'
    };
  }

  /** Returns an array of { percent, sizeFraction, targetPrice } for scaling out. */
  calculatePartialTakeProfits(entryPrice, side, totalQuantity = null) {
    if (!this.partialTakeProfitEnabled) {
      return [this.calculateFixedTakeProfit(entryPrice, side)];
    }

    const levels = this.partialTakeProfitLevels;
    const sizes  = this.partialTakeProfitSizes;
    const out = [];

    for (let i = 0; i < levels.length; i++) {
      const percent = levels[i];
      const sizeFraction = sizes[i] ?? 1 / levels.length;
      const mult = side === 'buy' ? 1 + percent / 100 : 1 - percent / 100;
      out.push({
        type: 'partial',
        level: i + 1,
        percent,
        sizeFraction,
        quantity: totalQuantity != null ? totalQuantity * sizeFraction : null,
        targetPrice: entryPrice * mult,
        entryPrice,
        side: side === 'buy' ? 'sell' : 'buy'
      });
    }
    return out;
  }

  calculateOptimalTakeProfit(params = {}) {
    const {
      entryPrice,
      side,
      method = 'fixed',
      takeProfitPercent,
      stopLossPrice,
      riskRewardRatio = 2,
      targetLevel,
      srBuffer = 0.1
    } = params;

    let tp;
    switch (method) {
      case 'risk_reward':
        if (!stopLossPrice) throw new Error('stopLossPrice required for risk_reward method');
        tp = this.calculateRiskRewardTakeProfit(entryPrice, stopLossPrice, side, riskRewardRatio);
        break;
      case 'support_resistance':
        if (!targetLevel) throw new Error('targetLevel required for support_resistance method');
        tp = this.calculateSupportResistanceTakeProfit(entryPrice, side, targetLevel, srBuffer);
        break;
      case 'fixed':
      default:
        tp = this.calculateFixedTakeProfit(entryPrice, side, takeProfitPercent);
    }

    if (tp.percent > this.maxTakeProfitPercent) {
      console.warn(`TP ${tp.percent.toFixed(2)}% > max ${this.maxTakeProfitPercent}% — falling back to fixed`);
      tp = this.calculateFixedTakeProfit(entryPrice, side, this.maxTakeProfitPercent);
    }

    tp.createdAt = new Date();
    return tp;
  }

  shouldTriggerTakeProfit(takeProfit, currentPrice, side) {
    if (!takeProfit || takeProfit.triggered) return false;
    return side === 'buy'
      ? currentPrice >= takeProfit.targetPrice
      : currentPrice <= takeProfit.targetPrice;
  }
}

module.exports = TakeProfitManager;