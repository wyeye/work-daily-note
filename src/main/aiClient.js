'use strict';

const { CATEGORIES } = require('../shared/categories');

function requireString(value, message) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(message);
  }
  return value.trim();
}

function normalizeBaseUrl(value) {
  const baseUrl = requireString(value, '请先配置 AI 接口地址');
  return baseUrl.replace(/\/+$/, '');
}

function chatCompletionsUrl(baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized.endsWith('/chat/completions')) {
    return normalized;
  }
  return `${normalized}/chat/completions`;
}

function extractJsonObject(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    throw new Error('AI 返回内容为空');
  }
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error('AI 返回内容不是 JSON');
  }
}

function normalizeResult(raw) {
  const categorySummaries = Array.isArray(raw.categorySummaries)
    ? raw.categorySummaries
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        category: String(item.category || '').trim(),
        summary: String(item.summary || '').trim()
      }))
      .filter((item) => item.category && item.summary)
    : [];
  const zentaoText = String(raw.zentaoText || '').trim();
  const tomorrowPlan = Array.isArray(raw.tomorrowPlan)
    ? raw.tomorrowPlan.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  if (!zentaoText) {
    throw new Error('AI 返回内容缺少禅道文本');
  }
  return {
    categorySummaries,
    zentaoText,
    tomorrowPlan
  };
}

function buildPrompt(notes) {
  const noteLines = notes.map((note, index) => {
    const category = note.category ? `【${note.category}】` : '【未分类】';
    return `${index + 1}. ${category}${note.content}`;
  }).join('\n');
  return [
    '你是日报整理助手。请根据用户当天零散工作事项，整理为适合复制到禅道的日报文本。',
    '要求：',
    '1. 不编造未出现的事实。',
    '2. 按工作类型归并，不写流水账。',
    '3. 语气客观简洁。',
    '4. 输出 JSON，不输出 Markdown。',
    `5. 工作类型只能从这些分类选择：${CATEGORIES.join('、')}`,
    'JSON 字段：categorySummaries 数组，每项包含 category 和 summary；zentaoText 字符串；tomorrowPlan 字符串数组。',
    '',
    '当天事项：',
    noteLines || '无事项'
  ].join('\n');
}

async function organizeDailyNotes({ settings, notes }) {
  const url = chatCompletionsUrl(settings && settings.apiBaseUrl);
  const apiKey = requireString(settings && settings.apiKey, '请先配置 AI Key');
  const model = requireString(settings && settings.model, '请先配置 AI 模型名');
  const safeNotes = Array.isArray(notes) ? notes : [];
  if (safeNotes.length === 0) {
    throw new Error('今天还没有事项可整理');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: '你只返回合法 JSON。' },
        { role: 'user', content: buildPrompt(safeNotes) }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI 请求失败：HTTP ${response.status} ${text.slice(0, 160)}`);
  }

  const payload = await response.json();
  const content = payload && payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content;
  return normalizeResult(extractJsonObject(content));
}

module.exports = {
  buildPrompt,
  chatCompletionsUrl,
  extractJsonObject,
  normalizeResult,
  organizeDailyNotes
};
