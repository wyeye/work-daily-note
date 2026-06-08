'use strict';

function parseReminderTime(value) {
  if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim())) {
    throw new Error('提醒时间格式必须是 HH:mm');
  }
  const [hours, minutes] = value.trim().split(':').map(Number);
  return { hours, minutes };
}

function millisecondsUntilNextOccurrence(reminderTime, now = new Date()) {
  const { hours, minutes } = parseReminderTime(reminderTime);
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime() - now.getTime();
}

class ReminderScheduler {
  constructor({ getReminderTime, onReminder }) {
    this.getReminderTime = getReminderTime;
    this.onReminder = onReminder;
    this.timer = null;
  }

  start() {
    this.stop();
    const delay = millisecondsUntilNextOccurrence(this.getReminderTime());
    this.timer = setTimeout(() => {
      this.onReminder();
      this.start();
    }, delay);
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  restart() {
    this.start();
  }
}

module.exports = {
  ReminderScheduler,
  millisecondsUntilNextOccurrence,
  parseReminderTime
};
