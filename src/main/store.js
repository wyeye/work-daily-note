'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { normalizeCategory } = require('../shared/categories');
const { nowIso, toDateKey } = require('../shared/dates');

const DEFAULT_SETTINGS = Object.freeze({
  apiBaseUrl: '',
  apiKey: '',
  model: '',
  reminderTime: '18:00'
});

function isReminderTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim());
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function defaultData() {
  return {
    notes: [],
    settings: { ...DEFAULT_SETTINGS }
  };
}

function sanitizeSettings(input = {}) {
  const reminderTime = cleanString(input.reminderTime);
  return {
    apiBaseUrl: cleanString(input.apiBaseUrl),
    apiKey: cleanString(input.apiKey),
    model: cleanString(input.model),
    reminderTime: isReminderTime(reminderTime) ? reminderTime : DEFAULT_SETTINGS.reminderTime
  };
}

function sanitizeData(input) {
  const data = defaultData();
  if (!input || typeof input !== 'object') {
    return data;
  }
  if (Array.isArray(input.notes)) {
    data.notes = input.notes
      .filter((note) => note && typeof note === 'object' && typeof note.content === 'string')
      .map((note) => ({
        id: cleanString(note.id) || crypto.randomUUID(),
        content: cleanString(note.content),
        category: normalizeCategory(note.category),
        date: cleanString(note.date) || toDateKey(),
        createdAt: cleanString(note.createdAt) || nowIso(),
        updatedAt: cleanString(note.updatedAt) || nowIso()
      }))
      .filter((note) => note.content.length > 0);
  }
  data.settings = sanitizeSettings({ ...DEFAULT_SETTINGS, ...(input.settings || {}) });
  return data;
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return defaultData();
  }
  try {
    return sanitizeData(JSON.parse(fs.readFileSync(filePath, 'utf-8')));
  } catch (error) {
    const brokenPath = `${filePath}.broken-${Date.now()}`;
    fs.renameSync(filePath, brokenPath);
    return defaultData();
  }
}

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
  fs.renameSync(tempPath, filePath);
}

function createStore(app) {
  const dataFile = path.join(app.getPath('userData'), 'data.json');
  let data = readJsonFile(dataFile);

  function persist() {
    data = sanitizeData(data);
    writeJsonFile(dataFile, data);
  }

  function listNotes(date = toDateKey()) {
    return data.notes
      .filter((note) => note.date === date)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  function addNote(input) {
    const content = cleanString(input && input.content);
    if (!content) {
      throw new Error('事项内容不能为空');
    }
    const timestamp = nowIso();
    const note = {
      id: crypto.randomUUID(),
      content,
      category: normalizeCategory(input && input.category),
      date: cleanString(input && input.date) || toDateKey(),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    data.notes.push(note);
    persist();
    return note;
  }

  function updateNote(id, patch) {
    const note = data.notes.find((item) => item.id === id);
    if (!note) {
      throw new Error('事项不存在');
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'content')) {
      const content = cleanString(patch.content);
      if (!content) {
        throw new Error('事项内容不能为空');
      }
      note.content = content;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'category')) {
      note.category = normalizeCategory(patch.category);
    }
    note.updatedAt = nowIso();
    persist();
    return note;
  }

  function deleteNote(id) {
    const before = data.notes.length;
    data.notes = data.notes.filter((note) => note.id !== id);
    const changed = data.notes.length !== before;
    if (changed) {
      persist();
    }
    return changed;
  }

  function getSettings() {
    return { ...data.settings };
  }

  function saveSettings(settings) {
    data.settings = sanitizeSettings({ ...data.settings, ...settings });
    persist();
    return getSettings();
  }

  return {
    addNote,
    deleteNote,
    getDataFilePath: () => dataFile,
    getSettings,
    listNotes,
    saveSettings,
    updateNote
  };
}

module.exports = {
  DEFAULT_SETTINGS,
  createStore,
  sanitizeSettings
};
