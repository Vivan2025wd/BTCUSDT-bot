// Configuration Service - Manages app settings and preferences
const path = require('path');
const fs = require('fs').promises;
const { app } = require('electron');
const crypto = require('crypto');

class ConfigService {
    constructor() {
        this.configPath = path.join(app.getPath('userData'), 'config.json');
        this.config = {};
        this.encryptionKey = null;
        this.defaultConfig = {
            // Trading Settings
            trading: {
                enabled: false,
                riskPercentage: 2.0,
                stopLossPercentage: 3.0,
                takeProfitPercentage: 5.0,
                maxDailyTrades: 10,
                maxDrawdown: 15.0,
                defaultExchange: 'binance',
                defaultStrategy: 'ema_crossover',
                tradingPairs: ['BTCUSDT', 'ETHUSDT', 'ADAUSDT']
            },
            
            // Exchange Settings (encrypted)
            exchanges: {
                binance: {
                    apiKey: '',
                    apiSecret: '',
                    sandbox: true,
                    enabled: false
                },
                bybit: {
                    apiKey: '',
                    apiSecret: '',
                    sandbox: true,
                    enabled: false
                }
            },
            
            // Strategy Settings
            strategies: {
                ema_crossover: {
                    enabled: true,
                    fastPeriod: 12,
                    slowPeriod: 26,
                    signalPeriod: 9
                },
                rsi_divergence: {
                    enabled: false,
                    period: 14,
                    oversold: 30,
                    overbought: 70
                }
            },
            
            // UI Settings
            ui: {
                theme: 'dark',
                autoRefresh: true,
                refreshInterval: 5000,
                defaultTimeframe: '1h',
                showNotifications: true,
                soundAlerts: false
            },
            
            // Logging Settings
            logging: {
                level: 'INFO',
                maxLogFiles: 10,
                maxLogSize: 10485760, // 10MB
                enableConsole: true,
                enableFile: true
            },
            
            // Backtesting Settings
            backtesting: {
                enabled: true,
                startDate: '2023-01-01',
                endDate: null,
                initialBalance: 10000,
                commission: 0.001
            }
        };
    }

    async initialize() {
        try {
            // Generate or load encryption key
            await this.initializeEncryption();
            
            // Load existing config or create default
            await this.loadConfig();
            
            console.log('ConfigService initialized successfully');
        } catch (error) {
            console.error('Failed to initialize ConfigService:', error);
            throw error;
        }
    }

    async initializeEncryption() {
        const keyPath = path.join(app.getPath('userData'), '.key');
        
        try {
            // Try to load existing key
            const keyData = await fs.readFile(keyPath);
            this.encryptionKey = keyData;
        } catch (error) {
            // Generate new key if not exists
            this.encryptionKey = crypto.randomBytes(32);
            await fs.writeFile(keyPath, this.encryptionKey, { mode: 0o600 });
            console.log('Generated new encryption key');
        }
    }

    async loadConfig() {
        try {
            const configData = await fs.readFile(this.configPath, 'utf8');
            const savedConfig = JSON.parse(configData);
            
            // Decrypt sensitive data
            if (savedConfig.exchanges) {
                for (const [exchange, config] of Object.entries(savedConfig.exchanges)) {
                    if (config.apiKey) {
                        config.apiKey = this.decrypt(config.apiKey);
                    }
                    if (config.apiSecret) {
                        config.apiSecret = this.decrypt(config.apiSecret);
                    }
                }
            }
            
            // Merge with defaults
            this.config = this.mergeConfig(this.defaultConfig, savedConfig);
            
            console.log('Configuration loaded successfully');
        } catch (error) {
            // Use default config if file doesn't exist
            console.log('Using default configuration');
            this.config = { ...this.defaultConfig };
            await this.saveConfig();
        }
    }

    async saveConfig() {
        try {
            // Create a copy for saving
            const configToSave = JSON.parse(JSON.stringify(this.config));
            
            // Encrypt sensitive data
            if (configToSave.exchanges) {
                for (const [exchange, config] of Object.entries(configToSave.exchanges)) {
                    if (config.apiKey) {
                        config.apiKey = this.encrypt(config.apiKey);
                    }
                    if (config.apiSecret) {
                        config.apiSecret = this.encrypt(config.apiSecret);
                    }
                }
            }
            
            // Ensure directory exists
            await fs.mkdir(path.dirname(this.configPath), { recursive: true });
            
            // Save with proper permissions
            await fs.writeFile(
                this.configPath, 
                JSON.stringify(configToSave, null, 2),
                { mode: 0o600 }
            );
            
            console.log('Configuration saved successfully');
        } catch (error) {
            console.error('Failed to save configuration:', error);
            throw error;
        }
    }

    encrypt(text) {
        if (!text || !this.encryptionKey) return text;
        
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
        cipher.setAutoPadding(true);
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        return iv.toString('hex') + ':' + encrypted;
    }

    decrypt(encryptedText) {
        if (!encryptedText || !this.encryptionKey) return encryptedText;
        
        try {
            const [ivHex, encrypted] = encryptedText.split(':');
            const iv = Buffer.from(ivHex, 'hex');
            
            const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
            decipher.setAutoPadding(true);
            
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            console.error('Failed to decrypt data:', error);
            return encryptedText;
        }
    }

    mergeConfig(defaultConfig, userConfig) {
        const result = { ...defaultConfig };
        
        for (const [key, value] of Object.entries(userConfig)) {
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                result[key] = this.mergeConfig(defaultConfig[key] || {}, value);
            } else {
                result[key] = value;
            }
        }
        
        return result;
    }

    // Getters
    get(keyPath) {
        const keys = keyPath.split('.');
        let value = this.config;
        
        for (const key of keys) {
            if (value && typeof value === 'object') {
                value = value[key];
            } else {
                return undefined;
            }
        }
        
        return value;
    }

    // Setters
    async set(keyPath, value) {
        const keys = keyPath.split('.');
        const lastKey = keys.pop();
        let target = this.config;
        
        // Navigate to parent object
        for (const key of keys) {
            if (!target[key] || typeof target[key] !== 'object') {
                target[key] = {};
            }
            target = target[key];
        }
        
        target[lastKey] = value;
        await this.saveConfig();
    }

    // Specific getters for common settings
    getTradingConfig() {
        return this.config.trading || {};
    }

    getExchangeConfig(exchange) {
        return this.config.exchanges?.[exchange] || {};
    }

    getStrategyConfig(strategy) {
        return this.config.strategies?.[strategy] || {};
    }

    getUIConfig() {
        return this.config.ui || {};
    }

    getLoggingConfig() {
        return this.config.logging || {};
    }

    getBacktestingConfig() {
        return this.config.backtesting || {};
    }

    // Validation helpers
    validateExchangeConfig(exchange, config) {
        const required = ['apiKey', 'apiSecret'];
        const missing = required.filter(field => !config[field]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required fields for ${exchange}: ${missing.join(', ')}`);
        }
        
        return true;
    }

    validateTradingConfig(config) {
        const { riskPercentage, stopLossPercentage, takeProfitPercentage, maxDrawdown } = config;
        
        if (riskPercentage <= 0 || riskPercentage > 10) {
            throw new Error('Risk percentage must be between 0 and 10%');
        }
        
        if (stopLossPercentage <= 0 || stopLossPercentage > 20) {
            throw new Error('Stop loss percentage must be between 0 and 20%');
        }
        
        if (takeProfitPercentage <= 0 || takeProfitPercentage > 50) {
            throw new Error('Take profit percentage must be between 0 and 50%');
        }
        
        if (maxDrawdown <= 0 || maxDrawdown > 50) {
            throw new Error('Max drawdown must be between 0 and 50%');
        }
        
        return true;
    }

    // Export/Import functionality
    async exportConfig(filePath) {
        try {
            const exportData = {
                ...this.config,
                exports: {
                    timestamp: new Date().toISOString(),
                    version: '1.0.0'
                }
            };
            
            // Remove sensitive data from export
            delete exportData.exchanges;
            
            await fs.writeFile(filePath, JSON.stringify(exportData, null, 2));
            return true;
        } catch (error) {
            console.error('Failed to export configuration:', error);
            return false;
        }
    }

    async importConfig(filePath) {
        try {
            const importData = JSON.parse(await fs.readFile(filePath, 'utf8'));
            
            // Validate imported data
            if (!importData || typeof importData !== 'object') {
                throw new Error('Invalid configuration file');
            }
            
            // Merge imported config (excluding exchanges for security)
            delete importData.exchanges;
            this.config = this.mergeConfig(this.config, importData);
            
            await this.saveConfig();
            return true;
        } catch (error) {
            console.error('Failed to import configuration:', error);
            return false;
        }
    }

    // Reset to defaults
    async resetToDefaults() {
        const currentExchanges = this.config.exchanges;
        this.config = { ...this.defaultConfig };
        this.config.exchanges = currentExchanges; // Preserve exchange configs
        await this.saveConfig();
    }
}

module.exports = ConfigService;
