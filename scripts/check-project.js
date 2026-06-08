'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const requiredFiles = [
  'package.json',
  'src/shared/categories.js',
  'src/shared/dates.js',
  'src/main/store.js',
  'src/main/aiClient.js',
  'src/main/reminder.js',
  'src/main/main.js',
  'src/main/preload.js',
  'src/renderer/index.html',
  'src/renderer/styles.css',
  'src/renderer/app.js',
  'src/assets/icons/app.svg',
  'src/assets/icons/app.png',
  'src/assets/icons/app-16.png',
  'src/assets/icons/app-32.png',
  'src/assets/icons/app-48.png',
  'src/assets/icons/app-64.png',
  'src/assets/icons/app-128.png',
  'src/assets/icons/app-256.png',
  'src/assets/icons/app.ico',
  'README.md',
  'docs/usage.md'
];

for (const relative of requiredFiles) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) {
    throw new Error(`missing required file: ${relative}`);
  }
}

const mainText = fs.readFileSync(path.join(root, 'src/main/main.js'), 'utf-8');
for (const channel of ['notes:list', 'notes:add', 'notes:update', 'notes:delete', 'settings:get', 'settings:save', 'ai:organize', 'clipboard:write']) {
  if (!mainText.includes(channel)) {
    throw new Error(`missing IPC channel: ${channel}`);
  }
}

for (const snippet of [
  "APP_ICON_PATH = path.join(__dirname, '../assets/icons/app.png')",
  "TRAY_ICON_PATH = path.join(__dirname, '../assets/icons/app-16.png')",
  'icon: APP_ICON_PATH',
  'nativeImage.createFromPath(TRAY_ICON_PATH)'
]) {
  if (!mainText.includes(snippet)) {
    throw new Error(`missing icon wiring: ${snippet}`);
  }
}

const packageConfig = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
if (packageConfig.build?.win?.icon !== 'src/assets/icons/app.ico') {
  throw new Error('missing Windows build icon: src/assets/icons/app.ico');
}

const preloadText = fs.readFileSync(path.join(root, 'src/main/preload.js'), 'utf-8');
for (const apiName of ['listNotes', 'addNote', 'updateNote', 'deleteNote', 'getSettings', 'saveSettings', 'organize', 'writeClipboard', 'onRouteSet']) {
  if (!preloadText.includes(apiName)) {
    throw new Error(`missing preload api: ${apiName}`);
  }
}

const htmlText = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf-8');
for (const elementId of ['noteForm', 'notesList', 'organizeButton', 'copyButton', 'settingsForm']) {
  if (!htmlText.includes(elementId)) {
    throw new Error(`missing element id: ${elementId}`);
  }
}

console.log('project check passed');
