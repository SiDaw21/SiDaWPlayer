const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 940,
    minHeight: 620,
    title: 'SiDaW Player',
    frame: false,
    backgroundColor: '#0a0c11',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.on('window:minimize', () => win?.minimize());
ipcMain.on('window:maximize', () => win?.isMaximized() ? win.unmaximize() : win.maximize());
ipcMain.on('window:close', () => win?.close());
ipcMain.on('window:set-mini', (_, enabled) => {
  if (!win) return;
  if (enabled) win.setBounds({ x: win.getBounds().x + 700, y: win.getBounds().y + 400, width: 410, height: 110 }, true);
  else win.setBounds({ width: 1360, height: 860 }, true);
});
