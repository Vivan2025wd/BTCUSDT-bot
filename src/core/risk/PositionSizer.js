'use strict';

class PositionSizer {
  constructor(config = {}) {
    // Accept BOTH naming conventions:
    //   - positionSizePercent (from TradingBot config.riskSettings)
    //   - defaultRiskPercent  (internal historical name)
    this.defaultRiskPercent  = config.positionSizePercent ?? config.defaultRiskPercent ?? 2;
    this.maxRiskPercent      = config.maxRiskPercent ?? 5;
    this.maxPositionPercent  = config.maxPositionPercent ?? 10;
    this.minTradeAmount      = config.minTradeAmount ?? 10;
    this.maxPositions        = config.maxPositions ?? 5;

    // Default stop-loss percentage used if caller doesn't pass one
    this.defaultStopLossPercent = config.stopLossPercent ?? 3;
  }

  /** Called by TradingBot.updateConfig() */
  updateSettings(newConfig = {}) {
    if (newConfig.positionSizePercent != null) this.defaultRiskPercent = newConfig.positionSizePercent;
    if (newConfig.maxRiskPercent != null)      this.maxRiskPercent = newConfig.maxRiskPercent;
    if (newConfig.maxPositionPercent != null)  this.maxPositionPercent = newConfig.maxPositionPercent;
    if (newConfig.minTradeAmount != null)      this.minTradeAmount = newConfig.minTradeAmount;
    if (newConfig.maxPositions != null)        this.maxPositions = newConfig.maxPositions;
    if (newConfig.stopLossPercent != null)     this.defaultStopLossPercent = newConfig.stopLossPercent;
  }

  /**
   * Simple entry-point used by TradingBot.executeBuyOrder():
   *   const positionValue = sizer.calculateSize(balance, price);
   * Returns the USDT notional (not quantity).
   */
  calculateSize(accountBalance, currentPrice, stopLossPercent = null) {
    const result = this.calculateFixedPercentRisk(
      accountBalance,
      this.defaultRiskPercent,
      stopLossPercent ?? this.defaultStopLossPercent,
      currentPrice
    );
    return result.isValid ? result.positionValue : 0;
  }

  /* ═══════════════════════════════════════════════════════════════
     CORE METHODS
     ═══════════════════════════════════════════════════════════════ */

  calculateFixedPercentRisk(accountBalance, riskPercent, stopLossPercent, currentPrice) {
    if (!accountBalance || accountBalance <= 0) {
      return this._invalid('invalid_balance');
    }
    if (!stopLossPercent || stopLossPercent <= 0) {
      return this._invalid('invalid_stop_loss');
    }
    if (!currentPrice || currentPrice <= 0) {
      return this._invalid('invalid_price');
    }

    const risk = Math.min(riskPercent || this.defaultRiskPercent, this.maxRiskPercent);
    const riskAmount = accountBalance * (risk / 100);

    // positionValue = riskAmount / (stopLossPercent / 100)
    const stopLossFraction = stopLossPercent / 100;
    let positionValue = riskAmount / stopLossFraction;

    // Clamp to max position size
    const maxPositionValue = accountBalance * (this.maxPositionPercent / 100);
    positionValue = Math.min(positionValue, maxPositionValue);

    const quantity = positionValue / currentPrice;

    return {
      quantity,
      positionValue,
      riskAmount,
      riskPercent: risk,
      stopLossPercent,
      isValid: positionValue >= this.minTradeAmount
    };
  }

  calculateKellySize(accountBalance, winRate, avgWin, avgLoss, currentPrice, maxRisk = 0.25) {
    // Kelly assumes: winRate ∈ (0,1), avgWin > 0, avgLoss < 0
    // (avgLoss is the *signed* average loss — negative number.)
    if (winRate <= 0 || winRate >= 1 || avgWin <= 0 || avgLoss >= 0) {
      return this.calculateFixedPercentRisk(
        accountBalance,
        this.defaultRiskPercent,
        this.defaultStopLossPercent,
        currentPrice
      );
    }

    const b = avgWin / Math.abs(avgLoss);
    const p = winRate;
    const q = 1 - winRate;
    const kelly = (b * p - q) / b;

    const cappedKelly = Math.max(0, Math.min(kelly, maxRisk));
    const positionValue = accountBalance * cappedKelly;
    const quantity = positionValue / currentPrice;

    return {
      quantity,
      positionValue,
      kellyPercent: cappedKelly * 100,
      isValid: positionValue >= this.minTradeAmount
    };
  }

  calculateVolatilityBasedSize(accountBalance, atr, currentPrice, multiplier = 2) {
    if (!atr || atr <= 0) {
      return this._invalid('invalid_atr');
    }
    const stopDistance = atr * multiplier;
    const stopLossPercent = (stopDistance / currentPrice) * 100;
    return this.calculateFixedPercentRisk(
      accountBalance,
      this.defaultRiskPercent,
      stopLossPercent,
      currentPrice
    );
  }

  calculatePortfolioAwareSize(accountBalance, currentPositions, symbol, riskPercent, stopLossPercent, currentPrice) {
    if (currentPositions.length >= this.maxPositions) {
      return this._invalid('max_positions_reached');
    }

    const totalExposure = currentPositions.reduce((s, p) => s + (p.positionValue || 0), 0);
    const exposurePercent = accountBalance > 0 ? (totalExposure / accountBalance) * 100 : 0;

    let adjustedRisk = riskPercent ?? this.defaultRiskPercent;
    if (exposurePercent > 30) adjustedRisk *= 0.7;
    if (exposurePercent > 50) adjustedRisk *= 0.5;

    if (currentPositions.some((p) => p.symbol === symbol)) {
      adjustedRisk *= 0.5;
    }

    return this.calculateFixedPercentRisk(
      accountBalance,
      adjustedRisk,
      stopLossPercent,
      currentPrice
    );
  }

  calculateOptimalSize(params = {}) {
    const {
      accountBalance,
      currentPositions = [],
      symbol = '',
      currentPrice,
      stopLossPercent = this.defaultStopLossPercent,
      riskPercent = this.defaultRiskPercent,
      winRate = null,
      avgWin = null,
      avgLoss = null,
      atr = null,
      method = 'fixed_percent'
    } = params;

    let result;
    switch (method) {
      case 'kelly':
        result = (winRate && avgWin && avgLoss)
          ? this.calculateKellySize(accountBalance, winRate, avgWin, avgLoss, currentPrice)
          : this.calculateFixedPercentRisk(accountBalance, riskPercent, stopLossPercent, currentPrice);
        break;
      case 'volatility':
        result = atr
          ? this.calculateVolatilityBasedSize(accountBalance, atr, currentPrice)
          : this.calculateFixedPercentRisk(accountBalance, riskPercent, stopLossPercent, currentPrice);
        break;
      case 'portfolio_aware':
        result = this.calculatePortfolioAwareSize(
          accountBalance, currentPositions, symbol,
          riskPercent, stopLossPercent, currentPrice
        );
        break;
      case 'fixed_percent':
      default:
        result = this.calculateFixedPercentRisk(accountBalance, riskPercent, stopLossPercent, currentPrice);
    }

    result.method = method;
    result.symbol = symbol;
    result.timestamp = new Date();
    return result;
  }

  validatePositionSize(positionSize, accountBalance, currentPositions = []) {
    const warnings = [];
    const errors = [];

    if (positionSize.positionValue < this.minTradeAmount) {
      errors.push(`Position $${positionSize.positionValue.toFixed(2)} below minimum $${this.minTradeAmount}`);
    }

    const positionPercent = (positionSize.positionValue / accountBalance) * 100;
    if (positionPercent > this.maxPositionPercent) {
      errors.push(`Position ${positionPercent.toFixed(1)}% exceeds max ${this.maxPositionPercent}%`);
    }

    const currentExposure = currentPositions.reduce((s, p) => s + (p.positionValue || 0), 0);
    const totalExposure = currentExposure + positionSize.positionValue;
    const totalExposurePercent = (totalExposure / accountBalance) * 100;

    if (totalExposurePercent > 70) {
      warnings.push(`Portfolio exposure would be ${totalExposurePercent.toFixed(1)}%`);
    }

    const available = accountBalance - currentExposure;
    if (positionSize.positionValue > available) {
      errors.push(`Insufficient balance: need $${positionSize.positionValue.toFixed(2)}, have $${available.toFixed(2)}`);
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  /* ─── internal ─── */
  _invalid(reason) {
    return { quantity: 0, positionValue: 0, isValid: false, reason };
  }
}

module.exports = PositionSizer;