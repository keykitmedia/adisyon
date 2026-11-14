const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ck', {
  mod: m => ipcRenderer.send('mod', m),
  sec: k => ipcRenderer.send('sec', k),
  yenile: () => ipcRenderer.send('yenile'),
  dinle: f => ipcRenderer.on('durum', (_e, d) => f(d))
});
