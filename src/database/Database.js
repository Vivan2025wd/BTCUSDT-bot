const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const os = require('os');

class Database {
  constructor() {
    this.db = null;
    this.isConnected = false;
    
    // Database path in user's home directory
    this.dbPath = path.join(os.homedir(), '.privacy-trading-bot', 'trading.db');
    
    // Ensure directory exists
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error('Database connection failed:', err);
          reject(err);
          return;
        }
        
        console.log('Connected to SQLite database:', this.dbPath);
        this.isConnected = true;
        
        // Initialize tables
        this.initializeTables()
          .then(() => resolve())
          .catch(reject);
      });
    });
  }

  async close() {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }

      this.db.close((err) => {
        if (err) {
          console.error('Database close failed:', err);
          reject(err);
          return;
        }
        
        console.log('Database connection closed');
        this.isConnected = false;
        resolve();
      });
    });
  }

  async initializeTables() {
    const queries = [
      // Trades table
      `CREATE TABLE IF NOT EXISTS trades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pair TEXT NOT NULL,
        side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
        price REAL NOT NULL,
        quantity REAL NOT NULL,
        pnl REAL DEFAULT 0,
        pnl_percent REAL DEFAULT 0,
        signal TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Balances table
      `CREATE TABLE IF NOT EXISTS balances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset TEXT NOT NULL,
        free REAL NOT NULL DEFAULT 0,
        locked REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(asset, timestamp)
      )`,
      
      // Bot sessions table
      `CREATE TABLE IF NOT EXISTS bot_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        start_time DATETIME NOT NULL,
        end_time DATETIME,
        start_balance REAL NOT NULL,
        end_balance REAL,
        total_trades INTEGER DEFAULT 0,
        profitable_trades INTEGER DEFAULT 0,
        total_pnl REAL DEFAULT 0,
        max_drawdown REAL DEFAULT 0,
        status TEXT CHECK (status IN ('RUNNING', 'STOPPED', 'ERROR')) DEFAULT 'RUNNING',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Settings table
      `CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(category, key)
      )`,
      
      // Performance metrics table
      `CREATE TABLE IF NOT EXISTS performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL,
        total_pnl REAL DEFAULT 0,
        win_rate REAL DEFAULT 0,
        total_trades INTEGER DEFAULT 0,
        avg_trade_duration INTEGER DEFAULT 0,
        max_drawdown REAL DEFAULT 0,
        sharpe_ratio REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date)
      )`,
      
      // Create indexes for better performance
      `CREATE INDEX IF NOT EXISTS idx_trades_pair_timestamp ON trades(pair, timestamp)`,
      `CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_balances_timestamp ON balances(timestamp DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_performance_date ON performance_metrics(date DESC)`
    ];

    try {
      for (const query of queries) {
        await this.executeQuery(query);
      }
      console.log('Database tables initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database tables:', error);
      throw error;
    }
  }

  async executeQuery(query, params = []) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('Database not connected'));
        return;
      }

      this.db.run(query, params, function(err) {
        if (err) {
          console.error('Query execution failed:', err);
          reject(err);
          return;
        }
        resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }

  async selectQuery(query, params = []) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('Database not connected'));
        return;
      }

      this.db.all(query, params, (err, rows) => {
        if (err) {
          console.error('Select query failed:', err);
          reject(err);
          return;
        }
        resolve(rows);
      });
    });
  }

  async selectOne(query, params = []) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('Database not connected'));
        return;
      }

      this.db.get(query, params, (err, row) => {
        if (err) {
          console.error('Select one query failed:', err);
          reject(err);
          return;
        }
        resolve(row);
      });
    });
  }

  // Trade operations
  async saveTrade(trade) {
    const query = `
      INSERT INTO trades (pair, side, price, quantity, pnl, pnl_percent, signal, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      trade.pair,
      trade.side,
      trade.price,
      trade.quantity,
      trade.pnl || 0,
      trade.pnlPercent || 0,
      trade.signal || '',
      trade.timestamp || new Date().toISOString()
    ];

    try {
      const result = await this.executeQuery(query, params);
      console.log(`Trade saved: ${trade.side} ${trade.pair} at ${trade.price}`);
      return result.id;
    } catch (error) {
      console.error('Failed to save trade:', error);
      throw error;
    }
  }

  async getTradeHistory(limit = 100, offset = 0) {
    const query = `
      SELECT * FROM trades 
      ORDER BY timestamp DESC 
      LIMIT ? OFFSET ?
    `;

    try {
      const trades = await this.selectQuery(query, [limit, offset]);
      return trades.map(trade => ({
        ...trade,
        timestamp: new Date(trade.timestamp),
        created_at: new Date(trade.created_at)
      }));
    } catch (error) {
      console.error('Failed to get trade history:', error);
      throw error;
    }
  }

  async getTradesByPair(pair, limit = 50) {
    const query = `
      SELECT * FROM trades 
      WHERE pair = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `;

    try {
      return await this.selectQuery(query, [pair, limit]);
    } catch (error) {
      console.error(`Failed to get trades for ${pair}:`, error);
      throw error;
    }
  }

  async getTradingStats(days = 30) {
    const query = `
      SELECT 
        COUNT(*) as total_trades,
        SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as profitable_trades,
        SUM(pnl) as total_pnl,
        AVG(pnl) as avg_pnl,
        MIN(pnl) as worst_trade,
        MAX(pnl) as best_trade,
        SUM(CASE WHEN pnl > 0 THEN pnl ELSE 0 END) as total_profit,
        SUM(CASE WHEN pnl < 0 THEN ABS(pnl) ELSE 0 END) as total_loss
      FROM trades 
      WHERE timestamp >= datetime('now', '-${days} days')
    `;

    try {
      const stats = await this.selectOne(query);
      
      if (stats && stats.total_trades > 0) {
        stats.win_rate = (stats.profitable_trades / stats.total_trades) * 100;
        stats.profit_factor = stats.total_loss > 0 ? stats.total_profit / stats.total_loss : 0;
      }
      
      return stats || {
        total_trades: 0,
        profitable_trades: 0,
        total_pnl: 0,
        avg_pnl: 0,
        worst_trade: 0,
        best_trade: 0,
        win_rate: 0,
        profit_factor: 0
      };
    } catch (error) {
      console.error('Failed to get trading stats:', error);
      throw error;
    }
  }

  // Balance operations
  async saveBalance(asset, free, locked) {
    const query = `
      INSERT OR REPLACE INTO balances (asset, free, locked, total, timestamp)
      VALUES (?, ?, ?, ?, datetime('now'))
    `;
    
    const total = free + locked;
    
    try {
      await this.executeQuery(query, [asset, free, locked, total]);
      console.log(`Balance saved: ${asset} - Free: ${free}, Locked: ${locked}`);
    } catch (error) {
      console.error('Failed to save balance:', error);
      throw error;
    }
  }

  async getLatestBalance(asset) {
    const query = `
      SELECT * FROM balances 
      WHERE asset = ? 
      ORDER BY timestamp DESC 
      LIMIT 1
    `;

    try {
      return await this.selectOne(query, [asset]);
    } catch (error) {
      console.error(`Failed to get balance for ${asset}:`, error);
      throw error;
    }
  }

  async getAllLatestBalances() {
    const query = `
      SELECT DISTINCT asset FROM balances
    `;

    try {
      const assets = await this.selectQuery(query);
      const balances = [];
      
      for (const asset of assets) {
        const balance = await this.getLatestBalance(asset.asset);
        if (balance) {
          balances.push(balance);
        }
      }
      
      return balances;
    } catch (error) {
      console.error('Failed to get all balances:', error);
      throw error;
    }
  }

  // Bot session operations
  async startBotSession(startBalance) {
    const query = `
      INSERT INTO bot_sessions (start_time, start_balance, status)
      VALUES (datetime('now'), ?, 'RUNNING')
    `;

    try {
      const result = await this.executeQuery(query, [startBalance]);
      console.log(`Bot session started with balance: ${startBalance}`);
      return result.id;
    } catch (error) {
      console.error('Failed to start bot session:', error);
      throw error;
    }
  }

  async endBotSession(sessionId, endBalance, stats) {
    const query = `
      UPDATE bot_sessions 
      SET end_time = datetime('now'), 
          end_balance = ?,
          total_trades = ?,
          profitable_trades = ?,
          total_pnl = ?,
          status = 'STOPPED'
      WHERE id = ?
    `;

    try {
      await this.executeQuery(query, [
        endBalance,
        stats.totalTrades || 0,
        stats.profitableTrades || 0,
        stats.totalPnL || 0,
        sessionId
      ]);
      console.log(`Bot session ${sessionId} ended`);
    } catch (error) {
      console.error('Failed to end bot session:', error);
      throw error;
    }
  }

  async getActiveBotSession() {
    const query = `
      SELECT * FROM bot_sessions 
      WHERE status = 'RUNNING' 
      ORDER BY start_time DESC 
      LIMIT 1
    `;

    try {
      return await this.selectOne(query);
    } catch (error) {
      console.error('Failed to get active bot session:', error);
      throw error;
    }
  }

  // Settings operations
  async saveSetting(category, key, value) {
    const query = `
      INSERT OR REPLACE INTO settings (category, key, value, updated_at)
      VALUES (?, ?, ?, datetime('now'))
    `;

    try {
      await this.executeQuery(query, [category, key, JSON.stringify(value)]);
    } catch (error) {
      console.error('Failed to save setting:', error);
      throw error;
    }
  }

  async getSetting(category, key, defaultValue = null) {
    const query = `
      SELECT value FROM settings 
      WHERE category = ? AND key = ?
    `;

    try {
      const result = await this.selectOne(query, [category, key]);
      if (result) {
        return JSON.parse(result.value);
      }
      return defaultValue;
    } catch (error) {
      console.error('Failed to get setting:', error);
      return defaultValue;
    }
  }

  async getAllSettings(category = null) {
    let query = `SELECT * FROM settings`;
    let params = [];
    
    if (category) {
      query += ` WHERE category = ?`;
      params.push(category);
    }
    
    query += ` ORDER BY category, key`;

    try {
      const settings = await this.selectQuery(query, params);
      const result = {};
      
      settings.forEach(setting => {
        if (!result[setting.category]) {
          result[setting.category] = {};
        }
        result[setting.category][setting.key] = JSON.parse(setting.value);
      });
      
      return result;
    } catch (error) {
      console.error('Failed to get settings:', error);
      return {};
    }
  }

  // Performance metrics operations
  async savePerformanceMetrics(date, metrics) {
    const query = `
      INSERT OR REPLACE INTO performance_metrics 
      (date, total_pnl, win_rate, total_trades, avg_trade_duration, max_drawdown, sharpe_ratio)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    try {
      await this.executeQuery(query, [
        date,
        metrics.totalPnL || 0,
        metrics.winRate || 0,
        metrics.totalTrades || 0,
        metrics.avgTradeDuration || 0,
        metrics.maxDrawdown || 0,
        metrics.sharpeRatio || 0
      ]);
    } catch (error) {
      console.error('Failed to save performance metrics:', error);
      throw error;
    }
  }

  async getPerformanceMetrics(days = 30) {
    const query = `
      SELECT * FROM performance_metrics 
      WHERE date >= date('now', '-${days} days')
      ORDER BY date DESC
    `;

    try {
      return await this.selectQuery(query);
    } catch (error) {
      console.error('Failed to get performance metrics:', error);
      return [];
    }
  }

  // Data export operations
  async exportTrades(startDate = null, endDate = null) {
    let query = `
      SELECT pair, side, price, quantity, pnl, pnl_percent, signal, timestamp
      FROM trades
    `;
    
    const params = [];
    const conditions = [];
    
    if (startDate) {
      conditions.push('timestamp >= ?');
      params.push(startDate);
    }
    
    if (endDate) {
      conditions.push('timestamp <= ?');
      params.push(endDate);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ' ORDER BY timestamp DESC';

    try {
      return await this.selectQuery(query, params);
    } catch (error) {
      console.error('Failed to export trades:', error);
      throw error;
    }
  }

  // Database maintenance operations
  async vacuum() {
    try {
      await this.executeQuery('VACUUM');
      console.log('Database vacuumed successfully');
    } catch (error) {
      console.error('Failed to vacuum database:', error);
      throw error;
    }
  }

  async getDatabaseStats() {
    try {
      const queries = [
        { name: 'trades', query: 'SELECT COUNT(*) as count FROM trades' },
        { name: 'balances', query: 'SELECT COUNT(*) as count FROM balances' },
        { name: 'bot_sessions', query: 'SELECT COUNT(*) as count FROM bot_sessions' },
        { name: 'settings', query: 'SELECT COUNT(*) as count FROM settings' },
        { name: 'performance_metrics', query: 'SELECT COUNT(*) as count FROM performance_metrics' }
      ];

      const stats = {};
      
      for (const { name, query } of queries) {
        const result = await this.selectOne(query);
        stats[name] = result.count;
      }
      
      // Get database file size
      try {
        const fileStats = fs.statSync(this.dbPath);
        stats.file_size = fileStats.size;
        stats.file_size_mb = (fileStats.size / (1024 * 1024)).toFixed(2);
      } catch (error) {
        stats.file_size = 0;
        stats.file_size_mb = '0.00';
      }
      
      return stats;
    } catch (error) {
      console.error('Failed to get database stats:', error);
      throw error;
    }
  }

  async clearOldData(days = 90) {
    const queries = [
      {
        name: 'old_balances',
        query: `DELETE FROM balances WHERE timestamp < datetime('now', '-${days} days')`
      },
      {
        name: 'old_performance_metrics',
        query: `DELETE FROM performance_metrics WHERE date < date('now', '-${days} days')`
      }
    ];

    try {
      let totalDeleted = 0;
      
      for (const { name, query } of queries) {
        const result = await this.executeQuery(query);
        console.log(`Cleared ${result.changes} old records from ${name}`);
        totalDeleted += result.changes;
      }
      
      if (totalDeleted > 0) {
        await this.vacuum();
      }
      
      return totalDeleted;
    } catch (error) {
      console.error('Failed to clear old data:', error);
      throw error;
    }
  }

  // Backup and restore
  async createBackup(backupPath) {
    try {
      if (!fs.existsSync(this.dbPath)) {
        throw new Error('Database file does not exist');
      }
      
      fs.copyFileSync(this.dbPath, backupPath);
      console.log(`Database backed up to: ${backupPath}`);
      return true;
    } catch (error) {
      console.error('Failed to create backup:', error);
      throw error;
    }
  }

  async restoreBackup(backupPath) {
    try {
      if (!fs.existsSync(backupPath)) {
        throw new Error('Backup file does not exist');
      }
      
      // Close current connection
      await this.close();
      
      // Replace database file
      fs.copyFileSync(backupPath, this.dbPath);
      
      // Reconnect
      await this.connect();
      
      console.log(`Database restored from: ${backupPath}`);
      return true;
    } catch (error) {
      console.error('Failed to restore backup:', error);
      throw error;
    }
  }
}

module.exports = Database;