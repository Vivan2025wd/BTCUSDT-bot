const EMA = require('../indicators/EMA');
const RSI = require('../indicators/RSI');
const Volume = require('../indicators/Volume');

class EMAStrategy {
  constructor(settings = {}) {
    this.settings = {
      emaFast: settings.emaFast || 9,
      emaSlow: settings.emaSlow || 21,
      rsiPeriod: settings.rsiPeriod || 14,
      rsiOverbought: settings.rsiOverbought || 70,
      rsiOversold: settings.rsiOversold || 30,
      volumeThreshold: settings.volumeThreshold || 1.5,
      minConfidence: settings.minConfidence || 60,
      ...settings
    };
    
    // Initialize indicators
    this.emaFast = new EMA(this.settings.emaFast);
    this.emaSlow = new EMA(this.settings.emaSlow);
    this.rsi = new RSI(this.settings.rsiPeriod);
    this.volume = new Volume(20); // 20-period volume analysis
    
    // Price history for trend analysis
    this.priceHistory = new Map();
  }

  async analyze(candles, marketData) {
    const { pair, currentPrice, volume: currentVolume } = marketData;
    
    if (!candles || candles.length < Math.max(this.settings.emaSlow, this.settings.rsiPeriod) + 10) {
      return this.createSignal('HOLD', 0, 'Insufficient data', currentPrice);
    }
    
    try {
      // Extract price and volume data
      const closes = candles.map(c => parseFloat(c.close));
      const volumes = candles.map(c => parseFloat(c.volume));
      const highs = candles.map(c => parseFloat(c.high));
      const lows = candles.map(c => parseFloat(c.low));
      
      // Calculate indicators
      const indicators = this.calculateIndicators(closes, volumes, highs, lows);
      
      // Store price history for trend analysis
      this.updatePriceHistory(pair, closes.slice(-10)); // Keep last 10 prices
      
      // Generate trading signal
      const signal = this.generateSignal(pair, indicators, currentPrice);
      
      return signal;
      
    } catch (error) {
      console.error(`Strategy analysis error for ${pair}:`, error);
      return this.createSignal('HOLD', 0, `Analysis error: ${error.message}`, currentPrice);
    }
  }

  calculateIndicators(closes, volumes, highs, lows) {
    // EMA calculations
    const emaFastValue = this.emaFast.calculate(closes);
    const emaSlowValue = this.emaSlow.calculate(closes);
    
    // RSI calculation
    const rsiValue = this.rsi.calculate(closes);
    
    // Volume analysis
    const volumeAnalysis = this.volume.analyze(volumes);
    
    // Additional technical indicators
    const atr = this.calculateATR(highs, lows, closes, 14);
    const momentum = this.calculateMomentum(closes, 10);
    const bollinger = this.calculateBollingerBands(closes, 20, 2);
    
    return {
      emaFast: emaFastValue,
      emaSlow: emaSlowValue,
      rsi: rsiValue,
      volumeSpike: volumeAnalysis.spike,
      volumeAverage: volumeAnalysis.average,
      atr: atr,
      momentum: momentum,
      bollinger: bollinger,
      trend: this.determineTrend(closes)
    };
  }

  generateSignal(pair, indicators, currentPrice) {
    const {
      emaFast,
      emaSlow,
      rsi,
      volumeSpike,
      atr,
      momentum,
      bollinger,
      trend
    } = indicators;
    
    // Basic signal conditions
    const bullishCross = emaFast > emaSlow;
    const bearishCross = emaFast < emaSlow;
    const emaDivergence = Math.abs(emaFast - emaSlow) / emaSlow;
    
    // RSI conditions
    const rsiOversold = rsi < this.settings.rsiOversold;
    const rsiOverbought = rsi > this.settings.rsiOverbought;
    const rsiNeutral = rsi >= 40 && rsi <= 60;
    
    // Volume confirmation
    const hasVolumeConfirmation = volumeSpike > this.settings.volumeThreshold;
    
    // Volatility check
    const isVolatile = atr > 0.01; // Minimum volatility requirement
    
    // Trend confirmation
    const isUptrend = trend === 'UP';
    const isDowntrend = trend === 'DOWN';
    
    let action = 'HOLD';
    let confidence = 0;
    let reasons = [];
    
    // BUY Signal Logic
    if (this.shouldBuy(indicators, { 
      bullishCross, 
      rsiOversold, 
      rsiNeutral, 
      hasVolumeConfirmation, 
      isVolatile, 
      isUptrend,
      currentPrice,
      bollinger 
    })) {
      action = 'BUY';
      confidence = this.calculateBuyConfidence({
        emaDivergence,
        rsi,
        volumeSpike,
        momentum,
        trend,
        bollinger,
        currentPrice
      });
      reasons = this.getBuyReasons(indicators);
    }
    
    // SELL Signal Logic
    else if (this.shouldSell(indicators, { 
      bearishCross, 
      rsiOverbought, 
      isVolatile, 
      isDowntrend,
      currentPrice,
      bollinger 
    })) {
      action = 'SELL';
      confidence = this.calculateSellConfidence({
        emaDivergence,
        rsi,
        volumeSpike,
        momentum,
        trend,
        bollinger,
        currentPrice
      });
      reasons = this.getSellReasons(indicators);
    }
    
    const reason = reasons.join(' | ');
    
    return this.createSignal(action, confidence, reason, currentPrice, indicators);
  }

  shouldBuy(indicators, conditions) {
    const {
      bullishCross,
      rsiOversold,
      rsiNeutral,
      hasVolumeConfirmation,
      isVolatile,
      isUptrend,
      currentPrice,
      bollinger
    } = conditions;
    
    // Primary buy conditions
    const primaryCondition = bullishCross && (rsiOversold || rsiNeutral) && hasVolumeConfirmation;
    
    // Secondary confirmations
    const trendConfirmation = isUptrend || indicators.momentum > 0;
    const volatilityOk = isVolatile;
    const bollingerSupport = currentPrice > bollinger.lower;
    
    // Risk filters
    const notOverbought = indicators.rsi < 75;
    
    return primaryCondition && trendConfirmation && volatilityOk && bollingerSupport && notOverbought;
  }

  shouldSell(indicators, conditions) {
    const {
      bearishCross,
      rsiOverbought,
      isVolatile,
      isDowntrend,
      currentPrice,
      bollinger
    } = conditions;
    
    // Primary sell conditions
    const primaryCondition = bearishCross || rsiOverbought;
    
    // Secondary confirmations
    const trendConfirmation = isDowntrend || indicators.momentum < 0;
    const volatilityOk = isVolatile;
    const bollingerResistance = currentPrice < bollinger.upper;
    
    // Risk filters
    const notOversold = indicators.rsi > 25;
    
    return primaryCondition && trendConfirmation && volatilityOk && bollingerResistance && notOversold;
  }

  calculateBuyConfidence({ emaDivergence, rsi, volumeSpike, momentum, trend, bollinger, currentPrice }) {
    let confidence = 0;
    
    // EMA divergence strength (0-25 points)
    confidence += Math.min(emaDivergence * 500, 25);
    
    // RSI positioning (0-25 points)
    if (rsi < 30) confidence += 25;
    else if (rsi < 50) confidence += 20 - ((rsi - 30) * 0.25);
    
    // Volume confirmation (0-20 points)
    confidence += Math.min(volumeSpike * 10, 20);
    
    // Momentum (0-15 points)
    if (momentum > 0) {
      confidence += Math.min(momentum * 100, 15);
    }
    
    // Trend alignment (0-15 points)
    if (trend === 'UP') confidence += 15;
    else if (trend === 'NEUTRAL') confidence += 5;
    
    return Math.min(Math.max(confidence, 0), 100);
  }

  calculateSellConfidence({ emaDivergence, rsi, volumeSpike, momentum, trend, bollinger, currentPrice }) {
    let confidence = 0;
    
    // EMA divergence strength (0-25 points)
    confidence += Math.min(emaDivergence * 500, 25);
    
    // RSI positioning (0-25 points)
    if (rsi > 70) confidence += 25;
    else if (rsi > 50) confidence += ((rsi - 50) * 0.25);
    
    // Volume confirmation (0-20 points)
    confidence += Math.min(volumeSpike * 10, 20);
    
    // Momentum (0-15 points)
    if (momentum < 0) {
      confidence += Math.min(Math.abs(momentum) * 100, 15);
    }
    
    // Trend alignment (0-15 points)
    if (trend === 'DOWN') confidence += 15;
    else if (trend === 'NEUTRAL') confidence += 5;
    
    return Math.min(Math.max(confidence, 0), 100);
  }

  getBuyReasons(indicators) {
    const reasons = [];
    
    if (indicators.emaFast > indicators.emaSlow) {
      reasons.push(`EMA Cross (${indicators.emaFast.toFixed(4)} > ${indicators.emaSlow.toFixed(4)})`);
    }
    
    if (indicators.rsi < this.settings.rsiOversold) {
      reasons.push(`RSI Oversold (${indicators.rsi.toFixed(1)})`);
    } else if (indicators.rsi < 50) {
      reasons.push(`RSI Neutral (${indicators.rsi.toFixed(1)})`);
    }
    
    if (indicators.volumeSpike > this.settings.volumeThreshold) {
      reasons.push(`Volume Spike (${indicators.volumeSpike.toFixed(1)}x)`);
    }
    
    if (indicators.momentum > 0) {
      reasons.push(`Positive Momentum (${(indicators.momentum * 100).toFixed(2)}%)`);
    }
    
    if (indicators.trend === 'UP') {
      reasons.push('Uptrend');
    }
    
    return reasons;
  }

  getSellReasons(indicators) {
    const reasons = [];
    
    if (indicators.emaFast < indicators.emaSlow) {
      reasons.push(`EMA Cross (${indicators.emaFast.toFixed(4)} < ${indicators.emaSlow.toFixed(4)})`);
    }
    
    if (indicators.rsi > this.settings.rsiOverbought) {
      reasons.push(`RSI Overbought (${indicators.rsi.toFixed(1)})`);
    }
    
    if (indicators.volumeSpike > this.settings.volumeThreshold) {
      reasons.push(`Volume Spike (${indicators.volumeSpike.toFixed(1)}x)`);
    }
    
    if (indicators.momentum < 0) {
      reasons.push(`Negative Momentum (${(indicators.momentum * 100).toFixed(2)}%)`);
    }
    
    if (indicators.trend === 'DOWN') {
      reasons.push('Downtrend');
    }
    
    return reasons;
  }

  calculateATR(highs, lows, closes, period) {
    if (highs.length < period + 1) return 0;
    
    const trueRanges = [];
    for (let i = 1; i < highs.length; i++) {
      const tr1 = highs[i] - lows[i];
      const tr2 = Math.abs(highs[i] - closes[i - 1]);
      const tr3 = Math.abs(lows[i] - closes[i - 1]);
      trueRanges.push(Math.max(tr1, tr2, tr3));
    }
    
    return trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period;
  }

  calculateMomentum(closes, period) {
    if (closes.length < period + 1) return 0;
    
    const current = closes[closes.length - 1];
    const past = closes[closes.length - 1 - period];
    
    return (current - past) / past;
  }

  calculateBollingerBands(closes, period, stdDev) {
    if (closes.length < period) {
      return { upper: 0, middle: 0, lower: 0 };
    }
    
    const prices = closes.slice(-period);
    const sma = prices.reduce((a, b) => a + b, 0) / period;
    
    const variance = prices.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
    const stdev = Math.sqrt(variance);
    
    return {
      upper: sma + (stdDev * stdev),
      middle: sma,
      lower: sma - (stdDev * stdev)
    };
  }

  determineTrend(closes, period = 10) {
    if (closes.length < period) return 'NEUTRAL';
    
    const recentPrices = closes.slice(-period);
    const firstHalf = recentPrices.slice(0, Math.floor(period / 2));
    const secondHalf = recentPrices.slice(Math.floor(period / 2));
    
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    const trendStrength = (secondAvg - firstAvg) / firstAvg;
    
    if (trendStrength > 0.002) return 'UP';
    if (trendStrength < -0.002) return 'DOWN';
    return 'NEUTRAL';
  }

  updatePriceHistory(pair, prices) {
    this.priceHistory.set(pair, prices);
  }

  createSignal(action, confidence, reason, price, indicators = {}) {
    return {
      action,
      confidence: Math.round(confidence),
      reason,
      price,
      indicators,
      timestamp: new Date(),
      strategy: 'EMA_RSI_Volume'
    };
  }

  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    
    // Recreate indicators with new settings
    this.emaFast = new EMA(this.settings.emaFast);
    this.emaSlow = new EMA(this.settings.emaSlow);
    this.rsi = new RSI(this.settings.rsiPeriod);
  }

  getSettings() {
    return { ...this.settings };
  }
}

module.exports = EMAStrategy;