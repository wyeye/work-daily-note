'use strict';

const tauri = window.__TAURI__;
const invoke = tauri.core.invoke;
const listen = tauri.event.listen;

const dailyNoteApi = {
  listNotes: (date) => invoke('list_notes', { date: date || null }),
  addNote: (note) => invoke('add_note', { note }),
  updateNote: (id, patch) => invoke('update_note', { id, patch }),
  deleteNote: (id) => invoke('delete_note', { id }),
  getSettings: () => invoke('get_settings'),
  saveSettings: (settings) => invoke('save_settings', { settings }),
  organize: () => invoke('organize_daily_notes_command'),
  writeClipboard: (text) => invoke('write_clipboard', { text }),
  showOrganizer: () => invoke('show_organizer'),
  onRouteSet: (callback) => listen('route:set', (event) => callback(event.payload))
};

const state = {
  notes: [],
  categories: [],
  selectedCategory: '',
  resultText: ''
};

const elements = {
  tabs: Array.from(document.querySelectorAll('.tab')),
  views: {
    notes: document.getElementById('notesView'),
    organize: document.getElementById('organizeView'),
    settings: document.getElementById('settingsView')
  },
  noteForm: document.getElementById('noteForm'),
  noteContent: document.getElementById('noteContent'),
  categoryOptions: document.getElementById('categoryOptions'),
  notesList: document.getElementById('notesList'),
  noteCount: document.getElementById('noteCount'),
  organizeButton: document.getElementById('organizeButton'),
  summaryList: document.getElementById('summaryList'),
  resultText: document.getElementById('resultText'),
  copyButton: document.getElementById('copyButton'),
  settingsForm: document.getElementById('settingsForm'),
  apiBaseUrl: document.getElementById('apiBaseUrl'),
  apiKey: document.getElementById('apiKey'),
  model: document.getElementById('model'),
  reminderTime: document.getElementById('reminderTime'),
  toast: document.getElementById('toast')
};

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => elements.toast.classList.remove('show'), 1800);
}

function setRoute(route) {
  const nextRoute = elements.views[route] ? route : 'notes';
  elements.tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.route === nextRoute));
  Object.entries(elements.views).forEach(([name, view]) => view.classList.toggle('active', name === nextRoute));
  if (nextRoute === 'notes') {
    loadNotes().catch((error) => showToast(error.message || '加载事项失败'));
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
    empty.className = 'note-meta';
    empty.textContent = '今天还没有记录。';
    elements.notesList.appendChild(empty);
    return;
  }
  state.notes.forEach((note) => {
    const item = document.createElement('article');
    item.className = 'note-item';

    const body = document.createElement('div');
    const content = document.createElement('p');
    content.className = 'note-content';
    content.textContent = note.content;
    const meta = document.createElement('div');
    meta.className = 'note-meta';
    meta.textContent = `${note.category || '未分类'} · ${note.createdAt.slice(11, 16)}`;
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

async function loadNotes() {
  state.notes = await dailyNoteApi.listNotes();
  renderNotes();
}

async function addNote(event) {
  event.preventDefault();
  const content = elements.noteContent.value.trim();
  if (!content) {
    showToast('请输入事项内容');
    return;
  }
  try {
    await dailyNoteApi.addNote({ content, category: state.selectedCategory });
    elements.noteContent.value = '';
    state.selectedCategory = '';
    renderCategories();
    await loadNotes();
    showToast('已保存');
  } catch (error) {
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
  try {
    await dailyNoteApi.updateNote(note.id, { content, category: note.category });
    await loadNotes();
    showToast('已更新');
  } catch (error) {
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
    showToast('已删除');
  } catch (error) {
    showToast(error.message || '删除失败');
  }
}

function renderSummary(items) {
  elements.summaryList.innerHTML = '';
  items.forEach((item) => {
    const box = document.createElement('div');
    box.className = 'summary-item';
    const title = document.createElement('strong');
    title.textContent = item.category;
    const summary = document.createElement('p');
    summary.textContent = item.summary;
    box.append(title, summary);
    elements.summaryList.appendChild(box);
  });
}

async function organizeToday() {
  elements.organizeButton.disabled = true;
  elements.organizeButton.textContent = '整理中...';
  try {
    const result = await dailyNoteApi.organize();
    state.resultText = result.zentaoText;
    elements.resultText.value = result.zentaoText;
    renderSummary(result.categorySummaries || []);
    showToast('整理完成');
  } catch (error) {
    showToast(error.message || '整理失败');
  } finally {
    elements.organizeButton.disabled = false;
    elements.organizeButton.textContent = 'AI 整理今日事项';
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
    showToast('已复制');
  } catch (error) {
    showToast(error.message || '复制失败');
  }
}

async function loadSettings() {
  const settings = await dailyNoteApi.getSettings();
  state.categories = settings.categories || [];
  elements.apiBaseUrl.value = settings.apiBaseUrl || '';
  elements.apiKey.value = settings.apiKey || '';
  elements.model.value = settings.model || '';
  elements.reminderTime.value = settings.reminderTime || '18:00';
  renderCategories();
}

async function saveSettings(event) {
  event.preventDefault();
  try {
    await dailyNoteApi.saveSettings({
      apiBaseUrl: elements.apiBaseUrl.value,
      apiKey: elements.apiKey.value,
      model: elements.model.value,
      reminderTime: elements.reminderTime.value || '18:00'
    });
    showToast('设置已保存');
  } catch (error) {
    showToast(error.message || '设置保存失败');
  }
}

function bindEvents() {
  elements.tabs.forEach((tab) => tab.addEventListener('click', () => setRoute(tab.dataset.route)));
  elements.noteForm.addEventListener('submit', addNote);
  elements.noteContent.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      elements.noteForm.requestSubmit();
    }
  });
  elements.settingsForm.addEventListener('submit', saveSettings);
  elements.organizeButton.addEventListener('click', organizeToday);
  elements.copyButton.addEventListener('click', copyResult);
  if (dailyNoteApi.onRouteSet) {
    dailyNoteApi.onRouteSet((route) => setRoute(route));
  }
}

async function boot() {
  bindEvents();
  await loadSettings();
  await loadNotes();
  setRoute('notes');
}

boot().catch((error) => showToast(error.message || '应用初始化失败'));
