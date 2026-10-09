'use strict';

class StopLossManager {
  constructor(config = {}) {
    // Accept both naming conventions
    this.defaultStopLossPercent = config.stopLossPercent ?? config.defaultStopLossPercent ?? 3;
    this.maxStopLossPercent     = config.maxStopLossPercent ?? 10;
    this.trailingStopEnabled    = config.trailingStopEnabled ?? true;
    this.trailingStopPercent    = config.trailingStopPercent ?? 2;
  }

  /** Called by TradingBot.updateConfig() */
  updateSettings(newConfig = {}) {
    if (newConfig.stopLossPercent != null)     this.defaultStopLossPercent = newConfig.stopLossPercent;
    if (newConfig.maxStopLossPercent != null)  this.maxStopLossPercent = newConfig.maxStopLossPercent;
    if (newConfig.trailingStopEnabled != null) this.trailingStopEnabled = newConfig.trailingStopEnabled;
    if (newConfig.trailingStopPercent != null) this.trailingStopPercent = newConfig.trailingStopPercent;
  }

  calculateFixedStopLoss(entryPrice, side, stopLossPercent = null) {
    const percent = stopLossPercent ?? this.defaultStopLossPercent;
    const mult = side === 'buy' ? 1 - percent / 100 : 1 + percent / 100;
    return {
      type: 'fixed',
      stopPrice: entryPrice * mult,
      percent,
      entryPrice,
      side: side === 'buy' ? 'sell' : 'buy'
    };
  }

  calculateATRStopLoss(entryPrice, side, atr, multiplier = 2) {
    if (!atr || atr <= 0) throw new Error('Invalid ATR for stop loss');
    const stopDistance = atr * multiplier;
    const stopPrice = side === 'buy' ? entryPrice - stopDistance : entryPrice + stopDistance;
    const percent = Math.abs((stopPrice - entryPrice) / entryPrice) * 100;
    return {
      type: 'atr',
      stopPrice: Math.max(0, stopPrice),
      percent,
      atr,
      multiplier,
      entryPrice,
      side: side === 'buy' ? 'sell' : 'buy'
    };
  }

  calculateSupportResistanceStopLoss(entryPrice, side, level, buffer = 0.1) {
    const bufferAmount = level * (buffer / 100);
    const stopPrice = side === 'buy' ? level - bufferAmount : level + bufferAmount;
    const percent = Math.abs((stopPrice - entryPrice) / entryPrice) * 100;
    return {
      type: 'support_resistance',
      stopPrice: Math.max(0, stopPrice),
      percent,
      supportResistanceLevel: level,
      buffer,
      entryPrice,
      side: side === 'buy' ? 'sell' : 'buy'
    };
  }

  initializeTrailingStop(entryPrice, side, trailingPercent = null) {
    const percent = trailingPercent ?? this.trailingStopPercent;
    const initialStopPrice = side === 'buy'
      ? entryPrice * (1 - percent / 100)
      : entryPrice * (1 + percent / 100);
    return {
      type: 'trailing',
      stopPrice: initialStopPrice,
      highestPrice: entryPrice,
      lowestPrice: entryPrice,
      trailingPercent: percent,
      entryPrice,
      side: side === 'buy' ? 'sell' : 'buy',
      triggered: false
    };
  }

  updateTrailingStop(trailingStop, currentPrice, side) {
    if (!trailingStop || trailingStop.type !== 'trailing' || trailingStop.triggered) {
      return trailingStop;
    }
    const next = { ...trailingStop };

    if (side === 'buy') {
      if (currentPrice > next.highestPrice) {
        next.highestPrice = currentPrice;
        const candidate = currentPrice * (1 - next.trailingPercent / 100);
        if (candidate > next.stopPrice) {
          next.stopPrice = candidate;
          next.lastUpdated = new Date();
        }
      }
      if (currentPrice <= next.stopPrice) {
        next.triggered = true;
        next.triggerPrice = currentPrice;
      }
    } else {
      if (currentPrice < next.lowestPrice) {
        next.lowestPrice = currentPrice;
        const candidate = currentPrice * (1 + next.trailingPercent / 100);
        if (candidate < next.stopPrice) {
          next.stopPrice = candidate;
          next.lastUpdated = new Date();
        }
      }
      if (currentPrice >= next.stopPrice) {
        next.triggered = true;
        next.triggerPrice = currentPrice;
      }
    }
    return next;
  }

  calculateOptimalStopLoss(params = {}) {
    const {
      entryPrice,
      side,
      method = 'fixed',
      stopLossPercent,
      atr,
      atrMultiplier = 2,
      supportResistanceLevel,
      srBuffer = 0.1,
      trailingPercent
    } = params;

    let stopLoss;
    switch (method) {
      case 'atr':
        if (!atr) throw new Error('ATR required');
        stopLoss = this.calculateATRStopLoss(entryPrice, side, atr, atrMultiplier);
        break;
      case 'support_resistance':
        if (!supportResistanceLevel) throw new Error('Support level required');
        stopLoss = this.calculateSupportResistanceStopLoss(entryPrice, side, supportResistanceLevel, srBuffer);
        break;
      case 'trailing':
        stopLoss = this.initializeTrailingStop(entryPrice, side, trailingPercent);
        break;
      case 'fixed':
      default:
        stopLoss = this.calculateFixedStopLoss(entryPrice, side, stopLossPercent);
    }

    if (stopLoss.percent > this.maxStopLossPercent) {
      console.warn(`SL ${stopLoss.percent.toFixed(2)}% > max ${this.maxStopLossPercent}% — falling back to fixed`);
      stopLoss = this.calculateFixedStopLoss(entryPrice, side, this.maxStopLossPercent);
    }

    stopLoss.createdAt = new Date();
    return stopLoss;
  }

  shouldTriggerStopLoss(stopLoss, currentPrice, side) {
    if (!stopLoss || stopLoss.triggered) return false;

    if (stopLoss.type === 'trailing') {
      const updated = this.updateTrailingStop(stopLoss, currentPrice, side);
      return updated.triggered;
    }

    return side === 'buy'
      ? currentPrice <= stopLoss.stopPrice
      : currentPrice >= stopLoss.stopPrice;
  }

  calculatePortfolioStopLoss(positions, maxPortfolioLoss = 15) {
    const totalValue = positions.reduce((s, p) => s + (p.positionValue || 0), 0);
    const currentPnL = positions.reduce((s, p) => s + (p.unrealizedPnL || 0), 0);
    const lossPercent = totalValue > 0 ? Math.abs(currentPnL / totalValue) * 100 : 0;

    return {
      shouldTrigger: lossPercent >= maxPortfolioLoss,
      currentLossPercent: lossPercent,
      maxLossPercent: maxPortfolioLoss,
      totalPnL: currentPnL,
      totalValue,
      positionsToClose: lossPercent >= maxPortfolioLoss ? positions.length : 0
    };
  }

  adjustStopLossForVolatility(stopLoss, volatility, baselineVolatility = 0.02) {
    if (!stopLoss || volatility <= 0) return stopLoss;
    const ratio = volatility / baselineVolatility;
    const next = { ...stopLoss };

    if (ratio > 1.5) {
      const adj = Math.min(ratio * 0.3, 2);
      next.percent = stopLoss.percent * adj;
      const m = stopLoss.side === 'sell' ? 1 - next.percent / 100 : 1 + next.percent / 100;
      next.stopPrice = stopLoss.entryPrice * m;
      next.volatilityAdjusted = true;
      next.volatilityRatio = ratio;
      next.originalPercent = stopLoss.percent;
    }
    return next;
  }
}

module.exports = StopLossManager;