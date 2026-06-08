'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dailyNote', {
  listNotes: (date) => ipcRenderer.invoke('notes:list', date),
  addNote: (note) => ipcRenderer.invoke('notes:add', note),
  updateNote: (id, patch) => ipcRenderer.invoke('notes:update', id, patch),
  deleteNote: (id) => ipcRenderer.invoke('notes:delete', id),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),
  organize: () => ipcRenderer.invoke('ai:organize'),
  writeClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),
  showOrganizer: () => ipcRenderer.invoke('window:showOrganizer'),
  onRouteSet: (callback) => {
    ipcRenderer.on('route:set', (_event, route) => callback(route));
  }
});
