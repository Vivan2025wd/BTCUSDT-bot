// Logging Service - Handles application logging and trade history
const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');

class LoggingService {
    constructor(configService, database) {
        this.configService = configService;
        this.database = database;
        this.logsDir = path.join(app.getPath('userData'), 'logs');
        this.currentLogFile = null;
        this.logQueue = [];
        this.isWriting = false;
        
        // Log levels
        this.levels = {
            DEBUG: 0,
            INFO: 1,
            WARN: 2,
            ERROR: 3,
            FATAL: 4
        };
        
        this.levelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
    }

    async initialize() {
        try {
            // Ensure logs directory exists
            await fs.mkdir(this.logsDir, { recursive: true });
            
            // Initialize current log file
            await this.initializeLogFile();
            
            // Start log processing
            this.processLogQueue();
            
            console.log('LoggingService initialized successfully');
            this.info('SYSTEM', 'Logging service started');
        } catch (error) {
            console.error('Failed to initialize LoggingService:', error);
            throw error;
        }
    }

    async initializeLogFile() {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-');
        
        this.currentLogFile = path.join(this.logsDir, `trading-bot-${dateStr}-${timeStr}.log`);
        
        // Write initial log entry
        const header = `\n=== Trading Bot Log - ${now.toISOString()} ===\n`;
        await fs.writeFile(this.currentLogFile, header, { flag: 'a' });
        
        // Clean up old log files
        await this.cleanupOldLogs();
    }

    async cleanupOldLogs() {
        try {
            const config = this.configService.getLoggingConfig();
            const maxFiles = config.maxLogFiles || 10;
            
            const files = await fs.readdir(this.logsDir);
            const logFiles = files
                .filter(file => file.startsWith('trading-bot-') && file.endsWith('.log'))
                .map(file => ({
                    name: file,
                    path: path.join(this.logsDir, file),
                    stat: null
                }));
            
            // Get file stats
            for (const file of logFiles) {
                try {
                    file.stat = await fs.stat(file.path);
                } catch (error) {
                    // Skip files we can't stat
                }
            }
            
            // Sort by creation time (newest first)
            logFiles
                .filter(file => file.stat)
                .sort((a, b) => b.stat.birthtime - a.stat.birthtime)
                .slice(maxFiles) // Keep only excess files
                .forEach(async (file) => {
                    try {
                        await fs.unlink(file.path);
                        console.log(`Cleaned up old log file: ${file.name}`);
                    } catch (error) {
                        console.error(`Failed to cleanup log file ${file.name}:`, error);
                    }
                });
                
        } catch (error) {
            console.error('Failed to cleanup old logs:', error);
        }
    }

    processLogQueue() {
        setInterval(async () => {
            if (this.isWriting || this.logQueue.length === 0) return;
            
            this.isWriting = true;
            
            try {
                const logsToWrite = [...this.logQueue];
                this.logQueue = [];
                
                // Write to file
                if (this.shouldLogToFile()) {
                    const logText = logsToWrite
                        .map(log => this.formatLogEntry(log))
                        .join('\n') + '\n';
                    
                    await fs.writeFile(this.currentLogFile, logText, { flag: 'a' });
                }
                
                // Write to database
                if (this.database) {
                    for (const log of logsToWrite) {
                        await this.writeToDatabase(log);
                    }
                }
                
            } catch (error) {
                console.error('Error processing log queue:', error);
            } finally {
                this.isWriting = false;
            }
        }, 1000);
    }

    async writeToDatabase(logEntry) {
        try {
            await this.database.run(
                `INSERT INTO logs (level, message, category, data, timestamp) 
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    logEntry.level,
                    logEntry.message,
                    logEntry.category || 'GENERAL',
                    logEntry.data ? JSON.stringify(logEntry.data) : null,
                    logEntry.timestamp
                ]
            );
        } catch (error) {
            console.error('Failed to write log to database:', error);
        }
    }

    formatLogEntry(logEntry) {
        const timestamp = new Date(logEntry.timestamp).toISOString();
        const level = logEntry.level.padEnd(5);
        const category = logEntry.category ? `[${logEntry.category}]` : '[GENERAL]';
        const data = logEntry.data ? ` | ${JSON.stringify(logEntry.data)}` : '';
        
        return `${timestamp} ${level} ${category} ${logEntry.message}${data}`;
    }

    shouldLogToFile() {
        const config = this.configService.getLoggingConfig();
        return config.enableFile !== false;
    }

    shouldLogToConsole() {
        const config = this.configService.getLoggingConfig();
        return config.enableConsole !== false;
    }

    shouldLog(level) {
        const config = this.configService.getLoggingConfig();
        const configLevel = config.level || 'INFO';
        const configLevelNum = this.levels[configLevel] || 1;
        const logLevelNum = this.levels[level] || 1;
        
        return logLevelNum >= configLevelNum;
    }

    log(level, category, message, data = null) {
        if (!this.shouldLog(level)) return;
        
        const logEntry = {
            level,
            category,
            message,
            data,
            timestamp: new Date().toISOString()
        };
        
        // Add to queue for file/database logging
        this.logQueue.push(logEntry);
        
        // Console logging
        if (this.shouldLogToConsole()) {
            const formattedMessage = this.formatLogEntry(logEntry);
            
            switch (level) {
                case 'DEBUG':
                    console.debug(formattedMessage);
                    break;
                case 'INFO':
                    console.info(formattedMessage);
                    break;
                case 'WARN':
                    console.warn(formattedMessage);
                    break;
                case 'ERROR':
                case 'FATAL':
                    console.error(formattedMessage);
                    break;
                default:
                    console.log(formattedMessage);
            }
        }
    }

    // Convenience methods
    debug(category, message, data) {
        this.log('DEBUG', category, message, data);
    }

    info(category, message, data) {
        this.log('INFO', category, message, data);
    }

    warn(category, message, data) {
        this.log('WARN', category, message, data);
    }

    error(category, message, data) {
        this.log('ERROR', category, message, data);
    }

    fatal(category, message, data) {
        this.log('FATAL', category, message, data);
    }

    // Trading-specific logging methods
    logTrade(trade, action = 'EXECUTED') {
        const message = `${action}: ${trade.side} ${trade.quantity} ${trade.symbol} at ${trade.price}`;
        this.info('TRADE', message, {
            tradeId: trade.id,
            strategy: trade.strategy_name,
            exchange: trade.exchange,
            symbol: trade.symbol,
            side: trade.side,
            quantity: trade.quantity,
            price: trade.price,
            status: trade.status
        });
    }

    logError(category, error, context = null) {
        const message = error.message || 'Unknown error';
        const data = {
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack
            },
            context
        };
        
        this.error(category, message, data);
    }

    logStrategyAction(strategyName, action, symbol, data = null) {
        const message = `Strategy ${strategyName}: ${action} for ${symbol}`;
        this.info('STRATEGY', message, {
            strategy: strategyName,
            action,
            symbol,
            ...data
        });
    }

    logExchangeAction(exchange, action, data = null) {
        const message = `${exchange}: ${action}`;
        this.info('EXCHANGE', message, {
            exchange,
            action,
            ...data
        });
    }

    logSystemAction(action, data = null) {
        this.info('SYSTEM', action, data);
    }

    // Query methods for log retrieval
    async getLogs(options = {}) {
        const {
            level = null,
            category = null,
            startDate = null,
            endDate = null,
            limit = 100,
            offset = 0
        } = options;
        
        let query = 'SELECT * FROM logs WHERE 1=1';
        const params = [];
        
        if (level) {
            query += ' AND level = ?';
            params.push(level);
        }
        
        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }
        
        if (startDate) {
            query += ' AND timestamp >= ?';
            params.push(startDate);
        }
        
        if (endDate) {
            query += ' AND timestamp <= ?';
            params.push(endDate);
        }
        
        query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        try {
            const rows = await this.database.all(query, params);
            return rows.map(row => ({
                ...row,
                data: row.data ? JSON.parse(row.data) : null
            }));
        } catch (error) {
            console.error('Failed to retrieve logs:', error);
            return [];
        }
    }

    async getLogStats() {
        try {
            const stats = await this.database.all(`
                SELECT 
                    level,
                    COUNT(*) as count,
                    DATE(timestamp) as date
                FROM logs 
                WHERE timestamp >= datetime('now', '-7 days')
                GROUP BY level, DATE(timestamp)
                ORDER BY date DESC, level
            `);
            
            return stats;
        } catch (error) {
            console.error('Failed to get log stats:', error);
            return [];
        }
    }

    // Log file management
    async rotateLogFile() {
        try {
            await this.initializeLogFile();
            this.info('SYSTEM', 'Log file rotated');
        } catch (error) {
            this.error('SYSTEM', 'Failed to rotate log file', { error: error.message });
        }
    }

    async exportLogs(filePath, options = {}) {
        try {
            const logs = await this.getLogs({ ...options, limit: 10000 });
            const logText = logs
                .map(log => this.formatLogEntry(log))
                .join('\n');
            
            await fs.writeFile(filePath, logText);
            this.info('SYSTEM', `Logs exported to ${filePath}`);
            return true;
        } catch (error) {
            this.error('SYSTEM', 'Failed to export logs', { error: error.message });
            return false;
        }
    }

    // Cleanup methods
    async clearOldLogs(days = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            
            const result = await this.database.run(
                'DELETE FROM logs WHERE timestamp < ?',
                [cutoffDate.toISOString()]
            );
            
            this.info('SYSTEM', `Cleared ${result.changes} old log entries`);
            return result.changes;
        } catch (error) {
            this.error('SYSTEM', 'Failed to clear old logs', { error: error.message });
            return 0;
        }
    }
}

module.exports = LoggingService;
