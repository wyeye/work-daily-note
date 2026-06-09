'use strict';

const tauri = window.__TAURI__;
const invoke = tauri.core.invoke;
const listen = tauri.event.listen;
const appApi = tauri.app;
const updater = tauri.updater;
const processApi = tauri.process;

const dailyNoteApi = {
  listNotes: (date) => invoke('list_notes', { date: date || null }),
  addNote: (note) => invoke('add_note', { note }),
  updateNote: (id, patch) => invoke('update_note', { id, patch }),
  deleteNote: (id) => invoke('delete_note', { id }),
  getSettings: () => invoke('get_settings'),
  saveSettings: (settings) => invoke('save_settings', { settings }),
  getDailyResult: (date) => invoke('get_daily_result', { date: date || null }),
  organize: () => invoke('organize_daily_notes_command'),
  writeClipboard: (text) => invoke('write_clipboard', { text }),
  hideWindow: () => invoke('hide_window'),
  showOrganizer: () => invoke('show_organizer'),
  getAppVersion: () => appApi.getVersion(),
  checkUpdate: () => updater.check(),
  relaunch: () => processApi.relaunch(),
  onRouteSet: (callback) => listen('route:set', (event) => callback(event.payload))
};

const DEFAULT_SETTINGS = {
  apiBaseUrl: '',
  apiKey: '',
  model: '',
  reminderTime: '18:00',
  dailyTemplate: '今日完成\n1. ...\n\n明日计划\n1. ...',
  projectRules: '#项目名 优先，其余由 AI 自动识别',
  startupPage: 'notes',
  enterBehavior: 'save',
  reminderStrategy: 'confirm',
  categories: []
};

const state = {
  notes: [],
  categories: [],
  selectedCategory: '',
  resultText: '',
  settings: { ...DEFAULT_SETTINGS },
  dailyResult: null,
  activeResultTab: 'daily'
};

const elements = {
  tabs: Array.from(document.querySelectorAll('.tab')),
  views: {
    notes: document.getElementById('notesView'),
    organize: document.getElementById('organizeView'),
    reminder: document.getElementById('reminderView'),
    settings: document.getElementById('settingsView')
  },
  noteForm: document.getElementById('noteForm'),
  noteContent: document.getElementById('noteContent'),
  categoryOptions: document.getElementById('categoryOptions'),
  notesList: document.getElementById('notesList'),
  noteCount: document.getElementById('noteCount'),
  projectHint: document.getElementById('projectHint'),
  organizeButton: document.getElementById('organizeButton'),
  organizeStatus: document.getElementById('organizeStatus'),
  staleHint: document.getElementById('staleHint'),
  resultTabs: Array.from(document.querySelectorAll('.result-tab')),
  resultPanels: Array.from(document.querySelectorAll('.result-panel')),
  summaryList: document.getElementById('summaryList'),
  projectSummaryList: document.getElementById('projectSummaryList'),
  resultText: document.getElementById('resultText'),
  copyButton: document.getElementById('copyButton'),
  reminderNotesList: document.getElementById('reminderNotesList'),
  reminderLaterButton: document.getElementById('reminderLaterButton'),
  reminderStartButton: document.getElementById('reminderStartButton'),
  settingsForm: document.getElementById('settingsForm'),
  apiBaseUrl: document.getElementById('apiBaseUrl'),
  apiKey: document.getElementById('apiKey'),
  model: document.getElementById('model'),
  reminderTime: document.getElementById('reminderTime'),
  enterHint: document.getElementById('enterHint'),
  advancedSettingsToggle: document.getElementById('advancedSettingsToggle'),
  advancedSettingsPanel: document.getElementById('advancedSettingsPanel'),
  dailyTemplate: document.getElementById('dailyTemplate'),
  projectRules: document.getElementById('projectRules'),
  startupPage: document.getElementById('startupPage'),
  enterBehavior: document.getElementById('enterBehavior'),
  reminderStrategy: document.getElementById('reminderStrategy'),
  appVersion: document.getElementById('appVersion'),
  checkUpdateButton: document.getElementById('checkUpdateButton'),
  updateStatus: document.getElementById('updateStatus'),
  toast: document.getElementById('toast')
};

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => elements.toast.classList.remove('show'), 1800);
}

function focusNoteInput() {
  if (!elements.noteContent || !elements.views.notes.classList.contains('active')) {
    return;
  }
  window.setTimeout(() => elements.noteContent.focus(), 0);
}

function isReminderTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '');
}

function normalizeReminderTime(value) {
  return isReminderTime(value) ? value : DEFAULT_SETTINGS.reminderTime;
}

function normalizeChoice(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function textOrDefault(value, fallback) {
  const text = (value || '').trim();
  return text || fallback;
}

function normalizeSettings(settings = {}) {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  return {
    ...merged,
    reminderTime: normalizeReminderTime(merged.reminderTime),
    dailyTemplate: textOrDefault(merged.dailyTemplate, DEFAULT_SETTINGS.dailyTemplate),
    projectRules: textOrDefault(merged.projectRules, DEFAULT_SETTINGS.projectRules),
    startupPage: normalizeChoice(merged.startupPage, ['notes', 'organize', 'settings'], DEFAULT_SETTINGS.startupPage),
    enterBehavior: normalizeChoice(merged.enterBehavior, ['save', 'newline'], DEFAULT_SETTINGS.enterBehavior),
    reminderStrategy: normalizeChoice(merged.reminderStrategy, ['confirm', 'organize', 'off'], DEFAULT_SETTINGS.reminderStrategy),
    categories: Array.isArray(merged.categories) ? merged.categories : []
  };
}

function updateEnterHint() {
  if (state.settings.enterBehavior === 'newline') {
    elements.enterHint.textContent = 'Enter 换行，Ctrl/⌘ + Enter 保存。保存失败时会保留输入。';
  } else {
    elements.enterHint.textContent = 'Enter 保存，Shift + Enter 换行。保存失败时会保留输入。';
  }
}

function applySettingsToForm(settings) {
  const normalized = normalizeSettings(settings);
  state.settings = normalized;
  state.categories = normalized.categories;
  elements.apiBaseUrl.value = normalized.apiBaseUrl;
  elements.apiKey.type = 'password';
  elements.apiKey.value = normalized.apiKey;
  elements.model.value = normalized.model;
  elements.reminderTime.value = normalized.reminderTime;
  elements.dailyTemplate.value = normalized.dailyTemplate;
  elements.projectRules.value = normalized.projectRules;
  elements.startupPage.value = normalized.startupPage;
  elements.enterBehavior.value = normalized.enterBehavior;
  elements.reminderStrategy.value = normalized.reminderStrategy;
  updateEnterHint();
  renderCategories();
}

function collectSettingsFromForm() {
  return {
    apiBaseUrl: elements.apiBaseUrl.value,
    apiKey: elements.apiKey.value,
    model: elements.model.value,
    reminderTime: normalizeReminderTime(elements.reminderTime.value),
    dailyTemplate: elements.dailyTemplate.value,
    projectRules: elements.projectRules.value,
    startupPage: elements.startupPage.value,
    enterBehavior: elements.enterBehavior.value,
    reminderStrategy: elements.reminderStrategy.value
  };
}

function toggleAdvancedSettings(forceExpanded) {
  const expanded = typeof forceExpanded === 'boolean' ? forceExpanded : elements.advancedSettingsPanel.hidden;
  elements.advancedSettingsPanel.hidden = !expanded;
  elements.advancedSettingsToggle.setAttribute('aria-expanded', String(expanded));
}

function handleNoteComposerKeydown(event) {
  if (event.key !== 'Enter') {
    return;
  }
  if (state.settings.enterBehavior === 'newline') {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      elements.noteForm.requestSubmit();
    }
    return;
  }
  if (!event.shiftKey) {
    event.preventDefault();
    elements.noteForm.requestSubmit();
  }
}

function parseNoteMetadata(content) {
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
  return {
    project: tags[0] || '',
    tags
  };
}

function renderProjectHint() {
  const metadata = parseNoteMetadata(elements.noteContent.value);
  if (!metadata.project) {
    elements.projectHint.textContent = '未识别项目标签';
    elements.projectHint.classList.remove('active');
    return;
  }
  elements.projectHint.textContent = `#${metadata.project}`;
  elements.projectHint.classList.add('active');
}

function setRoute(route) {
  const nextRoute = elements.views[route] ? route : 'notes';
  elements.tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.route === nextRoute));
  Object.entries(elements.views).forEach(([name, view]) => view.classList.toggle('active', name === nextRoute));
  if (nextRoute === 'notes') {
    loadNotes()
      .then(focusNoteInput)
      .catch((error) => showToast(error.message || '加载事项失败'));
  }
  if (nextRoute === 'organize') {
    loadNotes()
      .then(loadDailyResult)
      .catch((error) => setOrganizerStatus(error.message || '加载整理结果失败'));
  }
  if (nextRoute === 'reminder') {
    loadNotes()
      .then(renderReminderNotes)
      .catch((error) => showToast(error.message || '加载提醒事项失败'));
  }
}

function renderCategories() {
  elements.categoryOptions.innerHTML = '';
  const empty = document.createElement('button');
  empty.type = 'button';
  empty.className = `category-pill${state.selectedCategory === '' ? ' active' : ''}`;
  empty.textContent = '不选分类';
  empty.addEventListener('click', () => {
    state.selectedCategory = '';
    renderCategories();
  });
  elements.categoryOptions.appendChild(empty);
  state.categories.forEach((category) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `category-pill${state.selectedCategory === category ? ' active' : ''}`;
    button.textContent = category;
    button.addEventListener('click', () => {
      state.selectedCategory = category;
      renderCategories();
    });
    elements.categoryOptions.appendChild(button);
  });
}

function renderNotes() {
  elements.notesList.innerHTML = '';
  elements.noteCount.textContent = `${state.notes.length} 条`;
  if (state.notes.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'chat-empty';
    empty.textContent = '输入第一条事项，今天的记录会像聊天一样显示在这里。';
    elements.notesList.appendChild(empty);
    return;
  }
  state.notes.forEach((note) => {
    const item = document.createElement('article');
    item.className = 'note-item note-bubble';

    const body = document.createElement('div');
    const content = document.createElement('p');
    content.className = 'note-content';
    content.textContent = note.content;
    const meta = document.createElement('div');
    meta.className = 'note-meta';
    const project = note.project ? `#${note.project}` : '未指定项目';
    const tags = Array.isArray(note.tags) && note.tags.length ? ` · ${note.tags.map((tag) => `#${tag}`).join(' ')}` : '';
    meta.textContent = `${project}${tags} · ${note.category || '未分类'} · ${note.createdAt.slice(11, 16)}`;
    body.append(content, meta);

    const actions = document.createElement('div');
    actions.className = 'note-actions';
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'secondary';
    editButton.textContent = '编辑';
    editButton.addEventListener('click', async () => editNote(note));
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'danger';
    deleteButton.textContent = '删除';
    deleteButton.addEventListener('click', async () => deleteNote(note));
    actions.append(editButton, deleteButton);

    item.append(body, actions);
    elements.notesList.appendChild(item);
  });
}

function renderReminderNotes() {
  elements.reminderNotesList.innerHTML = '';
  if (state.notes.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'chat-empty';
    empty.textContent = '今天还没有事项。可以先回到记录页补充。';
    elements.reminderNotesList.appendChild(empty);
    return;
  }
  state.notes.forEach((note) => {
    const item = document.createElement('article');
    item.className = 'note-item reminder-note';
    const content = document.createElement('p');
    content.className = 'note-content';
    content.textContent = note.content;
    const meta = document.createElement('div');
    meta.className = 'note-meta';
    const project = note.project ? `#${note.project}` : '未指定项目';
    const time = note.createdAt ? note.createdAt.slice(11, 16) : '--:--';
    meta.textContent = `${project} · ${note.category || '未分类'} · ${time}`;
    item.append(content, meta);
    elements.reminderNotesList.appendChild(item);
  });
}

async function loadNotes() {
  state.notes = await dailyNoteApi.listNotes();
  renderNotes();
  updateStaleHint();
}

async function addNote(event) {
  event.preventDefault();
  const content = elements.noteContent.value.trim();
  if (!content) {
    showToast('请输入事项内容');
    focusNoteInput();
    return;
  }
  const metadata = parseNoteMetadata(content);
  try {
    await dailyNoteApi.addNote({ content, category: state.selectedCategory, project: metadata.project, tags: metadata.tags });
    elements.noteContent.value = '';
    state.selectedCategory = '';
    renderCategories();
    renderProjectHint();
    await loadNotes();
    focusNoteInput();
    showToast('已保存');
  } catch (error) {
    focusNoteInput();
    showToast(error.message || '保存失败');
  }
}

async function editNote(note) {
  const nextContent = window.prompt('编辑事项', note.content);
  if (nextContent === null) {
    return;
  }
  const content = nextContent.trim();
  if (!content) {
    showToast('事项内容不能为空');
    return;
  }
  const metadata = parseNoteMetadata(content);
  try {
    await dailyNoteApi.updateNote(note.id, { content, category: note.category, project: metadata.project, tags: metadata.tags });
    await loadNotes();
    focusNoteInput();
    showToast('已更新');
  } catch (error) {
    focusNoteInput();
    showToast(error.message || '更新失败');
  }
}

async function deleteNote(note) {
  const confirmed = window.confirm('确认删除这条事项吗？');
  if (!confirmed) {
    return;
  }
  try {
    await dailyNoteApi.deleteNote(note.id);
    await loadNotes();
    focusNoteInput();
    showToast('已删除');
  } catch (error) {
    focusNoteInput();
    showToast(error.message || '删除失败');
  }
}

function renderSummaryList(container, items, titleKey) {
  container.innerHTML = '';
  if (!items || items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = '暂无内容';
    container.appendChild(empty);
    return;
  }
  items.forEach((item) => {
    const box = document.createElement('div');
    box.className = 'summary-item';
    const title = document.createElement('strong');
    title.textContent = item[titleKey] || '未命名';
    const summary = document.createElement('p');
    summary.textContent = item.summary || '';
    box.append(title, summary);
    container.appendChild(box);
  });
}

function renderSummary(items) {
  renderSummaryList(elements.summaryList, items, 'category');
}

function setOrganizerStatus(message) {
  elements.organizeStatus.textContent = message;
}

function hasAiConfig() {
  return Boolean((state.settings.apiBaseUrl || '').trim() && (state.settings.apiKey || '').trim() && (state.settings.model || '').trim());
}

function sourceRevisionHash(notes) {
  const parts = notes
    .map((note) => `${note.id}|${note.revision || 1}|${note.updatedAt || ''}|${note.deletedAt || ''}`)
    .sort()
    .join('\n');
  let hash = 0xcbf29ce484222325n;
  for (const code of new TextEncoder().encode(parts)) {
    hash ^= BigInt(code);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function updateStaleHint() {
  if (!elements.staleHint || !state.dailyResult || !state.dailyResult.sourceRevisionHash) {
    elements.staleHint.hidden = true;
    return;
  }
  elements.staleHint.hidden = sourceRevisionHash(state.notes) === state.dailyResult.sourceRevisionHash;
}

function setResultTab(tab) {
  state.activeResultTab = tab;
  elements.resultTabs.forEach((button) => button.classList.toggle('active', button.dataset.resultTab === tab));
  elements.resultPanels.forEach((panel) => panel.classList.toggle('active', panel.dataset.resultPanel === tab));
}

function renderOrganizerResult(result) {
  state.dailyResult = result;
  state.resultText = result && result.dailyText ? result.dailyText : '';
  elements.resultText.value = state.resultText;
  renderSummary(result ? result.categorySummaries || [] : []);
  renderSummaryList(elements.projectSummaryList, result ? result.projectSummaries || [] : [], 'project');
  setResultTab('daily');
  updateStaleHint();
}

async function loadDailyResult() {
  const result = await dailyNoteApi.getDailyResult();
  if (result) {
    renderOrganizerResult(result);
  } else {
    updateStaleHint();
  }
}

async function organizeToday() {
  await loadNotes();
  if (state.notes.length === 0) {
    setOrganizerStatus('今天还没有事项可整理');
    return;
  }
  state.settings = normalizeSettings(await dailyNoteApi.getSettings());
  if (!hasAiConfig()) {
    setOrganizerStatus('请先配置 AI 接口地址、API Key 和模型名');
    return;
  }
  elements.organizeButton.disabled = true;
  elements.organizeButton.textContent = '整理中...';
  setOrganizerStatus('整理中，请稍候');
  try {
    const result = await dailyNoteApi.organize();
    renderOrganizerResult(result);
    setOrganizerStatus('整理完成');
    showToast('整理完成');
  } catch (error) {
    setOrganizerStatus(error.message || '整理失败');
    showToast(error.message || '整理失败');
  } finally {
    elements.organizeButton.disabled = false;
    elements.organizeButton.textContent = '开始整理';
  }
}

async function copyResult() {
  const text = elements.resultText.value.trim();
  if (!text) {
    showToast('没有可复制内容');
    return;
  }
  try {
    await dailyNoteApi.writeClipboard(text);
    setOrganizerStatus('已复制');
    showToast('已复制');
  } catch (error) {
    setOrganizerStatus(`复制失败：${error.message || '未知错误'}`);
    showToast('复制失败');
  }
}

async function startReminderOrganizing() {
  elements.reminderStartButton.disabled = true;
  elements.reminderStartButton.textContent = '整理中...';
  setRoute('organize');
  try {
    await organizeToday();
  } finally {
    elements.reminderStartButton.disabled = false;
    elements.reminderStartButton.textContent = '开始整理';
  }
}

async function remindLater() {
  try {
    await dailyNoteApi.hideWindow();
    showToast('稍后处理');
  } catch (error) {
    setRoute('notes');
    showToast(error.message || '稍后处理');
  }
}


function setUpdateStatus(message) {
  elements.updateStatus.textContent = message;
}

async function loadAppVersion() {
  try {
    const version = await dailyNoteApi.getAppVersion();
    elements.appVersion.textContent = version ? `v${version}` : '未知版本';
  } catch (error) {
    elements.appVersion.textContent = '读取失败';
    setUpdateStatus(error.message || '读取版本失败');
  }
}

function describeUpdateProgress(event) {
  if (!event || !event.event) {
    return '正在下载安装包...';
  }
  if (event.event === 'Started') {
    return '开始下载安装包...';
  }
  if (event.event === 'Progress') {
    return '正在下载安装包...';
  }
  if (event.event === 'Finished') {
    return '下载完成，正在安装...';
  }
  return '正在处理更新...';
}

async function handleCheckUpdate() {
  elements.checkUpdateButton.disabled = true;
  elements.checkUpdateButton.textContent = '检查中...';
  setUpdateStatus('正在检查最新版本...');
  try {
    const update = await dailyNoteApi.checkUpdate();
    if (!update) {
      setUpdateStatus('当前已是最新版本');
      showToast('当前已是最新版本');
      return;
    }
    const notes = update.body ? `

${update.body}` : '';
    const confirmed = window.confirm(`检测到新版本 v${update.version}，是否下载并安装？${notes}`);
    if (!confirmed) {
      setUpdateStatus(`发现新版本 v${update.version}，已取消安装`);
      return;
    }
    elements.checkUpdateButton.textContent = '更新中...';
    setUpdateStatus(`正在安装 v${update.version}...`);
    await update.downloadAndInstall((event) => setUpdateStatus(describeUpdateProgress(event)));
    setUpdateStatus('更新已安装，正在重启应用...');
    await dailyNoteApi.relaunch();
  } catch (error) {
    const message = error.message || String(error) || '检查更新失败';
    setUpdateStatus(message);
    showToast(message);
  } finally {
    elements.checkUpdateButton.disabled = false;
    elements.checkUpdateButton.textContent = '检查更新';
  }
}

async function loadSettings() {
  const settings = await dailyNoteApi.getSettings();
  applySettingsToForm(settings);
}

async function saveSettings(event) {
  event.preventDefault();
  try {
    const saved = await dailyNoteApi.saveSettings(collectSettingsFromForm());
    applySettingsToForm(saved);
    showToast('设置已保存');
  } catch (error) {
    showToast(error.message || '设置保存失败');
  }
}

function bindEvents() {
  elements.tabs.forEach((tab) => tab.addEventListener('click', () => setRoute(tab.dataset.route)));
  elements.noteForm.addEventListener('submit', addNote);
  elements.noteContent.addEventListener('input', renderProjectHint);
  elements.noteContent.addEventListener('keydown', handleNoteComposerKeydown);
  elements.reminderTime.addEventListener('blur', () => {
    elements.reminderTime.value = normalizeReminderTime(elements.reminderTime.value);
  });
  elements.advancedSettingsToggle.addEventListener('click', () => toggleAdvancedSettings());
  elements.settingsForm.addEventListener('submit', saveSettings);
  elements.checkUpdateButton.addEventListener('click', handleCheckUpdate);
  elements.organizeButton.addEventListener('click', organizeToday);
  elements.copyButton.addEventListener('click', copyResult);
  elements.reminderStartButton.addEventListener('click', startReminderOrganizing);
  elements.reminderLaterButton.addEventListener('click', remindLater);
  elements.resultTabs.forEach((button) => button.addEventListener('click', () => setResultTab(button.dataset.resultTab)));
  if (dailyNoteApi.onRouteSet) {
    dailyNoteApi.onRouteSet((route) => setRoute(route));
  }
}

async function boot() {
  bindEvents();
  await loadSettings();
  await loadAppVersion();
  await loadNotes();
  await loadDailyResult();
  setRoute(state.settings.startupPage);
  renderProjectHint();
  focusNoteInput();
}

boot().catch((error) => showToast(error.message || '应用初始化失败'));
