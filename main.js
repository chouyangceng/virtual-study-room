'use strict';

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

let archiveService = null;

function configuredDataRoot() {
  const argument = process.argv.find(value => String(value).startsWith('--vsr-data-root='));
  const value = String(argument ? argument.slice('--vsr-data-root='.length) : process.env.VSR_DATA_ROOT || '').trim();
  return value ? path.resolve(value) : null;
}

const dataRoot = process.platform === 'win32' ? configuredDataRoot() : null;
if (dataRoot) app.setPath('userData', path.join(dataRoot, '应用数据'));

async function startArchiveServiceIfNeeded() {
  if (process.platform !== 'win32') return null;
  const { startWindowsArchive } = require('./server/windows-archive');
  archiveService = await startWindowsArchive({
    staticRoot: __dirname,
    dataDirectory: dataRoot ? path.join(dataRoot, 'Windows归档') : undefined
  });
  return archiveService;
}

async function createWindow() {
  const isMac = process.platform === 'darwin';
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: isMac ? 375 : 900,
    minHeight: isMac ? 600 : 680,
    backgroundColor: '#2d2d3f',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  if (archiveService) {
    await win.loadURL(`http://127.0.0.1:${archiveService.address.port}/index.html`);
  } else {
    await win.loadFile(path.join(__dirname, 'index.html'), { query: { electron: '1' } });
  }
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });
}

const gotLock = app.requestSingleInstanceLock && app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
  app.whenReady().then(async () => {
    try {
      await startArchiveServiceIfNeeded();
      await createWindow();
    } catch (error) {
      console.error(error);
      app.quit();
    }
    app.on('activate', () => {
      if (!BrowserWindow.getAllWindows().length) createWindow();
    });
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('before-quit', () => {
    if (archiveService) archiveService.server.close();
  });
}
