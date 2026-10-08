const { Menu } = require('electron');

function createMenu(mainWindow) {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Strategy',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('menu-action', 'new-strategy');
          }
        },
        {
          label: 'Export Trades',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            mainWindow.webContents.send('menu-action', 'export-trades');
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Trading',
      submenu: [
        {
          label: 'Start Bot',
          accelerator: 'F5',
          click: () => {
            mainWindow.webContents.send('menu-action', 'start-bot');
          }
        },
        {
          label: 'Stop Bot',
          accelerator: 'F6',
          click: () => {
            mainWindow.webContents.send('menu-action', 'stop-bot');
          }
        },
        { type: 'separator' },
        {
          label: 'Emergency Stop All',
          accelerator: 'F12',
          click: () => {
            mainWindow.webContents.send('menu-action', 'emergency-stop');
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Dashboard',
          accelerator: 'CmdOrCtrl+1',
          click: () => {
            mainWindow.webContents.send('menu-action', 'show-dashboard');
          }
        },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+2',
          click: () => {
            mainWindow.webContents.send('menu-action', 'show-settings');
          }
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          click: () => {
            mainWindow.webContents.toggleDevTools();
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            mainWindow.webContents.send('menu-action', 'show-about');
          }
        }
      ]
    }
  ];

  return Menu.buildFromTemplate(template);
}

module.exports = { createMenu };
