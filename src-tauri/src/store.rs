use chrono::{Datelike, Local, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub const CATEGORIES: [&str; 5] = [
    "日常沟通与需求确认",
    "问题排查与技术支持",
    "开发与代码调整",
    "测试验证与发布支持",
    "文档、配置与环境维护",
];

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub content: String,
    pub category: String,
    pub date: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub api_base_url: String,
    pub api_key: String,
    pub model: String,
    pub reminder_time: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsWithCategories {
    pub api_base_url: String,
    pub api_key: String,
    pub model: String,
    pub reminder_time: String,
    pub categories: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DataFile {
    notes: Vec<Note>,
    settings: Settings,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteInput {
    pub content: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub date: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotePatch {
    pub content: Option<String>,
    pub category: Option<String>,
}

pub struct Store {
    data_file: PathBuf,
    data: DataFile,
}

impl Store {
    pub fn new(data_file: PathBuf) -> Self {
        let data = read_json_file(&data_file);
        Self { data_file, data }
    }

    pub fn list_notes(&self, date: Option<String>) -> Vec<Note> {
        let wanted_date = clean_string(date.unwrap_or_default())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(to_date_key);
        let mut notes: Vec<Note> = self
            .data
            .notes
            .iter()
            .filter(|note| note.date == wanted_date)
            .cloned()
            .collect();
        notes.sort_by(|left, right| left.created_at.cmp(&right.created_at));
        notes
    }

    pub fn add_note(&mut self, input: NoteInput) -> Result<Note, String> {
        let content = clean_string(input.content).ok_or_else(|| "事项内容不能为空".to_string())?;
        let timestamp = now_iso();
        let note = Note {
            id: Uuid::new_v4().to_string(),
            content,
            category: normalize_category(&input.category),
            date: clean_string(input.date).filter(|value| !value.is_empty()).unwrap_or_else(to_date_key),
            created_at: timestamp.clone(),
            updated_at: timestamp,
        };
        self.data.notes.push(note.clone());
        self.persist()?;
        Ok(note)
    }

    pub fn update_note(&mut self, id: String, patch: NotePatch) -> Result<Note, String> {
        let note = self
            .data
            .notes
            .iter_mut()
            .find(|item| item.id == id)
            .ok_or_else(|| "事项不存在".to_string())?;

        if let Some(content) = patch.content {
            note.content = clean_string(content).ok_or_else(|| "事项内容不能为空".to_string())?;
        }
        if let Some(category) = patch.category {
            note.category = normalize_category(&category);
        }
        note.updated_at = now_iso();
        let updated = note.clone();
        self.persist()?;
        Ok(updated)
    }

    pub fn delete_note(&mut self, id: String) -> Result<bool, String> {
        let before = self.data.notes.len();
        self.data.notes.retain(|note| note.id != id);
        let changed = self.data.notes.len() != before;
        if changed {
            self.persist()?;
        }
        Ok(changed)
    }

    pub fn get_settings(&self) -> Settings {
        self.data.settings.clone()
    }

    pub fn get_settings_with_categories(&self) -> SettingsWithCategories {
        let settings = self.get_settings();
        SettingsWithCategories {
            api_base_url: settings.api_base_url,
            api_key: settings.api_key,
            model: settings.model,
            reminder_time: settings.reminder_time,
            categories: CATEGORIES.iter().map(|item| item.to_string()).collect(),
        }
    }

    pub fn save_settings(&mut self, settings: Settings) -> Result<SettingsWithCategories, String> {
        self.data.settings = sanitize_settings(settings);
        self.persist()?;
        Ok(self.get_settings_with_categories())
    }

    fn persist(&mut self) -> Result<(), String> {
        self.data = sanitize_data(self.data.clone());
        write_json_file(&self.data_file, &self.data)
    }
}

fn default_settings() -> Settings {
    Settings {
        api_base_url: String::new(),
        api_key: String::new(),
        model: String::new(),
        reminder_time: "18:00".to_string(),
    }
}

fn default_data() -> DataFile {
    DataFile {
        notes: Vec::new(),
        settings: default_settings(),
    }
}

fn is_reminder_time(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 5 || bytes[2] != b':' {
        return false;
    }
    let hours = value[0..2].parse::<u8>();
    let minutes = value[3..5].parse::<u8>();
    matches!((hours, minutes), (Ok(h), Ok(m)) if h < 24 && m < 60)
}

pub fn sanitize_settings(input: Settings) -> Settings {
    let fallback = default_settings();
    let reminder_time = input.reminder_time.trim().to_string();
    Settings {
        api_base_url: input.api_base_url.trim().to_string(),
        api_key: input.api_key.trim().to_string(),
        model: input.model.trim().to_string(),
        reminder_time: if is_reminder_time(&reminder_time) {
            reminder_time
        } else {
            fallback.reminder_time
        },
    }
}

fn sanitize_data(input: DataFile) -> DataFile {
    let mut data = default_data();
    data.notes = input
        .notes
        .into_iter()
        .filter_map(|note| {
            let content = clean_string(note.content)?;
            Some(Note {
                id: clean_string(note.id).unwrap_or_else(|| Uuid::new_v4().to_string()),
                content,
                category: normalize_category(&note.category),
                date: clean_string(note.date).unwrap_or_else(to_date_key),
                created_at: clean_string(note.created_at).unwrap_or_else(now_iso),
                updated_at: clean_string(note.updated_at).unwrap_or_else(now_iso),
            })
        })
        .collect();
    data.settings = sanitize_settings(input.settings);
    data
}

fn read_json_file(file_path: &Path) -> DataFile {
    if !file_path.exists() {
        return default_data();
    }
    match fs::read_to_string(file_path)
        .ok()
        .and_then(|text| serde_json::from_str::<DataFile>(&text).ok())
    {
        Some(data) => sanitize_data(data),
        None => {
            let broken_path = file_path.with_extension(format!("json.broken-{}", Utc::now().timestamp_millis()));
            let _ = fs::rename(file_path, broken_path);
            default_data()
        }
    }
}

fn write_json_file(file_path: &Path, data: &DataFile) -> Result<(), String> {
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let temp_path = file_path.with_extension("json.tmp");
    let text = serde_json::to_string_pretty(data).map_err(|error| error.to_string())? + "\n";
    fs::write(&temp_path, text).map_err(|error| error.to_string())?;
    fs::rename(&temp_path, file_path).map_err(|error| error.to_string())
}

pub fn normalize_category(value: &str) -> String {
    let trimmed = value.trim();
    if CATEGORIES.contains(&trimmed) {
        trimmed.to_string()
    } else {
        String::new()
    }
}

fn clean_string(value: String) -> Option<String> {
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

pub fn to_date_key() -> String {
    let now = Local::now();
    format!("{:04}-{:02}-{:02}", now.year(), now.month(), now.day())
}

pub fn now_iso() -> String {
    Utc::now().to_rfc3339()
}
