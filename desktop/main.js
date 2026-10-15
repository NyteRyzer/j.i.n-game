'use strict';
// Electron shell for the desktop builds (Linux and macOS). It opens the same
// index.html the browser version uses; saves live in the app's own storage.
const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function createWindow() {
  const win = new BrowserWindow({
    width: 1366,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0b0e1c',
    title: 'Retroville Unleashed',
    icon: path.join(ROOT, 'build', 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(ROOT, 'index.html'));

  // Keep the game window on the game: external links open in the real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) e.preventDefault(); });
  return win;
}

// macOS expects an app menu (Cmd+Q, Cmd+H, fullscreen); Linux gets none.
Menu.setApplicationMenu(process.platform === 'darwin'
  ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { label: 'View', submenu: [{ role: 'togglefullscreen' }] }, { role: 'windowMenu' }])
  : null);

ipcMain.on('app:quit', () => app.quit());
ipcMain.on('app:fullscreen', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.setFullScreen(!win.isFullScreen());
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => app.quit());
