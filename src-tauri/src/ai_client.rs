use crate::store::{CategorySummary, Note, OrganizeResult, ProjectSummary, Settings};
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawResult {
    #[serde(default)]
    daily_text: String,
    #[serde(default)]
    category_summaries: Vec<CategorySummary>,
    #[serde(default)]
    project_summaries: Vec<ProjectSummary>,
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
            { "role": "user", "content": build_prompt(&settings, &notes) }
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
    normalize_result(raw, &notes)
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

fn normalize_result(raw: RawResult, notes: &[Note]) -> Result<OrganizeResult, String> {
    let category_summaries = raw
        .category_summaries
        .into_iter()
        .map(|item| CategorySummary {
            category: item.category.trim().to_string(),
            summary: item.summary.trim().to_string(),
        })
        .filter(|item| !item.category.is_empty() && !item.summary.is_empty())
        .collect::<Vec<_>>();
    let mut project_summaries = raw
        .project_summaries
        .into_iter()
        .map(|item| ProjectSummary {
            project: item.project.trim().to_string(),
            summary: item.summary.trim().to_string(),
        })
        .filter(|item| !item.project.is_empty() && !item.summary.is_empty())
        .collect::<Vec<_>>();
    sort_projects_by_note_order(&mut project_summaries, notes);
    let daily_text = raw.daily_text.trim().to_string();
    if daily_text.is_empty() {
        return Err("AI 返回内容缺少日报文本".to_string());
    }
    let tomorrow_plan = raw
        .tomorrow_plan
        .into_iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .collect();
    Ok(OrganizeResult {
        daily_text,
        category_summaries,
        project_summaries,
        tomorrow_plan,
    })
}

fn sort_projects_by_note_order(project_summaries: &mut [ProjectSummary], notes: &[Note]) {
    let project_order = note_project_order(notes);
    project_summaries.sort_by_key(|item| {
        project_order
            .iter()
            .position(|project| project == &item.project)
            .unwrap_or(usize::MAX)
    });
}

fn note_project_order(notes: &[Note]) -> Vec<String> {
    let mut projects = Vec::new();
    for note in notes {
        if note.project.trim().is_empty() {
            continue;
        }
        if !projects.iter().any(|project| project == &note.project) {
            projects.push(note.project.clone());
        }
    }
    projects
}

fn build_prompt(settings: &Settings, notes: &[Note]) -> String {
    let project_order = note_project_order(notes);
    let daily_template = prompt_value(&settings.daily_template, "今日完成\n1. ...\n\n明日计划\n1. ...");
    let project_rules = prompt_value(&settings.project_rules, "#项目名 优先，其余由 AI 自动识别");
    let note_lines = notes
        .iter()
        .enumerate()
        .map(|(index, note)| {
            let category = if note.category.trim().is_empty() {
                "未分类".to_string()
            } else {
                note.category.trim().to_string()
            };
            let project = if note.project.trim().is_empty() { "未指定" } else { note.project.trim() };
            let tags = if note.tags.is_empty() { "无".to_string() } else { note.tags.join("、") };
            format!(
                "{}. 项目={}；标签={}；分类={}；revision={}；内容={}",
                index + 1,
                project,
                tags,
                category,
                note.revision,
                note.content
            )
        })
        .collect::<Vec<_>>()
        .join("\n");

    let categories = if settings.categories.is_empty() {
        vec!["未分类".to_string()]
    } else {
        settings.categories.clone()
    };

    [
        "你是日报整理助手。请根据用户当天零散工作事项，整理结构化日报。".to_string(),
        "日报模板：".to_string(),
        daily_template,
        "项目识别规则：".to_string(),
        project_rules,
        "分类整理要求：".to_string(),
        format!("- 工作类型优先从这些分类选择：{}", categories.join("、")),
        "- categorySummaries 每项包含 category 和 summary。".to_string(),
        "项目整理要求：".to_string(),
        format!("- 优先按用户项目线索顺序整理：{}", if project_order.is_empty() { "无".to_string() } else { project_order.join("、") }),
        "- projectSummaries 每项包含 project 和 summary。".to_string(),
        "输出 JSON，不输出 Markdown。".to_string(),
        "JSON 字段：dailyText 字符串；categorySummaries 数组；projectSummaries 数组；tomorrowPlan 字符串数组。".to_string(),
        "当天未删除事项：".to_string(),
        if note_lines.is_empty() { "无事项".to_string() } else { note_lines },
    ]
    .join("\n")
}

fn prompt_value(value: &str, fallback: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        fallback.to_string()
    } else {
        trimmed.to_string()
    }
}
