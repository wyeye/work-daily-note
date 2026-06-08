# Work Daily Note

Win11 桌面便签，用于记录零散工作事项，并生成可复制到禅道的日报文本。

## 功能

- 快速记录当天事项。
- 今日事项列表查看、编辑、删除；删除采用软删除，默认不显示已删除事项。
- 每天 18:00 默认弹出整理窗口。
- 调用 OpenAI 兼容接口生成结构化日报，包含日报文本、分类汇总和项目汇总。
- 一键复制日报文本，手动粘贴到目标系统。
- 桌面窗口、托盘和 Windows 安装包使用自定义应用图标。
- 本地 JSON 数据保存在 Tauri 应用数据目录，按 `sync-data/` 与 `local-data/` 分层存储。
- 事项、整理结果、AI 地址、模型名和提醒时间写入 `sync-data/`；事项与结果变更写入 `sync-data/changes/<deviceId>/`。
- API Key 只写入 `local-data/secrets.json`，本机设备标识写入 `local-data/device.json`。

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

## 隐私说明

只有点击“AI 整理今日事项”时，应用才会把当天事项发送到你配置的 OpenAI 兼容接口。API Key 只保存在本机 Tauri 应用数据目录的 `local-data/secrets.json`，不写入仓库，不输出到日志。`sync-data/` 可用于文件同步工具同步事项和非密钥设置。
