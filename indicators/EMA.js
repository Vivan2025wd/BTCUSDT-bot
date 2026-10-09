'use strict';

/**
 * Exponential Moving Average.
 *
 * Two usage modes:
 *   • Streaming:   `update(price)` — call once per new price
 *   • Bulk:        `calculate(prices)` — one-shot, returns full series
 *
 * After `calculate(...)`, calling `update(...)` continues the series
 * from the last computed EMA (state is preserved).
 */
class EMA {
  constructor(period) {
    if (!Number.isInteger(period) || period < 1) {
      throw new Error('EMA: period must be a positive integer');
    }
    this.period = period;
    this.multiplier = 2 / (period + 1);
    this.previousEMA = null;
    this.values = [];
    this.initialized = false;
  }

  /** Feed one new price; returns the EMA or `null` if not yet ready. */
  update(price) {
    if (typeof price !== 'number' || Number.isNaN(price)) return this.previousEMA;

    if (this.previousEMA === null) {
      this.values.push(price);
      if (this.values.length >= this.period) {
        const sma =
          this.values.slice(-this.period).reduce((s, v) => s + v, 0) / this.period;
        this.previousEMA = sma;
        this.initialized = true;
        return sma;
      }
      return null;
    }

    const ema =
      (price - this.previousEMA) * this.multiplier + this.previousEMA;
    this.previousEMA = ema;
    return ema;
  }

  /**
   * Bulk calculation. Returns an array of the same length as `prices`,
   * with `null` in the first `period - 1` positions.
   *
   * Resets internal streaming state so subsequent `update()` calls
   * continue cleanly from the final value.
   */
  calculate(prices) {
    if (!Array.isArray(prices) || prices.length < this.period) {
      this.reset();
      return null;
    }

    // Seed from first `period` values
    let ema =
      prices.slice(0, this.period).reduce((s, v) => s + v, 0) / this.period;

    const results = new Array(this.period - 1).fill(null);
    results.push(ema);

    for (let i = this.period; i < prices.length; i++) {
      ema = (prices[i] - ema) * this.multiplier + ema;
      results.push(ema);
    }

    // Preserve streaming state so `update()` can continue
    this.previousEMA = ema;
    this.initialized = true;
    this.values = []; // not needed after initialization — free the memory

    return results;
  }

  /** Convenience: only the latest EMA value. */
  calculateLast(prices) {
    if (!Array.isArray(prices) || prices.length < this.period) return null;
    let ema =
      prices.slice(0, this.period).reduce((s, v) => s + v, 0) / this.period;
    for (let i = this.period; i < prices.length; i++) {
      ema = (prices[i] - ema) * this.multiplier + ema;
    }
    return ema;
  }

  getCurrentValue() {
    return this.previousEMA;
  }

  isReady() {
    return this.initialized;
  }

  reset() {
    this.previousEMA = null;
    this.values = [];
    this.initialized = false;
  }

  getInfo() {
    return {
      name: 'EMA',
      period: this.period,
      multiplier: this.multiplier,
      isReady: this.isReady(),
      currentValue: this.getCurrentValue()
    };
  }

  /* ═══════════════════════════════════════════════════════════════
     STATIC HELPERS
     ═══════════════════════════════════════════════════════════════ */

  static calculateMultiple(prices, periods) {
    const out = {};
    for (const p of periods) {
      out[`EMA${p}`] = new EMA(p).calculate(prices);
    }
    return out;
  }

  /**
   * Find crossovers between two aligned EMA series.
   * Returns [{ index, type: 'bullish'|'bearish', fast, slow, difference, strength }].
   */
  static findCrossovers(fastEMA, slowEMA) {
    if (!fastEMA || !slowEMA || fastEMA.length !== slowEMA.length) return [];

    const out = [];
    for (let i = 1; i < fastEMA.length; i++) {
      const pf = fastEMA[i - 1], ps = slowEMA[i - 1];
      const cf = fastEMA[i],     cs = slowEMA[i];
      if (pf == null || ps == null || cf == null || cs == null) continue;

      const crossedUp   = pf <= ps && cf > cs;
      const crossedDown = pf >= ps && cf < cs;
      if (!crossedUp && !crossedDown) continue;

      out.push({
        index: i,
        type: crossedUp ? 'bullish' : 'bearish',
        fast: cf,
        slow: cs,
        difference: cf - cs,
        strength: cs !== 0 ? Math.abs((cf - cs) / cs) * 100 : 0
      });
    }
    return out;
  }

  /**
   * Latest fast-vs-slow relationship.
   * Returns null if either series has no valid last value.
   */
  static calculateConvergence(fastEMA, slowEMA) {
    if (!fastEMA?.length || !slowEMA?.length) return null;

    const i = Math.min(fastEMA.length, slowEMA.length) - 1;
    const fast = fastEMA[i];
    const slow = slowEMA[i];
    if (fast == null || slow == null) return null;

    const difference = fast - slow;
    const percentageDiff = slow !== 0 ? (difference / slow) * 100 : 0;

    let momentum = 0;
    if (i > 0 && fastEMA[i - 1] != null && slowEMA[i - 1] != null) {
      momentum = difference - (fastEMA[i - 1] - slowEMA[i - 1]);
    }

    return {
      difference,
      percentageDiff,
      direction: difference >= 0 ? 'bullish' : 'bearish',  // ← clearer name
      momentum,
      strength: Math.abs(percentageDiff),
      fast,
      slow
    };
  }
}

module.exports = EMA;