# Work Daily Note

Win11 桌面便签，用于记录零散工作事项，并生成可复制到禅道的日报文本。

## 功能

- 快速记录当天事项。
- 今日事项列表查看、编辑、删除。
- 每天 18:00 默认弹出整理窗口。
- 调用 OpenAI 兼容接口生成禅道文本。
- 一键复制生成结果，手动粘贴到禅道。
- AI 地址、API Key、模型名和提醒时间保存在本机 Tauri 应用数据目录。

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

生成文件位于 `src-tauri/target/release/bundle/`，不提交仓库。

## 隐私说明

只有点击“AI 整理今日事项”时，应用才会把当天事项发送到你配置的 OpenAI 兼容接口。API Key 不写入仓库，不输出到日志。
