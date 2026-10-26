// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('secureOpenAI', {
    chat: payload => ipcRenderer.invoke('openai:chat', payload),
    isConfigured: () => ipcRenderer.invoke('openai:is-configured'),
});
