# Tauri 迁移设计

## 目标

将当前 Electron 桌面便签迁移为 Tauri + Rust + WebView2，保留现有业务功能，并显著降低 Windows 打包体积。

## 范围

包含：

- 记录、编辑、删除当天事项。
- 配置 OpenAI 兼容接口地址、API Key、模型名和提醒时间。
- 调用 AI 整理当天事项并生成禅道日报文本。
- 一键复制生成结果到剪贴板。
- 托盘常驻，关闭窗口后隐藏到托盘。
- 到提醒时间显示整理窗口和系统通知。
- Windows 打包改为 Tauri 构建。

不包含：

- 自动登录或提交禅道。
- 多端同步。
- 引入前端框架。
- 复杂历史数据迁移工具。已有 JSON 数据格式保持兼容，必要时由新存储层读取同结构数据。

## 推荐方案

采用 Tauri + Rust + WebView2。

原因：当前前端是原生 HTML/CSS/JS，迁移到 Tauri 可以复用大部分渲染层；Electron 主进程能力改由 Rust 实现，去掉内置 Chromium 后，Windows 安装包预计降到十几 MB 级。

## 架构

- 前端：继续使用 `src/renderer/index.html`、`styles.css`、`app.js`。
- 后端：新增 `src-tauri`，使用 Rust 实现存储、AI 请求、提醒、托盘、窗口和剪贴板。
- 通信：前端通过 `@tauri-apps/api/core` 的 `invoke` 调用 Rust 命令，替代 Electron preload 暴露的 `window.dailyNote`。
- 数据：使用 Tauri app data 目录下的 `data.json` 保存事项和设置，字段沿用现有结构。
- 打包：移除 Electron 打包配置，新增 Tauri dev/build 脚本。

## 命令映射

| 现有 Electron IPC | 新 Tauri 命令 |
|---|---|
| `notes:list` | `list_notes` |
| `notes:add` | `add_note` |
| `notes:update` | `update_note` |
| `notes:delete` | `delete_note` |
| `settings:get` | `get_settings` |
| `settings:save` | `save_settings` |
| `ai:organize` | `organize_daily_notes` |
| `clipboard:write` | `write_clipboard` |
| `window:showOrganizer` | `show_organizer` |

## Rust 模块

- `main.rs`：Tauri 启动、窗口行为、托盘菜单、命令注册、共享状态初始化。
- `store.rs`：数据结构、JSON 读写、事项增删改查、设置读写和字段清洗。
- `ai_client.rs`：OpenAI 兼容接口 URL 处理、请求构造、返回 JSON 解析和结果校验。
- `reminder.rs`：提醒时间解析、下一次触发时间计算、后台定时任务和提醒触发。

## 前端调整

- 将 `window.dailyNote.*` 调用改为本地 JS API 包装函数。
- 包装函数内部使用 Tauri `invoke`。
- 页面结构和样式保持不变。
- 删除 Electron preload 依赖。

## 数据与错误处理

- `data.json` 写入采用临时文件再替换，降低写入中断造成的数据损坏风险。
- 读取损坏 JSON 时，将原文件重命名为带时间戳的 `.broken-*` 文件，并创建默认数据。
- AI 配置缺失、事项为空、请求失败、返回格式错误时返回明确错误文本给前端。
- API Key 只保存在本机数据文件，不写入日志、文档示例或仓库。

## 打包与体积目标

- Windows 使用 Tauri 构建安装包。
- 依赖 Win11 WebView2 运行时。
- 安装包目标为十几 MB 级；实际大小以 `npm run tauri:build` 产物为准。

## 验证标准

- `npm run check` 通过。
- `npm run tauri:dev` 可启动应用。
- `npm run tauri:build` 可生成 Windows 安装包。
- 可新增、编辑、删除事项。
- 可保存 AI 与提醒设置。
- 到提醒时间可弹出整理窗口和通知。
- AI 整理可生成禅道文本。
- 一键复制可写入剪贴板。
- 关闭窗口后托盘仍可用。
