-- Trading Bot Database Schema
-- SQLite database initialization

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ── Settings ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    key          TEXT UNIQUE NOT NULL,
    value        TEXT NOT NULL,
    encrypted    BOOLEAN DEFAULT FALSE,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Trades ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trades (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,

    -- identification
    strategy_name    TEXT     DEFAULT 'manual',
    exchange         TEXT     DEFAULT 'unknown',
    symbol           TEXT     NOT NULL,           -- e.g. 'BTCUSDT'
    side             TEXT     NOT NULL,           -- 'BUY' | 'SELL'
    type             TEXT     DEFAULT 'MARKET',   -- MARKET | LIMIT | STOP_LOSS | TAKE_PROFIT

    -- sizing / pricing
    quantity         DECIMAL(18,8) NOT NULL,
    price            DECIMAL(18,8),               -- intended / limit price
    fill_price       DECIMAL(18,8),               -- actual fill
    entry_price      DECIMAL(18,8),               -- for closed trades
    exit_price       DECIMAL(18,8),               -- for closed trades

    -- lifecycle
    status           TEXT     DEFAULT 'FILLED',   -- PENDING | FILLED | PARTIALLY_FILLED | CANCELLED | FAILED | CLOSED
    order_id         TEXT,
    opened_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at        DATETIME,

    -- P&L (null for open trades, filled in on close)
    profit_loss      DECIMAL(18,8) DEFAULT 0,     -- absolute USDT
    pnl_percent      DECIMAL(18,8) DEFAULT 0,     -- percentage
    fees             DECIMAL(18,8) DEFAULT 0,

    -- metadata
    reason           TEXT,                        -- signal reason ('EMA cross', etc.)
    signal_data      TEXT,                        -- JSON blob for audit
    notes            TEXT,

    timestamp        DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trades_symbol        ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_trades_timestamp     ON trades(timestamp);
CREATE INDEX IF NOT EXISTS idx_trades_closed_at     ON trades(closed_at);
CREATE INDEX IF NOT EXISTS idx_trades_strategy      ON trades(strategy_name);
CREATE INDEX IF NOT EXISTS idx_trades_status        ON trades(status);

-- ── Balances ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS balances (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    exchange       TEXT NOT NULL,
    asset          TEXT NOT NULL,
    free_balance   DECIMAL(18,8) NOT NULL,
    locked_balance DECIMAL(18,8) DEFAULT 0,
    usd_value      DECIMAL(18,8),
    timestamp      DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_balances_exchange_asset ON balances(exchange, asset);
CREATE INDEX IF NOT EXISTS idx_balances_timestamp      ON balances(timestamp);

-- ── Performance ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS performance (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    date            DATE UNIQUE NOT NULL,
    total_balance   DECIMAL(18,8) NOT NULL,
    daily_pnl       DECIMAL(18,8) DEFAULT 0,
    total_trades    INTEGER DEFAULT 0,
    winning_trades  INTEGER DEFAULT 0,
    losing_trades   INTEGER DEFAULT 0,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ── Logs ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS logs (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    level     TEXT NOT NULL,
    message   TEXT NOT NULL,
    category  TEXT,
    data      TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_logs_level     ON logs(level);

-- ── Market data (backtesting cache) ─────────────────────────
CREATE TABLE IF NOT EXISTS market_data (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    exchange   TEXT NOT NULL,
    symbol     TEXT NOT NULL,
    timeframe  TEXT NOT NULL,
    open       DECIMAL(18,8) NOT NULL,
    high       DECIMAL(18,8) NOT NULL,
    low        DECIMAL(18,8) NOT NULL,
    close      DECIMAL(18,8) NOT NULL,
    volume     DECIMAL(18,8) NOT NULL,
    open_time  DATETIME NOT NULL,
    close_time DATETIME,
    UNIQUE(exchange, symbol, timeframe, open_time)
);
CREATE INDEX IF NOT EXISTS idx_market_data_symbol_time ON market_data(symbol, open_time);

-- ── Default settings ────────────────────────────────────────
INSERT OR IGNORE INTO settings (key, value) VALUES
('bot_enabled',              'false'),
('position_size_percent',    '2.0'),
('stop_loss_percent',        '3.0'),
('take_profit_percent',      '5.0'),
('max_daily_loss',           '10'),
('max_positions',            '5'),
('default_exchange',         'binance'),
('default_strategy',         'EMA'),
('default_timeframe',        '5m'),
('log_level',                'INFO'),
('notification_enabled',     'true'),
('backtesting_enabled',      'true');