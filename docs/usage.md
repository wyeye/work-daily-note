# 使用说明

## 1. 配置 AI

打开“设置”页，填写：

- OpenAI 兼容接口地址，例如 `https://api.example.com/v1`
- API Key
- 模型名，例如 `gpt-4.1-mini`
- 提醒时间，默认 `18:00`

保存后，新的提醒时间立即生效。API Key 只保存在本机应用数据目录的 `local-data/secrets.json`。

## 2. 记录事项

在“记录”页输入零散事项，按“保存”。分类可以不选，整理时 AI 会按工作类型归并。

## 3. 整理日报

到提醒时间后，应用弹出整理窗口。也可以从托盘菜单手动打开。

点击“AI 整理今日事项”，生成结构化日报结果。日报文本、分类汇总、项目汇总和明日计划会保存到 `sync-data/results/daily/`。

## 4. 录入禅道

点击“复制到剪贴板”，再手动粘贴到目标系统。应用不自动登录第三方系统，也不自动提交。

## 5. 本地数据

应用数据位于 Tauri 应用数据目录：

- `sync-data/notes/`：按日期保存事项 JSON，包含项目、标签、版本号、本机更新标识和软删除时间。
- `sync-data/settings/`：保存 AI 地址、模型名、提醒时间等可同步设置。
- `sync-data/results/daily/`：按日期保存整理结果，包含 `dailyText`、`categorySummaries`、`projectSummaries`、`tomorrowPlan`、来源事项 ID 和 `sourceRevisionHash`。
- `sync-data/changes/<deviceId>/`：按月份追加保存事项创建、更新、删除和结果生成记录。
- `local-data/secrets.json`：只保存 API Key，不放入同步目录。
- `local-data/device.json`：保存本机 `deviceId`，用于写入事项 `updatedBy` 和变更日志目录。
- JSON 写入使用临时文件替换正式文件，减少同步工具读取到不完整文件的概率。

## 6. 运行环境

新版应用使用 Tauri + WebView2。Win11 通常已包含 WebView2 Runtime；缺失时需要安装 Microsoft WebView2 Runtime 后再启动应用。
