'use strict';

/**
 * Relative Strength Index (Wilder's smoothing).
 *
 * Streaming:  `update(price)` — one new price at a time
 * Bulk:       `calculate(prices)` — full series, same length as input
 *             (first `period` positions are `null`)
 *
 * `calculate()` seeds internal state, so a following `update()` continues
 * seamlessly from the last computed RSI.
 */
class RSI {
  constructor(period = 14) {
    if (!Number.isInteger(period) || period < 2) {
      throw new Error('RSI: period must be an integer ≥ 2');
    }
    this.period = period;
    this.prices = [];
    this.avgGain = null;
    this.avgLoss = null;
    this.initialized = false;
  }

  /** Feed one new price; returns RSI or `null` while warming up. */
  update(price) {
    if (typeof price !== 'number' || Number.isNaN(price)) {
      return this.getCurrentValue();
    }

    this.prices.push(price);
    if (this.prices.length < 2) return null;

    const change = price - this.prices[this.prices.length - 2];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    if (!this.initialized) {
      // Accumulate until we have `period + 1` prices
      if (this.prices.length < this.period + 1) return null;
      this.avgGain = 0;
      this.avgLoss = 0;
      // Compute initial SMA of gains/losses over the first `period` changes
      for (let i = 1; i <= this.period; i++) {
        const c = this.prices[i] - this.prices[i - 1];
        this.avgGain += c > 0 ? c : 0;
        this.avgLoss += c < 0 ? -c : 0;
      }
      this.avgGain /= this.period;
      this.avgLoss /= this.period;
      this.initialized = true;
    } else {
      // Wilder's smoothing
      this.avgGain = (this.avgGain * (this.period - 1) + gain) / this.period;
      this.avgLoss = (this.avgLoss * (this.period - 1) + loss) / this.period;
    }

    // Only keep enough prices for the next change calculation
    if (this.prices.length > this.period + 1) {
      this.prices = this.prices.slice(-(this.period + 1));
    }

    return this._rsiFromAvgs();
  }

  /** Compute the full RSI series. Output length equals `prices.length`. */
  calculate(prices) {
    if (!Array.isArray(prices) || prices.length < this.period + 1) {
      this.reset();
      return null;
    }

    const results = new Array(this.period).fill(null);

    // Seed averages from first `period` changes
    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i <= this.period; i++) {
      const c = prices[i] - prices[i - 1];
      avgGain += c > 0 ? c : 0;
      avgLoss += c < 0 ? -c : 0;
    }
    avgGain /= this.period;
    avgLoss /= this.period;

    results.push(this._rsi(avgGain, avgLoss));

    for (let i = this.period + 1; i < prices.length; i++) {
      const c = prices[i] - prices[i - 1];
      const gain = c > 0 ? c : 0;
      const loss = c < 0 ? -c : 0;
      avgGain = (avgGain * (this.period - 1) + gain) / this.period;
      avgLoss = (avgLoss * (this.period - 1) + loss) / this.period;
      results.push(this._rsi(avgGain, avgLoss));
    }

    // Preserve streaming state — so subsequent `update()` calls work
    this.avgGain = avgGain;
    this.avgLoss = avgLoss;
    this.initialized = true;
    this.prices = prices.slice(-(this.period + 1));

    return results;
  }

  calculateLast(prices) {
    const series = this.calculate(prices);
    return series ? series[series.length - 1] : null;
  }

  getCurrentValue() {
    return this._rsiFromAvgs();
  }

  isOverbought(threshold = 70) {
    const v = this.getCurrentValue();
    return v !== null && v > threshold;
  }

  isOversold(threshold = 30) {
    const v = this.getCurrentValue();
    return v !== null && v < threshold;
  }

  isReady() {
    return this.initialized && this.avgGain !== null && this.avgLoss !== null;
  }

  reset() {
    this.prices = [];
    this.avgGain = null;
    this.avgLoss = null;
    this.initialized = false;
  }

  getInfo() {
    return {
      name: 'RSI',
      period: this.period,
      isReady: this.isReady(),
      currentValue: this.getCurrentValue(),
      avgGain: this.avgGain,
      avgLoss: this.avgLoss,
      isOverbought: this.isOverbought(),
      isOversold: this.isOversold()
    };
  }

  /* ─── internal ─── */

  _rsi(avgGain, avgLoss) {
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
  }

  _rsiFromAvgs() {
    if (!this.isReady()) return null;
    return this._rsi(this.avgGain, this.avgLoss);
  }

  /* ═══════════════════════════════════════════════════════════════
     STATIC HELPERS
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Generate buy/sell signals from a precomputed RSI series.
   * Note: `strength` is a 0–1 value for downstream confidence.
   */
  static generateSignals(rsiValues, overbought = 70, oversold = 30) {
    if (!rsiValues || rsiValues.length < 2) return [];
    const signals = [];

    for (let i = 1; i < rsiValues.length; i++) {
      const prev = rsiValues[i - 1];
      const curr = rsiValues[i];
      if (prev == null || curr == null) continue;

      // Cross UP through oversold → BUY
      if (prev <= oversold && curr > oversold) {
        signals.push({
          type: 'BUY',
          index: i,
          rsi: curr,
          reason: `RSI crossed above oversold (${oversold})`,
          strength: Math.min((oversold - prev) / 20, 1)
        });
      }

      // Cross DOWN through overbought → SELL
      if (prev >= overbought && curr < overbought) {
        signals.push({
          type: 'SELL',
          index: i,
          rsi: curr,
          reason: `RSI crossed below overbought (${overbought})`,
          strength: Math.min((prev - overbought) / 20, 1)
        });
      }
    }
    return signals;
  }

  /**
   * Simple divergence detection.
   * `prices[i]` corresponds to `rsiValues[i]`. Missing RSI values are skipped.
   */
  static findDivergences(prices, rsiValues, lookback = 5) {
    if (!Array.isArray(prices) || !Array.isArray(rsiValues)) return [];
    const n = Math.min(prices.length, rsiValues.length);
    const out = [];

    for (let i = lookback; i < n - lookback; i++) {
      if (rsiValues[i] == null) continue;

      const priceWindow = prices.slice(i - lookback, i + lookback + 1);
      const rsiWindow   = rsiValues.slice(i - lookback, i + lookback + 1)
        .filter((v) => v != null);
      if (!rsiWindow.length) continue;

      const priceHigh = Math.max(...priceWindow);
      const priceLow  = Math.min(...priceWindow);
      const rsiHigh   = Math.max(...rsiWindow);
      const rsiLow    = Math.min(...rsiWindow);

      const isLocalLow  = prices[i] === priceLow  && rsiValues[i] === rsiLow;
      const isLocalHigh = prices[i] === priceHigh && rsiValues[i] === rsiHigh;

      if (!isLocalLow && !isLocalHigh) continue;

      // Look further back for a matching extreme
      for (let j = i - lookback * 2; j >= lookback; j--) {
        if (rsiValues[j] == null) continue;

        const prevPriceWindow = prices.slice(j - lookback, j + lookback + 1);
        const prevRsiWindow   = rsiValues.slice(j - lookback, j + lookback + 1)
          .filter((v) => v != null);
        if (!prevRsiWindow.length) continue;

        const prevPriceExt = isLocalLow
          ? Math.min(...prevPriceWindow)
          : Math.max(...prevPriceWindow);
        const prevRsiExt   = isLocalLow
          ? Math.min(...prevRsiWindow)
          : Math.max(...prevRsiWindow);

        const priceExtremeMatches = isLocalLow
          ? prices[j] === prevPriceExt
          : prices[j] === prevPriceExt;
        const rsiExtremeMatches = isLocalLow
          ? rsiValues[j] === prevRsiExt
          : rsiValues[j] === prevRsiExt;
        if (!priceExtremeMatches || !rsiExtremeMatches) continue;

        if (isLocalLow && prices[i] < prevPriceExt && rsiValues[i] > prevRsiExt) {
          out.push({
            type: 'bullish',
            currentIndex: i, previousIndex: j,
            currentPrice: prices[i], previousPrice: prevPriceExt,
            currentRSI: rsiValues[i], previousRSI: prevRsiExt
          });
        } else if (isLocalHigh && prices[i] > prevPriceExt && rsiValues[i] < prevRsiExt) {
          out.push({
            type: 'bearish',
            currentIndex: i, previousIndex: j,
            currentPrice: prices[i], previousPrice: prevPriceExt,
            currentRSI: rsiValues[i], previousRSI: prevRsiExt
          });
        }
        break;
      }
    }
    return out;
  }
}

module.exports = RSI;