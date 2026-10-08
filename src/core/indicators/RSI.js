class RSI {
  constructor(period = 14) {
    this.period = period;
    this.prices = [];
    this.gains = [];
    this.losses = [];
    this.avgGain = null;
    this.avgLoss = null;
    this.initialized = false;
  }

  // Update RSI with a new price
  update(price) {
    this.prices.push(price);
    
    // Need at least 2 prices to calculate change
    if (this.prices.length < 2) {
      return null;
    }
    
    // Calculate price change
    const change = price - this.prices[this.prices.length - 2];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    
    this.gains.push(gain);
    this.losses.push(loss);
    
    // Need enough data points for initial calculation
    if (this.gains.length < this.period) {
      return null;
    }
    
    // Calculate initial averages (SMA for first calculation)
    if (!this.initialized) {
      this.avgGain = this.gains.slice(-this.period).reduce((sum, val) => sum + val, 0) / this.period;
      this.avgLoss = this.losses.slice(-this.period).reduce((sum, val) => sum + val, 0) / this.period;
      this.initialized = true;
    } else {
      // Use Wilder's smoothing method for subsequent calculations
      this.avgGain = ((this.avgGain * (this.period - 1)) + gain) / this.period;
      this.avgLoss = ((this.avgLoss * (this.period - 1)) + loss) / this.period;
    }
    
    // Calculate RSI
    if (this.avgLoss === 0) {
      return 100; // All gains, no losses
    }
    
    const rs = this.avgGain / this.avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    // Keep arrays manageable
    if (this.prices.length > this.period * 2) {
      this.prices = this.prices.slice(-this.period);
      this.gains = this.gains.slice(-this.period);
      this.losses = this.losses.slice(-this.period);
    }
    
    return rsi;
  }

  // Calculate RSI for an array of prices
  calculate(prices) {
    if (prices.length < this.period + 1) {
      return null;
    }

    const results = [];
    const changes = [];
    const gains = [];
    const losses = [];

    // Calculate price changes
    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      changes.push(change);
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }

    // Fill initial positions with null
    for (let i = 0; i < this.period; i++) {
      results.push(null);
    }

    // Calculate initial averages using SMA
    let avgGain = gains.slice(0, this.period).reduce((sum, val) => sum + val, 0) / this.period;
    let avgLoss = losses.slice(0, this.period).reduce((sum, val) => sum + val, 0) / this.period;

    // Calculate first RSI value
    let rs = avgLoss === 0 ? 0 : avgGain / avgLoss;
    let rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
    results.push(rsi);

    // Calculate subsequent RSI values using Wilder's smoothing
    for (let i = this.period; i < gains.length; i++) {
      avgGain = ((avgGain * (this.period - 1)) + gains[i]) / this.period;
      avgLoss = ((avgLoss * (this.period - 1)) + losses[i]) / this.period;
      
      rs = avgLoss === 0 ? 0 : avgGain / avgLoss;
      rsi = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
      results.push(rsi);
    }

    // Update internal state
    this.avgGain = avgGain;
    this.avgLoss = avgLoss;
    this.initialized = true;

    return results;
  }

  // Calculate only the latest RSI value
  calculateLast(prices) {
    const results = this.calculate(prices);
    return results ? results[results.length - 1] : null;
  }

  // Get current RSI value
  getCurrentValue() {
    if (!this.initialized || this.avgLoss === null) {
      return null;
    }
    
    const rs = this.avgLoss === 0 ? 0 : this.avgGain / this.avgLoss;
    return this.avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
  }

  // Check if RSI is overbought (>70)
  isOverbought(threshold = 70) {
    const current = this.getCurrentValue();
    return current !== null && current > threshold;
  }

  // Check if RSI is oversold (<30)
  isOversold(threshold = 30) {
    const current = this.getCurrentValue();
    return current !== null && current < threshold;
  }

  // Check if indicator is ready
  isReady() {
    return this.initialized && this.avgGain !== null && this.avgLoss !== null;
  }

  // Reset the indicator
  reset() {
    this.prices = [];
    this.gains = [];
    this.losses = [];
    this.avgGain = null;
    this.avgLoss = null;
    this.initialized = false;
  }

  // Get indicator information
  getInfo() {
    return {
      name: 'RSI',
      period: this.period,
      isReady: this.isReady(),
      currentValue: this.getCurrentValue(),
      avgGain: this.avgGain,
      avgLoss: this.avgLoss,
      isOverbought: this.isOverbought(),
      isOversold: this.isOversold(),
      dataPoints: this.prices.length
    };
  }

  // Find RSI divergences
  static findDivergences(prices, rsiValues, lookback = 5) {
    if (!prices || !rsiValues || prices.length !== rsiValues.length + 1) {
      return [];
    }

    const divergences = [];
    const priceLength = prices.length;
    const rsiLength = rsiValues.length;

    for (let i = lookback; i < rsiLength - lookback; i++) {
      if (rsiValues[i] === null) continue;

      // Find local highs and lows in both price and RSI
      const priceSlice = prices.slice(i - lookback + 1, i + lookback + 2); // +1 because prices array is longer
      const rsiSlice = rsiValues.slice(i - lookback, i + lookback + 1);

      const priceHigh = Math.max(...priceSlice);
      const priceLow = Math.min(...priceSlice);
      const rsiHigh = Math.max(...rsiSlice);
      const rsiLow = Math.min(...rsiSlice);

      const priceIndex = i + 1; // Adjust for price array offset
      const currentPrice = prices[priceIndex];
      const currentRSI = rsiValues[i];

      // Bullish divergence: price makes lower low, RSI makes higher low
      if (currentPrice === priceLow && currentRSI === rsiLow) {
        // Look for previous low
        for (let j = i - lookback * 2; j >= lookback; j--) {
          if (rsiValues[j] === null) continue;
          
          const prevPriceSlice = prices.slice(j - lookback + 1, j + lookback + 2);
          const prevRsiSlice = rsiValues.slice(j - lookback, j + lookback + 1);
          
          const prevPriceLow = Math.min(...prevPriceSlice);
          const prevRsiLow = Math.min(...prevRsiSlice);
          
          if (prices[j + 1] === prevPriceLow && rsiValues[j] === prevRsiLow) {
            if (currentPrice < prevPriceLow && currentRSI > prevRsiLow) {
              divergences.push({
                type: 'bullish',
                currentIndex: i,
                previousIndex: j,
                currentPrice,
                previousPrice: prevPriceLow,
                currentRSI,
                previousRSI: prevRsiLow,
                strength: (currentRSI - prevRsiLow) / (prevPriceLow - currentPrice)
              });
            }
            break;
          }
        }
      }

      // Bearish divergence: price makes higher high, RSI makes lower high
      if (currentPrice === priceHigh && currentRSI === rsiHigh) {
        for (let j = i - lookback * 2; j >= lookback; j--) {
          if (rsiValues[j] === null) continue;
          
          const prevPriceSlice = prices.slice(j - lookback + 1, j + lookback + 2);
          const prevRsiSlice = rsiValues.slice(j - lookback, j + lookback + 1);
          
          const prevPriceHigh = Math.max(...prevPriceSlice);
          const prevRsiHigh = Math.max(...prevRsiSlice);
          
          if (prices[j + 1] === prevPriceHigh && rsiValues[j] === prevRsiHigh) {
            if (currentPrice > prevPriceHigh && currentRSI < prevRsiHigh) {
              divergences.push({
                type: 'bearish',
                currentIndex: i,
                previousIndex: j,
                currentPrice,
                previousPrice: prevPriceHigh,
                currentRSI,
                previousRSI: prevRsiHigh,
                strength: (prevRsiHigh - currentRSI) / (currentPrice - prevPriceHigh)
              });
            }
            break;
          }
        }
      }
    }

    return divergences;
  }

  // Generate trading signals based on RSI levels
  static generateSignals(rsiValues, overboughtLevel = 70, oversoldLevel = 30) {
    if (!rsiValues || rsiValues.length < 2) {
      return [];
    }

    const signals = [];

    for (let i = 1; i < rsiValues.length; i++) {
      const current = rsiValues[i];
      const previous = rsiValues[i - 1];

      if (current === null || previous === null) {
        continue;
      }

      // Buy signal: RSI crosses above oversold level
      if (previous <= oversoldLevel && current > oversoldLevel) {
        signals.push({
          type: 'BUY',
          index: i,
          rsi: current,
          reason: `RSI crossed above oversold level (${oversoldLevel})`,
          strength: Math.min((50 - current) / 20, 1) // Stronger signal closer to 30
        });
      }

      // Sell signal: RSI crosses below overbought level
      if (previous >= overboughtLevel && current < overboughtLevel) {
        signals.push({
          type: 'SELL',
          index: i,
          rsi: current,
          reason: `RSI crossed below overbought level (${overboughtLevel})`,
          strength: Math.min((current - 50) / 20, 1) // Stronger signal closer to 70
        });
      }
    }

    return signals;
  }
}

module.exports = RSI;
