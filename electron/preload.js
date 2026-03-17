const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vmShell', {
  getBootstrap() {
    return ipcRenderer.invoke('vm-shell:get-bootstrap');
  },
  onCommand(listener) {
    ipcRenderer.removeAllListeners('vm-shell:command');
    ipcRenderer.on('vm-shell:command', (_, payload) => listener(payload));
  },
  openBrowserWindow(url) {
    return ipcRenderer.invoke('vm-shell:open-browser-window', url);
  },
  openExtensionPage(page) {
    return ipcRenderer.invoke('vm-shell:open-extension-page', page);
  },
  openExternal(url) {
    return ipcRenderer.invoke('vm-shell:open-external', url);
  },
  updateTitle(title) {
    ipcRenderer.send('vm-shell:update-title', title);
  },
});
