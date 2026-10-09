// src/main/main.js
'use strict';

const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

const isDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';

/* ═══════════════════════════════════════════════════════════════
   ✅ WINDOWS GPU SANDBOX WORKAROUND
   Fixes:  "GPU process exited unexpectedly: exit_code=-1073740791"
   ═══════════════════════════════════════════════════════════════ */
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('disable-gpu-sandbox');
  app.commandLine.appendSwitch('disable-gpu');
  app.commandLine.appendSwitch('in-process-gpu');
}
app.disableHardwareAcceleration();

let mainWindow  = null;
let botInstance = null;

/* ═══════════════════════════════════════════════════════════════
   APP DATA + ENCRYPTION STATE
   ═══════════════════════════════════════════════════════════════ */

const appDataDir = path.join(os.homedir(), '.privacy-trading-bot');
const keysFile   = path.join(appDataDir, 'keys.enc');
const configFile = path.join(appDataDir, 'config.json');

if (!fs.existsSync(appDataDir)) {
  fs.mkdirSync(appDataDir, { recursive: true });
}

let encryptionPassword = null;

let EncryptionService = null;
try {
  ({ EncryptionService } = require('../core/encryption'));
} catch (err) {
  console.warn(
    '[main] EncryptionService not available — API key encryption disabled.\n' +
    '       Move src/renderer/utils/encryption.js → src/core/encryption.js\n' +
    '       Reason: ' + err.message
  );
}
const encryptor = EncryptionService ? new EncryptionService() : null;

/* ═══════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════ */

function readJsonSafe(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`[main] Failed to read ${file}:`, err);
    return null;
  }
}

function writeJsonSafe(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function loadTradingBot() {
  try {
    return require('../core/TradingBot');
  } catch (err) {
    throw new Error(
      `TradingBot module not found. Expected at build/core/TradingBot.js.\n` +
      `Original error: ${err.message}`
    );
  }
}

/**
 * Read the decrypted API key pair for the ACTIVE exchange.
 * Supports both the legacy single-pair format and the new
 * multi-exchange format { version, exchanges: { binance: {...}, bybit: {...} } }.
 */
function getDecryptedKeys() {
  const stored = readJsonSafe(keysFile);
  if (!stored) return null;

  // Legacy: plaintext at top level
  if (stored.apiKey && stored.apiSecret) return stored;

  if (!encryptor || !encryptionPassword) return null;

  // Legacy: single encrypted pair at top level
  if (stored.encryptedApiKey) {
    try {
      return encryptor.decryptApiKeys(stored, encryptionPassword);
    } catch (err) {
      console.error('[main] Failed to decrypt legacy API keys:', err.message);
      return null;
    }
  }

  // New: multi-exchange format — pick the active exchange
  const config = readJsonSafe(configFile) || {};
  const activeExchange = config?.exchangeSettings?.name
    || config?.trading?.activeExchange
    || 'binance';

  const cipher = stored.exchanges?.[activeExchange] || stored.exchanges?.binance;
  if (!cipher) return null;

  try {
    return encryptor.decryptApiKeys(cipher, encryptionPassword);
  } catch (err) {
    console.error(`[main] Failed to decrypt ${activeExchange} keys:`, err.message);
    return null;
  }
}

/** Merge stored config + decrypted API keys into one object for TradingBot. */
function buildBotConfig(overrides = {}) {
  const base = readJsonSafe(configFile) || {};
  const apiKeys = getDecryptedKeys();

  const riskIn = base.risk || {};
  const riskSettings = {
    positionSizePercent: riskIn.positionSize ?? riskIn.positionSizePercent ?? 2,
    stopLossPercent:     riskIn.stopLoss     ?? riskIn.stopLossPercent     ?? 3,
    takeProfitPercent:   riskIn.takeProfit   ?? riskIn.takeProfitPercent   ?? 5,
    maxDailyLoss:        riskIn.maxDrawdown  ?? riskIn.maxDailyLoss        ?? 10,
    maxPositions:        riskIn.maxPositions ?? 5
  };

  const strategyIn = base.strategySettings || {};
  const strategySettings = {
    emaFast:         strategyIn.emaFast         ?? 9,
    emaSlow:         strategyIn.emaSlow         ?? 21,
    rsiPeriod:       strategyIn.rsiPeriod       ?? 14,
    rsiOverbought:   strategyIn.rsiOverbought   ?? 70,
    rsiOversold:     strategyIn.rsiOversold     ?? 30,
    volumeThreshold: strategyIn.volumeThreshold ?? 1.5,
    timeframe:       strategyIn.timeframe       ?? base?.trading?.timeframe ?? '5m'
  };

  const exchangeIn = base.exchangeSettings || {};
  const exchangeSettings = {
    name:    base?.trading?.activeExchange || exchangeIn.name || 'binance',
    testnet: exchangeIn.testnet ?? base?.binance?.testnet ?? true
  };

  const tradingPairs = base.tradingPairs
    || base?.trading?.symbols
    || ['BTCUSDT', 'ETHUSDT'];

  return {
    ...base,
    ...overrides,
    riskSettings,
    strategySettings,
    exchangeSettings,
    tradingPairs,
    apiKeys: apiKeys || null
  };
}

async function writeTradesCsv(filePath, tradesOverride = null) {
  const trades = tradesOverride ?? (botInstance?.getTradeHistory
    ? await botInstance.getTradeHistory(1000)
    : []);

  const header = 'Timestamp,Pair,Side,Entry,Exit,Quantity,PnL,PnL%\n';
  const rows = trades.map((t) => {
    const ts     = t.timestamp ?? '';
    const pair   = t.pair ?? t.symbol ?? '';
    const side   = t.side ?? '';
    const entry  = t.entryPrice ?? t.price ?? '';
    const exit   = t.exitPrice ?? '';
    const qty    = t.quantity ?? t.size ?? '';
    const pnl    = t.pnl ?? t.profit_loss ?? 0;
    const pnlPct = t.pnlPercent ?? t.pnl_percent ?? 0;
    return `${ts},${pair},${side},${entry},${exit},${qty},${pnl},${pnlPct}`;
  }).join('\n');

  fs.writeFileSync(filePath, header + rows, 'utf8');
  return { success: true, path: filePath, count: trades.length };
}

/** Send an IPC event to renderer if the window is still alive. */
function emit(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

/* ═══════════════════════════════════════════════════════════════
   WINDOW
   ═══════════════════════════════════════════════════════════════ */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      sandbox: false
    },
    icon: path.join(__dirname, '../../resources/icon.png'),
    title: 'Privacy Trading Bot — Local Control',
    show: false,
    backgroundColor: '#0a0e17'
  });

  createMenu();

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../public/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    emit('app-ready', {
      version: app.getVersion(),
      platform: process.platform,
      hasApiKeys: fs.existsSync(keysFile),
      encryptionAvailable: !!encryptor
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (botInstance?.isRunning) {
      try { botInstance.stop(); } catch {}
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

/* ═══════════════════════════════════════════════════════════════
   MENU
   ═══════════════════════════════════════════════════════════════ */

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => emit('navigate-to', 'settings')
        },
        { type: 'separator' },
        {
          label: 'Export Trades…',
          click: async () => {
            const result = await dialog.showSaveDialog(mainWindow, {
              defaultPath: 'trading-history.csv',
              filters: [{ name: 'CSV', extensions: ['csv'] }]
            });
            if (!result.canceled && result.filePath) {
              await writeTradesCsv(result.filePath).catch((e) =>
                dialog.showErrorBox('Export failed', e.message)
              );
            }
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Trading',
      submenu: [
        { label: 'Start Bot',       accelerator: 'CmdOrCtrl+S',
          click: () => emit('toggle-bot', true) },
        { label: 'Stop Bot',        accelerator: 'CmdOrCtrl+T',
          click: () => emit('toggle-bot', false) },
        { type: 'separator' },
        { label: 'Emergency Stop',  accelerator: 'CmdOrCtrl+E',
          click: () => { emit('emergency-stop'); } }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Privacy Trading Bot',
          click: () => dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'About',
            message: 'Privacy Trading Bot',
            detail:
              `Version: ${app.getVersion()}\n` +
              `A self-hosted trading bot with full local control.\n\n` +
              `No cloud dependencies • Encrypted API storage • Open source`
          })
        },
        {
          label: 'Documentation',
          click: () => shell.openExternal('https://github.com/your-repo/privacy-trading-bot#readme')
        }
      ]
    }
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ═══════════════════════════════════════════════════════════════
   IPC — ENCRYPTION SESSION
   ═══════════════════════════════════════════════════════════════ */

ipcMain.handle('encryption:set-password', async (_e, password) => {
  if (!encryptor) return { success: false, error: 'Encryption not available' };
  if (!password || password.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters' };
  }

  const existing = readJsonSafe(keysFile);
  if (existing) {
    try {
      if (existing.encryptedApiKey) {
        encryptor.decryptApiKeys(existing, password);
      } else if (existing.exchanges) {
        const first = Object.values(existing.exchanges)[0];
        if (first) encryptor.decryptApiKeys(first, password);
      }
    } catch {
      return { success: false, error: 'Incorrect password' };
    }
  }

  encryptionPassword = password;
  return { success: true };
});

ipcMain.handle('encryption:lock', async () => {
  encryptionPassword = null;
  return { success: true };
});

ipcMain.handle('encryption:is-unlocked', async () => ({
  unlocked: encryptionPassword !== null
}));

ipcMain.handle('encryption:test-password', async (_e, password) => {
  if (!encryptor) return { success: false, error: 'Encryption not available' };
  const existing = readJsonSafe(keysFile);
  if (!existing) return { success: true };

  try {
    if (existing.encryptedApiKey) {
      encryptor.decryptApiKeys(existing, password);
    } else if (existing.exchanges) {
      const first = Object.values(existing.exchanges)[0];
      if (first) encryptor.decryptApiKeys(first, password);
    }
    return { success: true };
  } catch {
    return { success: false, error: 'Incorrect password' };
  }
});

ipcMain.handle('encryption:generate-password', async (_e, length) => {
  if (!encryptor) return { success: false, error: 'Encryption not available' };
  return { success: true, password: encryptor.generateSecurePassword(length || 32) };
});

/* ═══════════════════════════════════════════════════════════════
   IPC — API KEYS (multi-exchange aware)
   ═══════════════════════════════════════════════════════════════ */

ipcMain.handle('save-api-keys', async (_e, payload) => {
  try {
    if (!encryptor) {
      console.warn('[main] Saving API keys WITHOUT encryption');
      writeJsonSafe(keysFile, payload);
      return { success: true, encrypted: false };
    }

    if (!encryptionPassword) {
      return { success: false, error: 'Encryption locked — set a password first' };
    }

    const existing = readJsonSafe(keysFile) || {};
    const exchanges = existing.exchanges || {};

    const incoming = {};

    if (payload?.exchange && payload.apiKey) {
      incoming[payload.exchange] = {
        apiKey:    payload.apiKey,
        apiSecret: payload.apiSecret
      };
    } else if (payload?.apiKey && payload?.apiSecret && !payload.binance && !payload.bybit) {
      incoming.binance = {
        apiKey:    payload.apiKey,
        apiSecret: payload.apiSecret
      };
    } else {
      for (const [ex, creds] of Object.entries(payload || {})) {
        if (creds?.apiKey && creds?.apiSecret) {
          incoming[ex] = { apiKey: creds.apiKey, apiSecret: creds.apiSecret };
        }
      }
    }

    for (const [ex, creds] of Object.entries(incoming)) {
      exchanges[ex] = encryptor.encryptApiKeys(
        creds.apiKey,
        creds.apiSecret,
        encryptionPassword
      );
    }

    writeJsonSafe(keysFile, { version: 1, exchanges });
    return {
      success: true,
      encrypted: true,
      exchanges: Object.keys(exchanges)
    };
  } catch (err) {
    console.error('[main] save-api-keys failed:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('load-api-keys', async () => {
  try {
    const stored = readJsonSafe(keysFile);
    if (!stored) return null;

    if (stored.apiKey && stored.apiSecret) return stored;

    if (stored.encryptedApiKey) {
      if (!encryptor || !encryptionPassword) {
        return { ...stored, locked: true };
      }
      const { apiKey, apiSecret } = encryptor.decryptApiKeys(stored, encryptionPassword);
      return { binance: { apiKey, apiSecret }, apiKey, apiSecret, encrypted: true };
    }

    if (!encryptor) return stored;
    if (!encryptionPassword) {
      return { locked: true, exchanges: Object.keys(stored.exchanges || {}) };
    }

    const out = {};
    for (const [ex, cipher] of Object.entries(stored.exchanges || {})) {
      try {
        out[ex] = encryptor.decryptApiKeys(cipher, encryptionPassword);
      } catch {
        out[ex] = { error: 'decrypt failed' };
      }
    }
    return out;
  } catch (err) {
    console.error('[main] load-api-keys failed:', err);
    return { error: err.message, locked: !encryptionPassword };
  }
});

/* ═══════════════════════════════════════════════════════════════
   IPC — CONFIG / SETTINGS
   ═══════════════════════════════════════════════════════════════ */

const DEFAULT_CONFIG = {
  tradingPairs: ['BTCUSDT', 'ETHUSDT'],
  riskSettings: {
    positionSizePercent: 2,
    stopLossPercent: 3,
    takeProfitPercent: 5,
    maxDailyLoss: 10,
    maxPositions: 5
  },
  strategySettings: {
    emaFast: 9,
    emaSlow: 21,
    rsiPeriod: 14,
    rsiOverbought: 70,
    rsiOversold: 30,
    volumeThreshold: 1.5,
    timeframe: '5m'
  },
  exchangeSettings: {
    name: 'binance',
    testnet: true
  }
};

/* ═══════════════════════════════════════════════════════════════
   ✅ CHART DATA — standalone REST fetcher
   Works even when the bot is not running.
   ═══════════════════════════════════════════════════════════════ */

const chartDataCache = new Map();      // key: `${exchange}:${symbol}:${timeframe}`
const CHART_CACHE_TTL_MS = 20_000;     // 20s

async function fetchChartData(symbol, timeframe = '5m', limit = 100) {
  const config = readJsonSafe(configFile) || DEFAULT_CONFIG;
  const exchangeName = config.exchangeSettings?.name
    || config.trading?.activeExchange
    || 'binance';
  const testnet = config.exchangeSettings?.testnet ?? true;

  const cacheKey = `${exchangeName}:${symbol}:${timeframe}`;
  const cached = chartDataCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.fetchedAt < CHART_CACHE_TTL_MS) {
    return cached.data;
  }

  let ExchangeClass;
  try {
    ExchangeClass = exchangeName === 'bybit'
      ? require('../core/exchanges/BybitClient')
      : require('../core/exchanges/BinanceClient');
  } catch (err) {
    throw new Error(`${exchangeName} client not found: ${err.message}`);
  }

  const client = new ExchangeClass({ testnet });

  try {
    const candles = await client.getKlines(symbol, timeframe, limit);

    if (!Array.isArray(candles) || candles.length === 0) {
      return [];
    }

    const data = candles.map((c) => ({
      timestamp: Number(c.openTime || c.closeTime || Date.now()),
      open:      Number(c.open),
      high:      Number(c.high),
      low:       Number(c.low),
      close:     Number(c.close),
      volume:    Number(c.volume),
      closeTime: Number(c.closeTime || 0)
    }));

    chartDataCache.set(cacheKey, { data, fetchedAt: now });
    return data;
  } finally {
    if (typeof client.shutdown === 'function') {
      try { await client.shutdown(); } catch {}
    }
  }
}

ipcMain.handle('save-config', async (_e, config) => {
  try {
    writeJsonSafe(configFile, config);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('load-config', async () =>
  readJsonSafe(configFile) || DEFAULT_CONFIG
);

ipcMain.handle('get-settings', async () =>
  readJsonSafe(configFile) || null
);

ipcMain.handle('save-settings', async (_e, settings) => {
  try {
    writeJsonSafe(configFile, settings);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

/* ═══════════════════════════════════════════════════════════════
   IPC — BOT CONTROL
   ═══════════════════════════════════════════════════════════════ */

ipcMain.handle('start-bot', async (_e, overrides = {}) => {
  try {
    if (botInstance?.isRunning) {
      return { success: false, error: 'Bot is already running' };
    }

    const config = buildBotConfig(overrides);

    if (!config.apiKeys?.apiKey) {
      console.warn('[main] Starting bot without API keys — PAPER mode only');
    }

    const TradingBot = loadTradingBot();
    botInstance = new TradingBot(config);

    botInstance.on('trade',          (d) => emit('bot-trade', d));
    botInstance.on('error',          (e) => emit('bot-error', e?.message || String(e)));
    botInstance.on('status',         (s) => emit('bot-status', s));
    botInstance.on('balance-update', (b) => emit('balance-update', b));
    botInstance.on('price-update',   (p) => emit('trading-update', { type: 'PRICE_UPDATE', ...p }));

    await botInstance.start();

    return {
      success: true,
      mode: config.apiKeys?.apiKey ? 'live' : 'paper',
      pairs: config.tradingPairs
    };
  } catch (err) {
    console.error('[main] start-bot failed:', err);
    botInstance = null;
    return { success: false, error: err.message };
  }
});

ipcMain.handle('stop-bot', async () => {
  try {
    if (!botInstance?.isRunning) {
      return { success: false, error: 'Bot is not running' };
    }
    await botInstance.stop();
    return { success: true };
  } catch (err) {
    console.error('[main] stop-bot failed:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('pause-bot', async () => {
  if (!botInstance?.isRunning) {
    return { success: false, error: 'Bot is not running' };
  }
  botInstance.paused = true;
  emit('bot-status', { message: 'Bot paused', type: 'warning' });
  return { success: true };
});

ipcMain.handle('resume-bot', async () => {
  if (!botInstance?.isRunning) {
    return { success: false, error: 'Bot is not running' };
  }
  botInstance.paused = false;
  emit('bot-status', { message: 'Bot resumed', type: 'info' });
  return { success: true };
});

ipcMain.handle('emergency-stop', async () => {
  if (!botInstance) return { success: false, error: 'No bot instance' };
  try {
    if (typeof botInstance.emergencyStop === 'function') {
      await botInstance.emergencyStop();
    } else {
      await botInstance.stop();
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-bot-status', async () => {
  if (!botInstance) {
    return {
      isRunning: false,
      status: 'stopped',
      positions: [],
      stats: {},
      pairs: []
    };
  }
  return {
    isRunning: !!botInstance.isRunning,
    paused: !!botInstance.paused,
    status: botInstance.isRunning ? 'running' : 'stopped',
    positions: botInstance.getPositions ? botInstance.getPositions() : [],
    stats: botInstance.getStats ? botInstance.getStats() : {},
    pairs: botInstance.pairs || []
  };
});

/* ═══════════════════════════════════════════════════════════════
   IPC — TRADES / PORTFOLIO / PERFORMANCE
   ═══════════════════════════════════════════════════════════════ */

ipcMain.handle('get-trade-history', async (_e, limit = 100) => {
  try {
    if (!botInstance?.getTradeHistory) return [];
    return await botInstance.getTradeHistory(limit);
  } catch (err) {
    console.error('[main] get-trade-history failed:', err);
    return [];
  }
});

ipcMain.handle('get-trades', async (_e, limit = 1000) => {
  try {
    if (!botInstance?.getTradeHistory) return [];
    return await botInstance.getTradeHistory(limit);
  } catch {
    return [];
  }
});

ipcMain.handle('get-recent-trades', async (_e, limit = 10) => {
  try {
    if (!botInstance?.getTradeHistory) return [];
    return await botInstance.getTradeHistory(limit);
  } catch {
    return [];
  }
});

ipcMain.handle('get-open-positions', async () => {
  try {
    if (!botInstance?.getPositions) return [];
    return botInstance.getPositions();
  } catch {
    return [];
  }
});

ipcMain.handle('get-portfolio', async () => {
  const EMPTY = {
    totalBalance: 0,
    totalPnL: 0,
    totalPnLPercent: 0,
    assets: [],
    positions: []
  };
  try {
    if (!botInstance?.getPortfolio) return EMPTY;
    return await botInstance.getPortfolio();
  } catch (err) {
    console.error('[main] get-portfolio failed:', err);
    return EMPTY;
  }
});

ipcMain.handle('get-performance-stats', async () => {
  const EMPTY = { dailyPnL: 0, totalPnL: 0, winRate: 0, totalTrades: 0 };
  try {
    if (!botInstance?.getStats) return EMPTY;
    const s = botInstance.getStats();
    return {
      dailyPnL: -(s.currentDailyLoss || 0),
      totalPnL: s.totalPnL || 0,
      winRate: s.winRate || 0,
      totalTrades: s.totalTrades || 0,
      roi: s.roi || 0,
      runTime: s.runTime || 0
    };
  } catch {
    return EMPTY;
  }
});

ipcMain.handle('export-trades', async (_e, arg) => {
  try {
    if (Array.isArray(arg)) {
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: 'trading-history.csv',
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      });
      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }
      return writeTradesCsv(result.filePath, arg);
    }

    if (typeof arg === 'string') {
      return writeTradesCsv(arg);
    }

    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: 'trading-history.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });
    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }
    return writeTradesCsv(result.filePath);
  } catch (err) {
    console.error('[main] export-trades failed:', err);
    return { success: false, error: err.message };
  }
});

/* ═══════════════════════════════════════════════════════════════
   IPC — MARKET DATA
   ═══════════════════════════════════════════════════════════════ */

ipcMain.handle('get-price-data', async (_e, symbol, timeframe, limit = 100) => {
  try {
    // 1. Prefer bot's live marketData (has WS-updated recent candles)
    if (botInstance?.marketData?.getHistoricalData) {
      const historical = botInstance.marketData.getHistoricalData(symbol, limit);
      if (historical?.length) {
        return historical.map((c) => ({
          timestamp: Number(c.openTime || c.closeTime),
          open:      Number(c.open),
          high:      Number(c.high),
          low:       Number(c.low),
          close:     Number(c.close),
          volume:    Number(c.volume)
        }));
      }
    }

    // 2. Bot off / no data → fetch fresh from exchange REST
    return await fetchChartData(symbol, timeframe, limit);
  } catch (err) {
    console.error('[main] get-price-data failed:', err.message);
    return [];
  }
});

ipcMain.handle('get-current-prices', async (_e, symbols) => {
  try {
    if (!botInstance?.getCurrentPrices) return {};
    const all = botInstance.getCurrentPrices();
    if (!symbols || !Array.isArray(symbols)) return all;

    const out = {};
    for (const s of symbols) {
      if (all[s]) out[s] = all[s];
    }
    return out;
  } catch {
    return {};
  }
});

/* ═══════════════════════════════════════════════════════════════
   IPC — MANUAL ORDERS
   ═══════════════════════════════════════════════════════════════ */

ipcMain.handle('place-buy-order', async (_e, order) => {
  try {
    if (!botInstance) return { success: false, error: 'Bot not running' };
    if (typeof botInstance.executeBuyOrder !== 'function') {
      return { success: false, error: 'Manual orders not supported' };
    }
    const signal = {
      action: 'BUY',
      price: order.price || botInstance.marketData?.getCurrentPrice(order.symbol)?.price,
      confidence: 100,
      reason: 'Manual'
    };
    await botInstance.executeBuyOrder(order.symbol, signal);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('place-sell-order', async (_e, order) => {
  try {
    if (!botInstance) return { success: false, error: 'Bot not running' };
    if (typeof botInstance.executeSellOrder !== 'function') {
      return { success: false, error: 'Manual orders not supported' };
    }
    const signal = {
      action: 'SELL',
      price: order.price || botInstance.marketData?.getCurrentPrice(order.symbol)?.price,
      confidence: 100,
      reason: 'Manual'
    };
    await botInstance.executeSellOrder(order.symbol, signal);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('close-position', async (_e, symbol) => {
  try {
    if (!botInstance?.forceClosePosition) {
      return { success: false, error: 'Not supported' };
    }
    await botInstance.forceClosePosition(symbol);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

/* ═══════════════════════════════════════════════════════════════
   IPC — BACKTESTING
   ═══════════════════════════════════════════════════════════════ */

ipcMain.handle('run-backtest', async (_e, config) => {
  console.log('[main] run-backtest called with', config);
  return {
    totalReturn: 0,
    totalTrades: 0,
    winRate: 0,
    sharpeRatio: 0,
    maxDrawdown: 0,
    avgWin: 0,
    avgLoss: 0,
    profitFactor: 0,
    equityCurve: [],
    trades: []
  };
});

ipcMain.handle('stop-backtest', async () => ({ success: true }));

/* ═══════════════════════════════════════════════════════════════
   IPC — EXCHANGE TEST
   ═══════════════════════════════════════════════════════════════ */

ipcMain.handle('test-exchange-connection', async (_e, exchange, config = {}) => {
  try {
    const name = String(exchange || config.name || 'binance').toLowerCase();
    const Module = (() => {
      try {
        if (name === 'bybit') return require('../core/exchanges/BybitClient');
        return require('../core/exchanges/BinanceClient');
      } catch (e) {
        throw new Error(`${name} client not found: ${e.message}`);
      }
    })();

    const client = new Module({
      testnet:   config.testnet   ?? true,
      apiKey:    config.apiKey    ?? null,
      apiSecret: config.apiSecret ?? null
    });

    if (typeof client.testConnection === 'function') {
      const result = await client.testConnection();
      if (client.shutdown) try { await client.shutdown(); } catch {}
      return result;
    }

    if (typeof client.getTickerPrice === 'function') {
      const t = await client.getTickerPrice('BTCUSDT');
      if (client.shutdown) try { await client.shutdown(); } catch {}
      return { success: true, price: Number(t?.price || 0) };
    }

    if (client.shutdown) try { await client.shutdown(); } catch {}
    return { success: false, error: 'Client has no test method' };
  } catch (err) {
    console.error('[main] test-exchange-connection failed:', err);
    return { success: false, error: err.message };
  }
});

/* ═══════════════════════════════════════════════════════════════
   IPC — DIALOGS
   ═══════════════════════════════════════════════════════════════ */

ipcMain.handle('show-error-dialog', async (_e, title, message) => {
  dialog.showErrorBox(String(title || 'Error'), String(message || ''));
  return { success: true };
});

ipcMain.handle('show-info-dialog', async (_e, title, message) => {
  const r = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: String(title || 'Info'),
    message: String(message || ''),
    buttons: ['OK']
  });
  return r.response === 0;
});

/* ═══════════════════════════════════════════════════════════════
   APP LIFECYCLE
   ═══════════════════════════════════════════════════════════════ */

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', () => {
  encryptionPassword = null;
  if (botInstance?.isRunning) {
    try { botInstance.stop(); } catch {}
  }
});

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
});

app.on('certificate-error', (event, _wc, _url, _error, _cert, callback) => {
  if (isDev) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});