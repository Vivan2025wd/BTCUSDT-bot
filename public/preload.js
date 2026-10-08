const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Trading bot controls
  startBot: (config) => ipcRenderer.invoke('start-bot', config),
  stopBot: () => ipcRenderer.invoke('stop-bot'),
  getBotStatus: () => ipcRenderer.invoke('get-bot-status'),
  emergencyStop: () => ipcRenderer.invoke('emergency-stop'),

  // Configuration
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  loadConfig: () => ipcRenderer.invoke('load-config'),
  
  // API Keys (encrypted)
  saveApiKeys: (keys) => ipcRenderer.invoke('save-api-keys', keys),
  loadApiKeys: () => ipcRenderer.invoke('load-api-keys'),
  testApiKeys: (keys) => ipcRenderer.invoke('test-api-keys', keys),

  // Database operations
  getTrades: (limit, offset) => ipcRenderer.invoke('get-trades', limit, offset),
  getBalance: () => ipcRenderer.invoke('get-balance'),
  getPerformance: (period) => ipcRenderer.invoke('get-performance', period),
  
  // Market data
  getMarketData: (symbol) => ipcRenderer.invoke('get-market-data', symbol),
  subscribeToMarket: (symbols, callback) => {
    ipcRenderer.on('market-data', callback);
    return ipcRenderer.invoke('subscribe-market', symbols);
  },
  unsubscribeFromMarket: () => ipcRenderer.invoke('unsubscribe-market'),

  // Notifications and logs
  onBotEvent: (callback) => ipcRenderer.on('bot-event', callback),
  onTradeExecuted: (callback) => ipcRenderer.on('trade-executed', callback),
  onError: (callback) => ipcRenderer.on('bot-error', callback),
  getLogs: (limit) => ipcRenderer.invoke('get-logs', limit),

  // System
  getSystemInfo: () => ipcRenderer.invoke('get-system-info'),
  exportData: (type) => ipcRenderer.invoke('export-data', type),
  importData: (data) => ipcRenderer.invoke('import-data', data),
  
  // Cleanup listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});

// Security: Remove access to Node.js APIs
delete window.require;
delete window.exports;
delete window.module;
