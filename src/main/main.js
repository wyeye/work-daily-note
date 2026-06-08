'use strict';

const path = require('path');
const { app, BrowserWindow, Menu, Tray, ipcMain, clipboard, nativeImage, Notification } = require('electron');
const { CATEGORIES } = require('../shared/categories');
const { toDateKey } = require('../shared/dates');
const { createStore } = require('./store');
const { organizeDailyNotes } = require('./aiClient');
const { ReminderScheduler } = require('./reminder');

const TRAY_ICON_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAPUlEQVR42mP8z8Dwn4ECwESJ5lEDRgYGBgYGJgYGBhYGJkYGBgYGBhYGBkaQBiYGBgYGBhRkgAAn58EBEoYdB9AAAAAASUVORK5CYII=';

let mainWindow = null;
let tray = null;
let store = null;
let scheduler = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 860,
    minHeight: 620,
    show: false,
    title: 'Work Daily Note',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  return mainWindow;
}

function showWindow(route = 'notes') {
  if (!mainWindow) {
    createMainWindow();
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('route:set', route);
}

function createTray() {
  const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL);
  tray = new Tray(icon);
  tray.setToolTip('Work Daily Note');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开便签', click: () => showWindow('notes') },
    { label: '整理今日事项', click: () => showWindow('organize') },
    { type: 'separator' },
    { label: '退出', click: () => { app.isQuitting = true; app.quit(); } }
  ]));
  tray.on('double-click', () => showWindow('notes'));
}

function showReminder() {
  showWindow('organize');
  if (Notification.isSupported()) {
    new Notification({
      title: 'Work Daily Note',
      body: '到时间整理今日事项了'
    }).show();
  }
}

function registerIpcHandlers() {
  ipcMain.handle('notes:list', (_event, date) => store.listNotes(date || toDateKey()));
  ipcMain.handle('notes:add', (_event, note) => store.addNote(note));
  ipcMain.handle('notes:update', (_event, id, patch) => store.updateNote(id, patch));
  ipcMain.handle('notes:delete', (_event, id) => store.deleteNote(id));
  ipcMain.handle('settings:get', () => ({ ...store.getSettings(), categories: CATEGORIES }));
  ipcMain.handle('settings:save', (_event, settings) => {
    const saved = store.saveSettings(settings);
    scheduler.restart();
    return { ...saved, categories: CATEGORIES };
  });
  ipcMain.handle('ai:organize', async () => {
    const notes = store.listNotes(toDateKey());
    const settings = store.getSettings();
    return organizeDailyNotes({ notes, settings });
  });
  ipcMain.handle('clipboard:write', (_event, text) => {
    clipboard.writeText(String(text || ''));
    return true;
  });
  ipcMain.handle('window:showOrganizer', () => {
    showWindow('organize');
    return true;
  });
}

app.whenReady().then(() => {
  store = createStore(app);
  createMainWindow();
  createTray();
  registerIpcHandlers();
  scheduler = new ReminderScheduler({
    getReminderTime: () => store.getSettings().reminderTime,
    onReminder: showReminder
  });
  scheduler.start();
  showWindow('notes');
});

app.on('window-all-closed', () => {
  // Keep the tray app running after the window is hidden or closed.
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (scheduler) {
    scheduler.stop();
  }
});
