const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App control
  onAppReady: (callback) => ipcRenderer.on('app-ready', callback),
  onNavigateTo: (callback) => ipcRenderer.on('navigate-to', callback),
  
  // API Keys management
  saveApiKeys: (encryptedData) => ipcRenderer.invoke('save-api-keys', encryptedData),
  loadApiKeys: () => ipcRenderer.invoke('load-api-keys'),
  
  // Configuration management
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  loadConfig: () => ipcRenderer.invoke('load-config'),
  
  // Bot control
  startBot: (config) => ipcRenderer.invoke('start-bot', config),
  stopBot: () => ipcRenderer.invoke('stop-bot'),
  getBotStatus: () => ipcRenderer.invoke('get-bot-status'),
  
  // Bot events
  onBotTrade: (callback) => ipcRenderer.on('bot-trade', callback),
  onBotError: (callback) => ipcRenderer.on('bot-error', callback),
  onBotStatus: (callback) => ipcRenderer.on('bot-status', callback),
  onBalanceUpdate: (callback) => ipcRenderer.on('balance-update', callback),
  onToggleBot: (callback) => ipcRenderer.on('toggle-bot', callback),
  onEmergencyStop: (callback) => ipcRenderer.on('emergency-stop', callback),
  
  // Trade data
  getTradeHistory: (limit) => ipcRenderer.invoke('get-trade-history', limit),
  exportTrades: (filePath) => ipcRenderer.invoke('export-trades', filePath),
  onExportTrades: (callback) => ipcRenderer.on('export-trades', callback),
  
  // Dialogs
  showErrorDialog: (title, message) => ipcRenderer.invoke('show-error-dialog', title, message),
  showInfoDialog: (title, message) => ipcRenderer.invoke('show-info-dialog', title, message),
  
  // Cleanup listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});

// Platform info
contextBridge.exposeInMainWorld('platform', {
  os: process.platform,
  arch: process.arch,
  version: process.versions
});

// Console logging for development
if (process.env.NODE_ENV === 'development') {
  contextBridge.exposeInMainWorld('devTools', {
    log: (...args) => console.log(...args),
    error: (...args) => console.error(...args),
    warn: (...args) => console.warn(...args)
  });
}