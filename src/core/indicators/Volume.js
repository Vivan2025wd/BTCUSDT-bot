class VolumeAnalyzer {
  constructor() {
    this.name = 'Volume';
  }

  // Calculate Volume Moving Average
  calculateVMA(volumes, period = 20) {
    if (volumes.length < period) return null;
    
    const sum = volumes.slice(-period).reduce((a, b) => a + b, 0);
    return sum / period;
  }

  // Calculate Volume Rate of Change
  calculateVolumeROC(volumes, period = 1) {
    if (volumes.length < period + 1) return null;
    
    const current = volumes[volumes.length - 1];
    const previous = volumes[volumes.length - 1 - period];
    
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  }

  // Calculate On-Balance Volume
  calculateOBV(prices, volumes) {
    if (prices.length !== volumes.length || prices.length < 2) return null;
    
    let obv = 0;
    const obvArray = [0];
    
    for (let i = 1; i < prices.length; i++) {
      if (prices[i] > prices[i - 1]) {
        obv += volumes[i];
      } else if (prices[i] < prices[i - 1]) {
        obv -= volumes[i];
      }
      obvArray.push(obv);
    }
    
    return obvArray;
  }

  // Calculate Volume Weighted Average Price (VWAP)
  calculateVWAP(prices, volumes) {
    if (prices.length !== volumes.length || prices.length === 0) return null;
    
    let totalVolume = 0;
    let totalVolumePrice = 0;
    
    for (let i = 0; i < prices.length; i++) {
      const typicalPrice = (prices[i].high + prices[i].low + prices[i].close) / 3;
      totalVolumePrice += typicalPrice * volumes[i];
      totalVolume += volumes[i];
    }
    
    return totalVolume > 0 ? totalVolumePrice / totalVolume : null;
  }

  // Detect volume spikes
  detectVolumeSpike(volumes, threshold = 2.0, period = 20) {
    if (volumes.length < period + 1) return false;
    
    const currentVolume = volumes[volumes.length - 1];
    const avgVolume = this.calculateVMA(volumes.slice(0, -1), period);
    
    return avgVolume > 0 && currentVolume > (avgVolume * threshold);
  }

  // Calculate Volume Oscillator
  calculateVolumeOscillator(volumes, shortPeriod = 5, longPeriod = 10) {
    if (volumes.length < longPeriod) return null;
    
    const shortVMA = this.calculateVMA(volumes, shortPeriod);
    const longVMA = this.calculateVMA(volumes, longPeriod);
    
    if (!shortVMA || !longVMA || longVMA === 0) return null;
    
    return ((shortVMA - longVMA) / longVMA) * 100;
  }

  // Analyze volume pattern
  analyzeVolumePattern(prices, volumes, period = 20) {
    if (prices.length !== volumes.length || prices.length < period) {
      return { signal: 'neutral', strength: 0, reason: 'insufficient_data' };
    }

    const currentVolume = volumes[volumes.length - 1];
    const avgVolume = this.calculateVMA(volumes.slice(0, -1), period);
    const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;

    const currentPrice = prices[prices.length - 1];
    const previousPrice = prices[prices.length - 2];
    const priceChange = currentPrice - previousPrice;

    let signal = 'neutral';
    let strength = 0;
    let reason = 'normal_volume';

    // High volume with price increase
    if (volumeRatio > 1.5 && priceChange > 0) {
      signal = 'bullish';
      strength = Math.min(volumeRatio * 0.3, 1.0);
      reason = 'high_volume_price_up';
    }
    // High volume with price decrease
    else if (volumeRatio > 1.5 && priceChange < 0) {
      signal = 'bearish';
      strength = Math.min(volumeRatio * 0.3, 1.0);
      reason = 'high_volume_price_down';
    }
    // Low volume
    else if (volumeRatio < 0.7) {
      signal = 'neutral';
      strength = 0.1;
      reason = 'low_volume_weak_signal';
    }

    return { signal, strength, reason, volumeRatio };
  }

  // Generate volume-based trading signal
  generateVolumeSignal(prices, volumes, options = {}) {
    const {
      vmaPeriod = 20,
      spikeThreshold = 2.0,
      oscShortPeriod = 5,
      oscLongPeriod = 10
    } = options;

    const analysis = this.analyzeVolumePattern(prices, volumes, vmaPeriod);
    const volumeSpike = this.detectVolumeSpike(volumes, spikeThreshold, vmaPeriod);
    const volumeOsc = this.calculateVolumeOscillator(volumes, oscShortPeriod, oscLongPeriod);

    let overallSignal = 'neutral';
    let confidence = 0;
    const indicators = {
      volumeSpike,
      volumeOscillator: volumeOsc,
      volumeRatio: analysis.volumeRatio,
      pattern: analysis
    };

    // Combine indicators for final signal
    if (analysis.signal === 'bullish' && volumeSpike) {
      overallSignal = 'strong_buy';
      confidence = Math.min(analysis.strength + 0.3, 1.0);
    } else if (analysis.signal === 'bearish' && volumeSpike) {
      overallSignal = 'strong_sell';
      confidence = Math.min(analysis.strength + 0.3, 1.0);
    } else if (analysis.signal === 'bullish') {
      overallSignal = 'buy';
      confidence = analysis.strength;
    } else if (analysis.signal === 'bearish') {
      overallSignal = 'sell';
      confidence = analysis.strength;
    }

    return {
      signal: overallSignal,
      confidence,
      indicators,
      timestamp: new Date()
    };
  }
}

module.exports = VolumeAnalyzer;
