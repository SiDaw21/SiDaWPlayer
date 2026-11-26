const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopControls', {
  available: true,
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  setMini: (enabled) => ipcRenderer.send('window:set-mini', !!enabled),
});
