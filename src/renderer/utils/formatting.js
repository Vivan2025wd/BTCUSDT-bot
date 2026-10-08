export const formatCurrency = (value, options = {}) => {
  const {
    currency = 'USD',
    minimumFractionDigits = 2,
    maximumFractionDigits = 8,
    showSymbol = true
  } = options;

  if (value === null || value === undefined || isNaN(value)) {
    return showSymbol ? '$0.00' : '0.00';
  }

  // Auto-adjust decimal places based on value size
  let maxDecimals = maximumFractionDigits;
  if (value < 0.01 && value > 0) {
    maxDecimals = 8;
  } else if (value < 1) {
    maxDecimals = 6;
  } else if (value < 100) {
    maxDecimals = 4;
  } else {
    maxDecimals = 2;
  }

  return new Intl.NumberFormat('en-US', {
    style: showSymbol ? 'currency' : 'decimal',
    currency,
    minimumFractionDigits,
    maximumFractionDigits: maxDecimals
  }).format(value);
};

export const formatPercent = (value, decimals = 2) => {
  if (value === null || value === undefined || isNaN(value)) {
    return '0.00%';
  }

  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
};

export const formatNumber = (value, decimals = 2) => {
  if (value === null || value === undefined || isNaN(value)) {
    return '0';
  }

  // Handle large numbers with K, M, B suffixes
  if (Math.abs(value) >= 1000000000) {
    return `${(value / 1000000000).toFixed(1)}B`;
  }
  if (Math.abs(value) >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }

  return value.toFixed(decimals);
};

export const formatVolume = (value) => {
  return formatNumber(value);
};

export const formatDate = (date, options = {}) => {
  const {
    includeTime = true,
    includeSeconds = false,
    format = 'en-US'
  } = options;

  if (!date) return 'N/A';

  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) return 'Invalid Date';

  const dateOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  };

  if (includeTime) {
    dateOptions.hour = '2-digit';
    dateOptions.minute = '2-digit';
    
    if (includeSeconds) {
      dateOptions.second = '2-digit';
    }
  }

  return dateObj.toLocaleDateString(format, dateOptions);
};

export const formatTimeAgo = (date) => {
  if (!date) return 'Never';

  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - dateObj.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
};

export const formatOrderSide = (side) => {
  return side?.toLowerCase() === 'buy' ? 'BUY' : 'SELL';
};export default Portfolio;