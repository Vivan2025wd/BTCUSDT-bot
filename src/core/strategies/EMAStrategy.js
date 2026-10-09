'use strict';

const BaseStrategy = require('./BaseStrategy');
const EMA          = require('../indicators/EMA');
const RSI          = require('../indicators/RSI');
const Volume       = require('../indicators/Volume');

class EMAStrategy extends BaseStrategy {
  /**
   * Accepts either:
   *   new EMAStrategy({ emaFast, emaSlow, ... })   ← modern
   *   new EMAStrategy('EMA', { emaFast, ... })     ← legacy (name arg is discarded)
   */
  constructor(settingsOrName, maybeSettings) {
    const settings =
      typeof settingsOrName === 'string'
        ? (maybeSettings || {})
        : (settingsOrName || {});

    super('EMA_RSI_Volume', settings);

    this.settings = {
      emaFast:         settings.emaFast         ?? 9,
      emaSlow:         settings.emaSlow         ?? 21,
      rsiPeriod:       settings.rsiPeriod       ?? 14,
      rsiOverbought:   settings.rsiOverbought   ?? 70,
      rsiOversold:     settings.rsiOversold     ?? 30,
      volumeThreshold: settings.volumeThreshold ?? 1.5,
      volumePeriod:    settings.volumePeriod    ?? 20,
      minConfidence:   settings.minConfidence   ?? 60,
      ...settings
    };

    // Alias so BaseStrategy.shouldEnterTrade() works
    this.parameters = this.settings;

    this._buildIndicators();
    this.priceHistory = new Map();
  }

  _buildIndicators() {
    this.emaFast = new EMA(this.settings.emaFast);
    this.emaSlow = new EMA(this.settings.emaSlow);
    this.rsi     = new RSI(this.settings.rsiPeriod);
    this.volume  = new Volume();  // VolumeAnalyzer takes no args
  }

  updateSettings(newSettings = {}) {
    this.settings = { ...this.settings, ...newSettings };
    this.parameters = this.settings;
    this._buildIndicators();
    return this.settings;
  }

  /* ═══════════════════════════════════════════════════════════════
     MAIN ENTRY — matches TradingBot's call:
       await strategy.analyze(candles, { pair, currentPrice, volume })
     ═══════════════════════════════════════════════════════════════ */

  async analyze(candles, marketData = {}) {
    const { pair = 'UNKNOWN', currentPrice, volume } = marketData;

    const minCandles = Math.max(this.settings.emaSlow, this.settings.rsiPeriod) + 10;
    if (!Array.isArray(candles) || candles.length < minCandles) {
      return this._signal('HOLD', 0, 'Insufficient data', currentPrice);
    }

    try {
      const closes  = candles.map((c) => Number(c.close));
      const volumes = candles.map((c) => Number(c.volume));
      const highs   = candles.map((c) => Number(c.high));
      const lows    = candles.map((c) => Number(c.low));

      const indicators = this._calculateIndicators(closes, volumes, highs, lows);

      this.priceHistory.set(pair, closes.slice(-10));

      return this._generateSignal(pair, indicators, currentPrice ?? closes.at(-1));

    } catch (err) {
      console.error(`[EMAStrategy] analysis failed for ${pair}:`, err);
      return this._signal('HOLD', 0, `Analysis error: ${err.message}`, currentPrice);
    }
  }

  _calculateIndicators(closes, volumes, highs, lows) {
    // ← IMPORTANT: use calculateLast() — .calculate() returns an ARRAY
    const emaFast = this.emaFast.calculateLast(closes);
    const emaSlow = this.emaSlow.calculateLast(closes);
    const rsi     = this.rsi.calculateLast(closes);

    // VolumeAnalyzer: use analyzeVolumePattern — it returns { volumeRatio, signal, ... }
    const volPattern = this.volume.analyzeVolumePattern(closes, volumes, this.settings.volumePeriod);
    const volumeRatio = volPattern?.volumeRatio ?? 1;

    return {
      emaFast,
      emaSlow,
      rsi,
      volumeRatio,                    // ← renamed from volumeSpike
      volumeSignal: volPattern?.signal ?? 'neutral',
      atr: this._calculateATR(highs, lows, closes, 14),
      momentum: this._calculateMomentum(closes, 10),
      bollinger: this._calculateBollingerBands(closes, 20, 2),
      trend: this._determineTrend(closes)
    };
  }

  _generateSignal(pair, ind, price) {
    const { emaFast, emaSlow, rsi, volumeRatio, atr, momentum, bollinger, trend } = ind;

    if ([emaFast, emaSlow, rsi].some((v) => v == null || Number.isNaN(v))) {
      return this._signal('HOLD', 0, 'Indicators not ready', price, ind);
    }

    const bullishCross = emaFast > emaSlow;
    const bearishCross = emaFast < emaSlow;
    const emaDivergence = emaSlow !== 0 ? Math.abs(emaFast - emaSlow) / emaSlow : 0;

    const rsiOversold    = rsi < this.settings.rsiOversold;
    const rsiOverbought  = rsi > this.settings.rsiOverbought;
    const rsiNeutral     = rsi >= 40 && rsi <= 60;
    const hasVolConfirm  = volumeRatio > this.settings.volumeThreshold;
    const isVolatile     = atr > price * 0.001;  // 0.1% of price (scales with symbol)

    const isUptrend   = trend === 'UP';
    const isDowntrend = trend === 'DOWN';

    let action = 'HOLD';
    let confidence = 0;
    const reasons = [];

    const buyCtx = {
      bullishCross, rsiOversold, rsiNeutral,
      hasVolumeConfirmation: hasVolConfirm,
      isVolatile, isUptrend, currentPrice: price, bollinger
    };
    const sellCtx = {
      bearishCross, rsiOverbought, isVolatile, isDowntrend,
      currentPrice: price, bollinger
    };

    if (this.shouldBuy(ind, buyCtx)) {
      action = 'BUY';
      confidence = this._calcBuyConfidence({ emaDivergence, rsi, volumeRatio, momentum, trend });
      reasons.push(...this._buyReasons(ind));
    } else if (this.shouldSell(ind, sellCtx)) {
      action = 'SELL';
      confidence = this._calcSellConfidence({ emaDivergence, rsi, volumeRatio, momentum, trend });
      reasons.push(...this._sellReasons(ind));
    }

    return this._signal(action, confidence, reasons.join(' | ') || 'No signal', price, ind);
  }

  /* ─── gate rules ─── */

  shouldBuy(ind, ctx) {
    const {
      bullishCross, rsiOversold, rsiNeutral,
      hasVolumeConfirmation, isVolatile, isUptrend, currentPrice, bollinger
    } = ctx;

    const primary = bullishCross && (rsiOversold || rsiNeutral) && hasVolumeConfirmation;
    const trendOk = isUptrend || ind.momentum > 0;
    const bollOk  = !bollinger || currentPrice > bollinger.lower;
    const notOverbought = ind.rsi < 75;

    return primary && trendOk && isVolatile && bollOk && notOverbought;
  }

  shouldSell(ind, ctx) {
    const {
      bearishCross, rsiOverbought, isVolatile, isDowntrend,
      currentPrice, bollinger
    } = ctx;

    const primary = bearishCross || rsiOverbought;
    const trendOk = isDowntrend || ind.momentum < 0;
    const bollOk  = !bollinger || currentPrice < bollinger.upper;
    const notOversold = ind.rsi > 25;

    return primary && trendOk && isVolatile && bollOk && notOversold;
  }

  /* ─── confidence ─── */

  _calcBuyConfidence({ emaDivergence, rsi, volumeRatio, momentum, trend }) {
    let c = 0;
    c += Math.min(emaDivergence * 500, 25);
    if (rsi < 30) c += 25;
    else if (rsi < 50) c += Math.max(0, 20 - (rsi - 30) * 0.25);
    c += Math.min(volumeRatio * 10, 20);
    if (momentum > 0) c += Math.min(momentum * 100, 15);
    if (trend === 'UP') c += 15;
    else if (trend === 'NEUTRAL') c += 5;
    return Math.min(Math.max(c, 0), 100);
  }

  _calcSellConfidence({ emaDivergence, rsi, volumeRatio, momentum, trend }) {
    let c = 0;
    c += Math.min(emaDivergence * 500, 25);
    if (rsi > 70) c += 25;
    else if (rsi > 50) c += (rsi - 50) * 0.25;
    c += Math.min(volumeRatio * 10, 20);
    if (momentum < 0) c += Math.min(Math.abs(momentum) * 100, 15);
    if (trend === 'DOWN') c += 15;
    else if (trend === 'NEUTRAL') c += 5;
    return Math.min(Math.max(c, 0), 100);
  }

  /* ─── reason strings ─── */

  _buyReasons(ind) {
    const r = [];
    r.push(`EMA ${ind.emaFast.toFixed(2)} > ${ind.emaSlow.toFixed(2)}`);
    if (ind.rsi < this.settings.rsiOversold) r.push(`RSI oversold ${ind.rsi.toFixed(1)}`);
    else if (ind.rsi < 50) r.push(`RSI neutral ${ind.rsi.toFixed(1)}`);
    if (ind.volumeRatio > this.settings.volumeThreshold) r.push(`Vol ${ind.volumeRatio.toFixed(1)}x`);
    if (ind.momentum > 0) r.push(`Momentum +${(ind.momentum * 100).toFixed(2)}%`);
    if (ind.trend === 'UP') r.push('Uptrend');
    return r;
  }

  _sellReasons(ind) {
    const r = [];
    r.push(`EMA ${ind.emaFast.toFixed(2)} < ${ind.emaSlow.toFixed(2)}`);
    if (ind.rsi > this.settings.rsiOverbought) r.push(`RSI overbought ${ind.rsi.toFixed(1)}`);
    if (ind.volumeRatio > this.settings.volumeThreshold) r.push(`Vol ${ind.volumeRatio.toFixed(1)}x`);
    if (ind.momentum < 0) r.push(`Momentum ${(ind.momentum * 100).toFixed(2)}%`);
    if (ind.trend === 'DOWN') r.push('Downtrend');
    return r;
  }

  /* ─── math helpers ─── */

  _calculateATR(highs, lows, closes, period) {
    if (highs.length < period + 1) return 0;
    const tr = [];
    for (let i = 1; i < highs.length; i++) {
      tr.push(Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      ));
    }
    return tr.slice(-period).reduce((a, b) => a + b, 0) / period;
  }

  _calculateMomentum(closes, period) {
    if (closes.length < period + 1) return 0;
    const cur = closes.at(-1);
    const past = closes.at(-1 - period);
    return past !== 0 ? (cur - past) / past : 0;
  }

  _calculateBollingerBands(closes, period, stdDevMult) {
    if (closes.length < period) return { upper: 0, middle: 0, lower: 0 };
    const slice = closes.slice(-period);
    const sma = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((s, p) => s + (p - sma) ** 2, 0) / period;
    const std = Math.sqrt(variance);
    return {
      upper: sma + stdDevMult * std,
      middle: sma,
      lower: sma - stdDevMult * std
    };
  }

  _determineTrend(closes, period = 10) {
    if (closes.length < period) return 'NEUTRAL';
    const slice = closes.slice(-period);
    const half = Math.floor(period / 2);
    const firstAvg  = slice.slice(0, half).reduce((a, b) => a + b, 0) / half;
    const secondAvg = slice.slice(half).reduce((a, b) => a + b, 0) / (period - half);
    const strength = (secondAvg - firstAvg) / firstAvg;
    if (strength > 0.002) return 'UP';
    if (strength < -0.002) return 'DOWN';
    return 'NEUTRAL';
  }

  /* ─── signal shape ─── */

  _signal(action, confidence, reason, price, indicators = {}) {
    return {
      action,                          // 'BUY' | 'SELL' | 'HOLD'
      confidence: Math.round(confidence),
      reason,
      price,
      indicators,
      timestamp: new Date(),
      strategy: this.name
    };
  }
}

module.exports = EMAStrategy;