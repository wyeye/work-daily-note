use crate::store::{Note, Settings, CATEGORIES};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategorySummary {
    pub category: String,
    pub summary: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizeResult {
    pub category_summaries: Vec<CategorySummary>,
    pub zentao_text: String,
    pub tomorrow_plan: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawResult {
    #[serde(default)]
    category_summaries: Vec<CategorySummary>,
    #[serde(default)]
    zentao_text: String,
    #[serde(default)]
    tomorrow_plan: Vec<String>,
}

pub async fn organize_daily_notes(settings: Settings, notes: Vec<Note>) -> Result<OrganizeResult, String> {
    if notes.is_empty() {
        return Err("今天还没有事项可整理".to_string());
    }
    let url = chat_completions_url(&settings.api_base_url)?;
    let api_key = require_string(&settings.api_key, "请先配置 AI Key")?;
    let model = require_string(&settings.model, "请先配置 AI 模型名")?;

    let body = json!({
        "model": model,
        "temperature": 0.2,
        "messages": [
            { "role": "system", "content": "你只返回合法 JSON。" },
            { "role": "user", "content": build_prompt(&notes) }
        ]
    });

    let response = reqwest::Client::new()
        .post(url)
        .header("authorization", format!("Bearer {}", api_key))
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|error| format!("AI 请求失败：{}", error))?;

    let status = response.status();
    if !status.is_success() {
        let text = response.text().await.unwrap_or_default();
        let preview: String = text.chars().take(160).collect();
        return Err(format!("AI 请求失败：HTTP {} {}", status.as_u16(), preview));
    }

    let payload: Value = response.json().await.map_err(|error| format!("AI 返回内容不是 JSON：{}", error))?;
    let content = payload
        .get("choices")
        .and_then(|choices| choices.get(0))
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .ok_or_else(|| "AI 返回内容缺少 message.content".to_string())?;

    let raw = extract_json_object(content)?;
    normalize_result(raw)
}

fn require_string(value: &str, message: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        Err(message.to_string())
    } else {
        Ok(trimmed.to_string())
    }
}

fn chat_completions_url(base_url: &str) -> Result<String, String> {
    let normalized = require_string(base_url, "请先配置 AI 接口地址")?.trim_end_matches('/').to_string();
    if normalized.ends_with("/chat/completions") {
        Ok(normalized)
    } else {
        Ok(format!("{}/chat/completions", normalized))
    }
}

fn extract_json_object(text: &str) -> Result<RawResult, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("AI 返回内容为空".to_string());
    }
    if let Ok(raw) = serde_json::from_str::<RawResult>(trimmed) {
        return Ok(raw);
    }
    let start = trimmed.find('{').ok_or_else(|| "AI 返回内容不是 JSON".to_string())?;
    let end = trimmed.rfind('}').ok_or_else(|| "AI 返回内容不是 JSON".to_string())?;
    if end <= start {
        return Err("AI 返回内容不是 JSON".to_string());
    }
    serde_json::from_str::<RawResult>(&trimmed[start..=end]).map_err(|_| "AI 返回内容不是 JSON".to_string())
}

fn normalize_result(raw: RawResult) -> Result<OrganizeResult, String> {
    let category_summaries = raw
        .category_summaries
        .into_iter()
        .map(|item| CategorySummary {
            category: item.category.trim().to_string(),
            summary: item.summary.trim().to_string(),
        })
        .filter(|item| !item.category.is_empty() && !item.summary.is_empty())
        .collect::<Vec<_>>();
    let zentao_text = raw.zentao_text.trim().to_string();
    if zentao_text.is_empty() {
        return Err("AI 返回内容缺少禅道文本".to_string());
    }
    let tomorrow_plan = raw
        .tomorrow_plan
        .into_iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .collect();
    Ok(OrganizeResult {
        category_summaries,
        zentao_text,
        tomorrow_plan,
    })
}

fn build_prompt(notes: &[Note]) -> String {
    let note_lines = notes
        .iter()
        .enumerate()
        .map(|(index, note)| {
            let category = if note.category.trim().is_empty() {
                "未分类".to_string()
            } else {
                note.category.trim().to_string()
            };
            format!("{}. 【{}】{}", index + 1, category, note.content)
        })
        .collect::<Vec<_>>()
        .join("\n");

    [
        "你是日报整理助手。请根据用户当天零散工作事项，整理为适合复制到禅道的日报文本。".to_string(),
        "要求：".to_string(),
        "1. 不编造未出现的事实。".to_string(),
        "2. 按工作类型归并，不写流水账。".to_string(),
        "3. 语气客观简洁。".to_string(),
        "4. 输出 JSON，不输出 Markdown。".to_string(),
        format!("5. 工作类型只能从这些分类选择：{}", CATEGORIES.join("、")),
        "JSON 字段：categorySummaries 数组，每项包含 category 和 summary；zentaoText 字符串；tomorrowPlan 字符串数组。".to_string(),
        "".to_string(),
        "当天事项：".to_string(),
        if note_lines.is_empty() { "无事项".to_string() } else { note_lines },
    ]
    .join("\n")
}
