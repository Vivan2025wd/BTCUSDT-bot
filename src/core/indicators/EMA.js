class EMA {
  constructor(period) {
    this.period = period;
    this.multiplier = 2 / (period + 1);
    this.previousEMA = null;
    this.values = [];
    this.initialized = false;
  }

  // Calculate EMA for a single new price
  update(price) {
    if (this.previousEMA === null) {
      // First calculation - use SMA for initial value
      this.values.push(price);
      
      if (this.values.length >= this.period) {
        const sma = this.values.slice(-this.period).reduce((sum, val) => sum + val, 0) / this.period;
        this.previousEMA = sma;
        this.initialized = true;
        return sma;
      }
      return null; // Not enough data points yet
    }
    
    // EMA formula: (Close - EMA_prev) × Multiplier + EMA_prev
    const ema = (price - this.previousEMA) * this.multiplier + this.previousEMA;
    this.previousEMA = ema;
    this.values.push(price);
    
    // Keep only necessary values for memory efficiency
    if (this.values.length > this.period * 2) {
      this.values = this.values.slice(-this.period);
    }
    
    return ema;
  }

  // Calculate EMA for an array of prices (bulk calculation)
  calculate(prices) {
    if (prices.length < this.period) {
      return null;
    }

    let ema = null;
    const results = [];

    // Calculate initial SMA for the first EMA value
    const initialSMA = prices.slice(0, this.period).reduce((sum, price) => sum + price, 0) / this.period;
    ema = initialSMA;
    
    // Fill initial positions with null (not enough data)
    for (let i = 0; i < this.period - 1; i++) {
      results.push(null);
    }
    results.push(ema);

    // Calculate EMA for remaining prices
    for (let i = this.period; i < prices.length; i++) {
      ema = (prices[i] - ema) * this.multiplier + ema;
      results.push(ema);
    }

    // Update internal state to last calculated value
    this.previousEMA = ema;
    this.initialized = true;

    return results;
  }

  // Calculate only the latest EMA value from price array
  calculateLast(prices) {
    if (prices.length < this.period) {
      return null;
    }

    // Calculate initial SMA
    let ema = prices.slice(0, this.period).reduce((sum, price) => sum + price, 0) / this.period;

    // Calculate EMA for each subsequent price
    for (let i = this.period; i < prices.length; i++) {
      ema = (prices[i] - ema) * this.multiplier + ema;
    }

    return ema;
  }

  // Get the current EMA value
  getCurrentValue() {
    return this.previousEMA;
  }

  // Check if indicator has enough data
  isReady() {
    return this.initialized;
  }

  // Reset the indicator
  reset() {
    this.previousEMA = null;
    this.values = [];
    this.initialized = false;
  }

  // Get indicator info
  getInfo() {
    return {
      name: 'EMA',
      period: this.period,
      multiplier: this.multiplier,
      isReady: this.isReady(),
      currentValue: this.getCurrentValue(),
      dataPoints: this.values.length
    };
  }

  // Calculate multiple EMAs at once (useful for strategy combinations)
  static calculateMultiple(prices, periods) {
    const results = {};
    
    periods.forEach(period => {
      const ema = new EMA(period);
      results[`EMA${period}`] = ema.calculate(prices);
    });
    
    return results;
  }

  // Calculate EMA crossover signals
  static findCrossovers(fastEMA, slowEMA) {
    if (!fastEMA || !slowEMA || fastEMA.length !== slowEMA.length) {
      return [];
    }

    const crossovers = [];
    
    for (let i = 1; i < fastEMA.length; i++) {
      const prevFast = fastEMA[i - 1];
      const prevSlow = slowEMA[i - 1];
      const currFast = fastEMA[i];
      const currSlow = slowEMA[i];

      // Skip if any values are null
      if (prevFast === null || prevSlow === null || currFast === null || currSlow === null) {
        continue;
      }

      // Bullish crossover: fast EMA crosses above slow EMA
      if (prevFast <= prevSlow && currFast > currSlow) {
        crossovers.push({
          index: i,
          type: 'bullish',
          fast: currFast,
          slow: currSlow,
          difference: currFast - currSlow,
          strength: Math.abs((currFast - currSlow) / currSlow) * 100
        });
      }
      // Bearish crossover: fast EMA crosses below slow EMA
      else if (prevFast >= prevSlow && currFast < currSlow) {
        crossovers.push({
          index: i,
          type: 'bearish',
          fast: currFast,
          slow: currSlow,
          difference: currFast - currSlow,
          strength: Math.abs((currFast - currSlow) / currSlow) * 100
        });
      }
    }

    return crossovers;
  }

  // Calculate EMA convergence/divergence strength
  static calculateConvergence(fastEMA, slowEMA) {
    if (!fastEMA || !slowEMA || fastEMA.length === 0 || slowEMA.length === 0) {
      return null;
    }

    const lastIndex = Math.min(fastEMA.length, slowEMA.length) - 1;
    const fast = fastEMA[lastIndex];
    const slow = slowEMA[lastIndex];

    if (fast === null || slow === null) {
      return null;
    }

    const difference = fast - slow;
    const percentageDiff = (difference / slow) * 100;
    const isConverging = fast > slow ? 'bullish' : 'bearish';
    
    // Calculate momentum (rate of convergence/divergence)
    let momentum = 0;
    if (lastIndex > 0) {
      const prevFast = fastEMA[lastIndex - 1];
      const prevSlow = slowEMA[lastIndex - 1];
      
      if (prevFast !== null && prevSlow !== null) {
        const prevDiff = prevFast - prevSlow;
        momentum = difference - prevDiff;
      }
    }

    return {
      difference,
      percentageDiff,
      direction: isConverging,
      momentum,
      strength: Math.abs(percentageDiff),
      fast,
      slow
    };
  }
}

module.exports = EMA;
