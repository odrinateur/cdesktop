![](https://github.com/cdesktop-ai/cdesktop/raw/main/packages/public/cdesktop-hero.png)

<h1 align="center">cdesktop</h1>

<p align="center">开源版 Claude Code Desktop。</p>

<p align="center">
  <a href="./README.md">English</a> | <strong>简体中文</strong>
</p>
<!-- <p align="center">
  <a href="https://www.npmjs.com/package/cdesktop"><img alt="npm" src="https://img.shields.io/npm/v/cdesktop?style=flat-square" /></a>
  <a href="https://github.com/cdesktop-ai/cdesktop/blob/main/.github/workflows/publish.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/cdesktop-ai/cdesktop/.github%2Fworkflows%2Fpublish.yml" /></a>
  <a href="https://deepwiki.com/cdesktop-ai/cdesktop"><img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki"></a>
</p> -->

<p align="center">
  <video src="https://github.com/user-attachments/assets/d57bb67f-185b-4e19-b386-64406578c8df" controls></video>
</p>

## 赞助商

想在这里展示你的 Logo？[联系我们](mailto:onlylakehouse@163.com)。

## 概览

cdesktop 是 Anthropic [Claude Code Desktop](https://code.claude.com/docs/en/desktop-quickstart) 的开源替代品。它是 5 款编码 agent —— Claude Code、Codex、Gemini CLI、OpenCode、Hermes —— 的 Web UI,在本地将各 CLI 作为子进程运行,代码、对话记录和 worktree 全部保存在本地磁盘。

整体布局参考了官方桌面端的 Code 标签:左侧会话边栏、中间集成终端与 diff 查看器的对话区、右侧 plan / files / 应用预览面板。与官方应用不同的是,cdesktop 完全本地运行,与 agent、模型供应商均解耦 —— 可以挑 agent、从内置供应商目录里选一个,也可以接入自定义端点。

**2026 年 5 月 7 日起,Anthropic Claude Code Desktop 已不再接受第三方模型名称。** cdesktop 对第三方供应商与模型提供完整支持。

- **5 款编码 agent 一个 UI** —— Claude Code、Codex、Gemini、OpenCode、Hermes;每个会话独立选 agent,各 agent 对话记录互不干扰
- **一键接入任意供应商** —— 内置 20+ 预设(OpenRouter、AWS Bedrock、DeepSeek、Kimi、ModelScope、MiniMax、Nvidia……),或自行配置 `ANTHROPIC_BASE_URL`;每个会话可独立切换供应商并调节推理强度
- **Agent 团队** —— 在工作区内派生协作者,分工执行;每位协作者可独立选 agent 与模型;主 agent 通过 `npx cdesktop team spawn` 调度
- **多会话并排执行** —— 工作区可拆分为最多 4 个 cell,任意会话可拖拽到新 cell
- **会话瞬时切换** —— 切换线程无需重载,对话状态保持在原位
- **Routines** —— 定时执行 agent 任务(每小时、每天、工作日、每周),或保存模板手动触发;每次运行产生独立工作区,可随时打开查看
- **可选 Git worktree** —— 按项目开启,为每个会话分配独立分支;也可直接在主目录工作,非 Git 目录同样支持
- **审阅 diff 并行内联评论** —— 直接在 UI 里向 agent 反馈
- **应用内预览** —— 内置浏览器,支持 DevTools、Inspect、设备模拟
- **创建并合并 PR** —— 自动生成 PR 描述,在 GitHub 上审阅并合并
- **多语言界面** —— 内置英文、简体中文、繁体中文、西班牙文、法文、日文、韩文
- **手机可用** —— 完全响应式 UI,在任何设备上查看进度、审阅 diff、追加指令
- **浏览器即开即用** —— `npx cdesktop` 启动后在任意现代浏览器打开;Tauri 桌面版已接好但尚未发布

> **Beta 软件。** 预期会遇到 bug 与粗糙之处,欢迎 [提交 issue](https://github.com/cdesktop-ai/cdesktop/issues)。

## 安装

```bash
npx cdesktop
```

## 路线图

- **桌面端构建** —— 打包 macOS、Windows、Linux 的 Tauri 安装包
- **语音输入** —— 按住说话,免动手发送指令
- **文件面板** —— 浏览整个项目目录树,不再只看会话工作目录
- **性能优化** —— 更快冷启动、更小打包体积、更低空闲 CPU 占用
- **Skill 浏览器** —— 应用内发现并一键安装 slash 命令与 skill

## 反馈

Bug 与功能请求请提交到 [cdesktop-ai/cdesktop/issues](https://github.com/cdesktop-ai/cdesktop/issues)。

## 贡献

提 PR 前请先在 [GitHub Discussions](https://github.com/cdesktop-ai/cdesktop/discussions) 讨论想法或改动,便于对齐实现细节与路线图。

## 开发

### 环境要求

- [Rust](https://rustup.rs/)(最新稳定版)
- [Node.js](https://nodejs.org/)(>=20)
- [pnpm](https://pnpm.io/)(>=8)

额外开发工具:
```bash
cargo install cargo-watch
cargo install sqlx-cli
```

安装依赖:
```bash
pnpm i
```

### 启动开发服务器

```bash
pnpm run dev
```

会同时启动后端和 web 应用。空白 DB 会从 `dev_assets_seed` 目录拷贝。

### 构建 web 应用

只构建 web 应用:

```bash
cd packages/local-web
pnpm run build
```

### 从源码构建(macOS)

1. 运行 `./local-build.sh`
2. 通过 `cd npx-cli && node bin/cli.js` 测试

### 环境变量

可在构建或运行时配置以下变量:

| 变量 | 类型 | 默认值 | 说明 |
|----------|------|---------|-------------|
| `POSTHOG_API_KEY` | 构建时 | 空 | PostHog analytics API key(留空则禁用) |
| `POSTHOG_API_ENDPOINT` | 构建时 | 空 | PostHog analytics endpoint(留空则禁用) |
| `PORT` | 运行时 | 自动分配 | **生产**:server 端口。**开发**:前端端口(后端使用 PORT+1) |
| `BACKEND_PORT` | 运行时 | `0`(自动分配) | 后端端口(仅开发模式,覆盖 PORT+1) |
| `FRONTEND_PORT` | 运行时 | `3000` | 前端 dev server 端口(仅开发模式,覆盖 PORT) |
| `HOST` | 运行时 | `127.0.0.1` | 后端 host |
| `MCP_HOST` | 运行时 | 同 `HOST` | MCP server 连接 host(`HOST=0.0.0.0` 在 Windows 时用 `127.0.0.1`) |
| `MCP_PORT` | 运行时 | 同 `BACKEND_PORT` | MCP server 连接端口 |
| `DISABLE_WORKTREE_CLEANUP` | 运行时 | 未设置 | 关闭所有 git worktree 清理(含孤儿与过期工作区,用于调试) |
| `CDT_ALLOWED_ORIGINS` | 运行时 | 未设置 | 允许调用后端 API 的来源,逗号分隔(如 `https://my-cdesktop.example.com`) |

**构建时变量**必须在 `pnpm run build` 时设置。**运行时变量**在应用启动时读取。

#### 反向代理 / 自定义域名自托管

将 cdesktop 放在反向代理(nginx、Caddy、Traefik 等)之后或挂在自定义域名上时,必须设置 `CDT_ALLOWED_ORIGINS`。否则浏览器的 Origin header 与后端期望的 host 不匹配,API 请求会被拒为 403 Forbidden。

值是前端可访问的完整 origin URL:

```bash
# 单个 origin
CDT_ALLOWED_ORIGINS=https://cdesktop.example.com

# 多个 origin(逗号分隔)
CDT_ALLOWED_ORIGINS=https://cdesktop.example.com,https://cdesktop-staging.example.com
```

### 远程部署

将 cdesktop 跑在远程服务器(systemctl、Docker、云主机等)时,可以配置编辑器通过 SSH 打开项目:

1. **通过隧道访问**:使用 Cloudflare Tunnel、ngrok 等暴露 web UI
2. **在设置 → Editor Integration 配置 Remote SSH**:
   - **Remote SSH Host** 填服务器 hostname 或 IP
   - **Remote SSH User** 填 SSH 用户名(可选)
3. **前置条件**:
   - 本地能 SSH 到远程服务器
   - 已配置 SSH key(免密登录)
   - VSCode Remote-SSH 扩展

配置完成后,"Open in VSCode" 按钮会生成 `vscode://vscode-remote/ssh-remote+user@host/path` 这样的 URL,在本地编辑器中打开并连接到远程服务器。

详细配置请参考[文档](https://cdesktop.ai)。

## 许可证

Apache License 2.0 —— 见 [`LICENSE`](https://github.com/cdesktop-ai/cdesktop/blob/main/LICENSE)。

cdesktop 衍生自 [BloopAI/vibe-kanban](https://github.com/BloopAI/vibe-kanban)(Apache 2.0)。供应商预设目录衍生自 [farion1231/cc-switch](https://github.com/farion1231/cc-switch)(MIT)。完整归属信息见 [`NOTICE`](https://github.com/cdesktop-ai/cdesktop/blob/main/NOTICE)。
