# CC Genius

[English README](README.md)

基于 [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) 的 Web 版 Claude 聊天客户端（PWA）。Mac 自托管，iPad 通过 Tailscale 访问，无需 API Key。

![CC Genius](https://img.shields.io/badge/CC_Genius-PWA-blue) ![Next.js](https://img.shields.io/badge/Next.js-16-black) ![License](https://img.shields.io/badge/License-MIT-green)

## 功能特性

- **Claude Code CLI 后端** -- 直接复用 CC 订阅的 OAuth 登录，无需 API Key
- **多轮对话** -- 通过 `--resume` 保持上下文连贯
- **流式输出** -- SSE 实时推送，支持 Markdown + 代码高亮
- **图片和文件上传** -- 图片、PDF、代码文件都能发，CC CLI 会自动读取分析
- **模型切换** -- Sonnet / Opus / Haiku 随意选
- **主题切换** -- 深色/浅色/跟随系统，无闪烁
- **PWA** -- 添加到 iPad 主屏幕，全屏体验，和原生 App 一样
- **响应式布局** -- iPad 横屏双栏，竖屏可折叠侧边栏
- **本地存储** -- IndexedDB 持久化对话记录（按设备独立）

## 架构

```
iPad Safari (PWA)  --Tailscale-->  Mac (Next.js Server)
                                       |
                                       |-- SSE 流 <--> Claude Code CLI
                                       |                (OAuth via ~/.claude)
                                       +-- IndexedDB (客户端)
```

## 快速开始

### 前置条件

- macOS 上已安装并登录 [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)
- Node.js 18+
- [Tailscale](https://tailscale.com/)（iPad 访问需要）

### 安装与运行

```bash
git clone https://github.com/AliceLJY/cc-genius.git
cd cc-genius
npm install
npm run build
npx next start --port 3088 --hostname 0.0.0.0
```

### 访问地址

- **Mac**: http://localhost:3088
- **iPad**: `http://<你的Tailscale IP>:3088`（通过 `tailscale ip -4` 查看）

### 添加到 iPad 主屏幕

1. 在 Safari 中打开上面的地址
2. 点击顶部 **分享按钮**（方框+箭头）
3. 选择 **"添加到主屏幕"**
4. 全屏使用，没有地址栏

### 改完代码后重建

```bash
./scripts/rebuild.sh
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router) + Tailwind CSS 4 |
| 后端 | Claude Code CLI (`claude -p --output-format stream-json`) |
| 流式传输 | Server-Sent Events (SSE) |
| 存储 | IndexedDB via `idb` |
| 渲染 | `react-markdown` + `remark-gfm` + `rehype-highlight` |
| PWA | Web App Manifest + standalone 模式 |

## 为什么不直接用 API？

CC Genius 用 Claude Code CLI 做后端，而不是 Anthropic API：

- **不用管 API Key** -- 直接用你的 Claude Code 订阅
- **复用终端登录** -- `~/.claude` 里的 OAuth token 共享
- **工具能力** -- CC CLI 能读文件、跑代码、用它所有内置工具
- **不额外花钱** -- CC 订阅已包含

> **注意**：iPad 访问必须用 production build。Next.js dev server 的 HMR WebSocket 在非 localhost 网络下会导致跨域脚本错误。

## 许可证

MIT
