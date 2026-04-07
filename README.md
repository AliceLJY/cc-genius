# CC Genius

[中文版 README](README_CN.md)

A web-based Claude chat client (PWA) powered by [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code). Self-hosted on your Mac, accessible from iPad via Tailscale -- no API key needed.

![CC Genius](https://img.shields.io/badge/CC_Genius-PWA-blue) ![Next.js](https://img.shields.io/badge/Next.js-16-black) ![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **Claude Code CLI Backend** -- Uses your existing CC subscription (OAuth), no API key required
- **Multi-turn Conversations** -- Session resume via `--resume` flag
- **Streaming Output** -- Real-time SSE streaming with Markdown + code highlighting
- **Image & File Upload** -- Upload images, PDFs, code files -- CC CLI reads them via its Read tool
- **Model Selection** -- Switch between Sonnet, Opus, and Haiku
- **Dark/Light/System Theme** -- Flash-free theme initialization
- **PWA** -- Add to iPad home screen for fullscreen, app-like experience
- **Responsive Layout** -- iPad landscape = split panels, portrait = collapsible sidebar
- **Local Storage** -- IndexedDB for conversation persistence (per device)

## Architecture

```
iPad Safari (PWA)  --Tailscale-->  Mac (Next.js Server)
                                       |
                                       |-- SSE Stream <--> Claude Code CLI
                                       |                    (OAuth via ~/.claude)
                                       +-- IndexedDB (client-side)
```

## Quick Start

### Prerequisites

- macOS with [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) installed and logged in
- Node.js 18+
- [Tailscale](https://tailscale.com/) (for iPad access)

### Install & Run

```bash
git clone https://github.com/AliceLJY/cc-genius.git
cd cc-genius
npm install
npm run build
npx next start --port 3088 --hostname 0.0.0.0
```

### Access

- **Mac**: http://localhost:3088
- **iPad**: `http://<your-tailscale-ip>:3088` (find IP via `tailscale ip -4`)

### Add to iPad Home Screen

1. Open the URL in Safari
2. Tap the Share button (box with arrow)
3. Select **"Add to Home Screen"**
4. Enjoy fullscreen, app-like experience

### Rebuild After Code Changes

```bash
./scripts/rebuild.sh
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) + Tailwind CSS 4 |
| Backend | Claude Code CLI (`claude -p --output-format stream-json`) |
| Streaming | Server-Sent Events (SSE) |
| Storage | IndexedDB via `idb` |
| Rendering | `react-markdown` + `remark-gfm` + `rehype-highlight` |
| PWA | Web App Manifest + standalone display |

## Why Not Use the API Directly?

CC Genius uses the Claude Code CLI as its backend instead of the Anthropic API:

- **No API key management** -- Uses your existing Claude Code subscription
- **Same auth as your terminal** -- OAuth token from `~/.claude` is reused
- **Tool access** -- CC CLI can read files, run code, and use all its built-in tools
- **No extra cost** -- Covered by your Claude Code subscription

> **Note**: Production build is required for iPad access. Next.js dev server's HMR WebSocket causes cross-origin script errors over non-localhost networks.

## License

MIT
