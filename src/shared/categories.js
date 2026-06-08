'use strict';

const CATEGORIES = Object.freeze([
  '日常沟通与需求确认',
  '问题排查与技术支持',
  '开发与代码调整',
  '测试验证与发布支持',
  '文档、配置与环境维护'
]);

function normalizeCategory(value) {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  return CATEGORIES.includes(trimmed) ? trimmed : '';
}

module.exports = {
  CATEGORIES,
  normalizeCategory
};
