const path = require('path');
const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  session,
  shell,
} = require('electron');

const APP_SESSION_PARTITION = 'persist:violentmonkey';
const DEFAULT_URL = 'https://violentmonkey.github.io/';
const SHELL_TITLE = 'Violentmonkey for macOS';
const WINDOW_SIZE = {
  width: 1440,
  height: 920,
  minWidth: 980,
  minHeight: 720,
};

let extension = null;

function isShellWindow(win) {
  return !!win && !win.isDestroyed() && win.__vmShell === true;
}

function getProjectRoot() {
  return app.isPackaged ? process.resourcesPath : app.getAppPath();
}

function getExtensionPath() {
  return path.join(getProjectRoot(), 'dist');
}

function getRendererPath(file) {
  return path.join(app.getAppPath(), 'electron', 'renderer', file);
}

function getExtensionUrl(route) {
  if (!extension) return null;
  const cleanRoute = `${route || ''}`.replace(/^\/+/, '');
  return `chrome-extension://${extension.id}/${cleanRoute}`;
}

function normalizeUrl(input) {
  const value = `${input || ''}`.trim();
  if (!value) return DEFAULT_URL;
  if (value.startsWith('chrome-extension://') || value.startsWith('file://')) {
    return value;
  }
  try {
    return new URL(value).toString();
  } catch {
    if (/^[a-z][a-z\d+\-.]*:/i.test(value)) {
      return value;
    }
    try {
      return new URL(`https://${value}`).toString();
    } catch {
      return DEFAULT_URL;
    }
  }
}

async function loadViolentmonkeyExtension() {
  const extensionPath = getExtensionPath();
  const partitionSession = session.fromPartition(APP_SESSION_PARTITION);
  extension = await partitionSession.loadExtension(extensionPath, {
    allowFileAccess: true,
  });
  return extension;
}

function createShellWindow(initialUrl = DEFAULT_URL) {
  const win = new BrowserWindow({
    ...WINDOW_SIZE,
    title: SHELL_TITLE,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#10151c',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false,
      webviewTag: true,
    },
  });
  win.__vmShell = true;
  win.__vmInitialUrl = normalizeUrl(initialUrl);
  win.loadFile(getRendererPath('index.html'));
  return win;
}

function createExtensionWindow(route, windowOptions = {}) {
  const url = getExtensionUrl(route);
  if (!url) return null;
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#10151c',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      partition: APP_SESSION_PARTITION,
      sandbox: true,
    },
    ...windowOptions,
  });
  win.loadURL(url);
  return win;
}

function sendShellCommand(command, payload) {
  const win = BrowserWindow.getFocusedWindow();
  if (isShellWindow(win)) {
    win.webContents.send('vm-shell:command', { command, payload });
  }
}

function buildAppMenu() {
  const template = [{
    label: 'Violentmonkey',
    submenu: [
      {
        label: 'Dashboard',
        accelerator: 'CmdOrCtrl+1',
        click: () => createExtensionWindow('options/index.html#scripts'),
      },
      {
        label: 'Settings',
        accelerator: 'CmdOrCtrl+,',
        click: () => createExtensionWindow('options/index.html#settings'),
      },
      {
        label: 'Popup',
        accelerator: 'CmdOrCtrl+2',
        click: () => createExtensionWindow('popup/index.html', {
          width: 420,
          height: 680,
          minWidth: 360,
          minHeight: 520,
          resizable: false,
        }),
      },
      { type: 'separator' },
      {
        label: 'New Browser Window',
        accelerator: 'CmdOrCtrl+N',
        click: () => createShellWindow(),
      },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  }, {
    label: 'View',
    submenu: [
      {
        label: 'Back',
        accelerator: 'CmdOrCtrl+[',
        click: () => sendShellCommand('back'),
      },
      {
        label: 'Forward',
        accelerator: 'CmdOrCtrl+]',
        click: () => sendShellCommand('forward'),
      },
      {
        label: 'Reload Page',
        accelerator: 'CmdOrCtrl+R',
        click: () => sendShellCommand('reload'),
      },
      {
        label: 'Focus Address Bar',
        accelerator: 'CmdOrCtrl+L',
        click: () => sendShellCommand('focus-location'),
      },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      { role: 'toggleDevTools' },
    ],
  }, {
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      { type: 'separator' },
      { role: 'front' },
    ],
  }, {
    label: 'Help',
    submenu: [
      {
        label: 'Violentmonkey Website',
        click: () => shell.openExternal('https://violentmonkey.github.io/'),
      },
      {
        label: 'Greasy Fork',
        click: () => shell.openExternal('https://greasyfork.org/'),
      },
    ],
  }];
  return Menu.buildFromTemplate(template);
}

ipcMain.handle('vm-shell:get-bootstrap', event => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return {
    appName: SHELL_TITLE,
    appVersion: app.getVersion(),
    extensionId: extension?.id || null,
    initialUrl: normalizeUrl(win?.__vmInitialUrl),
  };
});

ipcMain.handle('vm-shell:open-browser-window', (_, url) => {
  createShellWindow(normalizeUrl(url));
});

ipcMain.handle('vm-shell:open-extension-page', (_, page) => {
  if (!extension) return false;
  if (page === 'popup') {
    createExtensionWindow('popup/index.html', {
      width: 420,
      height: 680,
      minWidth: 360,
      minHeight: 520,
      resizable: false,
    });
    return true;
  }
  if (page === 'settings') {
    createExtensionWindow('options/index.html#settings');
    return true;
  }
  createExtensionWindow('options/index.html#scripts');
  return true;
});

ipcMain.handle('vm-shell:open-external', (_, url) => shell.openExternal(url));

ipcMain.on('vm-shell:update-title', (event, pageTitle) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!isShellWindow(win)) return;
  const suffix = pageTitle ? `${pageTitle} - ${SHELL_TITLE}` : SHELL_TITLE;
  win.setTitle(suffix);
});

app.whenReady()
.then(async () => {
  try {
    await loadViolentmonkeyExtension();
  } catch (error) {
    dialog.showErrorBox('Unable to load Violentmonkey desktop shell', `${error}`);
    app.quit();
    return;
  }
  Menu.setApplicationMenu(buildAppMenu());
  createShellWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createShellWindow();
    }
  });
})
.catch(error => {
  dialog.showErrorBox('Unable to start Violentmonkey', `${error}`);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
