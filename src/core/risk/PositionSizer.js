class PositionSizer {
  constructor(config = {}) {
    this.defaultRiskPercent = config.defaultRiskPercent || 2; // 2% of account
    this.maxRiskPercent = config.maxRiskPercent || 5; // Max 5% per trade
    this.maxPositionPercent = config.maxPositionPercent || 10; // Max 10% of account per position
    this.minTradeAmount = config.minTradeAmount || 10; // Minimum $10 trade
    this.maxPositions = config.maxPositions || 5; // Max concurrent positions
  }

  // Calculate position size based on fixed percentage risk
  calculateFixedPercentRisk(accountBalance, riskPercent, stopLossPercent, currentPrice) {
    if (!accountBalance || !stopLossPercent || !currentPrice) {
      throw new Error('Missing required parameters for position sizing');
    }

    // Validate risk percentage
    const risk = Math.min(riskPercent || this.defaultRiskPercent, this.maxRiskPercent);
    
    // Calculate risk amount in dollars
    const riskAmount = accountBalance * (risk / 100);
    
    // Calculate position size based on stop loss
    const stopLossAmount = stopLossPercent / 100;
    const positionValue = riskAmount / stopLossAmount;
    
    // Calculate quantity
    const quantity = positionValue / currentPrice;
    
    // Apply maximum position size limit
    const maxPositionValue = accountBalance * (this.maxPositionPercent / 100);
    const maxQuantity = maxPositionValue / currentPrice;
    
    const finalQuantity = Math.min(quantity, maxQuantity);
    const finalPositionValue = finalQuantity * currentPrice;

    return {
      quantity: finalQuantity,
      positionValue: finalPositionValue,
      riskAmount,
      riskPercent: risk,
      stopLossPercent,
      isValid: finalPositionValue >= this.minTradeAmount
    };
  }

  // Calculate position size using Kelly Criterion
  calculateKellySize(accountBalance, winRate, avgWin, avgLoss, currentPrice, maxRisk = 0.25) {
    if (winRate <= 0 || winRate >= 1 || avgWin <= 0 || avgLoss >= 0) {
      // Fall back to fixed percent if Kelly inputs are invalid
      return this.calculateFixedPercentRisk(accountBalance, this.defaultRiskPercent, 3, currentPrice);
    }

    // Kelly formula: f = (bp - q) / b
    // where: b = avgWin/|avgLoss|, p = winRate, q = lossRate
    const b = avgWin / Math.abs(avgLoss);
    const p = winRate;
    const q = 1 - winRate;
    
    const kellyPercent = (b * p - q) / b;
    
    // Cap Kelly percentage to avoid over-leveraging
    const cappedKelly = Math.max(0, Math.min(kellyPercent, maxRisk));
    
    // Convert to position size
    const positionValue = accountBalance * cappedKelly;
    const quantity = positionValue / currentPrice;

    return {
      quantity,
      positionValue,
      kellyPercent: cappedKelly * 100,
      isValid: positionValue >= this.minTradeAmount
    };
  }

  // Calculate position size based on volatility (ATR)
  calculateVolatilityBasedSize(accountBalance, atr, currentPrice, multiplier = 2) {
    if (!atr || atr <= 0) {
      throw new Error('Invalid ATR value for volatility-based sizing');
    }

    // Use ATR as a proxy for stop loss distance
    const stopLossDistance = atr * multiplier;
    const stopLossPercent = (stopLossDistance / currentPrice) * 100;
    
    return this.calculateFixedPercentRisk(
      accountBalance, 
      this.defaultRiskPercent, 
      stopLossPercent, 
      currentPrice
    );
  }

  // Portfolio-aware position sizing
  calculatePortfolioAwareSize(accountBalance, currentPositions, symbol, riskPercent, stopLossPercent, currentPrice) {
    // Check if we're at max positions
    if (currentPositions.length >= this.maxPositions) {
      return {
        quantity: 0,
        positionValue: 0,
        isValid: false,
        reason: 'max_positions_reached'
      };
    }

    // Calculate current portfolio exposure
    const totalExposure = currentPositions.reduce((sum, pos) => sum + pos.positionValue, 0);
    const exposurePercent = (totalExposure / accountBalance) * 100;

    // Reduce position size if portfolio is heavily exposed
    let adjustedRisk = riskPercent;
    if (exposurePercent > 30) { // If more than 30% of account is in positions
      adjustedRisk *= 0.7; // Reduce new position size by 30%
    }
    if (exposurePercent > 50) {
      adjustedRisk *= 0.5; // Further reduce if over 50%
    }

    // Check if we already have a position in this symbol
    const existingPosition = currentPositions.find(pos => pos.symbol === symbol);
    if (existingPosition) {
      // Reduce size for adding to existing position
      adjustedRisk *= 0.5;
    }

    return this.calculateFixedPercentRisk(
      accountBalance, 
      adjustedRisk, 
      stopLossPercent, 
      currentPrice
    );
  }

  // Calculate optimal position size considering multiple factors
  calculateOptimalSize(params) {
    const {
      accountBalance,
      currentPositions = [],
      symbol,
      currentPrice,
      stopLossPercent,
      riskPercent,
      winRate = null,
      avgWin = null,
      avgLoss = null,
      atr = null,
      method = 'fixed_percent'
    } = params;

    let result;

    switch (method) {
      case 'kelly':
        if (winRate && avgWin && avgLoss) {
          result = this.calculateKellySize(accountBalance, winRate, avgWin, avgLoss, currentPrice);
        } else {
          result = this.calculateFixedPercentRisk(accountBalance, riskPercent, stopLossPercent, currentPrice);
        }
        break;

      case 'volatility':
        if (atr) {
          result = this.calculateVolatilityBasedSize(accountBalance, atr, currentPrice);
        } else {
          result = this.calculateFixedPercentRisk(accountBalance, riskPercent, stopLossPercent, currentPrice);
        }
        break;

      case 'portfolio_aware':
        result = this.calculatePortfolioAwareSize(
          accountBalance, currentPositions, symbol, riskPercent, stopLossPercent, currentPrice
        );
        break;

      case 'fixed_percent':
      default:
        result = this.calculateFixedPercentRisk(accountBalance, riskPercent, stopLossPercent, currentPrice);
        break;
    }

    // Add metadata
    result.method = method;
    result.timestamp = new Date();
    result.symbol = symbol;

    return result;
  }

  // Validate position size before execution
  validatePositionSize(positionSize, accountBalance, currentPositions = []) {
    const warnings = [];
    const errors = [];

    // Check minimum trade amount
    if (positionSize.positionValue < this.minTradeAmount) {
      errors.push(`Position value ${positionSize.positionValue.toFixed(2)} is below minimum ${this.minTradeAmount}`);
    }

    // Check if position is too large relative to account
    const positionPercent = (positionSize.positionValue / accountBalance) * 100;
    if (positionPercent > this.maxPositionPercent) {
      errors.push(`Position size ${positionPercent.toFixed(1)}% exceeds maximum ${this.maxPositionPercent}%`);
    }

    // Check portfolio exposure
    const currentExposure = currentPositions.reduce((sum, pos) => sum + pos.positionValue, 0);
    const newTotalExposure = currentExposure + positionSize.positionValue;
    const totalExposurePercent = (newTotalExposure / accountBalance) * 100;

    if (totalExposurePercent > 70) {
      warnings.push(`Total portfolio exposure would be ${totalExposurePercent.toFixed(1)}%`);
    }

    // Check available balance
    const availableBalance = accountBalance - currentExposure;
    if (positionSize.positionValue > availableBalance) {
      errors.push(`Insufficient available balance: need ${positionSize.positionValue.toFixed(2)}, have ${availableBalance.toFixed(2)}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}

module.exports = PositionSizer;
