'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const readText = (relative) => fs.readFileSync(path.join(root, relative), 'utf-8');
const expectedSplitSettingsPaths = ['sync-data/settings/organizer.json', 'local-data/secrets.json'];

function assertIncludes(text, snippet, label) {
  if (!text.includes(snippet)) {
    throw new Error(`missing ${label} snippet: ${snippet}`);
  }
}

function assertRequiredSnippets(label, text, requiredSnippets) {
  for (const snippet of requiredSnippets) {
    assertIncludes(text, snippet, label);
  }
}

function parseLeadingProjectTags(content) {
  const tags = [];
  for (const token of content.trim().split(/\s+/)) {
    if (!token.startsWith('#') || token.length === 1) {
      break;
    }
    const tag = token.slice(1).trim();
    if (tag && !tags.includes(tag)) {
      tags.push(tag);
    }
  }
  return { project: tags[0] || '', tags };
}

function runParserChecks() {
  const cases = [
    ['#移动端 调整筛选', { project: '移动端', tags: ['移动端'] }],
    ['#移动端 #后台 联调接口', { project: '移动端', tags: ['移动端', '后台'] }],
    ['没有项目标签', { project: '', tags: [] }],
    ['#移动端 #移动端 去重', { project: '移动端', tags: ['移动端'] }]
  ];
  for (const [content, expected] of cases) {
    const actual = parseLeadingProjectTags(content);
    if (actual.project !== expected.project || JSON.stringify(actual.tags) !== JSON.stringify(expected.tags)) {
      throw new Error(`parser case failed: ${content}`);
    }
  }
}

function runJsonCompatibilityChecks(storeText) {
  for (const expectedPath of expectedSplitSettingsPaths) {
    assertIncludes(storeText, path.basename(expectedPath), 'store split settings path');
  }
  assertRequiredSnippets('store json compatibility', storeText, [
    'sync-data',
    'local-data',
    'organizer.json',
    'interaction.json',
    'local-data',
    'secrets_file',
    'default_daily_template',
    'default_project_rules',
    'default_startup_page',
    'default_enter_behavior',
    'default_reminder_strategy',
    'write_json_file',
    'temp_json_path',
    'sanitize_settings'
  ]);
}

function forbiddenRendererText(text, forbidden, label) {
  for (const word of forbidden) {
    if (text.includes(word)) {
      throw new Error(`${label} should not contain forbidden UI text: ${word}`);
    }
  }
}
const requiredFiles = [
  'package.json',
  '.github/workflows/build-windows.yml',
  'scripts/set-version.js',
  'src-tauri/Cargo.toml',
  'src-tauri/Cargo.lock',
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

if (fs.existsSync(path.join(root, 'src', 'main'))) {
  throw new Error('electron main directory should be removed');
}

const packageJson = JSON.parse(readText('package.json'));
for (const scriptName of ['check', 'tauri:dev', 'tauri:build', 'version:set']) {
  if (!packageJson.scripts || !packageJson.scripts[scriptName]) {
    throw new Error(`missing package script: ${scriptName}`);
  }
}
if ((packageJson.devDependencies || {}).electron || (packageJson.devDependencies || {})['electron-builder']) {
  throw new Error('electron dependencies should be removed after Tauri migration');
}

const packageLock = JSON.parse(readText('package-lock.json'));
const tauriConfig = JSON.parse(readText('src-tauri/tauri.conf.json'));
const cargoText = readText('src-tauri/Cargo.toml');
const cargoLockText = readText('src-tauri/Cargo.lock');
const cargoVersionMatch = cargoText.match(/^version\s*=\s*"([^"]+)"/m);
if (!cargoVersionMatch) {
  throw new Error('missing Cargo package version');
}
const cargoLockVersionMatch = cargoLockText.match(/\[\[package\]\]\s*name\s*=\s*"work-daily-note"\s*version\s*=\s*"([^"]+)"/m);
if (!cargoLockVersionMatch) {
  throw new Error('missing Cargo.lock package version');
}
for (const [name, value] of Object.entries({
  packageLock: packageLock.version,
  packageLockRoot: packageLock.packages && packageLock.packages[''] && packageLock.packages[''].version,
  tauriConfig: tauriConfig.version,
  cargo: cargoVersionMatch[1],
  cargoLock: cargoLockVersionMatch[1]
})) {
  if (value !== packageJson.version) {
    throw new Error(`version mismatch: ${name}=${value}, package=${packageJson.version}`);
  }
}

const versionScriptText = readText('scripts/set-version.js');
for (const snippet of ['package-lock.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'src-tauri/tauri.conf.json', 'Version updated to']) {
  if (!versionScriptText.includes(snippet)) {
    throw new Error(`missing version script snippet: ${snippet}`);
  }
}

const workflowText = readText('.github/workflows/build-windows.yml');
for (const snippet of ['push:', 'tags:', '- v*', 'workflow_dispatch:', 'runs-on: windows-2022', 'npm run tauri:build -- --verbose --ci', 'work-daily-note-windows-${{ github.ref_name }}']) {
  if (!workflowText.includes(snippet)) {
    throw new Error(`missing workflow snippet: ${snippet}`);
  }
}

const tauriConfigText = readText('src-tauri/tauri.conf.json');
for (const iconPath of ['../src/assets/icons/app.ico', '../src/assets/icons/app.png', '../src/assets/icons/app-256.png']) {
  if (!tauriConfigText.includes(iconPath)) {
    throw new Error(`missing Tauri icon config: ${iconPath}`);
  }
}

const mainText = readText('src-tauri/src/main.rs');
for (const commandName of ['list_notes', 'add_note', 'update_note', 'delete_note', 'get_settings', 'save_settings', 'organize_daily_notes_command', 'write_clipboard', 'hide_window', 'show_organizer']) {
  if (!mainText.includes(commandName)) {
    throw new Error(`missing Tauri command: ${commandName}`);
  }
}
if (!mainText.includes('include_bytes!("../../src/assets/icons/app-16.png")')) {
  throw new Error('missing Tauri tray icon wiring: app-16.png');
}

const rendererText = readText('src/renderer/app.js');
for (const commandName of ['list_notes', 'add_note', 'update_note', 'delete_note', 'get_settings', 'save_settings', 'get_daily_result', 'organize_daily_notes_command', 'write_clipboard', 'hide_window']) {
  if (!rendererText.includes(commandName)) {
    throw new Error(`renderer missing invoke command: ${commandName}`);
  }
}
if (rendererText.includes('window.dailyNote')) {
  throw new Error('renderer should not use Electron bridge API');
}

const htmlText = readText('src/renderer/index.html');
for (const elementId of ['noteForm', 'notesList', 'organizeButton', 'copyButton', 'settingsForm', 'reminderView', 'reminderNotesList', 'advancedSettingsToggle', 'dailyResultPanel', 'projectSummaryList']) {
  if (!htmlText.includes(elementId)) {
    throw new Error(`missing element id: ${elementId}`);
  }
}

const styleText = readText('src/renderer/styles.css');
const storeText = readText('src-tauri/src/store.rs');
const reminderText = readText('src-tauri/src/reminder.rs');
const readmeText = readText('README.md');
const usageText = readText('docs/usage.md');

assertRequiredSnippets('renderer redesign', htmlText + rendererText, [
  '日报文本',
  '复制文本',
  'result-tab',
  'dailyResultPanel',
  'projectSummaryList',
  'staleHint',
  'advancedSettingsToggle',
  'dailyTemplate',
  'projectRules',
  'reminderStrategy',
  'reminderView',
  'reminderLaterButton',
  'reminderStartButton',
  'sourceRevisionHash',
  'normalizeSettings',
  'renderReminderNotes'
]);
assertRequiredSnippets('style redesign', styleText, ['#0D9488', '#14B8A6', '#F97316', 'prefers-reduced-motion', 'result-tabs', 'advanced-settings', 'reminder-card']);
assertRequiredSnippets('reminder routing', reminderText, ['reminder_strategy', 'route:set', 'reminder', 'organize', '到时间确认今日事项了']);
runParserChecks();
runJsonCompatibilityChecks(storeText);
assertRequiredSnippets('workflow docs', readmeText + usageText, ['聊天式', '日报文本', '复制文本', '高级设置', '今日事项确认页', 'sync-data', 'local-data/secrets.json']);
forbiddenRendererText(htmlText + rendererText, ['禅道'], 'renderer');

console.log('project check passed');
