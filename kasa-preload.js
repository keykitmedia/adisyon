const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('kasaApp', { yazicilar: () => ipcRenderer.invoke('yazicilar'), yazdir: is => ipcRenderer.invoke('yazdir', is) });
