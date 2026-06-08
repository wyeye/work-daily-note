# AGENTS.md

适用范围：本项目根目录及其子目录。

## 项目定位

1. 本项目是 Win11 Tauri 桌面便签：记录零散工作事项，并生成可复制到禅道的日报文本。
2. 应用只生成文本并复制到剪贴板，不自动登录禅道，不自动提交禅道。
3. AI 使用 OpenAI 兼容接口，接口地址、API Key、模型名由用户在本机配置。

## Node.js 环境

当前开发环境：

- Node.js 路径：`/root/.nvm/versions/node/v24.15.0/bin/node`
- Node.js 版本：`v24.15.0`
- npm 路径：`/root/.nvm/versions/node/v24.15.0/bin/npm`
- npm 版本：`11.12.1`

约定：

1. 优先使用上述 nvm Node.js 环境开发。
2. `package.json` 完成后，在 `engines.node` 记录支持版本。
3. 升级 Node.js 或 npm 后，同步更新本节。

4. 开发运行使用 `npm run tauri:dev`；Windows 打包使用 `npm run tauri:build`。

## 国内源配置

项目根目录使用 `.npmrc` 固定国内源：

```ini
registry=https://registry.npmmirror.com/
```

约定：

1. 安装 Node 依赖优先使用项目 `.npmrc`。
2. 不在 `.npmrc` 写入 token、账号或私有源密钥。
3. 如需临时切换源，只在本机环境变量或用户级 npm 配置处理，不提交真实凭据。

## 开发规范

1. 使用 Tauri + Rust + 原生 HTML/CSS/JS，默认不引入前端框架。
2. 保持模块职责清晰：Rust 负责窗口、托盘、定时、存储、剪贴板和 AI 请求；渲染层负责界面交互。
3. 本地数据使用 Tauri 应用数据目录下的 JSON 文件保存。
4. 不把真实 API Key、token、密码、密钥写入仓库、日志或文档示例。
5. 修改功能时同步更新 `README.md` 或 `docs/` 中对应说明。
6. Node 项目不新增额外测试类；需要验证时使用 `/tmp` 下的 `python3` 临时脚本，临时脚本不提交。
7. 生成文件、打包产物、日志、临时文件不进仓库。
8. 提交 commit 使用中文信息；提交时忽略 `docs/superpowers/`。

## 验证要求

提交前至少执行：

```bash
npm run check
git diff --check
git status --short
```

涉及桌面行为时，还要在 Win11 上手动验证：

- 应用可启动。
- 可新增、编辑、删除事项。
- 到提醒时间可弹出整理窗口。
- AI 整理可生成禅道文本。
- 一键复制可写入剪贴板。
- 关闭窗口后托盘仍可用。

## Git 规范

1. 每个独立变更单独提交。
2. 不提交 `node_modules/`、`dist/`、`out/`、`.env*`、日志和 `docs/superpowers/`。
3. 提交前检查暂存内容，确认没有真实密钥。

## 版本与升级

1. 升级版本号时统一使用：

```bash
npm run version:set 0.1.2
```

该命令会同步更新：

- `package.json`
- `package-lock.json`
- `src-tauri/Cargo.toml`
- `src-tauri/Cargo.lock`
- `src-tauri/tauri.conf.json`

2. 发布新版本时使用 tag 触发 GitHub Actions Windows 打包：

```bash
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
git commit -m "升级版本到0.1.2"
git tag v0.1.2
git push
git push origin v0.1.2
```

3. Tauri `identifier` 必须保持不变：`com.wyeye.work-daily-note`。版本号升高后，用户运行新版安装包即可覆盖升级旧版。

4. 推送到 `master` 会自动构建 Windows 安装包；推送 `v*` tag 会构建带 tag 名称的 artifact。
