/**
 * Formatting utilities for the trading bot.
 * All functions are pure and safe against null/undefined/NaN/Infinity.
 */

/* ═══════════════════════════════════════════════════════════════
   NUMERIC GUARDS
   ═══════════════════════════════════════════════════════════════ */

const isInvalidNumber = (v) =>
  v === null || v === undefined || typeof v !== 'number' || Number.isNaN(v) || !Number.isFinite(v);

/* ═══════════════════════════════════════════════════════════════
   CURRENCY
   ═══════════════════════════════════════════════════════════════ */

/**
 * Format a number as currency with auto-scaled decimals.
 *
 * - Values < 0.01  → up to 8 decimals (crypto micro-caps)
 * - Values < 1     → up to 6 decimals
 * - Values < 100   → up to 4 decimals
 * - Values ≥ 100   → up to 2 decimals
 *
 * @param {number} value
 * @param {Object} [options]
 * @param {string} [options.currency='USD']
 * @param {number} [options.minimumFractionDigits=2]
 * @param {number} [options.maximumFractionDigits=8]  Upper bound; auto-scale will not exceed this.
 * @param {boolean} [options.showSymbol=true]
 * @param {boolean} [options.signed=false]  Prefix `+` for positive values.
 * @param {string} [options.fallback='$0.00']  Returned when value is invalid.
 * @returns {string}
 */
export const formatCurrency = (value, options = {}) => {
  const {
    currency = 'USD',
    minimumFractionDigits = 2,
    maximumFractionDigits = 8,
    showSymbol = true,
    signed = false,
    fallback = showSymbol ? '$0.00' : '0.00'
  } = options;

  if (isInvalidNumber(value)) return fallback;

  const abs = Math.abs(value);
  let maxDecimals;
  if (abs < 0.01)       maxDecimals = 8;
  else if (abs < 1)     maxDecimals = 6;
  else if (abs < 100)   maxDecimals = 4;
  else                  maxDecimals = 2;

  // Respect caller's ceiling
  maxDecimals = Math.min(maxDecimals, maximumFractionDigits);
  const minDecimals = Math.min(minimumFractionDigits, maxDecimals);

  const formatted = new Intl.NumberFormat('en-US', {
    style: showSymbol ? 'currency' : 'decimal',
    currency,
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals
  }).format(Math.abs(value));

  if (value < 0) return `-${formatted}`;
  if (signed && value > 0) return `+${formatted}`;
  return formatted;
};

/* ═══════════════════════════════════════════════════════════════
   PERCENT
   ═══════════════════════════════════════════════════════════════ */

/**
 * Format a number as a signed percentage.
 *
 * @param {number} value
 * @param {Object} [options]
 * @param {number} [options.decimals=2]
 * @param {boolean} [options.signed=true]  Always show +/- prefix.
 * @param {string} [options.fallback='0.00%']
 * @returns {string}
 */
export const formatPercent = (value, options = {}) => {
  const { decimals = 2, signed = true, fallback = '0.00%' } = options;

  if (isInvalidNumber(value)) return fallback;

  const sign = signed ? (value >= 0 ? '+' : '') : '';
  return `${sign}${value.toFixed(decimals)}%`;
};

/* ═══════════════════════════════════════════════════════════════
   NUMBER (K/M/B abbreviations)
   ═══════════════════════════════════════════════════════════════ */

/**
 * Format a large number with K / M / B suffixes.
 *
 * @param {number} value
 * @param {number} [decimals=2]
 * @returns {string}
 */
export const formatNumber = (value, decimals = 2) => {
  if (isInvalidNumber(value)) return '0';

  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(1)}T`;
  if (abs >= 1e9)  return `${sign}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6)  return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3)  return `${sign}${(abs / 1e3).toFixed(1)}K`;

  return value.toFixed(decimals);
};

/**
 * Alias kept for backwards-compat with existing components.
 */
export const formatVolume = (value) => formatNumber(value);

/**
 * Compact price for axis ticks and tickers.
 * 67432.18 → "$67.4k"
 * 1.2345   → "$1.23"
 * 0.00012  → "$0.00012"
 *
 * @param {number} value
 * @returns {string}
 */
export const formatCompactPrice = (value) => {
  if (isInvalidNumber(value)) return '$0';

  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}k`;
  if (abs >= 1)   return `${sign}$${abs.toFixed(2)}`;
  if (abs >= 0.01) return `${sign}$${abs.toFixed(4)}`;
  return `${sign}$${abs.toFixed(6)}`;
};

/* ═══════════════════════════════════════════════════════════════
   QUANTITY
   ═══════════════════════════════════════════════════════════════ */

/**
 * Format a crypto quantity — trims trailing zeros, keeps significant digits.
 * 0.00100000 → "0.001"
 * 1.23456789 → "1.23456789"
 *
 * @param {number} value
 * @param {number} [maxDecimals=8]
 * @returns {string}
 */
export const formatQuantity = (value, maxDecimals = 8) => {
  if (isInvalidNumber(value)) return '0';

  const fixed = value.toFixed(maxDecimals);
  // Trim trailing zeros and possible trailing dot
  return fixed.replace(/\.?0+$/, '');
};

/* ═══════════════════════════════════════════════════════════════
   DATE / TIME
   ═══════════════════════════════════════════════════════════════ */

/**
 * Format a date (or ISO string) for display.
 *
 * @param {Date|string|number} date
 * @param {Object} [options]
 * @param {boolean} [options.includeTime=true]
 * @param {boolean} [options.includeSeconds=false]
 * @param {string}  [options.format='en-US']
 * @returns {string}
 */
export const formatDate = (date, options = {}) => {
  const {
    includeTime = true,
    includeSeconds = false,
    format = 'en-US'
  } = options;

  if (!date) return 'N/A';

  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return 'Invalid Date';

  const dateOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  };

  if (includeTime) {
    dateOptions.hour = '2-digit';
    dateOptions.minute = '2-digit';
    if (includeSeconds) dateOptions.second = '2-digit';
  }

  return d.toLocaleDateString(format, dateOptions);
};

/**
 * Short date only (no time): "Jan 15, 2024"
 */
export const formatDateShort = (date) =>
  formatDate(date, { includeTime: false });

/**
 * Time only: "14:32"
 */
export const formatTime = (date, includeSeconds = false) => {
  if (!date) return '--:--';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {})
  });
};

/**
 * Relative time: "3m ago", "2h ago", "5d ago", "3mo ago", "2y ago".
 *
 * @param {Date|string|number} date
 * @returns {string}
 */
export const formatTimeAgo = (date) => {
  if (!date) return 'Never';

  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return 'Invalid date';

  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 5)     return 'just now';
  if (diffSec < 60)    return `${diffSec}s ago`;

  const min = Math.floor(diffSec / 60);
  if (min < 60)        return `${min}m ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24)         return `${hr}h ago`;

  const day = Math.floor(hr / 24);
  if (day < 7)         return `${day}d ago`;

  const wk = Math.floor(day / 7);
  if (day < 30)        return `${wk}w ago`;

  const mo = Math.floor(day / 30);
  if (day < 365)       return `${mo}mo ago`;

  const yr = Math.floor(day / 365);
  return `${yr}y ago`;
};

/**
 * Format a duration in milliseconds as "1h 23m" / "45s" / "2m 12s".
 * Useful for backtest progress or uptime.
 *
 * @param {number} ms
 * @returns {string}
 */
export const formatDuration = (ms) => {
  if (isInvalidNumber(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.floor(ms)}ms`;

  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;

  const m = Math.floor(s / 60);
  if (m < 60) {
    const rem = s % 60;
    return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
  }

  const h = Math.floor(m / 60);
  const remM = m % 60;
  return remM > 0 ? `${h}h ${remM}m` : `${h}h`;
};

/* ═══════════════════════════════════════════════════════════════
   TRADING-SPECIFIC
   ═══════════════════════════════════════════════════════════════ */

/**
 * Uppercase order side.
 * 'buy' | 'BUY' | 'Buy' → 'BUY'
 * anything else        → 'SELL'
 *
 * @param {string} side
 * @returns {'BUY' | 'SELL'}
 */
export const formatOrderSide = (side) => {
  return String(side).toLowerCase() === 'buy' ? 'BUY' : 'SELL';
};

/**
 * Format a symbol for display: "BTCUSDT" → "BTC / USDT".
 *
 * @param {string} symbol
 * @param {string} [quote='USDT']
 * @returns {string}
 */
export const formatSymbol = (symbol, quote = 'USDT') => {
  if (!symbol) return '—';
  if (symbol.includes('/')) return symbol;
  if (symbol.endsWith(quote)) {
    return `${symbol.slice(0, -quote.length)} / ${quote}`;
  }
  return symbol;
};

/**
 * Format an allocation percentage from a part/total pair.
 *
 * @param {number} part
 * @param {number} total
 * @param {number} [decimals=1]
 * @returns {string}
 */
export const formatAllocation = (part, total, decimals = 1) => {
  if (isInvalidNumber(part) || isInvalidNumber(total) || total === 0) {
    return '0.0%';
  }
  return `${((part / total) * 100).toFixed(decimals)}%`;
};