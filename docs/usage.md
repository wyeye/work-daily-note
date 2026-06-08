# 使用说明

## 1. 配置 AI

打开“设置”页，填写：

- OpenAI 兼容接口地址，例如 `https://api.example.com/v1`
- API Key
- 模型名，例如 `gpt-4.1-mini`
- 提醒时间，默认 `18:00`

保存后，新的提醒时间立即生效。API Key 只保存在本机应用数据目录的 `local-data/secrets.json`。

设置页默认只展示 AI 地址、API Key、模型名和提醒时间。点击“高级设置”后，可以编辑日报模板、项目识别规则、启动页、Enter 行为和提醒策略；API Key 默认以密码框隐藏，不完整展示。提醒时间格式异常时会回到 `18:00`。

## 2. 记录事项

打开应用默认进入“记录”页，今日事项以聊天式事项流展示，光标会自动进入底部输入框。输入一句话后按 Enter 保存，Shift + Enter 换行；也可以输入 `#项目名 内容`，应用会识别项目和标签。保存成功后输入框清空并继续聚焦，保存失败时保留原输入。

## 3. 整理日报

到提醒时间后，应用先弹出今日事项确认页。确认页会展示当天事项，点击“开始整理”进入整理页并触发整理，点击“稍后”关闭确认页且不自动整理。也可以从托盘菜单手动打开整理页。

点击“开始整理”，生成结构化日报结果。结果页包含“日报文本”“分类展示”“项目展示”三个页签，默认打开“日报文本”；事项变化后会提示“事项已变化，可重新整理”。日报文本、分类汇总、项目汇总和明日计划会保存到 `sync-data/results/daily/`。

## 4. 复制到目标系统

点击“复制文本”，再手动粘贴到目标系统。应用不自动登录第三方系统，也不自动提交。

## 5. 本地数据

应用数据位于 Tauri 应用数据目录：

- `sync-data/notes/`：按日期保存事项 JSON，包含项目、标签、版本号、本机更新标识和软删除时间。
- `sync-data/settings/`：保存 AI 地址、模型名、提醒时间、日报模板、项目识别规则、启动页、Enter 行为和提醒策略等可同步设置。
- `sync-data/results/daily/`：按日期保存整理结果，包含 `dailyText`、`categorySummaries`、`projectSummaries`、`tomorrowPlan`、来源事项 ID 和 `sourceRevisionHash`。
- `sync-data/changes/<deviceId>/`：按月份追加保存事项创建、更新、删除和结果生成记录。
- `local-data/secrets.json`：只保存 API Key，不放入同步目录。
- `local-data/device.json`：保存本机 `deviceId`，用于写入事项 `updatedBy` 和变更日志目录。
- JSON 写入使用临时文件替换正式文件，减少同步工具读取到不完整文件的概率。

## 6. 运行环境

新版应用使用 Tauri + WebView2。Win11 通常已包含 WebView2 Runtime；缺失时需要安装 Microsoft WebView2 Runtime 后再启动应用。
