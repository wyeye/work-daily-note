'use strict';

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toDateKey(date = new Date()) {
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate())
  ].join('-');
}

function formatTime(date = new Date()) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function nowIso() {
  return new Date().toISOString();
}

module.exports = {
  formatTime,
  nowIso,
  toDateKey
};
