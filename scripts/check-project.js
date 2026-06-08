'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const requiredFiles = [
  'package.json',
  'src-tauri/Cargo.toml',
  'src-tauri/tauri.conf.json',
  'src-tauri/capabilities/default.json',
  'src-tauri/icons/icon.png',
  'src-tauri/src/main.rs',
  'src-tauri/src/store.rs',
  'src-tauri/src/ai_client.rs',
  'src-tauri/src/reminder.rs',
  'src/renderer/index.html',
  'src/renderer/styles.css',
  'src/renderer/app.js',
  'README.md',
  'docs/usage.md'
];

for (const relative of requiredFiles) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) {
    throw new Error(`missing required file: ${relative}`);
  }
}

if (fs.existsSync(path.join(root, 'src', 'main'))) {
  throw new Error('electron main directory should be removed');
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
for (const scriptName of ['check', 'tauri:dev', 'tauri:build']) {
  if (!packageJson.scripts || !packageJson.scripts[scriptName]) {
    throw new Error(`missing package script: ${scriptName}`);
  }
}
if ((packageJson.devDependencies || {}).electron || (packageJson.devDependencies || {})['electron-builder']) {
  throw new Error('electron dependencies should be removed after Tauri migration');
}

const mainText = fs.readFileSync(path.join(root, 'src-tauri/src/main.rs'), 'utf-8');
for (const commandName of ['list_notes', 'add_note', 'update_note', 'delete_note', 'get_settings', 'save_settings', 'organize_daily_notes_command', 'write_clipboard', 'show_organizer']) {
  if (!mainText.includes(commandName)) {
    throw new Error(`missing Tauri command: ${commandName}`);
  }
}

const rendererText = fs.readFileSync(path.join(root, 'src/renderer/app.js'), 'utf-8');
for (const commandName of ['list_notes', 'add_note', 'update_note', 'delete_note', 'get_settings', 'save_settings', 'organize_daily_notes_command', 'write_clipboard']) {
  if (!rendererText.includes(commandName)) {
    throw new Error(`renderer missing invoke command: ${commandName}`);
  }
}
if (rendererText.includes('window.dailyNote')) {
  throw new Error('renderer should not use Electron bridge API');
}

const htmlText = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf-8');
for (const elementId of ['noteForm', 'notesList', 'organizeButton', 'copyButton', 'settingsForm']) {
  if (!htmlText.includes(elementId)) {
    throw new Error(`missing element id: ${elementId}`);
  }
}

console.log('project check passed');
