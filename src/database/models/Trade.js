class Trade {
  constructor(database) {
    this.db = database;
    this.tableName = 'trades';
  }

  /**
   * Create trades table
   */
  async createTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        trade_id TEXT UNIQUE NOT NULL,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL CHECK(side IN ('buy', 'sell')),
        type TEXT NOT NULL CHECK(type IN ('market', 'limit', 'stop_market', 'stop_limit')),
        quantity REAL NOT NULL,
        price REAL NOT NULL,
        filled_quantity REAL DEFAULT 0,
        avg_fill_price REAL DEFAULT 0,
        commission REAL DEFAULT 0,
        commission_asset TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'filled', 'cancelled', 'rejected', 'expired')),
        strategy TEXT,
        entry_price REAL,
        exit_price REAL,
        stop_loss REAL,
        take_profit REAL,
        pnl REAL DEFAULT 0,
        pnl_percentage REAL DEFAULT 0,
        exchange TEXT NOT NULL,
        order_time INTEGER NOT NULL,
        fill_time INTEGER,
        notes TEXT,
        metadata TEXT, -- JSON string for additional data
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `;
    
    await this.db.run(sql);
    
    // Create indexes for better performance
    await this.createIndexes();
  }

  /**
   * Create database indexes
   */
  async createIndexes() {
    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_trades_symbol ON ${this.tableName}(symbol)`,
      `CREATE INDEX IF NOT EXISTS idx_trades_status ON ${this.tableName}(status)`,
      `CREATE INDEX IF NOT EXISTS idx_trades_strategy ON ${this.tableName}(strategy)`,
      `CREATE INDEX IF NOT EXISTS idx_trades_order_time ON ${this.tableName}(order_time)`,
      `CREATE INDEX IF NOT EXISTS idx_trades_exchange ON ${this.tableName}(exchange)`,
      `CREATE INDEX IF NOT EXISTS idx_trades_side ON ${this.tableName}(side)`
    ];

    for (const index of indexes) {
      await this.db.run(index);
    }
  }

  /**
   * Insert a new trade
   * @param {Object} tradeData - Trade data
   * @returns {Promise<number>} Trade ID
   */
  async create(tradeData) {
    const {
      trade_id, symbol, side, type, quantity, price,
      filled_quantity = 0, avg_fill_price = 0, commission = 0,
      commission_asset, status = 'pending', strategy, entry_price,
      exit_price, stop_loss, take_profit, pnl = 0, pnl_percentage = 0,
      exchange, order_time, fill_time, notes, metadata
    } = tradeData;

    const sql = `
      INSERT INTO ${this.tableName} (
        trade_id, symbol, side, type, quantity, price,
        filled_quantity, avg_fill_price, commission, commission_asset,
        status, strategy, entry_price, exit_price, stop_loss, take_profit,
        pnl, pnl_percentage, exchange, order_time, fill_time, notes, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      trade_id, symbol, side, type, quantity, price,
      filled_quantity, avg_fill_price, commission, commission_asset,
      status, strategy, entry_price, exit_price, stop_loss, take_profit,
      pnl, pnl_percentage, exchange, order_time, fill_time, notes,
      metadata ? JSON.stringify(metadata) : null
    ];

    const result = await this.db.run(sql, params);
    return result.lastID;
  }

  /**
   * Update trade data
   * @param {string} tradeId - Trade ID
   * @param {Object} updates - Update data
   * @returns {Promise<boolean>} Success status
   */
  async update(tradeId, updates) {
    const allowedFields = [
      'quantity', 'price', 'filled_quantity', 'avg_fill_price',
      'commission', 'commission_asset', 'status', 'exit_price',
      'pnl', 'pnl_percentage', 'fill_time', 'notes', 'metadata'
    ];

    const updateFields = [];
    const params = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = ?`);
        params.push(key === 'metadata' && typeof value === 'object' ? 
          JSON.stringify(value) : value);
      }
    }

    if (updateFields.length === 0) {
      return false;
    }

    updateFields.push('updated_at = ?');
    params.push(Math.floor(Date.now() / 1000));
    params.push(tradeId);

    const sql = `
      UPDATE ${this.tableName} 
      SET ${updateFields.join(', ')}
      WHERE trade_id = ?
    `;

    const result = await this.db.run(sql, params);
    return result.changes > 0;
  }

  /**
   * Get trade by ID
   * @param {string} tradeId - Trade ID
   * @returns {Promise<Object|null>} Trade data
   */
  async getById(tradeId) {
    const sql = `SELECT * FROM ${this.tableName} WHERE trade_id = ?`;
    const trade = await this.db.get(sql, [tradeId]);
    
    if (trade && trade.metadata) {
      try {
        trade.metadata = JSON.parse(trade.metadata);
      } catch (e) {
        trade.metadata = null;
      }
    }
    
    return trade;
  }

  /**
   * Get trades by symbol
   * @param {string} symbol - Trading symbol
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Trades array
   */
  async getBySymbol(symbol, options = {}) {
    const { limit = 100, offset = 0, status, strategy } = options;
    
    let sql = `SELECT * FROM ${this.tableName} WHERE symbol = ?`;
    const params = [symbol];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    if (strategy) {
      sql += ' AND strategy = ?';
      params.push(strategy);
    }

    sql += ' ORDER BY order_time DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const trades = await this.db.all(sql, params);
    return this.parseMetadata(trades);
  }

  /**
   * Get trades by date range
   * @param {number} startTime - Start timestamp
   * @param {number} endTime - End timestamp
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Trades array
   */
  async getByDateRange(startTime, endTime, options = {}) {
    const { symbol, strategy, status, limit = 1000 } = options;
    
    let sql = `
      SELECT * FROM ${this.tableName} 
      WHERE order_time >= ? AND order_time <= ?
    `;
    const params = [startTime, endTime];

    if (symbol) {
      sql += ' AND symbol = ?';
      params.push(symbol);
    }

    if (strategy) {
      sql += ' AND strategy = ?';
      params.push(strategy);
    }

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY order_time DESC LIMIT ?';
    params.push(limit);

    const trades = await this.db.all(sql, params);
    return this.parseMetadata(trades);
  }

  /**
   * Get open trades
   * @param {string} symbol - Optional symbol filter
   * @returns {Promise<Array>} Open trades
   */
  async getOpenTrades(symbol = null) {
    let sql = `
      SELECT * FROM ${this.tableName} 
      WHERE status IN ('pending', 'filled') AND exit_price IS NULL
    `;
    const params = [];

    if (symbol) {
      sql += ' AND symbol = ?';
      params.push(symbol);
    }

    sql += ' ORDER BY order_time ASC';

    const trades = await this.db.all(sql, params);
    return this.parseMetadata(trades);
  }

  /**
   * Get trade statistics
   * @param {Object} filters - Filter options
   * @returns {Promise<Object>} Trade statistics
   */
  async getStatistics(filters = {}) {
    const { symbol, strategy, startTime, endTime } = filters;
    
    let whereClause = 'WHERE status = "filled"';
    const params = [];

    if (symbol) {
      whereClause += ' AND symbol = ?';
      params.push(symbol);
    }

    if (strategy) {
      whereClause += ' AND strategy = ?';
      params.push(strategy);
    }

    if (startTime) {
      whereClause += ' AND order_time >= ?';
      params.push(startTime);
    }

    if (endTime) {
      whereClause += ' AND order_time <= ?';
      params.push(endTime);
    }

    const sql = `
      SELECT 
        COUNT(*) as total_trades,
        COUNT(CASE WHEN pnl > 0 THEN 1 END) as winning_trades,
        COUNT(CASE WHEN pnl < 0 THEN 1 END) as losing_trades,
        COUNT(CASE WHEN pnl = 0 THEN 1 END) as break_even_trades,
        SUM(pnl) as total_pnl,
        AVG(pnl) as avg_pnl,
        MAX(pnl) as max_win,
        MIN(pnl) as max_loss,
        SUM(commission) as total_commission,
        AVG(commission) as avg_commission,
        SUM(quantity * avg_fill_price) as total_volume
      FROM ${this.tableName} ${whereClause}
    `;

    const stats = await this.db.get(sql, params);
    
    // Calculate additional metrics
    const winRate = stats.total_trades > 0 ? 
      (stats.winning_trades / stats.total_trades * 100) : 0;
    
    const profitFactor = Math.abs(stats.max_loss) > 0 ? 
      Math.abs(stats.max_win / stats.max_loss) : 0;

    return {
      ...stats,
      win_rate: Math.round(winRate * 100) / 100,
      profit_factor: Math.round(profitFactor * 100) / 100,
      avg_win: stats.winning_trades > 0 ? 
        await this.getAvgWinLoss('win', whereClause, params) : 0,
      avg_loss: stats.losing_trades > 0 ? 
        await this.getAvgWinLoss('loss', whereClause, params) : 0
    };
  }

  /**
   * Get average win/loss
   * @param {string} type - 'win' or 'loss'
   * @param {string} whereClause - SQL WHERE clause
   * @param {Array} params - SQL parameters
   * @returns {Promise<number>} Average win/loss
   */
  async getAvgWinLoss(type, whereClause, params) {
    const condition = type === 'win' ? 'pnl > 0' : 'pnl < 0';
    const sql = `
      SELECT AVG(pnl) as avg_pnl 
      FROM ${this.tableName} 
      ${whereClause} AND ${condition}
    `;
    
    const result = await this.db.get(sql, params);
    return result.avg_pnl || 0;
  }

  /**
   * Get trades by strategy
   * @param {string} strategy - Strategy name
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Trades array
   */
  async getByStrategy(strategy, options = {}) {
    const { limit = 100, status } = options;
    
    let sql = `SELECT * FROM ${this.tableName} WHERE strategy = ?`;
    const params = [strategy];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY order_time DESC LIMIT ?';
    params.push(limit);

    const trades = await this.db.all(sql, params);
    return this.parseMetadata(trades);
  }

  /**
   * Delete old trades
   * @param {number} olderThan - Delete trades older than this timestamp
   * @returns {Promise<number>} Number of deleted trades
   */
  async deleteOldTrades(olderThan) {
    const sql = `DELETE FROM ${this.tableName} WHERE order_time < ?`;
    const result = await this.db.run(sql, [olderThan]);
    return result.changes;
  }

  /**
   * Close trade (set exit price and calculate PnL)
   * @param {string} tradeId - Trade ID
   * @param {number} exitPrice - Exit price
   * @param {number} exitTime - Exit timestamp
   * @returns {Promise<boolean>} Success status
   */
  async closeTrade(tradeId, exitPrice, exitTime = null) {
    const trade = await this.getById(tradeId);
    if (!trade) return false;

    const exitTimestamp = exitTime || Math.floor(Date.now() / 1000);
    const entryPrice = trade.avg_fill_price || trade.price;
    
    // Calculate PnL
    let pnl = 0;
    if (trade.side === 'buy') {
      pnl = (exitPrice - entryPrice) * trade.filled_quantity;
    } else {
      pnl = (entryPrice - exitPrice) * trade.filled_quantity;
    }

    // Subtract commission
    pnl -= (trade.commission || 0);

    const pnlPercentage = entryPrice > 0 ? (pnl / (entryPrice * trade.filled_quantity)) * 100 : 0;

    return await this.update(tradeId, {
      exit_price: exitPrice,
      pnl: pnl,
      pnl_percentage: pnlPercentage,
      fill_time: exitTimestamp,
      status: 'filled'
    });
  }

  /**
   * Parse metadata field for trades array
   * @param {Array} trades - Trades array
   * @returns {Array} Parsed trades
   */
  parseMetadata(trades) {
    return trades.map(trade => {
      if (trade.metadata) {
        try {
          trade.metadata = JSON.parse(trade.metadata);
        } catch (e) {
          trade.metadata = null;
        }
      }
      return trade;
    });
  }

  /**
   * Get recent trades
   * @param {number} limit - Number of trades to return
   * @returns {Promise<Array>} Recent trades
   */
  async getRecent(limit = 50) {
    const sql = `
      SELECT * FROM ${this.tableName} 
      ORDER BY order_time DESC 
      LIMIT ?
    `;
    
    const trades = await this.db.all(sql, [limit]);
    return this.parseMetadata(trades);
  }

  /**
   * Count trades by status
   * @param {string} status - Trade status
   * @returns {Promise<number>} Trade count
   */
  async countByStatus(status) {
    const sql = `SELECT COUNT(*) as count FROM ${this.tableName} WHERE status = ?`;
    const result = await this.db.get(sql, [status]);
    return result.count;
  }

  /**
   * Get daily PnL summary
   * @param {number} days - Number of days to look back
   * @returns {Promise<Array>} Daily PnL data
   */
  async getDailyPnL(days = 30) {
    const startTime = Math.floor((Date.now() - (days * 24 * 60 * 60 * 1000)) / 1000);
    
    const sql = `
      SELECT 
        DATE(order_time, 'unixepoch') as date,
        SUM(pnl) as daily_pnl,
        COUNT(*) as trade_count,
        SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as losses
      FROM ${this.tableName}
      WHERE order_time >= ? AND status = 'filled'
      GROUP BY DATE(order_time, 'unixepoch')
      ORDER BY date DESC
    `;

    return await this.db.all(sql, [startTime]);
  }
}

module.exports = Trade;