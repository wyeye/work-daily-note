use chrono::{Datelike, Local, Utc};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, File, OpenOptions};
use std::io::Write;
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
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub date: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub project: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
    #[serde(default)]
    pub deleted_at: Option<String>,
    #[serde(default = "default_revision")]
    pub revision: u32,
    #[serde(default)]
    pub updated_by: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    #[serde(default)]
    pub api_base_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
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
    #[serde(default)]
    notes: Vec<Note>,
    #[serde(default = "default_settings")]
    settings: Settings,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct NoteDayFile {
    #[serde(default = "default_schema_version")]
    schema_version: u32,
    #[serde(default)]
    date: String,
    #[serde(default)]
    notes: Vec<Note>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AiSettingsFile {
    #[serde(default = "default_schema_version")]
    schema_version: u32,
    #[serde(default)]
    api_base_url: String,
    #[serde(default)]
    model: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReminderSettingsFile {
    #[serde(default = "default_schema_version")]
    schema_version: u32,
    #[serde(default)]
    reminder_time: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SecretsFile {
    #[serde(default = "default_schema_version")]
    schema_version: u32,
    #[serde(default)]
    api_key: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DeviceFile {
    #[serde(default = "default_schema_version")]
    schema_version: u32,
    #[serde(default)]
    device_id: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChangeRecord {
    entity_type: String,
    entity_id: String,
    operation: String,
    revision: u32,
    changed_at: String,
}

#[derive(Clone, Debug)]
struct StorePaths {
    app_dir: PathBuf,
    notes_dir: PathBuf,
    daily_results_dir: PathBuf,
    sync_settings_dir: PathBuf,
    changes_dir: PathBuf,
    local_data_dir: PathBuf,
    local_cache_dir: PathBuf,
    legacy_data_file: PathBuf,
    ai_settings_file: PathBuf,
    reminder_settings_file: PathBuf,
    secrets_file: PathBuf,
    device_file: PathBuf,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteInput {
    pub content: String,
    #[serde(default)]
    pub category: String,
    #[serde(default)]
    pub date: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub project: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotePatch {
    pub content: Option<String>,
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
    pub project: Option<String>,
}

pub struct Store {
    paths: StorePaths,
    data: DataFile,
    device_id: String,
}

impl Store {
    pub fn new(app_data_path: PathBuf) -> Self {
        let paths = StorePaths::new(app_data_path);
        let _ = ensure_layout(&paths);
        let device_id = read_or_create_device_id(&paths).unwrap_or_else(|_| new_device_id());
        let legacy_data = read_json_file::<DataFile>(&paths.legacy_data_file).map(|data| sanitize_data(data, &device_id));
        let data = read_data_files(&paths, legacy_data.as_ref(), &device_id);
        if write_storage_files(&paths, &data).is_ok() && legacy_data.is_some() {
            let _ = fs::remove_file(&paths.legacy_data_file);
        }
        Self { paths, data, device_id }
    }

    pub fn list_notes(&self, date: Option<String>) -> Vec<Note> {
        let wanted_date = sanitize_date_or_today(date.unwrap_or_default());
        let mut notes: Vec<Note> = self
            .data
            .notes
            .iter()
            .filter(|note| note.date == wanted_date && note.deleted_at.is_none())
            .cloned()
            .collect();
        notes.sort_by(|left, right| left.created_at.cmp(&right.created_at));
        notes
    }

    pub fn add_note(&mut self, input: NoteInput) -> Result<Note, String> {
        let content = clean_string(input.content).ok_or_else(|| "事项内容不能为空".to_string())?;
        let timestamp = now_iso();
        let (project, tags) = derive_note_metadata(&content, input.project, input.tags);
        let note = Note {
            id: Uuid::new_v4().to_string(),
            content,
            category: normalize_category(&input.category),
            date: sanitize_date_or_today(input.date),
            tags,
            project,
            created_at: timestamp.clone(),
            updated_at: timestamp,
            deleted_at: None,
            revision: default_revision(),
            updated_by: self.device_id.clone(),
        };
        self.data.notes.push(note.clone());
        self.persist()?;
        self.append_note_change("note_created", &note)?;
        Ok(note)
    }

    pub fn update_note(&mut self, id: String, patch: NotePatch) -> Result<Note, String> {
        let index = self
            .data
            .notes
            .iter()
            .position(|item| item.id == id && item.deleted_at.is_none())
            .ok_or_else(|| "事项不存在".to_string())?;

        let content_changed = patch.content.is_some();
        let project_changed = patch.project.is_some();
        let tags_changed = patch.tags.is_some();
        let project_patch = patch.project.unwrap_or_default();
        let tags_patch = patch.tags.unwrap_or_default();
        let parsed_tags = patch.content.as_deref().map(parse_leading_tags).unwrap_or_default();

        {
            let note = &mut self.data.notes[index];
            if let Some(content) = patch.content {
                note.content = clean_string(content).ok_or_else(|| "事项内容不能为空".to_string())?;
            }
            if let Some(category) = patch.category {
                note.category = normalize_category(&category);
            }
            if project_changed || tags_changed {
                let project_input = if project_changed { project_patch } else { note.project.clone() };
                let tags_input = if tags_changed { tags_patch } else { note.tags.clone() };
                let (project, tags) = derive_note_metadata(&note.content, project_input, tags_input);
                note.project = project;
                note.tags = tags;
            } else if content_changed && !parsed_tags.is_empty() {
                note.project = parsed_tags[0].clone();
                note.tags = parsed_tags;
            }
            note.revision = note.revision.saturating_add(1).max(default_revision() + 1);
            note.updated_at = now_iso();
            note.updated_by = self.device_id.clone();
        }

        let updated = self.data.notes[index].clone();
        self.persist()?;
        self.append_note_change("note_updated", &updated)?;
        Ok(updated)
    }

    pub fn delete_note(&mut self, id: String) -> Result<bool, String> {
        let Some(index) = self.data.notes.iter().position(|note| note.id == id && note.deleted_at.is_none()) else {
            return Ok(false);
        };
        {
            let note = &mut self.data.notes[index];
            let timestamp = now_iso();
            note.deleted_at = Some(timestamp.clone());
            note.updated_at = timestamp;
            note.revision = note.revision.saturating_add(1).max(default_revision() + 1);
            note.updated_by = self.device_id.clone();
        }
        let deleted = self.data.notes[index].clone();
        self.persist()?;
        self.append_note_change("note_deleted", &deleted)?;
        Ok(true)
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
        self.data = sanitize_data(self.data.clone(), &self.device_id);
        write_storage_files(&self.paths, &self.data)
    }

    fn append_note_change(&self, operation: &str, note: &Note) -> Result<(), String> {
        append_change_record(
            &self.paths,
            &self.device_id,
            ChangeRecord {
                entity_type: "note".to_string(),
                entity_id: note.id.clone(),
                operation: operation.to_string(),
                revision: note.revision,
                changed_at: now_iso(),
            },
        )
    }
}

impl StorePaths {
    fn new(app_data_path: PathBuf) -> Self {
        let app_dir = normalize_app_data_dir(app_data_path);
        let sync_data_dir = app_dir.join("sync-data");
        let local_data_dir = app_dir.join("local-data");
        let sync_settings_dir = sync_data_dir.join("settings");
        Self {
            notes_dir: sync_data_dir.join("notes"),
            daily_results_dir: sync_data_dir.join("results").join("daily"),
            changes_dir: sync_data_dir.join("changes"),
            local_cache_dir: local_data_dir.join("cache"),
            legacy_data_file: app_dir.join("data.json"),
            ai_settings_file: sync_settings_dir.join("ai.json"),
            reminder_settings_file: sync_settings_dir.join("reminder.json"),
            secrets_file: local_data_dir.join("secrets.json"),
            device_file: local_data_dir.join("device.json"),
            sync_settings_dir,
            local_data_dir,
            app_dir,
        }
    }
}

fn normalize_app_data_dir(path: PathBuf) -> PathBuf {
    if path.file_name().and_then(|name| name.to_str()) == Some("data.json") {
        path.parent().map(Path::to_path_buf).unwrap_or(path)
    } else {
        path
    }
}

fn default_schema_version() -> u32 {
    1
}

fn default_revision() -> u32 {
    1
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

fn ensure_layout(paths: &StorePaths) -> Result<(), String> {
    for directory in [
        &paths.app_dir,
        &paths.notes_dir,
        &paths.daily_results_dir,
        &paths.sync_settings_dir,
        &paths.changes_dir,
        &paths.local_data_dir,
        &paths.local_cache_dir,
    ] {
        fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn read_or_create_device_id(paths: &StorePaths) -> Result<String, String> {
    let device_id = read_json_file::<DeviceFile>(&paths.device_file)
        .and_then(|file| clean_string(file.device_id))
        .unwrap_or_else(new_device_id);
    write_json_file(
        &paths.device_file,
        &DeviceFile {
            schema_version: default_schema_version(),
            device_id: device_id.clone(),
        },
    )?;
    Ok(device_id)
}

fn new_device_id() -> String {
    format!("device_{}", Uuid::new_v4())
}

fn read_data_files(paths: &StorePaths, legacy_data: Option<&DataFile>, device_id: &str) -> DataFile {
    let fallback = legacy_data.cloned().unwrap_or_else(default_data);
    let settings = read_settings(paths, &fallback.settings);
    let (split_notes, has_note_files) = read_note_files(paths);
    let notes = if !has_note_files && !fallback.notes.is_empty() {
        fallback.notes
    } else {
        split_notes
    };
    sanitize_data(DataFile { notes, settings }, device_id)
}

fn read_settings(paths: &StorePaths, fallback: &Settings) -> Settings {
    let ai_settings = read_json_file::<AiSettingsFile>(&paths.ai_settings_file).unwrap_or_else(|| AiSettingsFile {
        schema_version: default_schema_version(),
        api_base_url: fallback.api_base_url.clone(),
        model: fallback.model.clone(),
    });
    let reminder_settings = read_json_file::<ReminderSettingsFile>(&paths.reminder_settings_file).unwrap_or_else(|| ReminderSettingsFile {
        schema_version: default_schema_version(),
        reminder_time: fallback.reminder_time.clone(),
    });
    let secrets = read_json_file::<SecretsFile>(&paths.secrets_file).unwrap_or_else(|| SecretsFile {
        schema_version: default_schema_version(),
        api_key: fallback.api_key.clone(),
    });

    sanitize_settings(Settings {
        api_base_url: ai_settings.api_base_url,
        api_key: secrets.api_key,
        model: ai_settings.model,
        reminder_time: reminder_settings.reminder_time,
    })
}

fn read_note_files(paths: &StorePaths) -> (Vec<Note>, bool) {
    let mut notes = Vec::new();
    let mut has_note_files = false;
    let entries = match fs::read_dir(&paths.notes_dir) {
        Ok(entries) => entries,
        Err(_) => return (notes, has_note_files),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        has_note_files = true;
        if let Some(day_file) = read_json_file::<NoteDayFile>(&path) {
            notes.extend(day_file.notes);
        }
    }
    (notes, has_note_files)
}

fn write_storage_files(paths: &StorePaths, data: &DataFile) -> Result<(), String> {
    ensure_layout(paths)?;
    write_settings_files(paths, &data.settings)?;
    write_note_files(paths, &data.notes)
}

fn write_settings_files(paths: &StorePaths, settings: &Settings) -> Result<(), String> {
    write_json_file(
        &paths.ai_settings_file,
        &AiSettingsFile {
            schema_version: default_schema_version(),
            api_base_url: settings.api_base_url.clone(),
            model: settings.model.clone(),
        },
    )?;
    write_json_file(
        &paths.reminder_settings_file,
        &ReminderSettingsFile {
            schema_version: default_schema_version(),
            reminder_time: settings.reminder_time.clone(),
        },
    )?;
    write_json_file(
        &paths.secrets_file,
        &SecretsFile {
            schema_version: default_schema_version(),
            api_key: settings.api_key.clone(),
        },
    )
}

fn write_note_files(paths: &StorePaths, notes: &[Note]) -> Result<(), String> {
    fs::create_dir_all(&paths.notes_dir).map_err(|error| error.to_string())?;
    let mut notes_by_date: BTreeMap<String, Vec<Note>> = BTreeMap::new();
    for note in notes.iter().cloned() {
        notes_by_date.entry(note.date.clone()).or_default().push(note);
    }

    let mut dates: BTreeSet<String> = notes_by_date.keys().cloned().collect();
    if let Ok(entries) = fs::read_dir(&paths.notes_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            if let Some(stem) = path.file_stem().and_then(|value| value.to_str()) {
                if is_date_key(stem) {
                    dates.insert(stem.to_string());
                }
            }
        }
    }

    for date in dates {
        let mut day_notes = notes_by_date.remove(&date).unwrap_or_default();
        day_notes.sort_by(|left, right| left.created_at.cmp(&right.created_at));
        write_json_file(
            &paths.notes_dir.join(format!("{date}.json")),
            &NoteDayFile {
                schema_version: default_schema_version(),
                date,
                notes: day_notes,
            },
        )?;
    }
    Ok(())
}

fn append_change_record(paths: &StorePaths, device_id: &str, record: ChangeRecord) -> Result<(), String> {
    let month = month_key_from_iso(&record.changed_at).unwrap_or_else(to_month_key);
    let change_dir = paths.changes_dir.join(device_id);
    fs::create_dir_all(&change_dir).map_err(|error| error.to_string())?;
    let line = serde_json::to_string(&record).map_err(|error| error.to_string())? + "\n";
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(change_dir.join(format!("{month}.jsonl")))
        .map_err(|error| error.to_string())?;
    file.write_all(line.as_bytes()).map_err(|error| error.to_string())
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

fn sanitize_data(input: DataFile, device_id: &str) -> DataFile {
    let mut data = default_data();
    data.notes = input
        .notes
        .into_iter()
        .filter_map(|note| {
            let content = clean_string(note.content)?;
            let (project, tags) = derive_note_metadata(&content, note.project, note.tags);
            Some(Note {
                id: clean_string(note.id).unwrap_or_else(|| Uuid::new_v4().to_string()),
                content,
                category: normalize_category(&note.category),
                date: sanitize_date_or_today(note.date),
                tags,
                project,
                created_at: clean_string(note.created_at).unwrap_or_else(now_iso),
                updated_at: clean_string(note.updated_at).unwrap_or_else(now_iso),
                deleted_at: clean_optional_string(note.deleted_at),
                revision: note.revision.max(default_revision()),
                updated_by: clean_string(note.updated_by).unwrap_or_else(|| device_id.to_string()),
            })
        })
        .collect();
    data.settings = sanitize_settings(input.settings);
    data
}

fn read_json_file<T>(file_path: &Path) -> Option<T>
where
    T: DeserializeOwned,
{
    if !file_path.exists() {
        return None;
    }
    match fs::read_to_string(file_path)
        .ok()
        .and_then(|text| serde_json::from_str::<T>(&text).ok())
    {
        Some(data) => Some(data),
        None => {
            let extension = file_path.extension().and_then(|value| value.to_str()).unwrap_or("json");
            let broken_path = file_path.with_extension(format!("{extension}.broken-{}", Utc::now().timestamp_millis()));
            let _ = fs::rename(file_path, broken_path);
            None
        }
    }
}

fn write_json_file<T>(file_path: &Path, data: &T) -> Result<(), String>
where
    T: Serialize,
{
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let temp_path = temp_json_path(file_path);
    let text = serde_json::to_string_pretty(data).map_err(|error| error.to_string())? + "\n";
    let mut file = File::create(&temp_path).map_err(|error| error.to_string())?;
    file.write_all(text.as_bytes()).map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
    drop(file);
    fs::rename(&temp_path, file_path).map_err(|error| {
        let _ = fs::remove_file(&temp_path);
        error.to_string()
    })
}

fn temp_json_path(file_path: &Path) -> PathBuf {
    let extension = file_path.extension().and_then(|value| value.to_str()).unwrap_or("json");
    file_path.with_extension(format!("{extension}.tmp"))
}

fn derive_note_metadata(content: &str, project: String, tags: Vec<String>) -> (String, Vec<String>) {
    let mut cleaned_tags = sanitize_tags(tags);
    let parsed_tags = parse_leading_tags(content);
    if cleaned_tags.is_empty() {
        cleaned_tags = parsed_tags;
    }

    let cleaned_project = clean_project(project).or_else(|| cleaned_tags.first().cloned()).unwrap_or_default();
    if !cleaned_project.is_empty() && !cleaned_tags.iter().any(|tag| tag == &cleaned_project) {
        cleaned_tags.insert(0, cleaned_project.clone());
    }
    (cleaned_project, cleaned_tags)
}

fn parse_leading_tags(content: &str) -> Vec<String> {
    let mut tags = Vec::new();
    for token in content.split_whitespace() {
        let Some(raw_tag) = token.strip_prefix('#') else {
            break;
        };
        let Some(tag) = clean_project(raw_tag.to_string()) else {
            break;
        };
        if !tags.iter().any(|item| item == &tag) {
            tags.push(tag);
        }
    }
    tags
}

fn sanitize_tags(tags: Vec<String>) -> Vec<String> {
    let mut cleaned = Vec::new();
    for tag in tags {
        if let Some(value) = clean_project(tag) {
            if !cleaned.iter().any(|item| item == &value) {
                cleaned.push(value);
            }
        }
    }
    cleaned
}

fn clean_project(value: String) -> Option<String> {
    clean_string(value.trim_start_matches('#').to_string())
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

fn clean_optional_string(value: Option<String>) -> Option<String> {
    value.and_then(clean_string)
}

fn is_date_key(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() == 10
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes[..4].iter().all(u8::is_ascii_digit)
        && bytes[5..7].iter().all(u8::is_ascii_digit)
        && bytes[8..].iter().all(u8::is_ascii_digit)
}

fn sanitize_date_or_today(value: String) -> String {
    let trimmed = value.trim().to_string();
    if is_date_key(&trimmed) {
        trimmed
    } else {
        to_date_key()
    }
}

fn month_key_from_iso(value: &str) -> Option<String> {
    let prefix = value.get(0..7)?;
    if prefix.len() == 7 && prefix.as_bytes()[4] == b'-' {
        Some(prefix.to_string())
    } else {
        None
    }
}

pub fn to_date_key() -> String {
    let now = Local::now();
    format!("{:04}-{:02}-{:02}", now.year(), now.month(), now.day())
}

fn to_month_key() -> String {
    let now = Local::now();
    format!("{:04}-{:02}", now.year(), now.month())
}

pub fn now_iso() -> String {
    Utc::now().to_rfc3339()
}
