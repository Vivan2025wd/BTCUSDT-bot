'use strict';

/**
 * Volume analytics.
 *
 * Most methods accept either:
 *   • An array of numbers (plain close prices or volumes), or
 *   • An array of candle objects `{ open, high, low, close, volume }`
 *     for methods that need OHLC.
 *
 * `_normalize(prices, volumes)` handles both forms.
 */
class VolumeAnalyzer {
  constructor() {
    this.name = 'Volume';
  }

  /* ═══════════════════════════════════════════════════════════════
     NORMALIZERS
     ═══════════════════════════════════════════════════════════════ */

  /** Return { closes, highs, lows, volumes } from any input shape. */
  _normalize(prices, volumes) {
    if (!Array.isArray(prices)) {
      return { closes: [], highs: [], lows: [], volumes: [] };
    }

    // Candle-object form: prices[i] has .close / .high / .low / .volume
    if (typeof prices[0] === 'object' && prices[0] !== null) {
      const closes  = prices.map((c) => Number(c.close ?? c.c ?? 0));
      const highs   = prices.map((c) => Number(c.high  ?? c.h ?? c.close ?? 0));
      const lows    = prices.map((c) => Number(c.low   ?? c.l    ?? c.close ?? 0));
      const vols    = prices.map((c) => Number(c.volume ?? c.v ?? 0));
      return { closes, highs, lows, volumes: vols };
    }

    // Number form: `prices` are closes; `volumes` is a parallel array
    const closes = prices.map(Number);
    const vols   = (volumes || []).map(Number);
    return { closes, highs: closes, lows: closes, volumes: vols };
  }

  /* ═══════════════════════════════════════════════════════════════
     CORE
     ═══════════════════════════════════════════════════════════════ */

  calculateVMA(volumes, period = 20) {
    if (!Array.isArray(volumes) || volumes.length < period) return null;
    const slice = volumes.slice(-period);
    return slice.reduce((s, v) => s + v, 0) / period;
  }

  calculateVolumeROC(volumes, period = 1) {
    if (!Array.isArray(volumes) || volumes.length < period + 1) return null;
    const curr = volumes[volumes.length - 1];
    const prev = volumes[volumes.length - 1 - period];
    if (prev === 0) return 0;
    return ((curr - prev) / prev) * 100;
  }

  calculateOBV(prices, volumes) {
    const { closes, volumes: vols } = this._normalize(prices, volumes);
    if (closes.length !== vols.length || closes.length < 2) return null;

    const obv = [0];
    let running = 0;
    for (let i = 1; i < closes.length; i++) {
      if (closes[i] > closes[i - 1])      running += vols[i];
      else if (closes[i] < closes[i - 1]) running -= vols[i];
      obv.push(running);
    }
    return obv;
  }

  /** Volume-Weighted Average Price over the given window (or all history). */
  calculateVWAP(prices, volumes) {
    const { closes, highs, lows, volumes: vols } = this._normalize(prices, volumes);
    const n = Math.min(closes.length, vols.length);
    if (n === 0) return null;

    let pv = 0, v = 0;
    for (let i = 0; i < n; i++) {
      const typical = (highs[i] + lows[i] + closes[i]) / 3;
      pv += typical * vols[i];
      v  += vols[i];
    }
    return v > 0 ? pv / v : null;
  }

  detectVolumeSpike(volumes, threshold = 2.0, period = 20) {
    if (!Array.isArray(volumes) || volumes.length < period + 1) return false;
    const curr = volumes[volumes.length - 1];
    const avg  = this.calculateVMA(volumes.slice(0, -1), period);
    return avg != null && avg > 0 && curr > avg * threshold;
  }

  calculateVolumeOscillator(volumes, shortPeriod = 5, longPeriod = 10) {
    if (!Array.isArray(volumes) || volumes.length < longPeriod) return null;
    const s = this.calculateVMA(volumes, shortPeriod);
    const l = this.calculateVMA(volumes, longPeriod);
    if (s == null || l == null || l === 0) return null;
    return ((s - l) / l) * 100;
  }

  /**
   * Classify the last bar's volume context.
   * Returns { signal: 'bullish'|'bearish'|'neutral', strength: 0–1, reason, volumeRatio }.
   */
  analyzeVolumePattern(prices, volumes, period = 20) {
    const { closes, volumes: vols } = this._normalize(prices, volumes);
    if (vols.length < period + 1) {
      return { signal: 'neutral', strength: 0, reason: 'insufficient_data', volumeRatio: 1 };
    }

    const currVol = vols[vols.length - 1];
    const avgVol  = this.calculateVMA(vols.slice(0, -1), period);
    const ratio   = avgVol > 0 ? currVol / avgVol : 1;

    const priceChange = closes[closes.length - 1] - closes[closes.length - 2];

    let signal = 'neutral', strength = 0, reason = 'normal_volume';

    if (ratio > 1.5 && priceChange > 0) {
      signal = 'bullish'; strength = Math.min(ratio * 0.3, 1); reason = 'high_volume_price_up';
    } else if (ratio > 1.5 && priceChange < 0) {
      signal = 'bearish'; strength = Math.min(ratio * 0.3, 1); reason = 'high_volume_price_down';
    } else if (ratio < 0.7) {
      signal = 'neutral'; strength = 0.1; reason = 'low_volume_weak_signal';
    }

    return { signal, strength, reason, volumeRatio: ratio };
  }

  /**
   * Combined volume signal.
   * `confidence` is 0–1 (matches RSI/EMA strength conventions).
   */
  generateVolumeSignal(prices, volumes, options = {}) {
    const {
      vmaPeriod = 20,
      spikeThreshold = 2.0,
      oscShortPeriod = 5,
      oscLongPeriod = 10
    } = options;

    const { volumes: vols } = this._normalize(prices, volumes);

    const pattern   = this.analyzeVolumePattern(prices, volumes, vmaPeriod);
    const spike     = this.detectVolumeSpike(vols, spikeThreshold, vmaPeriod);
    const oscillator = this.calculateVolumeOscillator(vols, oscShortPeriod, oscLongPeriod);

    let signal = 'neutral';
    let confidence = 0;

    if (pattern.signal === 'bullish' && spike) {
      signal = 'strong_buy';
      confidence = Math.min(pattern.strength + 0.3, 1);
    } else if (pattern.signal === 'bearish' && spike) {
      signal = 'strong_sell';
      confidence = Math.min(pattern.strength + 0.3, 1);
    } else if (pattern.signal === 'bullish') {
      signal = 'buy';
      confidence = pattern.strength;
    } else if (pattern.signal === 'bearish') {
      signal = 'sell';
      confidence = pattern.strength;
    }

    return {
      signal,
      confidence,
      indicators: {
        volumeSpike: spike,
        volumeOscillator: oscillator,
        volumeRatio: pattern.volumeRatio,
        pattern
      },
      timestamp: new Date()
    };
  }
}

module.exports = VolumeAnalyzer;