// Notification Service - Handles trade alerts and system notifications
const { Notification, shell } = require('electron');
const path = require('path');

class NotificationService {
    constructor(configService, loggingService) {
        this.configService = configService;
        this.loggingService = loggingService;
        this.isSupported = Notification.isSupported();
        this.notificationQueue = [];
        this.soundQueue = [];
        this.lastNotificationTime = new Map();
        this.rateLimitWindow = 60000; // 1 minute
        this.maxNotificationsPerWindow = 5;
    }

    async initialize() {
        try {
            if (!this.isSupported) {
                console.warn('System notifications are not supported');
                return false;
            }

            // Request permission if needed (mainly for web contexts)
            if (process.platform === 'darwin') {
                // macOS specific notification setup if needed
            }

            this.loggingService?.info('SYSTEM', 'NotificationService initialized successfully');
            console.log('NotificationService initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize NotificationService:', error);
            this.loggingService?.error('SYSTEM', 'Failed to initialize NotificationService', { error: error.message });
            return false;
        }
    }

    // Core notification method
    async notify(options) {
        const {
            title = 'Trading Bot',
            message,
            type = 'info', // 'info', 'success', 'warning', 'error', 'trade'
            category = 'general',
            data = null,
            sound = false,
            persistent = false
        } = options;

        try {
            // Check if notifications are enabled
            const uiConfig = this.configService.getUIConfig();
            if (!uiConfig.showNotifications) {
                return false;
            }

            // Rate limiting
            if (!this.checkRateLimit(category)) {
                this.loggingService?.debug('NOTIFICATION', `Rate limit exceeded for category: ${category}`);
                return false;
            }

            // Create system notification
            if (this.isSupported) {
                const notification = new Notification({
                    title,
                    body: message,
                    icon: this.getIconForType(type),
                    silent: !sound,
                    urgency: this.getUrgencyForType(type)
                });

                // Handle click events
                notification.on('click', () => {
                    this.handleNotificationClick(type, data);
                });

                notification.show();
            }

            // Play sound if enabled
            if (sound && uiConfig.soundAlerts) {
                this.playNotificationSound(type);
            }

            // Log notification
            this.loggingService?.info('NOTIFICATION', `${type.toUpperCase()}: ${title} - ${message}`, {
                type,
                category,
                data
            });

            return true;
        } catch (error) {
            console.error('Failed to send notification:', error);
            this.loggingService?.error('NOTIFICATION', 'Failed to send notification', { error: error.message });
            return false;
        }
    }

    checkRateLimit(category) {
        const now = Date.now();
        const windowStart = now - this.rateLimitWindow;
        
        // Clean old entries
        for (const [key, timestamps] of this.lastNotificationTime.entries()) {
            this.lastNotificationTime.set(key, timestamps.filter(t => t > windowStart));
        }

        // Check current category
        const categoryTimes = this.lastNotificationTime.get(category) || [];
        
        if (categoryTimes.length >= this.maxNotificationsPerWindow) {
            return false;
        }

        // Add current notification
        categoryTimes.push(now);
        this.lastNotificationTime.set(category, categoryTimes);
        
        return true;
    }

    getIconForType(type) {
        // Return path to icon based on type
        const iconMap = {
            info: 'info.png',
            success: 'success.png',
            warning: 'warning.png',
            error: 'error.png',
            trade: 'trade.png'
        };

        return path.join(__dirname, '../../resources/icons', iconMap[type] || iconMap.info);
    }

    getUrgencyForType(type) {
        const urgencyMap = {
            info: 'normal',
            success: 'normal',
            warning: 'critical',
            error: 'critical',
            trade: 'critical'
        };

        return urgencyMap[type] || 'normal';
    }

    handleNotificationClick(type, data) {
        // Handle different notification types
        switch (type) {
            case 'trade':
                // Could open trade details or bring app to focus
                this.loggingService?.info('NOTIFICATION', 'Trade notification clicked', data);
                break;
            case 'error':
                // Could open logs or error details
                this.loggingService?.info('NOTIFICATION', 'Error notification clicked', data);
                break;
            default:
                this.loggingService?.debug('NOTIFICATION', 'Notification clicked', { type, data });
        }
    }

    playNotificationSound(type) {
        // Implementation would depend on platform
        // For now, just log the sound request
        this.loggingService?.debug('NOTIFICATION', `Sound request for type: ${type}`);
    }

    // Trading-specific notification methods
    async notifyTradeExecuted(trade) {
        const profitLoss = trade.profit_loss || 0;
        const isProfit = profitLoss > 0;
        const pnlText = profitLoss !== 0 ? ` (${isProfit ? '+' : ''}${profitLoss.toFixed(2)})` : '';
        
        return await this.notify({
            title: `Trade Executed - ${trade.symbol}`,
            message: `${trade.side} ${trade.quantity} at ${trade.fill_price}${pnlText}`,
            type: 'trade',
            category: 'trade',
            data: trade,
            sound: true
        });
    }

    async notifyTradeFailed(trade, error) {
        return await this.notify({
            title: `Trade Failed - ${trade.symbol}`,
            message: `Failed to ${trade.side} ${trade.quantity}: ${error}`,
            type: 'error',
            category: 'trade_error',
            data: { trade, error },
            sound: true
        });
    }

    async notifyStrategySignal(strategy, signal, symbol) {
        return await this.notify({
            title: `Strategy Signal - ${strategy}`,
            message: `${signal.toUpperCase()} signal for ${symbol}`,
            type: 'info',
            category: 'strategy',
            data: { strategy, signal, symbol }
        });
    }

    async notifyProfitTarget(trade, targetType) {
        const targetText = targetType === 'take_profit' ? 'Take Profit' : 'Stop Loss';
        const profitLoss = trade.profit_loss || 0;
        const pnlText = `${profitLoss > 0 ? '+' : ''}${profitLoss.toFixed(2)}`;
        
        return await this.notify({
            title: `${targetText} Hit - ${trade.symbol}`,
            message: `Position closed at ${trade.fill_price} (${pnlText})`,
            type: profitLoss > 0 ? 'success' : 'warning',
            category: 'profit_target',
            data: trade,
            sound: true
        });
    }

    async notifyBalanceUpdate(exchange, balance, previousBalance) {
        const change = balance - previousBalance;
        const changePercent = ((change / previousBalance) * 100).toFixed(2);
        const changeText = `${change > 0 ? '+' : ''}${change.toFixed(2)} (${changePercent}%)`;
        
        return await this.notify({
            title: `Balance Update - ${exchange}`,
            message: `New balance: ${balance.toFixed(2)} (${changeText})`,
            type: change > 0 ? 'success' : change < -100 ? 'warning' : 'info',
            category: 'balance',
            data: { exchange, balance, change }
        });
    }

    async notifySystemError(error, context = null) {
        return await this.notify({
            title: 'System Error',
            message: error.message || 'An unknown error occurred',
            type: 'error',
            category: 'system_error',
            data: { error: error.message, context },
            sound: true
        });
    }

    async notifyConnectionIssue(exchange, status) {
        const statusText = status === 'connected' ? 'Connection restored' : 'Connection lost';
        
        return await this.notify({
            title: `${exchange} Connection`,
            message: statusText,
            type: status === 'connected' ? 'success' : 'warning',
            category: 'connection',
            data: { exchange, status },
            sound: status !== 'connected'
        });
    }

    async notifyDailyReport(report) {
        const { totalTrades, winRate, pnl, winningTrades, losingTrades } = report;
        const winRateText = `${(winRate * 100).toFixed(1)}%`;
        const pnlText = `${pnl > 0 ? '+' : ''}${pnl.toFixed(2)}`;
        
        return await this.notify({
            title: 'Daily Trading Report',
            message: `${totalTrades} trades, ${winRateText} win rate, ${pnlText} P&L`,
            type: pnl > 0 ? 'success' : 'info',
            category: 'daily_report',
            data: report
        });
    }

    async notifyRiskWarning(warning) {
        return await this.notify({
            title: 'Risk Warning',
            message: warning.message,
            type: 'warning',
            category: 'risk',
            data: warning,
            sound: true
        });
    }

    // Batch notifications for multiple events
    async notifyBatch(notifications) {
        const results = [];
        
        for (const notification of notifications) {
            const result = await this.notify(notification);
            results.push(result);
            
            // Small delay between notifications to avoid spam
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        return results;
    }

    // Configuration methods
    async updateNotificationSettings(settings) {
        try {
            const currentUI = this.configService.getUIConfig();
            const newUI = { ...currentUI, ...settings };
            
            await this.configService.set('ui.showNotifications', newUI.showNotifications);
            await this.configService.set('ui.soundAlerts', newUI.soundAlerts);
            
            this.loggingService?.info('NOTIFICATION', 'Notification settings updated', settings);
            return true;
        } catch (error) {
            this.loggingService?.error('NOTIFICATION', 'Failed to update notification settings', { error: error.message });
            return false;
        }
    }

    // Testing methods
    async sendTestNotification() {
        return await this.notify({
            title: 'Test Notification',
            message: 'This is a test notification from the trading bot',
            type: 'info',
            category: 'test',
            sound: true
        });
    }

    // Cleanup methods
    clearRateLimit() {
        this.lastNotificationTime.clear();
        this.loggingService?.info('NOTIFICATION', 'Rate limit cache cleared');
    }

    // Statistics
    getRateLimitStats() {
        const stats = {};
        
        for (const [category, timestamps] of this.lastNotificationTime.entries()) {
            stats[category] = {
                count: timestamps.length,
                lastNotification: new Date(Math.max(...timestamps))
            };
        }
        
        return stats;
    }
}