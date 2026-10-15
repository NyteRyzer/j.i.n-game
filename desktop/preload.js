'use strict';
// The only things the game page can ask of the desktop shell.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApp', {
  isDesktop: true,
  quit: () => ipcRenderer.send('app:quit'),
  toggleFullscreen: () => ipcRenderer.send('app:fullscreen'),
});
