#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ai_client;
mod reminder;
mod store;

use crate::store::{NoteInput, NotePatch, Settings, Store};
use std::sync::{Arc, Mutex};
use tauri::image::Image;
use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_clipboard_manager::ClipboardExt;

const TRAY_ICON: &[u8] = include_bytes!("../../src/assets/icons/app-16.png");

struct AppState {
    store: Arc<Mutex<Store>>,
}

#[tauri::command]
fn list_notes(state: State<'_, AppState>, date: Option<String>) -> Result<Vec<store::Note>, String> {
    let store = state.store.lock().map_err(|_| "本地数据锁定失败".to_string())?;
    Ok(store.list_notes(date))
}

#[tauri::command]
fn add_note(state: State<'_, AppState>, note: NoteInput) -> Result<store::Note, String> {
    let mut store = state.store.lock().map_err(|_| "本地数据锁定失败".to_string())?;
    store.add_note(note)
}

#[tauri::command]
fn update_note(state: State<'_, AppState>, id: String, patch: NotePatch) -> Result<store::Note, String> {
    let mut store = state.store.lock().map_err(|_| "本地数据锁定失败".to_string())?;
    store.update_note(id, patch)
}

#[tauri::command]
fn delete_note(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    let mut store = state.store.lock().map_err(|_| "本地数据锁定失败".to_string())?;
    store.delete_note(id)
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> Result<store::SettingsWithCategories, String> {
    let store = state.store.lock().map_err(|_| "本地数据锁定失败".to_string())?;
    Ok(store.get_settings_with_categories())
}

#[tauri::command]
fn save_settings(state: State<'_, AppState>, settings: Settings) -> Result<store::SettingsWithCategories, String> {
    let mut store = state.store.lock().map_err(|_| "本地数据锁定失败".to_string())?;
    store.save_settings(settings)
}

#[tauri::command]
async fn organize_daily_notes_command(state: State<'_, AppState>) -> Result<ai_client::OrganizeResult, String> {
    let (settings, notes) = {
        let store = state.store.lock().map_err(|_| "本地数据锁定失败".to_string())?;
        (store.get_settings(), store.list_notes(None))
    };
    ai_client::organize_daily_notes(settings, notes).await
}

#[tauri::command]
fn write_clipboard(app: AppHandle, text: String) -> Result<bool, String> {
    app.clipboard().write_text(text).map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
fn show_organizer(app: AppHandle) -> Result<bool, String> {
    show_window(&app, "organize")?;
    Ok(true)
}

fn show_window(app: &AppHandle, route: &str) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|error| error.to_string())?;
        window.unminimize().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
    }
    app.emit("route:set", route).map_err(|error| error.to_string())?;
    Ok(())
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let handle = app.handle();
    let menu = MenuBuilder::new(handle)
        .text("open_notes", "打开便签")
        .text("organize", "整理今日事项")
        .separator()
        .text("quit", "退出")
        .build()?;
    let icon = Image::from_bytes(TRAY_ICON)?;
    TrayIconBuilder::with_id("main-tray")
        .tooltip("Work Daily Note")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open_notes" => {
                let _ = show_window(app, "notes");
            }
            "organize" => {
                let _ = show_window(app, "organize");
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::DoubleClick { button: MouseButton::Left, .. }
                | TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
            {
                let _ = show_window(tray.app_handle(), "notes");
            }
        })
        .build(app)?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let data_file = data_dir.join("data.json");
            let store = Arc::new(Mutex::new(Store::new(data_file)));
            app.manage(AppState { store: store.clone() });
            setup_tray(app)?;
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                reminder::start_reminder_loop(app_handle, store).await;
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            list_notes,
            add_note,
            update_note,
            delete_note,
            get_settings,
            save_settings,
            organize_daily_notes_command,
            write_clipboard,
            show_organizer
        ])
        .run(tauri::generate_context!())
        .expect("error while running Work Daily Note");
}
