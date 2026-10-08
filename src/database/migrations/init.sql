-- Trading Bot Database Schema
-- SQLite database initialization

-- Settings table for bot configuration
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    encrypted BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Trades table for trade history
CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    strategy_name TEXT NOT NULL,
    exchange TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL, -- 'BUY' or 'SELL'
    type TEXT NOT NULL, -- 'MARKET', 'LIMIT', 'STOP_LOSS', 'TAKE_PROFIT'
    quantity DECIMAL(18, 8) NOT NULL,
    price DECIMAL(18, 8),
    fill_price DECIMAL(18, 8),
    status TEXT NOT NULL, -- 'PENDING', 'FILLED', 'PARTIALLY_FILLED', 'CANCELLED', 'FAILED'
    order_id TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    profit_loss DECIMAL(18, 8) DEFAULT 0,
    fees DECIMAL(18, 8) DEFAULT 0,
    notes TEXT
);

-- Balance snapshots for portfolio tracking
CREATE TABLE IF NOT EXISTS balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exchange TEXT NOT NULL,
    asset TEXT NOT NULL,
    free_balance DECIMAL(18, 8) NOT NULL,
    locked_balance DECIMAL(18, 8) DEFAULT 0,
    usd_value DECIMAL(18, 8),
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Performance metrics
CREATE TABLE IF NOT EXISTS performance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    total_balance DECIMAL(18, 8) NOT NULL,
    daily_pnl DECIMAL(18, 8) DEFAULT 0,
    total_trades INTEGER DEFAULT 0,
    winning_trades INTEGER DEFAULT 0,
    losing_trades INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Bot logs for debugging and monitoring
CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    level TEXT NOT NULL, -- 'INFO', 'WARN', 'ERROR', 'DEBUG'
    message TEXT NOT NULL,
    category TEXT, -- 'TRADE', 'STRATEGY', 'EXCHANGE', 'SYSTEM'
    data TEXT, -- JSON data if needed
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Market data cache (optional, for backtesting)
CREATE TABLE IF NOT EXISTS market_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exchange TEXT NOT NULL,
    symbol TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    open DECIMAL(18, 8) NOT NULL,
    high DECIMAL(18, 8) NOT NULL,
    low DECIMAL(18, 8) NOT NULL,
    close DECIMAL(18, 8) NOT NULL,
    volume DECIMAL(18, 8) NOT NULL,
    timestamp DATETIME NOT NULL,
    UNIQUE(exchange, symbol, timeframe, timestamp)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp);
CREATE INDEX IF NOT EXISTS idx_trades_strategy ON trades(strategy_name);
CREATE INDEX IF NOT EXISTS idx_balances_exchange_asset ON balances(exchange, asset);
CREATE INDEX IF NOT EXISTS idx_balances_timestamp ON balances(timestamp);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_logs_level ON logs(level);
CREATE INDEX IF NOT EXISTS idx_market_data_symbol_time ON market_data(symbol, timestamp);

-- Insert default settings
INSERT OR IGNORE INTO settings (key, value) VALUES 
('bot_enabled', 'false'),
('risk_percentage', '2.0'),
('stop_loss_percentage', '3.0'),
('take_profit_percentage', '5.0'),
('max_daily_trades', '10'),
('default_exchange', 'binance'),
('default_strategy', 'ema_crossover'),
('log_level', 'INFO'),
('notification_enabled', 'true'),
('backtesting_enabled', 'true');