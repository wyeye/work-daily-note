use crate::store::{to_date_key, Store};
use chrono::{Local, Timelike};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
use tokio::time::{sleep, Duration};

pub fn is_reminder_time(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 5 || bytes[2] != b':' {
        return false;
    }
    let hours = value[0..2].parse::<u8>();
    let minutes = value[3..5].parse::<u8>();
    matches!((hours, minutes), (Ok(h), Ok(m)) if h < 24 && m < 60)
}

pub async fn start_reminder_loop(app: AppHandle, store: Arc<Mutex<Store>>) {
    let mut last_trigger = String::new();
    loop {
        let reminder_time = store
            .lock()
            .map(|store| store.get_settings().reminder_time)
            .unwrap_or_else(|_| "18:00".to_string());
        let now = Local::now();
        let current_time = format!("{:02}:{:02}", now.hour(), now.minute());
        let trigger_key = format!("{} {}", to_date_key(), reminder_time);
        if is_reminder_time(&reminder_time) && current_time == reminder_time && last_trigger != trigger_key {
            last_trigger = trigger_key;
            show_reminder(&app);
        }
        sleep(Duration::from_secs(30)).await;
    }
}

pub fn show_reminder(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    let _ = app.emit("route:set", "organize");
    let _ = app
        .notification()
        .builder()
        .title("Work Daily Note")
        .body("到时间整理今日事项了")
        .show();
}
