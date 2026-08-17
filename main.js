'use strict';

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { fileURLToPath } = require('url');

let archiveService = null;
app.setName('虚拟自习室');
app.commandLine.appendSwitch('proxy-bypass-list', '<local>;127.*;10.*;100.*;192.168.*;172.16.*;172.17.*;172.18.*;172.19.*;172.2*;172.30.*;172.31.*');

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
  const localIndex = path.resolve(__dirname, 'index.html');
  const archiveOrigin = archiveService ? `http://127.0.0.1:${archiveService.address.port}` : '';
  const trustedUrl = value => {
    try {
      const parsed = new URL(value);
      if (archiveOrigin) return parsed.origin === archiveOrigin;
      return parsed.protocol === 'file:' && path.resolve(fileURLToPath(parsed)) === localIndex;
    } catch (error) { return false; }
  };
  win.webContents.on('will-navigate', (event, url) => {
    if (trustedUrl(url)) return;
    event.preventDefault();
    try {
      const protocol = new URL(url).protocol;
      if (protocol === 'http:' || protocol === 'https:') shell.openExternal(url);
    } catch (error) { /* reject malformed navigation */ }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const protocol = new URL(url).protocol;
      if (protocol === 'http:' || protocol === 'https:') shell.openExternal(url);
    } catch (error) { /* reject malformed external URL */ }
    return { action: 'deny' };
  });
  win.webContents.session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details?.requestingUrl || webContents.getURL();
    callback(trustedUrl(requestingUrl) && (permission === 'notifications' || permission === 'fullscreen'));
  });
  if (archiveService) await win.loadURL(`${archiveOrigin}/index.html`);
  else await win.loadFile(localIndex, { query: { electron: '1' } });
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
