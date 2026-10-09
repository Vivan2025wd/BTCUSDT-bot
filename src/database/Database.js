// src/database/Database.js
'use strict';

const sqlite3 = require('sqlite3').verbose();
const path    = require('path');
const fs      = require('fs');
const os      = require('os');

class Database {
  constructor(config = {}) {
    this.db = null;
    this.isConnected = false;

    const dataDir = path.join(os.homedir(), '.privacy-trading-bot');
    this.dbPath = config.file || path.join(dataDir, 'trading.db');

    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     CONNECTION
     ═══════════════════════════════════════════════════════════════ */

  async connect() {
    if (this.isConnected) return;

    await new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) return reject(err);
        this.isConnected = true;
        resolve();
      });
    });

    // WAL improves concurrency; FK enforcement for correctness
    await this.executeQuery('PRAGMA journal_mode = WAL');
    await this.executeQuery('PRAGMA foreign_keys = ON');

    await this.initializeTables();
    console.log('[Database] Ready at', this.dbPath);
  }

  async close() {
    if (!this.db) return;
    await new Promise((resolve, reject) => {
      this.db.close((err) => (err ? reject(err) : resolve()));
    });
    this.db = null;
    this.isConnected = false;
  }

  /* ═══════════════════════════════════════════════════════════════
     QUERY PRIMITIVES
     ═══════════════════════════════════════════════════════════════ */

  async executeQuery(query, params = []) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) return reject(new Error('Database not connected'));
      this.db.run(query, params, function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }

  async selectQuery(query, params = []) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) return reject(new Error('Database not connected'));
      this.db.all(query, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
  }

  async selectOne(query, params = []) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) return reject(new Error('Database not connected'));
      this.db.get(query, params, (err, row) => (err ? reject(err) : resolve(row)));
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     SCHEMA
     ═══════════════════════════════════════════════════════════════ */

  async initializeTables() {
    const queries = [
      /* ─── trades ─── */
      `CREATE TABLE IF NOT EXISTS trades (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol       TEXT     NOT NULL,
        side         TEXT     NOT NULL CHECK (side IN ('BUY','SELL')),
        type         TEXT     DEFAULT 'MARKET',
        strategy     TEXT     DEFAULT 'manual',
        exchange     TEXT     DEFAULT 'unknown',

        quantity     REAL     NOT NULL,
        price        REAL,                        -- intended / fill price
        entry_price  REAL,
        exit_price   REAL,

        pnl          REAL     DEFAULT 0,          -- absolute, USDT
        pnl_percent  REAL     DEFAULT 0,
        fees         REAL     DEFAULT 0,

        status       TEXT     DEFAULT 'FILLED',   -- PENDING|FILLED|OPEN|CLOSED|CANCELLED|FAILED
        order_id     TEXT,
        reason       TEXT,
        signal       TEXT,

        opened_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        closed_at    DATETIME,
        timestamp    DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      /* ─── balances (append-only snapshot log) ─── */
      `CREATE TABLE IF NOT EXISTS balances (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        asset     TEXT NOT NULL,
        exchange  TEXT DEFAULT 'unknown',
        free      REAL NOT NULL DEFAULT 0,
        locked    REAL NOT NULL DEFAULT 0,
        total     REAL NOT NULL DEFAULT 0,
        usd_value REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      /* ─── bot sessions ─── */
      `CREATE TABLE IF NOT EXISTS bot_sessions (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        start_time         DATETIME NOT NULL,
        end_time           DATETIME,
        start_balance      REAL NOT NULL,
        end_balance        REAL,
        total_trades       INTEGER DEFAULT 0,
        profitable_trades  INTEGER DEFAULT 0,
        total_pnl          REAL DEFAULT 0,
        max_drawdown       REAL DEFAULT 0,
        status             TEXT CHECK (status IN ('RUNNING','STOPPED','ERROR')) DEFAULT 'RUNNING',
        created_at         DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      /* ─── settings ─── */
      `CREATE TABLE IF NOT EXISTS settings (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        category   TEXT NOT NULL,
        key        TEXT NOT NULL,
        value      TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(category, key)
      )`,

      /* ─── performance metrics ─── */
      `CREATE TABLE IF NOT EXISTS performance_metrics (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        date                DATE NOT NULL,
        total_pnl           REAL DEFAULT 0,
        win_rate            REAL DEFAULT 0,
        total_trades        INTEGER DEFAULT 0,
        avg_trade_duration  INTEGER DEFAULT 0,
        max_drawdown        REAL DEFAULT 0,
        sharpe_ratio        REAL DEFAULT 0,
        created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date)
      )`,

      /* ─── indexes ─── */
      `CREATE INDEX IF NOT EXISTS idx_trades_symbol_time ON trades(symbol, timestamp DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_trades_timestamp   ON trades(timestamp DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_trades_status      ON trades(status)`,
      `CREATE INDEX IF NOT EXISTS idx_balances_asset     ON balances(asset, timestamp DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_perf_date          ON performance_metrics(date DESC)`
    ];

    for (const q of queries) await this.executeQuery(q);

    // Best-effort migration for tables created by an older version
    await this._migrateColumns();
  }

  /**
   * Add missing columns if the table already existed from a previous
   * schema. `ALTER TABLE ADD COLUMN` is a no-op error if the column
   * exists — we swallow that specific error.
   */
  async _migrateColumns() {
    const existing = await this.selectQuery(`PRAGMA table_info(trades)`);
    const have = new Set(existing.map((r) => r.name));

    const additions = [
      ['symbol',      'TEXT'],
      ['type',        "TEXT DEFAULT 'MARKET'"],
      ['strategy',    "TEXT DEFAULT 'manual'"],
      ['exchange',    "TEXT DEFAULT 'unknown'"],
      ['entry_price', 'REAL'],
      ['exit_price',  'REAL'],
      ['fees',        'REAL DEFAULT 0'],
      ['status',      "TEXT DEFAULT 'FILLED'"],
      ['order_id',    'TEXT'],
      ['reason',      'TEXT'],
      ['signal',      'TEXT'],
      ['opened_at',   'DATETIME'],
      ['closed_at',   'DATETIME']
    ];

    for (const [col, def] of additions) {
      if (have.has(col)) continue;
      try {
        await this.executeQuery(`ALTER TABLE trades ADD COLUMN ${col} ${def}`);
      } catch (err) {
        if (!/duplicate column/i.test(err.message)) throw err;
      }
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     TRADES
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Save a trade. Accepts the loose shape TradingBot sends:
   *   { pair, side, price, quantity, timestamp, reason,
   *     entryPrice, exitPrice, pnl, pnlPercent, strategy, exchange }
   *
   * Returns the new row id.
   */
  async saveTrade(trade = {}) {
    const symbol   = trade.symbol || trade.pair;
    if (!symbol) throw new Error('saveTrade: missing symbol/pair');
    if (!trade.side) throw new Error('saveTrade: missing side');

    const side = String(trade.side).toUpperCase();
    if (side !== 'BUY' && side !== 'SELL') {
      throw new Error(`saveTrade: invalid side "${trade.side}"`);
    }

    // Determine lifecycle from what's present
    const closed = trade.exitPrice != null || trade.pnl != null;
    const status = trade.status
      ? String(trade.status).toUpperCase()
      : (closed ? 'CLOSED' : (side === 'BUY' ? 'OPEN' : 'FILLED'));

    const now = new Date().toISOString();

    const query = `
      INSERT INTO trades
        (symbol, side, type, strategy, exchange,
         quantity, price, entry_price, exit_price,
         pnl, pnl_percent, fees,
         status, order_id, reason, signal,
         opened_at, closed_at, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      symbol,
      side,
      String(trade.type || 'MARKET').toUpperCase(),
      trade.strategy || trade.strategy_name || 'manual',
      trade.exchange || 'unknown',

      Number(trade.quantity ?? 0),
      trade.price != null ? Number(trade.price) : null,
      trade.entryPrice != null ? Number(trade.entryPrice)
        : (trade.entry_price != null ? Number(trade.entry_price) : null),
      trade.exitPrice != null ? Number(trade.exitPrice)
        : (trade.exit_price != null ? Number(trade.exit_price) : null),

      Number(trade.pnl ?? trade.profit_loss ?? 0),
      Number(trade.pnlPercent ?? trade.pnl_percent ?? 0),
      Number(trade.fees ?? 0),

      status,
      trade.orderId || trade.order_id || null,
      trade.reason || null,
      trade.signal ? JSON.stringify(trade.signal) : (trade.signal_data || null),

      trade.openedAt || trade.opened_at || trade.timestamp || now,
      trade.closedAt || trade.closed_at || (closed ? (trade.timestamp || now) : null),
      trade.timestamp || now
    ];

    const result = await this.executeQuery(query, params);
    return result.id;
  }

  /**
   * Trade history. Returns rows with BOTH `symbol` and `pair`
   * so any consumer (TradingBot, TradeHistory.jsx, Portfolio.jsx)
   * gets what it expects.
   */
  async getTradeHistory(limit = 100, offset = 0) {
    const rows = await this.selectQuery(
      `SELECT * FROM trades
       ORDER BY COALESCE(closed_at, opened_at, timestamp) DESC
       LIMIT ? OFFSET ?`,
      [Math.max(1, limit | 0), Math.max(0, offset | 0)]
    );
    return rows.map(this._normalizeRow);
  }

  async getTradesByPair(pair, limit = 50) {
    const rows = await this.selectQuery(
      `SELECT * FROM trades WHERE symbol = ?
       ORDER BY timestamp DESC LIMIT ?`,
      [pair, Math.max(1, limit | 0)]
    );
    return rows.map(this._normalizeRow);
  }

  async getTradingStats(days = 30) {
    const d = Number(days) | 0; // ✅ integer, safe
    const row = await this.selectOne(
      `SELECT
         COUNT(*)                                          AS total_trades,
         SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END)          AS profitable_trades,
         COALESCE(SUM(pnl), 0)                             AS total_pnl,
         COALESCE(AVG(pnl), 0)                             AS avg_pnl,
         COALESCE(MIN(pnl), 0)                             AS worst_trade,
         COALESCE(MAX(pnl), 0)                             AS best_trade,
         COALESCE(SUM(CASE WHEN pnl > 0 THEN  pnl ELSE 0 END), 0) AS total_profit,
         COALESCE(SUM(CASE WHEN pnl < 0 THEN -pnl ELSE 0 END), 0) AS total_loss
       FROM trades
       WHERE timestamp >= datetime('now', ?)`,
      [`-${d} days`]
    );

    if (!row || row.total_trades === 0) {
      return {
        total_trades: 0, profitable_trades: 0, total_pnl: 0,
        avg_pnl: 0, worst_trade: 0, best_trade: 0,
        total_profit: 0, total_loss: 0,
        win_rate: 0, profit_factor: 0
      };
    }
    row.win_rate = (row.profitable_trades / row.total_trades) * 100;
    row.profit_factor = row.total_loss > 0 ? row.total_profit / row.total_loss : 0;
    return row;
  }

  /* ═══════════════════════════════════════════════════════════════
     BALANCES
     ═══════════════════════════════════════════════════════════════ */

  async saveBalance(assetOrObj, free, locked, exchange = 'unknown', usdValue = null) {
    let row;
    if (typeof assetOrObj === 'object') {
      row = {
        asset:     assetOrObj.asset,
        free:      assetOrObj.free ?? assetOrObj.free_balance ?? 0,
        locked:    assetOrObj.locked ?? assetOrObj.locked_balance ?? 0,
        exchange:  assetOrObj.exchange || exchange,
        usdValue:  assetOrObj.usdValue ?? assetOrObj.usd_value ?? usdValue
      };
    } else {
      row = { asset: assetOrObj, free, locked, exchange, usdValue };
    }

    const total = Number(row.free) + Number(row.locked);
    await this.executeQuery(
      `INSERT INTO balances (asset, exchange, free, locked, total, usd_value)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [row.asset, row.exchange, row.free, row.locked, total, row.usdValue]
    );
    return { asset: row.asset, total };
  }

  async getLatestBalance(asset) {
    return this.selectOne(
      `SELECT * FROM balances WHERE asset = ?
       ORDER BY timestamp DESC, id DESC LIMIT 1`,
      [asset]
    );
  }

  async getAllLatestBalances() {
    // One query — no N+1
    return this.selectQuery(`
      SELECT b.* FROM balances b
      INNER JOIN (
        SELECT asset, MAX(id) AS max_id FROM balances GROUP BY asset
      ) latest ON b.id = latest.max_id
      ORDER BY b.asset
    `);
  }

  /* ═══════════════════════════════════════════════════════════════
     BOT SESSIONS
     ═══════════════════════════════════════════════════════════════ */

  async startBotSession(startBalance) {
    const result = await this.executeQuery(
      `INSERT INTO bot_sessions (start_time, start_balance, status)
       VALUES (datetime('now'), ?, 'RUNNING')`,
      [startBalance]
    );
    return result.id;
  }

  async endBotSession(sessionId, endBalance, stats = {}) {
    await this.executeQuery(
      `UPDATE bot_sessions
       SET end_time = datetime('now'),
           end_balance = ?,
           total_trades = ?,
           profitable_trades = ?,
           total_pnl = ?,
           status = 'STOPPED'
       WHERE id = ?`,
      [
        endBalance,
        stats.totalTrades || 0,
        stats.profitableTrades || 0,
        stats.totalPnL || 0,
        sessionId
      ]
    );
  }

  async getActiveBotSession() {
    return this.selectOne(
      `SELECT * FROM bot_sessions WHERE status = 'RUNNING'
       ORDER BY start_time DESC LIMIT 1`
    );
  }

  /* ═══════════════════════════════════════════════════════════════
     SETTINGS
     ═══════════════════════════════════════════════════════════════ */

  async saveSetting(category, key, value) {
    await this.executeQuery(
      `INSERT INTO settings (category, key, value, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(category, key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
      [category, key, JSON.stringify(value)]
    );
  }

  async getSetting(category, key, defaultValue = null) {
    const row = await this.selectOne(
      `SELECT value FROM settings WHERE category = ? AND key = ?`,
      [category, key]
    );
    if (!row) return defaultValue;
    try { return JSON.parse(row.value); }
    catch { return row.value; }
  }

  async getAllSettings(category = null) {
    const rows = category
      ? await this.selectQuery(`SELECT * FROM settings WHERE category = ? ORDER BY key`, [category])
      : await this.selectQuery(`SELECT * FROM settings ORDER BY category, key`);

    const result = {};
    for (const s of rows) {
      if (!result[s.category]) result[s.category] = {};
      try { result[s.category][s.key] = JSON.parse(s.value); }
      catch { result[s.category][s.key] = s.value; }
    }
    return result;
  }

  /* ═══════════════════════════════════════════════════════════════
     PERFORMANCE METRICS
     ═══════════════════════════════════════════════════════════════ */

  async savePerformanceMetrics(date, metrics = {}) {
    await this.executeQuery(
      `INSERT INTO performance_metrics
         (date, total_pnl, win_rate, total_trades,
          avg_trade_duration, max_drawdown, sharpe_ratio)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET
         total_pnl          = excluded.total_pnl,
         win_rate           = excluded.win_rate,
         total_trades       = excluded.total_trades,
         avg_trade_duration = excluded.avg_trade_duration,
         max_drawdown       = excluded.max_drawdown,
         sharpe_ratio       = excluded.sharpe_ratio`,
      [
        date,
        metrics.totalPnL || 0,
        metrics.winRate || 0,
        metrics.totalTrades || 0,
        metrics.avgTradeDuration || 0,
        metrics.maxDrawdown || 0,
        metrics.sharpeRatio || 0
      ]
    );
  }

  async getPerformanceMetrics(days = 30) {
    const d = Number(days) | 0;
    return this.selectQuery(
      `SELECT * FROM performance_metrics
       WHERE date >= date('now', ?)
       ORDER BY date DESC`,
      [`-${d} days`]
    );
  }

  /* ═══════════════════════════════════════════════════════════════
     EXPORT / MAINTENANCE
     ═══════════════════════════════════════════════════════════════ */

  async exportTrades(startDate = null, endDate = null) {
    const where = [];
    const params = [];
    if (startDate) { where.push('timestamp >= ?'); params.push(startDate); }
    if (endDate)   { where.push('timestamp <= ?'); params.push(endDate); }

    const sql =
      `SELECT symbol, side, price, quantity, pnl, pnl_percent,
              reason, status, timestamp
       FROM trades
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY timestamp DESC`;

    return this.selectQuery(sql, params);
  }

  async vacuum() {
    await this.executeQuery('VACUUM');
  }

  async getDatabaseStats() {
    const tables = ['trades', 'balances', 'bot_sessions', 'settings', 'performance_metrics'];
    const stats = {};
    for (const t of tables) {
      const r = await this.selectOne(`SELECT COUNT(*) AS count FROM ${t}`);
      stats[t] = r.count;
    }
    try {
      const fileStats = fs.statSync(this.dbPath);
      stats.file_size = fileStats.size;
      stats.file_size_mb = (fileStats.size / (1024 * 1024)).toFixed(2);
    } catch {
      stats.file_size = 0;
      stats.file_size_mb = '0.00';
    }
    return stats;
  }

  async clearOldData(days = 90) {
    const d = Number(days) | 0;
    let total = 0;

    const q1 = await this.executeQuery(
      `DELETE FROM balances WHERE timestamp < datetime('now', ?)`,
      [`-${d} days`]
    );
    total += q1.changes;

    const q2 = await this.executeQuery(
      `DELETE FROM performance_metrics WHERE date < date('now', ?)`,
      [`-${d} days`]
    );
    total += q2.changes;

    if (total > 0) await this.vacuum();
    return total;
  }

  async createBackup(backupPath) {
    if (!fs.existsSync(this.dbPath)) throw new Error('Database file not found');
    fs.copyFileSync(this.dbPath, backupPath);
    return true;
  }

  async restoreBackup(backupPath) {
    if (!fs.existsSync(backupPath)) throw new Error('Backup not found');
    await this.close();
    fs.copyFileSync(backupPath, this.dbPath);
    await this.connect();
    return true;
  }

  /* ═══════════════════════════════════════════════════════════════
     INTERNAL — row shape translation
     ═══════════════════════════════════════════════════════════════ */

  /**
   * Return rows with both `symbol`/`pair` and `pnl`/`profit_loss`
   * aliases so any consumer works without changes.
   */
  _normalizeRow = (row) => {
    if (!row) return row;

    const entryPrice = row.entry_price ?? row.price ?? null;
    const exitPrice  = row.exit_price  ?? null;

    return {
      ...row,
      // identifiers
      symbol: row.symbol,
      pair:   row.symbol,
      // pricing
      entryPrice,
      exitPrice,
      // p&l aliases
      profit_loss: row.pnl,
      pnl_percent: row.pnl_percent,
      pnlPercent:  row.pnl_percent,
      // timing
      openedAt:  row.opened_at,
      closedAt:  row.closed_at,
      // API compat
      strategy_name: row.strategy,
      orderId:       row.order_id,
      // dates as Date objects
      timestamp:  row.timestamp  ? new Date(row.timestamp)  : null,
      created_at: row.created_at ? new Date(row.created_at) : null
    };
  };
}

module.exports = Database;