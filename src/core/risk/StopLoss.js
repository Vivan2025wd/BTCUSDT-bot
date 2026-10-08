class StopLossManager {
  constructor(config = {}) {
    this.defaultStopLossPercent = config.defaultStopLossPercent || 3;
    this.maxStopLossPercent = config.maxStopLossPercent || 10;
    this.trailingStopEnabled = config.trailingStopEnabled || true;
    this.trailingStopPercent = config.trailingStopPercent || 2;
  }

  // Calculate fixed percentage stop loss
  calculateFixedStopLoss(entryPrice, side, stopLossPercent = null) {
    const percent = stopLossPercent || this.defaultStopLossPercent;
    const multiplier = side === 'buy' ? (1 - percent / 100) : (1 + percent / 100);
    
    return {
      type: 'fixed',
      stopPrice: entryPrice * multiplier,
      percent: percent,
      side: side === 'buy' ? 'sell' : 'buy'
    };
  }

  // Calculate ATR-based stop loss
  calculateATRStopLoss(entryPrice, side, atr, multiplier = 2) {
    if (!atr || atr <= 0) {
      throw new Error('Invalid ATR value for stop loss calculation');
    }

    const stopDistance = atr * multiplier;
    const stopPrice = side === 'buy' ? entryPrice - stopDistance : entryPrice + stopDistance;
    const percent = Math.abs((stopPrice - entryPrice) / entryPrice) * 100;

    return {
      type: 'atr',
      stopPrice: Math.max(0, stopPrice),
      percent: percent,
      atr: atr,
      multiplier: multiplier,
      side: side === 'buy' ? 'sell' : 'buy'
    };
  }

  // Calculate support/resistance based stop loss
  calculateSupportResistanceStopLoss(entryPrice, side, supportResistanceLevel, buffer = 0.1) {
    const bufferAmount = supportResistanceLevel * (buffer / 100);
    let stopPrice;

    if (side === 'buy') {
      // For long positions, stop below support
      stopPrice = supportResistanceLevel - bufferAmount;
    } else {
      // For short positions, stop above resistance
      stopPrice = supportResistanceLevel + bufferAmount;
    }

    const percent = Math.abs((stopPrice - entryPrice) / entryPrice) * 100;

    return {
      type: 'support_resistance',
      stopPrice: Math.max(0, stopPrice),
      percent: percent,
      supportResistanceLevel: supportResistanceLevel,
      buffer: buffer,
      side: side === 'buy' ? 'sell' : 'buy'
    };
  }

  // Initialize trailing stop loss
  initializeTrailingStop(entryPrice, side, trailingPercent = null) {
    const percent = trailingPercent || this.trailingStopPercent;
    const initialStopPrice = side === 'buy' 
      ? entryPrice * (1 - percent / 100)
      : entryPrice * (1 + percent / 100);

    return {
      type: 'trailing',
      stopPrice: initialStopPrice,
      highestPrice: entryPrice,
      lowestPrice: entryPrice,
      trailingPercent: percent,
      side: side === 'buy' ? 'sell' : 'buy',
      triggered: false
    };
  }

  // Update trailing stop loss
  updateTrailingStop(trailingStop, currentPrice, side) {
    if (!trailingStop || trailingStop.type !== 'trailing' || trailingStop.triggered) {
      return trailingStop;
    }

    let updated = false;
    const newStop = { ...trailingStop };

    if (side === 'buy') {
      // For long positions, trail up with price
      if (currentPrice > newStop.highestPrice) {
        newStop.highestPrice = currentPrice;
        const newStopPrice = currentPrice * (1 - newStop.trailingPercent / 100);
        
        if (newStopPrice > newStop.stopPrice) {
          newStop.stopPrice = newStopPrice;
          updated = true;
        }
      }

      // Check if stop loss is triggered
      if (currentPrice <= newStop.stopPrice) {
        newStop.triggered = true;
        newStop.triggerPrice = currentPrice;
      }
    } else {
      // For short positions, trail down with price
      if (currentPrice < newStop.lowestPrice) {
        newStop.lowestPrice = currentPrice;
        const newStopPrice = currentPrice * (1 + newStop.trailingPercent / 100);
        
        if (newStopPrice < newStop.stopPrice) {
          newStop.stopPrice = newStopPrice;
          updated = true;
        }
      }

      // Check if stop loss is triggered
      if (currentPrice >= newStop.stopPrice) {
        newStop.triggered = true;
        newStop.triggerPrice = currentPrice;
      }
    }

    if (updated) {
      newStop.lastUpdated = new Date();
    }

    return newStop;
  }

  // Calculate optimal stop loss using multiple methods
  calculateOptimalStopLoss(params) {
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
        if (!atr) {
          throw new Error('ATR value required for ATR-based stop loss');
        }
        stopLoss = this.calculateATRStopLoss(entryPrice, side, atr, atrMultiplier);
        break;

      case 'support_resistance':
        if (!supportResistanceLevel) {
          throw new Error('Support/resistance level required');
        }
        stopLoss = this.calculateSupportResistanceStopLoss(
          entryPrice, side, supportResistanceLevel, srBuffer
        );
        break;

      case 'trailing':
        stopLoss = this.initializeTrailingStop(entryPrice, side, trailingPercent);
        break;

      case 'fixed':
      default:
        stopLoss = this.calculateFixedStopLoss(entryPrice, side, stopLossPercent);
        break;
    }

    // Validate stop loss percentage
    if (stopLoss.percent > this.maxStopLossPercent) {
      console.warn(`Stop loss ${stopLoss.percent.toFixed(2)}% exceeds maximum ${this.maxStopLossPercent}%`);
      // Fall back to fixed percentage
      stopLoss = this.calculateFixedStopLoss(entryPrice, side, this.maxStopLossPercent);
    }

    stopLoss.entryPrice = entryPrice;
    stopLoss.createdAt = new Date();
    
    return stopLoss;
  }

  // Check if stop loss should be triggered
  shouldTriggerStopLoss(stopLoss, currentPrice, side) {
    if (!stopLoss || stopLoss.triggered) {
      return false;
    }

    if (stopLoss.type === 'trailing') {
      const updated = this.updateTrailingStop(stopLoss, currentPrice, side);
      return updated.triggered;
    }

    // For fixed, ATR, and support/resistance stops
    if (side === 'buy') {
      return currentPrice <= stopLoss.stopPrice;
    } else {
      return currentPrice >= stopLoss.stopPrice;
    }
  }

  // Calculate stop loss for portfolio of positions
  calculatePortfolioStopLoss(positions, maxPortfolioLoss = 15) {
    const totalValue = positions.reduce((sum, pos) => sum + pos.positionValue, 0);
    const currentPnL = positions.reduce((sum, pos) => sum + (pos.unrealizedPnL || 0), 0);
    const portfolioLossPercent = Math.abs(currentPnL / totalValue) * 100;

    return {
      shouldTrigger: portfolioLossPercent >= maxPortfolioLoss,
      currentLossPercent: portfolioLossPercent,
      maxLossPercent: maxPortfolioLoss,
      totalPnL: currentPnL,
      totalValue: totalValue,
      positionsToClose: portfolioLossPercent >= maxPortfolioLoss ? positions.length : 0
    };
  }

  // Adjust stop loss based on market conditions
  adjustStopLossForVolatility(stopLoss, volatility, baselineVolatility = 0.02) {
    if (!stopLoss || volatility <= 0) return stopLoss;

    const volatilityRatio = volatility / baselineVolatility;
    const adjusted = { ...stopLoss };

    // Widen stop loss in high volatility markets
    if (volatilityRatio > 1.5) {
      const adjustment = Math.min(volatilityRatio * 0.3, 2.0); // Cap at 2x adjustment
      adjusted.percent *= adjustment;
      
      // Recalculate stop price with adjusted percentage
      const side = stopLoss.side === 'sell' ? 'buy' : 'sell';
      const multiplier = side === 'buy' ? (1 - adjusted.percent / 100) : (1 + adjusted.percent / 100);
      adjusted.stopPrice = stopLoss.entryPrice * multiplier;
      
      adjusted.volatilityAdjusted = true;
      adjusted.volatilityRatio = volatilityRatio;
      adjusted.originalPercent = stopLoss.percent;
    }

    return adjusted;
  }
}

module.exports = StopLossManager;
module.exports = BaseExchange;
