# Work Daily Note

Win11 桌面便签，用于记录零散工作事项，并生成可复制到禅道的日报文本。

## 功能

- 默认进入记录页，可用聊天式输入快速记录当天事项。
- 今日事项列表查看、编辑、删除；删除采用软删除，默认不显示已删除事项。
- 每天 18:00 默认弹出今日事项确认页，可选择开始整理或稍后处理。
- 调用 OpenAI 兼容接口生成结构化日报，包含日报文本、分类汇总和项目汇总。
- 设置页分为基础设置、应用更新和高级设置，API Key 默认隐藏显示。
- 一键复制日报文本，手动粘贴到目标系统。
- 设置页可手动“检查更新”，从 GitHub Releases 读取 `latest.json` 并安装新版。
- 桌面窗口、托盘和 Windows 安装包使用自定义应用图标。
- 本地 JSON 数据保存在 Tauri 应用数据目录，按 `sync-data/` 与 `local-data/` 分层存储。
- 事项、整理结果、AI 地址、模型名、提醒时间和高级偏好写入 `sync-data/`；事项与结果变更写入 `sync-data/changes/<deviceId>/`。
- API Key 只写入 `local-data/secrets.json`，本机设备标识写入 `local-data/device.json`。

## 工作流程

1. 在“记录”页使用聊天式事项流快速输入事项，支持 `#项目名 内容` 识别项目标签。
2. 到提醒时间后先进入今日事项确认页；点击“开始整理”才会进入整理页并触发 AI 整理，点击“稍后”只关闭确认页。
3. 整理页生成“日报文本”“分类展示”“项目展示”三个结果页签，默认展示“日报文本”。
4. 点击“复制文本”后，手动粘贴到目标系统；应用不自动登录第三方系统，也不自动提交。
5. 设置页默认显示 AI 地址、API Key、模型名、提醒时间和应用更新；点击“检查更新”可检测并安装 GitHub Releases 中的新版本。
6. 高级设置收起保存日报模板、项目识别规则、启动页、Enter 行为和提醒策略。

## 技术栈

使用 Tauri + Rust + WebView2，前端为原生 HTML/CSS/JS。

Win11 通常已包含 WebView2 Runtime；缺失时需要先安装 Microsoft WebView2 Runtime。

## 开发运行

```bash
npm install
npm run tauri:dev
```

## 本地检查

```bash
npm run check
cd src-tauri && cargo check
```

## Windows 打包

```bash
npm run tauri:build
```

生成文件位于 `src-tauri/target/release/bundle/`，不提交仓库。Windows 图标资源位于 `src/assets/icons/`，打包使用 `src/assets/icons/app.ico`。

## 自动更新发布

应用使用 Tauri updater 从 GitHub Releases 读取 `latest.json`。首次启用前，需要把本机生成的 Tauri 私钥写入仓库 Secret：

- `TAURI_SIGNING_PRIVATE_KEY`：Tauri updater 私钥内容或私钥文件路径。
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：私钥密码；当前本地生成的私钥未设置密码，可留空。

发布 `v*` tag 后，GitHub Actions 会构建 NSIS 安装包、生成签名文件、生成 `latest.json`，并上传到 GitHub Release。应用设置页点击“检查更新”后会读取：

```text
https://github.com/wyeye/work-daily-note/releases/latest/download/latest.json
```

注意：已经安装的旧版本如果还没有 updater 功能，需要先手动安装一次带 updater 的版本，之后才能应用内检查更新。

## 隐私说明

只有点击“开始整理”时，应用才会把当天事项发送到你配置的 OpenAI 兼容接口。API Key 只保存在本机 Tauri 应用数据目录的 `local-data/secrets.json`，不写入仓库，不输出到日志。`sync-data/` 可用于文件同步工具同步事项和非密钥设置。
