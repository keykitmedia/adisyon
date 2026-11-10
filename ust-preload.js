const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ck', { mod: m => ipcRenderer.send('mod', m), yenile: () => ipcRenderer.send('yenile'), dinle: f => ipcRenderer.on('mod', (_e, m) => f(m)) });
