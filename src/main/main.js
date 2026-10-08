const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

const isDev = process.env.NODE_ENV === 'development';
let mainWindow;
let botInstance = null;

// App data directory for storing encrypted keys
const appDataDir = path.join(os.homedir(), '.privacy-trading-bot');
const keysFile = path.join(appDataDir, 'keys.enc');
const configFile = path.join(appDataDir, 'config.json');

// Ensure app data directory exists
if (!fs.existsSync(appDataDir)) {
  fs.mkdirSync(appDataDir, { recursive: true });
}

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
      enableRemoteModule: false
    },
    icon: path.join(__dirname, '../../resources/icon.png'),
    title: 'Privacy Trading Bot - Local Control',
    show: false,
    titleBarStyle: 'default',
    backgroundColor: '#1a1a1a'
  });

  // Create application menu
  createMenu();

  // Load app
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../public/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Send initial app state
    mainWindow.webContents.send('app-ready', {
      version: app.getVersion(),
      platform: process.platform,
      hasApiKeys: fs.existsSync(keysFile)
    });
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (botInstance) {
      botInstance.stop();
    }
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            mainWindow.webContents.send('navigate-to', 'settings');
          }
        },
        { type: 'separator' },
        {
          label: 'Export Trades',
          click: async () => {
            const result = await dialog.showSaveDialog(mainWindow, {
              defaultPath: 'trading-history.csv',
              filters: [{ name: 'CSV', extensions: ['csv'] }]
            });
            
            if (!result.canceled) {
              mainWindow.webContents.send('export-trades', result.filePath);
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
        {
          label: 'Start Bot',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow.webContents.send('toggle-bot', true);
          }
        },
        {
          label: 'Stop Bot',
          accelerator: 'CmdOrCtrl+T',
          click: () => {
            mainWindow.webContents.send('toggle-bot', false);
          }
        },
        { type: 'separator' },
        {
          label: 'Emergency Stop',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            mainWindow.webContents.send('emergency-stop');
          }
        }
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
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About',
              message: 'Privacy Trading Bot',
              detail: `Version: ${app.getVersion()}\nA self-hosted trading bot with full local control.\n\nNo cloud dependencies • Encrypted API storage • Open source`
            });
          }
        },
        {
          label: 'Documentation',
          click: () => {
            shell.openExternal('https://github.com/your-repo/privacy-trading-bot#readme');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC Handlers
ipcMain.handle('save-api-keys', async (event, encryptedData) => {
  try {
    fs.writeFileSync(keysFile, JSON.stringify(encryptedData), 'utf8');
    return { success: true };
  } catch (error) {
    console.error('Failed to save API keys:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-api-keys', async (event) => {
  try {
    if (!fs.existsSync(keysFile)) {
      return null;
    }
    const data = fs.readFileSync(keysFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to load API keys:', error);
    return null;
  }
});

ipcMain.handle('save-config', async (event, config) => {
  try {
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf8');
    return { success: true };
  } catch (error) {
    console.error('Failed to save config:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('load-config', async (event) => {
  try {
    if (!fs.existsSync(configFile)) {
      // Return default config
      return {
        tradingPairs: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
        riskSettings: {
          positionSizePercent: 2,
          stopLossPercent: 3,
          takeProfitPercent: 5,
          maxDailyLoss: 10
        },
        strategySettings: {
          emaFast: 9,
          emaSlow: 21,
          rsiPeriod: 14,
          rsiOverbought: 70,
          rsiOversold: 30,
          volumeThreshold: 1.5
        },
        exchangeSettings: {
          name: 'binance',
          testnet: true,
          enableStopLoss: true,
          enableTakeProfit: true
        }
      };
    }
    const data = fs.readFileSync(configFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to load config:', error);
    return null;
  }
});

ipcMain.handle('start-bot', async (event, config) => {
  try {
    if (botInstance && botInstance.isRunning) {
      return { success: false, error: 'Bot is already running' };
    }

    // Import TradingBot class
    const TradingBot = require('../core/TradingBot');
    botInstance = new TradingBot(config);

    // Setup bot event listeners
    botInstance.on('trade', (data) => {
      mainWindow.webContents.send('bot-trade', data);
    });

    botInstance.on('error', (error) => {
      mainWindow.webContents.send('bot-error', error.message);
    });

    botInstance.on('status', (status) => {
      mainWindow.webContents.send('bot-status', status);
    });

    botInstance.on('balance-update', (balances) => {
      mainWindow.webContents.send('balance-update', balances);
    });

    await botInstance.start();
    return { success: true };
  } catch (error) {
    console.error('Failed to start bot:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-bot', async (event) => {
  try {
    if (!botInstance || !botInstance.isRunning) {
      return { success: false, error: 'Bot is not running' };
    }

    await botInstance.stop();
    return { success: true };
  } catch (error) {
    console.error('Failed to stop bot:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-bot-status', async (event) => {
  if (!botInstance) {
    return { isRunning: false, positions: [], stats: {} };
  }

  return {
    isRunning: botInstance.isRunning,
    positions: Array.from(botInstance.positions.values()),
    stats: botInstance.getStats()
  };
});

ipcMain.handle('get-trade-history', async (event, limit = 100) => {
  try {
    if (!botInstance) {
      return [];
    }
    return await botInstance.getTradeHistory(limit);
  } catch (error) {
    console.error('Failed to get trade history:', error);
    return [];
  }
});

ipcMain.handle('export-trades', async (event, filePath) => {
  try {
    if (!botInstance) {
      throw new Error('Bot not initialized');
    }
    
    const trades = await botInstance.getTradeHistory(1000);
    const csv = trades.map(trade => 
      `${trade.timestamp},${trade.pair},${trade.side},${trade.price},${trade.quantity},${trade.pnl || 0}`
    ).join('\n');
    
    const header = 'Timestamp,Pair,Side,Price,Quantity,PnL\n';
    fs.writeFileSync(filePath, header + csv);
    
    return { success: true };
  } catch (error) {
    console.error('Failed to export trades:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('show-error-dialog', async (event, title, message) => {
  dialog.showErrorBox(title, message);
});

ipcMain.handle('show-info-dialog', async (event, title, message) => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    title,
    message,
    buttons: ['OK']
  });
  return result.response === 0;
});

// App event handlers
app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (botInstance && botInstance.isRunning) {
    botInstance.stop();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });
});

// Handle certificate errors
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (isDev) {
    // In development, ignore certificate errors
    event.preventDefault();
    callback(true);
  } else {
    // In production, use default behavior
    callback(false);
  }
});