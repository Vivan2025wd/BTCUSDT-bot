/**
 * Settings.js - Bot Configuration Database Model
 * Handles bot settings, strategy configurations, and user preferences
 */

class Settings {
  constructor(database) {
    this.db = database;
    this.tableName = 'settings';
    this.strategiesTableName = 'strategy_settings';
    this.exchangeTableName = 'exchange_settings';
  }

  /**
   * Create settings tables
   */
  async createTable() {
    // Main settings table
    const settingsSql = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        data_type TEXT NOT NULL CHECK(data_type IN ('string', 'number', 'boolean', 'json', 'encrypted')),
        description TEXT,
        default_value TEXT,
        is_encrypted BOOLEAN DEFAULT FALSE,
        is_sensitive BOOLEAN DEFAULT FALSE,
        validation_rules TEXT, -- JSON string for validation rules
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(category, key)
      )
    `;

    // Strategy-specific settings table
    const strategiesSql = `
      CREATE TABLE IF NOT EXISTS ${this.strategiesTableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        strategy_name TEXT NOT NULL,
        setting_key TEXT NOT NULL,
        setting_value TEXT NOT NULL,
        data_type TEXT NOT NULL CHECK(data_type IN ('string', 'number', 'boolean', 'json')),
        is_active BOOLEAN DEFAULT TRUE,
        description TEXT,
        validation_rules TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(strategy_name, setting_key)
      )
    `;

    // Exchange-specific settings table
    const exchangeSql = `
      CREATE TABLE IF NOT EXISTS ${this.exchangeTableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        exchange_name TEXT NOT NULL,
        setting_key TEXT NOT NULL,
        setting_value TEXT NOT NULL,
        data_type TEXT NOT NULL CHECK(data_type IN ('string', 'number', 'boolean', 'json', 'encrypted')),
        is_encrypted BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        description TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(exchange_name, setting_key)
      )
    `;

    await this.db.run(settingsSql);
    await this.db.run(strategiesSql);
    await this.db.run(exchangeSql);
    
    await this.createIndexes();
    await this.insertDefaultSettings();
  }

  /**
   * Create database indexes
   */
  async createIndexes() {
    const indexes = [
      // Main settings indexes
      `CREATE INDEX IF NOT EXISTS idx_settings_category ON ${this.tableName}(category)`,
      `CREATE INDEX IF NOT EXISTS idx_settings_key ON ${this.tableName}(key)`,
      `CREATE INDEX IF NOT EXISTS idx_settings_category_key ON ${this.tableName}(category, key)`,
      
      // Strategy settings indexes
      `CREATE INDEX IF NOT EXISTS idx_strategy_settings_name ON ${this.strategiesTableName}(strategy_name)`,
      `CREATE INDEX IF NOT EXISTS idx_strategy_settings_key ON ${this.strategiesTableName}(setting_key)`,
      `CREATE INDEX IF NOT EXISTS idx_strategy_settings_active ON ${this.strategiesTableName}(is_active)`,
      
      // Exchange settings indexes
      `CREATE INDEX IF NOT EXISTS idx_exchange_settings_name ON ${this.exchangeTableName}(exchange_name)`,
      `CREATE INDEX IF NOT EXISTS idx_exchange_settings_key ON ${this.exchangeTableName}(setting_key)`,
      `CREATE INDEX IF NOT EXISTS idx_exchange_settings_active ON ${this.exchangeTableName}(is_active)`
    ];

    for (const index of indexes) {
      await this.db.run(index);
    }
  }

  /**
   * Insert default settings
   */
  async insertDefaultSettings() {
    const defaultSettings = [
      // General Bot Settings
      { category: 'general', key: 'bot_name', value: 'Trading Bot', data_type: 'string', description: 'Bot display name' },
      { category: 'general', key: 'auto_start', value: 'false', data_type: 'boolean', description: 'Auto-start bot on launch' },
      { category: 'general', key: 'log_level', value: 'info', data_type: 'string', description: 'Logging level (debug, info, warn, error)' },
      { category: 'general', key: 'max_log_files', value: '10', data_type: 'number', description: 'Maximum log files to keep' },
      { category: 'general', key: 'data_retention_days', value: '90', data_type: 'number', description: 'Days to keep trade data' },

      // Risk Management Settings
      { category: 'risk', key: 'max_position_size', value: '2', data_type: 'number', description: 'Maximum position size percentage' },
      { category: 'risk', key: 'stop_loss_percentage', value: '3', data_type: 'number', description: 'Default stop loss percentage' },
      { category: 'risk', key: 'take_profit_percentage', value: '5', data_type: 'number', description: 'Default take profit percentage' },
      { category: 'risk', key: 'max_daily_trades', value: '50', data_type: 'number', description: 'Maximum trades per day' },
      { category: 'risk', key: 'max_drawdown_percentage', value: '15', data_type: 'number', description: 'Maximum allowed drawdown' },
      { category: 'risk', key: 'emergency_stop_enabled', value: 'true', data_type: 'boolean', description: 'Enable emergency stop' },

      // Trading Settings
      { category: 'trading', key: 'default_strategy', value: 'EMAStrategy', data_type: 'string', description: 'Default trading strategy' },
      { category: 'trading', key: 'trading_enabled', value: 'false', data_type: 'boolean', description: 'Enable live trading' },
      { category: 'trading', key: 'paper_trading', value: 'true', data_type: 'boolean', description: 'Paper trading mode' },
      { category: 'trading', key: 'default_timeframe', value: '5m', data_type: 'string', description: 'Default chart timeframe' },
      { category: 'trading', key: 'slippage_tolerance', value: '0.1', data_type: 'number', description: 'Slippage tolerance percentage' },

      // UI Settings
      { category: 'ui', key: 'theme', value: 'dark', data_type: 'string', description: 'UI theme (dark, light)' },
      { category: 'ui', key: 'chart_style', value: 'candlestick', data_type: 'string', description: 'Default chart style' },
      { category: 'ui', key: 'auto_refresh_interval', value: '5', data_type: 'number', description: 'Auto refresh interval in seconds' },
      { category: 'ui', key: 'show_notifications', value: 'true', data_type: 'boolean', description: 'Show desktop notifications' },
      { category: 'ui', key: 'sound_alerts', value: 'true', data_type: 'boolean', description: 'Enable sound alerts' },

      // Notification Settings
      { category: 'notifications', key: 'trade_notifications', value: 'true', data_type: 'boolean', description: 'Trade execution notifications' },
      { category: 'notifications', key: 'error_notifications', value: 'true', data_type: 'boolean', description: 'Error notifications' },
      { category: 'notifications', key: 'pnl_notifications', value: 'true', data_type: 'boolean', description: 'P&L milestone notifications' },
      { category: 'notifications', key: 'daily_summary', value: 'true', data_type: 'boolean', description: 'Daily summary notifications' },

      // API Settings
      { category: 'api', key: 'rate_limit_enabled', value: 'true', data_type: 'boolean', description: 'Enable API rate limiting' },
      { category: 'api', key: 'request_timeout', value: '30000', data_type: 'number', description: 'API request timeout in ms' },
      { category: 'api', key: 'retry_attempts', value: '3', data_type: 'number', description: 'API retry attempts' },
      { category: 'api', key: 'retry_delay', value: '1000', data_type: 'number', description: 'Retry delay in ms' },

      // Security Settings
      { category: 'security', key: 'encryption_enabled', value: 'true', data_type: 'boolean', description: 'Enable data encryption' },
      { category: 'security', key: 'session_timeout', value: '3600', data_type: 'number', description: 'Session timeout in seconds' },
      { category: 'security', key: 'password_required', value: 'false', data_type: 'boolean', description: 'Require password to start bot' },
      { category: 'security', key: 'backup_enabled', value: 'true', data_type: 'boolean', description: 'Enable automatic backups' }
    ];

    for (const setting of defaultSettings) {
      await this.setSetting(setting.category, setting.key, setting.value, setting.data_type, setting.description);
    }
  }

  /**
   * Set a setting value
   * @param {string} category - Setting category
   * @param {string} key - Setting key
   * @param {any} value - Setting value
   * @param {string} dataType - Data type
   * @param {string} description - Setting description
   * @param {Object} validationRules - Validation rules
   * @param {boolean} isEncrypted - Whether value is encrypted
   * @returns {Promise<boolean>} Success status
   */
  async setSetting(category, key, value, dataType = 'string', description = null, validationRules = null, isEncrypted = false) {
    const timestamp = Math.floor(Date.now() / 1000);
    const valueStr = this.serializeValue(value, dataType);
    
    const sql = `
      INSERT OR REPLACE INTO ${this.tableName} (
        category, key, value, data_type, description, 
        validation_rules, is_encrypted, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      category, key, valueStr, dataType, description,
      validationRules ? JSON.stringify(validationRules) : null,
      isEncrypted, timestamp
    ];

    const result = await this.db.run(sql, params);
    return result.changes > 0;
  }

  /**
   * Get a setting value
   * @param {string} category - Setting category
   * @param {string} key - Setting key
   * @param {any} defaultValue - Default value if not found
   * @returns {Promise<any>} Setting value
   */
  async getSetting(category, key, defaultValue = null) {
    const sql = `SELECT * FROM ${this.tableName} WHERE category = ? AND key = ?`;
    const setting = await this.db.get(sql, [category, key]);
    
    if (!setting) {
      return defaultValue;
    }

    return this.deserializeValue(setting.value, setting.data_type);
  }

  /**
   * Get all settings for a category
   * @param {string} category - Setting category
   * @returns {Promise<Object>} Settings object
   */
  async getSettingsByCategory(category) {
    const sql = `SELECT * FROM ${this.tableName} WHERE category = ? ORDER BY key ASC`;
    const settings = await this.db.all(sql, [category]);
    
    const result = {};
    for (const setting of settings) {
      result[setting.key] = {
        value: this.deserializeValue(setting.value, setting.data_type),
        data_type: setting.data_type,
        description: setting.description,
        is_encrypted: setting.is_encrypted,
        validation_rules: setting.validation_rules ? JSON.parse(setting.validation_rules) : null
      };
    }
    
    return result;
  }

  /**
   * Get all settings
   * @returns {Promise<Object>} All settings grouped by category
   */
  async getAllSettings() {
    const sql = `SELECT * FROM ${this.tableName} ORDER BY category ASC, key ASC`;
    const settings = await this.db.all(sql);
    
    const result = {};
    for (const setting of settings) {
      if (!result[setting.category]) {
        result[setting.category] = {};
      }
      
      result[setting.category][setting.key] = {
        value: this.deserializeValue(setting.value, setting.data_type),
        data_type: setting.data_type,
        description: setting.description,
        is_encrypted: setting.is_encrypted,
        validation_rules: setting.validation_rules ? JSON.parse(setting.validation_rules) : null
      };
    }
    
    return result;
  }

  /**
   * Set strategy setting
   * @param {string} strategyName - Strategy name
   * @param {string} key - Setting key
   * @param {any} value - Setting value
   * @param {string} dataType - Data type
   * @param {string} description - Setting description
   * @returns {Promise<boolean>} Success status
   */
  async setStrategySetting(strategyName, key, value, dataType = 'string', description = null) {
    const timestamp = Math.floor(Date.now() / 1000);
    const valueStr = this.serializeValue(value, dataType);
    
    const sql = `
      INSERT OR REPLACE INTO ${this.strategiesTableName} (
        strategy_name, setting_key, setting_value, data_type, description, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    const params = [strategyName, key, valueStr, dataType, description, timestamp];
    const result = await this.db.run(sql, params);
    return result.changes > 0;
  }

  /**
   * Get strategy setting
   * @param {string} strategyName - Strategy name
   * @param {string} key - Setting key
   * @param {any} defaultValue - Default value
   * @returns {Promise<any>} Setting value
   */
  async getStrategySetting(strategyName, key, defaultValue = null) {
    const sql = `
      SELECT * FROM ${this.strategiesTableName} 
      WHERE strategy_name = ? AND setting_key = ? AND is_active = TRUE
    `;
    const setting = await this.db.get(sql, [strategyName, key]);
    
    if (!setting) {
      return defaultValue;
    }

    return this.deserializeValue(setting.setting_value, setting.data_type);
  }

  /**
   * Get all strategy settings
   * @param {string} strategyName - Strategy name
   * @returns {Promise<Object>} Strategy settings
   */
  async getStrategySettings(strategyName) {
    const sql = `
      SELECT * FROM ${this.strategiesTableName} 
      WHERE strategy_name = ? AND is_active = TRUE 
      ORDER BY setting_key ASC
    `;
    const settings = await this.db.all(sql, [strategyName]);
    
    const result = {};
    for (const setting of settings) {
      result[setting.setting_key] = {
        value: this.deserializeValue(setting.setting_value, setting.data_type),
        data_type: setting.data_type,
        description: setting.description
      };
    }
    
    return result;
  }

  /**
   * Set exchange setting
   * @param {string} exchangeName - Exchange name
   * @param {string} key - Setting key
   * @param {any} value - Setting value
   * @param {string} dataType - Data type
   * @param {boolean} isEncrypted - Whether value is encrypted
   * @returns {Promise<boolean>} Success status
   */
  async setExchangeSetting(exchangeName, key, value, dataType = 'string', isEncrypted = false) {
    const timestamp = Math.floor(Date.now() / 1000);
    const valueStr = this.serializeValue(value, dataType);
    
    const sql = `
      INSERT OR REPLACE INTO ${this.exchangeTableName} (
        exchange_name, setting_key, setting_value, data_type, is_encrypted, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `;

    const params = [exchangeName, key, valueStr, dataType, isEncrypted, timestamp];
    const result = await this.db.run(sql, params);
    return result.changes > 0;
  }

  /**
   * Get exchange setting
   * @param {string} exchangeName - Exchange name
   * @param {string} key - Setting key
   * @param {any} defaultValue - Default value
   * @returns {Promise<any>} Setting value
   */
  async getExchangeSetting(exchangeName, key, defaultValue = null) {
    const sql = `
      SELECT * FROM ${this.exchangeTableName} 
      WHERE exchange_name = ? AND setting_key = ? AND is_active = TRUE
    `;
    const setting = await this.db.get(sql, [exchangeName, key]);
    
    if (!setting) {
      return defaultValue;
    }

    return this.deserializeValue(setting.setting_value, setting.data_type);
  }

  /**
   * Get all exchange settings
   * @param {string} exchangeName - Exchange name
   * @returns {Promise<Object>} Exchange settings
   */
  async getExchangeSettings(exchangeName) {
    const sql = `
      SELECT * FROM ${this.exchangeTableName} 
      WHERE exchange_name = ? AND is_active = TRUE 
      ORDER BY setting_key ASC
    `;
    const settings = await this.db.all(sql, [exchangeName]);}}
