// src/main/preload.js
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

/** Subscribe to a channel; returns an unsubscribe function. */
function subscribe(channel, callback) {
  const wrapped = (_event, ...args) => callback(...args);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

/** Subscribe to a channel but pass the raw event as the first arg. */
function subscribeRaw(channel, callback) {
  const wrapped = (event, ...args) => callback(event, ...args);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

/* ═══════════════════════════════════════════════════════════════
   MAIN API
   ═══════════════════════════════════════════════════════════════ */

contextBridge.exposeInMainWorld('electronAPI', {

  /* ────────────────────────────────────────────────────────────
     APP LIFECYCLE
     ──────────────────────────────────────────────────────────── */

  onAppReady:   (cb) => subscribeRaw('app-ready', cb),
  onNavigateTo: (cb) => subscribeRaw('navigate-to', cb),

  /* ────────────────────────────────────────────────────────────
     ENCRYPTION SESSION
     The password lives in the main process. The renderer only
     sends it once; everything else is via IPC.
     ──────────────────────────────────────────────────────────── */

  /** Set (or unlock with) the encryption password. */
  setEncryptionPassword: (password) =>
    ipcRenderer.invoke('encryption:set-password', password),

  /** Lock — clears the in-memory password in main. */
  lockEncryption: () =>
    ipcRenderer.invoke('encryption:lock'),

  /** Check if currently unlocked. */
  isEncryptionUnlocked: () =>
    ipcRenderer.invoke('encryption:is-unlocked'),

  /** Verify a password against existing keys (doesn't unlock). */
  testEncryptionPassword: (password) =>
    ipcRenderer.invoke('encryption:test-password', password),

  /** Generate a strong random password (main-process crypto). */
  generatePassword: (length = 32) =>
    ipcRenderer.invoke('encryption:generate-password', length),

  /* ────────────────────────────────────────────────────────────
     API KEYS
     ──────────────────────────────────────────────────────────── */

  /**
   * Save API keys. Send PLAINTEXT — main encrypts.
   *   { apiKey, apiSecret }
   */
  saveApiKeys: (keys) =>
    ipcRenderer.invoke('save-api-keys', keys),

  /**
   * Load API keys.
   *   → { apiKey, apiSecret }                 if unlocked
   *   → { locked: true, ...ciphertext }       if password not set
   *   → null                                  if no keys stored
   */
  loadApiKeys: () =>
    ipcRenderer.invoke('load-api-keys'),

  /* ────────────────────────────────────────────────────────────
     CONFIG (raw JSON config file)
     ──────────────────────────────────────────────────────────── */

  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  loadConfig: ()       => ipcRenderer.invoke('load-config'),

  /* ────────────────────────────────────────────────────────────
     SETTINGS (user-facing settings — same file as config, but
     used by Settings.jsx which sends a different shape)
     ──────────────────────────────────────────────────────────── */

  getSettings:  ()         => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  /** Test an exchange API key pair. Returns { success, error?, price? } */
  testExchangeConnection: (exchange, config) =>
    ipcRenderer.invoke('test-exchange-connection', exchange, config),

  /* ────────────────────────────────────────────────────────────
     BOT CONTROL
     ──────────────────────────────────────────────────────────── */

  startBot:       (config) => ipcRenderer.invoke('start-bot', config),
  stopBot:        ()       => ipcRenderer.invoke('stop-bot'),
  pauseBot:       ()       => ipcRenderer.invoke('pause-bot'),
  resumeBot:      ()       => ipcRenderer.invoke('resume-bot'),
  getBotStatus:   ()       => ipcRenderer.invoke('get-bot-status'),
  emergencyStop:  ()       => ipcRenderer.invoke('emergency-stop'),

  /* ────────────────────────────────────────────────────────────
     BOT EVENTS
     ──────────────────────────────────────────────────────────── */

  onBotTrade:       (cb) => subscribeRaw('bot-trade', cb),
  onBotError:       (cb) => subscribeRaw('bot-error', cb),
  onBotStatus:      (cb) => subscribeRaw('bot-status', cb),
  onBalanceUpdate:  (cb) => subscribeRaw('balance-update', cb),
  onToggleBot:      (cb) => subscribeRaw('toggle-bot', cb),
  onEmergencyStop:  (cb) => subscribeRaw('emergency-stop', cb),
  onTradingUpdate:  (cb) => subscribeRaw('trading-update', cb),

  removeTradingUpdateListener: () =>
    ipcRenderer.removeAllListeners('trading-update'),

  /* ────────────────────────────────────────────────────────────
     MARKET DATA
     ──────────────────────────────────────────────────────────── */

  /**
   * Historical candles for the Chart component.
   * Returns array of { timestamp, open, high, low, close, volume }.
   */
  getPriceData: (symbol, timeframe, limit = 100) =>
    ipcRenderer.invoke('get-price-data', symbol, timeframe, limit),

  getCurrentPrices: (symbols) =>
    ipcRenderer.invoke('get-current-prices', symbols),

  /* ────────────────────────────────────────────────────────────
     PORTFOLIO
     ──────────────────────────────────────────────────────────── */

  getPortfolio: () => ipcRenderer.invoke('get-portfolio'),

  /* ────────────────────────────────────────────────────────────
     TRADES
     ──────────────────────────────────────────────────────────── */

  getTradeHistory: (limit = 100) =>
    ipcRenderer.invoke('get-trade-history', limit),

  getTrades: (limit = 1000) =>
    ipcRenderer.invoke('get-trades', limit),

  getRecentTrades: (limit = 10) =>
    ipcRenderer.invoke('get-recent-trades', limit),

  getOpenPositions: () =>
    ipcRenderer.invoke('get-open-positions'),

  getPerformanceStats: () =>
    ipcRenderer.invoke('get-performance-stats'),

  /**
   * Export trades to CSV.
   * Pass an array → main shows a save dialog.
   * Pass a string → treated as a file path.
   * Pass nothing → exports the current history.
   */
  exportTrades: (tradesOrPath) =>
    ipcRenderer.invoke('export-trades', tradesOrPath),

  onExportTrades: (cb) => subscribeRaw('export-trades', cb),

  /* ────────────────────────────────────────────────────────────
     MANUAL ORDERS (used by useTrading hook)
     ──────────────────────────────────────────────────────────── */

  placeBuyOrder:  (order)  => ipcRenderer.invoke('place-buy-order', order),
  placeSellOrder: (order)  => ipcRenderer.invoke('place-sell-order', order),
  closePosition:  (symbol) => ipcRenderer.invoke('close-position', symbol),

  /* ────────────────────────────────────────────────────────────
     BACKTESTING
     ──────────────────────────────────────────────────────────── */

  runBacktest:  (config) => ipcRenderer.invoke('run-backtest', config),
  stopBacktest: ()       => ipcRenderer.invoke('stop-backtest'),

  /* ────────────────────────────────────────────────────────────
     DIALOGS
     ──────────────────────────────────────────────────────────── */

  showErrorDialog: (title, message) =>
    ipcRenderer.invoke('show-error-dialog', title, message),

  showInfoDialog: (title, message) =>
    ipcRenderer.invoke('show-info-dialog', title, message),

  /* ────────────────────────────────────────────────────────────
     CLEANUP
     ──────────────────────────────────────────────────────────── */

  removeAllListeners: (channel) =>
    ipcRenderer.removeAllListeners(channel),

  /** Remove every listener registered via `on*` helpers. */
  removeAllBotListeners: () => {
    const channels = [
      'bot-trade', 'bot-error', 'bot-status', 'balance-update',
      'toggle-bot', 'emergency-stop', 'trading-update',
      'export-trades', 'app-ready', 'navigate-to'
    ];
    channels.forEach((ch) => ipcRenderer.removeAllListeners(ch));
  }
});

/* ═══════════════════════════════════════════════════════════════
   PLATFORM INFO
   ═══════════════════════════════════════════════════════════════ */

contextBridge.exposeInMainWorld('platform', {
  os:      process.platform,
  arch:    process.arch,
  version: process.versions,
  node:    process.versions.node,
  chrome:  process.versions.chrome,
  electron: process.versions.electron
});

/* ═══════════════════════════════════════════════════════════════
   DEVTOOLS (dev only)
   ═══════════════════════════════════════════════════════════════ */

if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
  contextBridge.exposeInMainWorld('devTools', {
    log:   (...args) => console.log('[renderer]', ...args),
    warn:  (...args) => console.warn('[renderer]', ...args),
    error: (...args) => console.error('[renderer]', ...args)
  });
}