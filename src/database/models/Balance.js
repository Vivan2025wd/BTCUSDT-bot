/**
 * Balance.js - Account Balances Database Model
 * Handles account balance tracking and portfolio management
 */

class Balance {
  constructor(database) {
    this.db = database;
    this.tableName = 'balances';
    this.historyTableName = 'balance_history';
  }

  /**
   * Create balances tables
   */
  async createTable() {
    // Main balances table
    const balancesSql = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exchange TEXT NOT NULL,
        asset TEXT NOT NULL,
        free REAL NOT NULL DEFAULT 0,
        locked REAL NOT NULL DEFAULT 0,
        total REAL NOT NULL DEFAULT 0,
        usd_value REAL DEFAULT 0,
        btc_value REAL DEFAULT 0,
        avg_buy_price REAL DEFAULT 0,
        unrealized_pnl REAL DEFAULT 0,
        realized_pnl REAL DEFAULT 0,
        position_size REAL DEFAULT 0,
        position_side TEXT CHECK(position_side IN ('long', 'short', 'none')) DEFAULT 'none',
        last_price REAL DEFAULT 0,
        price_change_24h REAL DEFAULT 0,
        last_updated INTEGER DEFAULT (strftime('%s', 'now')),
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(exchange, asset)
      )
    `;

    // Balance history table for tracking changes over time
    const historySql = `
      CREATE TABLE IF NOT EXISTS ${this.historyTableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exchange TEXT NOT NULL,
        asset TEXT,
        snapshot_type TEXT NOT NULL CHECK(snapshot_type IN ('hourly', 'daily', 'trade', 'manual')),
        total_balance REAL NOT NULL,
        usd_value REAL DEFAULT 0,
        btc_value REAL DEFAULT 0,
        total_pnl REAL DEFAULT 0,
        portfolio_percentage REAL DEFAULT 0,
        timestamp INTEGER NOT NULL,
        metadata TEXT, -- JSON string for additional data
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `;

    await this.db.run(balancesSql);
    await this.db.run(historySql);
    
    await this.createIndexes();
  }

  /**
   * Create database indexes
   */
  async createIndexes() {
    const indexes = [
      // Balance table indexes
      `CREATE INDEX IF NOT EXISTS idx_balances_exchange ON ${this.tableName}(exchange)`,
      `CREATE INDEX IF NOT EXISTS idx_balances_asset ON ${this.tableName}(asset)`,
      `CREATE INDEX IF NOT EXISTS idx_balances_exchange_asset ON ${this.tableName}(exchange, asset)`,
      `CREATE INDEX IF NOT EXISTS idx_balances_usd_value ON ${this.tableName}(usd_value)`,
      
      // History table indexes
      `CREATE INDEX IF NOT EXISTS idx_balance_history_exchange ON ${this.historyTableName}(exchange)`,
      `CREATE INDEX IF NOT EXISTS idx_balance_history_asset ON ${this.historyTableName}(asset)`,
      `CREATE INDEX IF NOT EXISTS idx_balance_history_timestamp ON ${this.historyTableName}(timestamp)`,
      `CREATE INDEX IF NOT EXISTS idx_balance_history_type ON ${this.historyTableName}(snapshot_type)`
    ];

    for (const index of indexes) {
      await this.db.run(index);
    }
  }

  /**
   * Update account balance
   * @param {Object} balanceData - Balance data
   * @returns {Promise<boolean>} Success status
   */
  async updateBalance(balanceData) {
    const {
      exchange, asset, free, locked, usd_value = 0, btc_value = 0,
      avg_buy_price = 0, unrealized_pnl = 0, realized_pnl = 0,
      position_size = 0, position_side = 'none', last_price = 0,
      price_change_24h = 0
    } = balanceData;

    const total = parseFloat(free) + parseFloat(locked);
    const timestamp = Math.floor(Date.now() / 1000);

    const sql = `
      INSERT OR REPLACE INTO ${this.tableName} (
        exchange, asset, free, locked, total, usd_value, btc_value,
        avg_buy_price, unrealized_pnl, realized_pnl, position_size,
        position_side, last_price, price_change_24h, last_updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      exchange, asset, free, locked, total, usd_value, btc_value,
      avg_buy_price, unrealized_pnl, realized_pnl, position_size,
      position_side, last_price, price_change_24h, timestamp
    ];

    const result = await this.db.run(sql, params);
    
    // Record balance change in history
    await this.recordBalanceHistory(exchange, asset, total, usd_value, btc_value, 'trade');
    
    return result.changes > 0;
  }

  /**
   * Get balance for specific asset
   * @param {string} exchange - Exchange name
   * @param {string} asset - Asset symbol
   * @returns {Promise<Object|null>} Balance data
   */
  async getBalance(exchange, asset) {
    const sql = `SELECT * FROM ${this.tableName} WHERE exchange = ? AND asset = ?`;
    return await this.db.get(sql, [exchange, asset]);
  }

  /**
   * Get all balances for an exchange
   * @param {string} exchange - Exchange name
   * @param {boolean} nonZeroOnly - Return only non-zero balances
   * @returns {Promise<Array>} Balances array
   */
  async getAllBalances(exchange, nonZeroOnly = true) {
    let sql = `SELECT * FROM ${this.tableName} WHERE exchange = ?`;
    const params = [exchange];

    if (nonZeroOnly) {
      sql += ' AND total > 0';
    }

    sql += ' ORDER BY usd_value DESC, asset ASC';

    return await this.db.all(sql, params);
  }

  /**
   * Get portfolio summary
   * @param {string} exchange - Exchange name
   * @returns {Promise<Object>} Portfolio summary
   */
  async getPortfolioSummary(exchange) {
    const sql = `
      SELECT 
        COUNT(*) as total_assets,
        SUM(usd_value) as total_usd_value,
        SUM(btc_value) as total_btc_value,
        SUM(unrealized_pnl) as total_unrealized_pnl,
        SUM(realized_pnl) as total_realized_pnl,
        SUM(CASE WHEN total > 0 THEN 1 ELSE 0 END) as non_zero_assets,
        MAX(usd_value) as largest_position_usd,
        AVG(price_change_24h) as avg_price_change_24h
      FROM ${this.tableName} 
      WHERE exchange = ?
    `;

    const summary = await this.db.get(sql, [exchange]);
    
    // Get top positions
    const topPositions = await this.db.all(`
      SELECT asset, usd_value, 
             ROUND((usd_value * 100.0 / ?), 2) as portfolio_percentage
      FROM ${this.tableName} 
      WHERE exchange = ? AND total > 0
      ORDER BY usd_value DESC 
      LIMIT 5
    `, [summary.total_usd_value || 1, exchange]);

    return {
      ...summary,
      total_pnl: (summary.total_unrealized_pnl || 0) + (summary.total_realized_pnl || 0),
      top_positions: topPositions
    };
  }

  /**
   * Record balance history snapshot
   * @param {string} exchange - Exchange name
   * @param {string} asset - Asset symbol (null for total portfolio)
   * @param {number} totalBalance - Total balance
   * @param {number} usdValue - USD value
   * @param {number} btcValue - BTC value
   * @param {string} snapshotType - Type of snapshot
   * @param {Object} metadata - Additional metadata
   * @returns {Promise<number>} History ID
   */
  async recordBalanceHistory(exchange, asset, totalBalance, usdValue = 0, btcValue = 0, 
                           snapshotType = 'manual', metadata = null) {
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Calculate portfolio percentage if this is for total portfolio
    let portfolioPercentage = 0;
    if (!asset) {
      portfolioPercentage = 100; // Total portfolio is always 100%
    } else {
      const summary = await this.getPortfolioSummary(exchange);
      portfolioPercentage = summary.total_usd_value > 0 ? 
        (usdValue / summary.total_usd_value) * 100 : 0;
    }

    const sql = `
      INSERT INTO ${this.historyTableName} (
        exchange, asset, snapshot_type, total_balance, usd_value,
        btc_value, portfolio_percentage, timestamp, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      exchange, asset, snapshotType, totalBalance, usdValue,
      btcValue, portfolioPercentage, timestamp,
      metadata ? JSON.stringify(metadata) : null
    ];

    const result = await this.db.run(sql, params);
    return result.lastID;
  }

  /**
   * Take portfolio snapshot
   * @param {string} exchange - Exchange name
   * @param {string} snapshotType - Type of snapshot
   * @returns {Promise<number>} Number of recorded entries
   */
  async takePortfolioSnapshot(exchange, snapshotType = 'manual') {
    const balances = await this.getAllBalances(exchange, false);
    const summary = await this.getPortfolioSummary(exchange);
    
    let recordedCount = 0;

    // Record total portfolio snapshot
    await this.recordBalanceHistory(
      exchange, null, summary.total_usd_value, summary.total_usd_value,
      summary.total_btc_value, snapshotType, {
        total_pnl: summary.total_pnl,
        asset_count: summary.non_zero_assets
      }
    );
    recordedCount++;

    // Record individual asset snapshots for significant positions
    for (const balance of balances) {
      if (balance.usd_value > 10) { // Only record positions worth more than $10
        await this.recordBalanceHistory(
          exchange, balance.asset, balance.total, balance.usd_value,
          balance.btc_value, snapshotType, {
            position_side: balance.position_side,
            unrealized_pnl: balance.unrealized_pnl
          }
        );
        recordedCount++;
      }
    }

    return recordedCount;
  }

  /**
   * Get balance history
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Balance history
   */
  async getBalanceHistory(options = {}) {
    const {
      exchange, asset, snapshotType, startTime, endTime,
      limit = 100, offset = 0
    } = options;

    let sql = `SELECT * FROM ${this.historyTableName} WHERE 1=1`;
    const params = [];

    if (exchange) {
      sql += ' AND exchange = ?';
      params.push(exchange);
    }

    if (asset !== undefined) {
      if (asset === null) {
        sql += ' AND asset IS NULL';
      } else {
        sql += ' AND asset = ?';
        params.push(asset);
      }
    }

    if (snapshotType) {
      sql += ' AND snapshot_type = ?';
      params.push(snapshotType);
    }

    if (startTime) {
      sql += ' AND timestamp >= ?';
      params.push(startTime);
    }

    if (endTime) {
      sql += ' AND timestamp <= ?';
      params.push(endTime);
    }

    sql += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const history = await this.db.all(sql, params);
    
    // Parse metadata
    return history.map(entry => {
      if (entry.metadata) {
        try {
          entry.metadata = JSON.parse(entry.metadata);
        } catch (e) {
          entry.metadata = null;
        }
      }
      return entry;
    });
  }

  /**
   * Get portfolio performance over time
   * @param {string} exchange - Exchange name
   * @param {number} days - Number of days to look back
   * @returns {Promise<Array>} Performance data
   */
  async getPortfolioPerformance(exchange, days = 30) {
    const startTime = Math.floor((Date.now() - (days * 24 * 60 * 60 * 1000)) / 1000);
    
    const sql = `
      SELECT 
        DATE(timestamp, 'unixepoch') as date,
        AVG(usd_value) as avg_portfolio_value,
        MAX(usd_value) as max_portfolio_value,
        MIN(usd_value) as min_portfolio_value,
        COUNT(*) as snapshot_count
      FROM ${this.historyTableName}
      WHERE exchange = ? AND asset IS NULL AND timestamp >= ?
      GROUP BY DATE(timestamp, 'unixepoch')
      ORDER BY date DESC
    `;

    return await this.db.all(sql, [exchange, startTime]);
  }

  /**
   * Calculate portfolio allocation
   * @param {string} exchange - Exchange name
   * @returns {Promise<Array>} Asset allocation data
   */
  async getPortfolioAllocation(exchange) {
    const sql = `
      SELECT 
        asset,
        usd_value,
        ROUND((usd_value * 100.0 / (
          SELECT SUM(usd_value) FROM ${this.tableName} WHERE exchange = ? AND total > 0
        )), 2) as percentage,
        position_side,
        unrealized_pnl,
        price_change_24h
      FROM ${this.tableName}
      WHERE exchange = ? AND total > 0
      ORDER BY usd_value DESC
    `;

    return await this.db.all(sql, [exchange, exchange]);
  }

  /**
   * Update position after trade
   * @param {string} exchange - Exchange name
   * @param {string} asset - Asset symbol
   * @param {Object} tradeData - Trade execution data
   * @returns {Promise<boolean>} Success status
   */
  async updatePositionFromTrade(exchange, asset, tradeData) {
    const { side, quantity, price, commission = 0 } = tradeData;
    const currentBalance = await this.getBalance(exchange, asset);
    
    if (!currentBalance) {
      // Create new balance entry
      const balanceData = {
        exchange,
        asset,
        free: side === 'buy' ? quantity : -quantity,
        locked: 0,
        avg_buy_price: price,
        last_price: price
      };
      return await this.updateBalance(balanceData);
    }

    // Update existing balance
    let newQuantity, newAvgPrice, newPnL;
    
    if (side === 'buy') {
      const totalCost = (currentBalance.total * currentBalance.avg_buy_price) + (quantity * price);
      newQuantity = currentBalance.total + quantity;
      newAvgPrice = newQuantity > 0 ? totalCost / newQuantity : price;
      newPnL = currentBalance.realized_pnl;
    } else {
      newQuantity = currentBalance.total - quantity;
      newAvgPrice = currentBalance.avg_buy_price;
      
      // Calculate realized PnL for sell
      const sellPnL = (price - currentBalance.avg_buy_price) * quantity;
      newPnL = currentBalance.realized_pnl + sellPnL - commission;
    }

    const updatedBalance = {
      exchange,
      asset,
      free: Math.max(0, newQuantity),
      locked: currentBalance.locked,
      avg_buy_price: newAvgPrice,
      realized_pnl: newPnL,
      last_price: price
    };

    return await this.updateBalance(updatedBalance);
  }

  /**
   * Get assets with significant changes
   * @param {string} exchange - Exchange name
   * @param {number} changeThreshold - Minimum change percentage to include
   * @returns {Promise<Array>} Assets with significant changes
   */
  async getSignificantChanges(exchange, changeThreshold = 5) {
    const sql = `
      SELECT *,
        ABS(price_change_24h) as abs_change
      FROM ${this.tableName}
      WHERE exchange = ? 
        AND total > 0 
        AND ABS(price_change_24h) >= ?
      ORDER BY abs_change DESC
    `;

    return await this.db.all(sql, [exchange, changeThreshold]);
  }

  /**
   * Get low balance assets
   * @param {string} exchange - Exchange name
   * @param {number} threshold - USD value threshold
   * @returns {Promise<Array>} Low balance assets
   */
  async getLowBalanceAssets(exchange, threshold = 1) {
    const sql = `
      SELECT *
      FROM ${this.tableName}
      WHERE exchange = ? 
        AND total > 0 
        AND usd_value < ?
        AND usd_value > 0.01
      ORDER BY usd_value ASC
    `;

    return await this.db.all(sql, [exchange, threshold]);
  }

  /**
   * Calculate total portfolio value across all exchanges
   * @returns {Promise<Object>} Total portfolio summary
   */
  async getTotalPortfolioValue() {
    const sql = `
      SELECT 
        SUM(usd_value) as total_usd_value,
        SUM(btc_value) as total_btc_value,
        SUM(unrealized_pnl) as total_unrealized_pnl,
        SUM(realized_pnl) as total_realized_pnl,
        COUNT(DISTINCT exchange) as exchange_count,
        COUNT(CASE WHEN total > 0 THEN 1 END) as total_positions
      FROM ${this.tableName}
      WHERE total > 0
    `;

    const summary = await this.db.get(sql);
    
    // Get exchange breakdown
    const exchangeBreakdown = await this.db.all(`
      SELECT 
        exchange,
        SUM(usd_value) as exchange_value,
        COUNT(CASE WHEN total > 0 THEN 1 END) as positions
      FROM ${this.tableName}
      WHERE total > 0
      GROUP BY exchange
      ORDER BY exchange_value DESC
    `);

    return {
      ...summary,
      total_pnl: (summary.total_unrealized_pnl || 0) + (summary.total_realized_pnl || 0),
      exchanges: exchangeBreakdown
    };
  }

  /**
   * Clean old balance history
   * @param {number} olderThan - Delete entries older than this timestamp
   * @returns {Promise<number>} Number of deleted entries
   */
  async cleanOldHistory(olderThan) {
    const sql = `DELETE FROM ${this.historyTableName} WHERE timestamp < ?`;
    const result = await this.db.run(sql, [olderThan]);
    return result.changes;
  }

  /**
   * Get balance trends
   * @param {string} exchange - Exchange name
   * @param {string} asset - Asset symbol (null for total portfolio)
   * @param {number} hours - Number of hours to analyze
   * @returns {Promise<Object>} Trend analysis
   */
  async getBalanceTrends(exchange, asset = null, hours = 24) {
    const startTime = Math.floor((Date.now() - (hours * 60 * 60 * 1000)) / 1000);
    
    let sql = `
      SELECT 
        usd_value,
        timestamp,
        (usd_value - LAG(usd_value) OVER (ORDER BY timestamp)) as change
      FROM ${this.historyTableName}
      WHERE exchange = ? AND timestamp >= ?
    `;
    const params = [exchange, startTime];

    if (asset !== undefined) {
      if (asset === null) {
        sql += ' AND asset IS NULL';
      } else {
        sql += ' AND asset = ?';
        params.push(asset);
      }
    }

    sql += ' ORDER BY timestamp ASC';

    const data = await this.db.all(sql, params);
    
    if (data.length < 2) {
      return {
        trend: 'insufficient_data',
        change: 0,
        change_percentage: 0,
        data_points: data.length
      };
    }

    const first = data[0];
    const last = data[data.length - 1];
    const change = last.usd_value - first.usd_value;
    const changePercentage = first.usd_value > 0 ? (change / first.usd_value) * 100 : 0;
    
    let trend = 'stable';
    if (changePercentage > 1) trend = 'rising';
    else if (changePercentage < -1) trend = 'falling';

    // Calculate volatility (standard deviation of changes)
    const changes = data.filter(d => d.change !== null).map(d => d.change);
    const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
    const variance = changes.reduce((a, b) => a + Math.pow(b - avgChange, 2), 0) / changes.length;
    const volatility = Math.sqrt(variance);

    return {
      trend,
      change: Math.round(change * 100) / 100,
      change_percentage: Math.round(changePercentage * 100) / 100,
      volatility: Math.round(volatility * 100) / 100,
      data_points: data.length,
      start_value: first.usd_value,
      end_value: last.usd_value
    };
  }

  /**
   * Set balance alerts
   * @param {string} exchange - Exchange name
   * @param {string} asset - Asset symbol
   * @param {Object} alerts - Alert configuration
   * @returns {Promise<boolean>} Success status
   */
  async setBalanceAlerts(exchange, asset, alerts) {
    const { low_balance_threshold, high_value_threshold, pnl_threshold } = alerts;
    
    const currentBalance = await this.getBalance(exchange, asset);
    if (!currentBalance) return false;

    const metadata = {
      alerts: {
        low_balance_threshold,
        high_value_threshold,
        pnl_threshold,
        set_at: Math.floor(Date.now() / 1000)
      }
    };

    // Update balance with alert metadata
    const sql = `
      UPDATE ${this.tableName} 
      SET last_updated = ? 
      WHERE exchange = ? AND asset = ?
    `;

    // For now, we'll store alerts in a separate mechanism
    // This could be expanded to include an alerts table
    const result = await this.db.run(sql, [Math.floor(Date.now() / 1000), exchange, asset]);
    
    // Record alert setup in history
    await this.recordBalanceHistory(
      exchange, asset, currentBalance.total, currentBalance.usd_value,
      currentBalance.btc_value, 'manual', metadata
    );

    return result.changes > 0;
  }

  /**
   * Get balance summary for dashboard
   * @param {string} exchange - Exchange name
   * @returns {Promise<Object>} Dashboard summary
   */
  async getDashboardSummary(exchange) {
    const portfolio = await this.getPortfolioSummary(exchange);
    const allocation = await this.getPortfolioAllocation(exchange);
    const trends = await this.getBalanceTrends(exchange, null, 24);
    const significantChanges = await this.getSignificantChanges(exchange, 5);

    return {
      portfolio_value: portfolio.total_usd_value || 0,
      total_pnl: portfolio.total_pnl || 0,
      asset_count: portfolio.non_zero_assets || 0,
      top_positions: portfolio.top_positions || [],
      allocation: allocation.slice(0, 10), // Top 10 positions
      trend: trends,
      significant_changes: significantChanges.slice(0, 5), // Top 5 changes
      last_updated: Math.floor(Date.now() / 1000)
    };
  }
}

module.exports = Balance;