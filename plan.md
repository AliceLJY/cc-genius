# Claude Chat PWA - Implementation Plan

> iPad Safari 全屏使用的 Web 版 Claude 聊天客户端
> 后端：Claude Code CLI | 前端：Next.js + Tailwind | 部署：Mac 自托管 + Tailscale

---

## 架构总览

```
┌─────────────────────────────────────────────────┐
│  iPad Safari (PWA Standalone)                    │
│  ┌──────────┐  ┌──────────────────────────────┐ │
│  │ 左栏      │  │ 右栏 - 聊天区                 │ │
│  │ 对话列表  │  │ Markdown + 代码高亮           │ │
│  │ 搜索      │  │ 流式输出                      │ │
│  │ 新建/删除 │  │ 图片上传                      │ │
│  └──────────┘  └──────────────────────────────┘ │
│              IndexedDB (本地存储)                 │
└────────────────────┬────────────────────────────┘
                     │ SSE (Tailscale 内网)
┌────────────────────┴────────────────────────────┐
│  Mac - Next.js Server                            │
│  ┌────────────────────────────────────────────┐ │
│  │ API Route: POST /api/chat                   │ │
│  │   → spawn `claude -p --output-format        │ │
│  │     stream-json --include-partial-messages`  │ │
│  │   → pipe stdout → SSE response              │ │
│  └────────────────────────────────────────────┘ │
│  Claude Code CLI (本机 OAuth 已登录)              │
└─────────────────────────────────────────────────┘
```

## 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 框架 | Next.js 14+ (App Router) | 全栈，API Routes + React |
| 样式 | Tailwind CSS 3 | 响应式 + 主题 |
| Markdown | react-markdown + rehype-highlight | 渲染 + 代码高亮 |
| 存储 | IndexedDB (idb) | 对话历史纯本地 |
| 后端 | Claude Code CLI subprocess | 零配置认证 |
| 流式 | SSE (Server-Sent Events) | 流式输出推送 |
| PWA | next-pwa / 手动 manifest + SW | 全屏 standalone |

## 项目结构

```
claude-chat/
├── app/
│   ├── layout.tsx              # 根 layout，主题 provider，字体
│   ├── page.tsx                # 主页面（App Shell）
│   ├── globals.css             # Tailwind + CSS 变量（主题色）
│   └── api/
│       └── chat/
│           └── route.ts        # POST: 流式聊天端点
├── components/
│   ├── AppShell.tsx            # 响应式外壳（左右分栏）
│   ├── Sidebar.tsx             # 左栏：对话列表 + 搜索 + 新建
│   ├── ConversationItem.tsx    # 单条对话项（标题 + 时间 + 删除）
│   ├── ChatArea.tsx            # 右栏：消息列表 + 输入框
│   ├── MessageBubble.tsx       # 单条消息气泡（Markdown 渲染）
│   ├── MessageInput.tsx        # 输入框 + 发送 + 图片上传
│   ├── ModelSelector.tsx       # 模型切换下拉
│   └── ThemeToggle.tsx         # 深色/浅色切换
├── lib/
│   ├── db.ts                   # IndexedDB 封装（idb 库）
│   ├── types.ts                # TypeScript 类型定义
│   └── stream-parser.ts        # CC stream-json 输出解析
├── hooks/
│   ├── useConversations.ts     # 对话 CRUD hook
│   ├── useChat.ts              # 发送消息 + 流式接收 hook
│   └── useTheme.ts             # 主题管理 hook
├── public/
│   ├── manifest.json           # PWA manifest
│   ├── sw.js                   # Service Worker
│   └── icons/                  # PWA 图标 (192x192, 512x512)
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 实施步骤

### Step 1: 项目脚手架 + PWA 基础 (~20min)

**目标**：可运行的 Next.js 项目，PWA 可安装

- [ ] `npx create-next-app@latest claude-chat --typescript --tailwind --app --src-dir=false`
- [ ] 配置 `tailwind.config.ts`：深浅主题色板
- [ ] 创建 `public/manifest.json`：
  ```json
  {
    "name": "Claude Chat",
    "short_name": "Claude",
    "display": "standalone",
    "orientation": "any",
    "theme_color": "#1a1a2e",
    "background_color": "#1a1a2e",
    "start_url": "/",
    "icons": [...]
  }
  ```
- [ ] 创建 `public/sw.js`：基础 service worker（缓存静态资源）
- [ ] `app/layout.tsx`：viewport meta（iPad safe area），manifest link，SW 注册
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  ```
- [ ] 验证：`npm run dev`，iPad Safari 打开，可添加到主屏幕

**[观察: ]**

---

### Step 2: CC CLI 集成验证 (~30min)

**目标**：确认 CLI 流式输出格式，确定后端接口设计

- [ ] 测试基础流式输出：
  ```bash
  echo "hello" | claude -p --output-format stream-json --include-partial-messages --model sonnet
  ```
  记录 JSON 格式（每行一个 JSON 对象？字段结构？）

- [ ] 测试 session-id 多轮对话：
  ```bash
  # 第一轮
  claude -p --output-format stream-json --session-id "test-uuid-1" "你好"
  # 第二轮（应该记住上下文）
  claude -p --output-format stream-json --session-id "test-uuid-1" --resume "test-uuid-1" "我刚才说了什么？"
  ```

- [ ] 测试模型切换：`--model sonnet` / `--model opus` / `--model haiku`

- [ ] 测试图片输入（关键验证点）：
  - 方案 A：`--input-format stream-json` 是否支持传图片 base64？
  - 方案 B：CLI 是否有 `--file` 参数接受图片？
  - 方案 C：如果 CLI 不支持图片，备选 → 用 `@anthropic-ai/sdk` + 从 CC 提取 OAuth token

- [ ] 记录发现，更新后续步骤

**[观察: ]**

---

### Step 3: 后端 API Route (~1hr)

**目标**：`POST /api/chat` 接收消息，spawn CC CLI，SSE 流式返回

**文件**：`app/api/chat/route.ts`

```typescript
// 核心逻辑伪代码
export async function POST(req: Request) {
  const { message, model, sessionId, images } = await req.json();

  // 构建 CLI 命令
  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--model', model || 'sonnet',
  ];

  if (sessionId) {
    args.push('--session-id', sessionId, '--resume', sessionId);
  }

  // Spawn CC CLI
  const proc = spawn('claude', [...args, message]);

  // 返回 SSE 流
  const stream = new ReadableStream({
    start(controller) {
      proc.stdout.on('data', (chunk) => {
        // 解析 stream-json，提取文本 delta
        // controller.enqueue(SSE 格式)
      });
      proc.on('close', () => controller.close());
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

**文件**：`lib/stream-parser.ts`
- [ ] 解析 CC stream-json 输出格式
- [ ] 提取文本 delta（部分消息）
- [ ] 提取最终完整消息
- [ ] 错误处理（进程崩溃 / 超时 / 认证失效）

**文件**：`lib/types.ts`
```typescript
interface ChatRequest {
  message: string;
  model: 'sonnet' | 'opus' | 'haiku';
  sessionId?: string;
  images?: { base64: string; mediaType: string }[];
}

interface Conversation {
  id: string;           // UUID
  title: string;        // 自动取首条消息前 50 字
  model: string;
  ccSessionId?: string; // CC CLI session ID（用于 --resume）
  createdAt: number;
  updatedAt: number;
}

interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  images?: { base64: string; mediaType: string }[];
  timestamp: number;
}
```

- [ ] 实现完整 API route
- [ ] 测试：curl 发请求，验证 SSE 流式输出

**[观察: ]**

---

### Step 4: IndexedDB 持久层 (~30min)

**目标**：对话和消息的本地 CRUD

**文件**：`lib/db.ts`

使用 `idb` 库（轻量 IndexedDB wrapper）：

```typescript
// 数据库 schema
const DB_NAME = 'claude-chat';
const DB_VERSION = 1;
// stores: conversations, messages

// API
export const db = {
  // Conversations
  createConversation(model: string): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation>;
  listConversations(): Promise<Conversation[]>;  // 按 updatedAt 降序
  updateConversation(id: string, updates: Partial<Conversation>): Promise<void>;
  deleteConversation(id: string): Promise<void>; // 同时删关联 messages
  searchConversations(query: string): Promise<Conversation[]>;

  // Messages
  addMessage(msg: Omit<Message, 'id'>): Promise<Message>;
  getMessages(conversationId: string): Promise<Message[]>;
  updateMessage(id: string, content: string): Promise<void>; // 流式追加用
  deleteMessages(conversationId: string): Promise<void>;
};
```

- [ ] 安装 `idb`：`npm i idb`
- [ ] 实现 db.ts
- [ ] 浏览器 DevTools 验证数据正确存储

**[观察: ]**

---

### Step 5: UI - App Shell + 左栏 (~1hr)

**目标**：响应式分栏布局，对话列表可用

**文件**：`components/AppShell.tsx`
- [ ] 横屏：左栏 280px + 右栏 flex-1
- [ ] 竖屏：左栏 overlay + 手势/按钮切换
- [ ] CSS：`env(safe-area-inset-*)` 适配 iPad 刘海/圆角
- [ ] 状态：`sidebarOpen` (boolean)

**文件**：`components/Sidebar.tsx`
- [ ] 顶部：搜索框 + 新建对话按钮
- [ ] 列表：`useConversations()` hook 驱动
- [ ] 每项显示标题 + 相对时间（今天/昨天/日期）
- [ ] 当前对话高亮
- [ ] 长按/右滑删除（iPad 友好手势）

**文件**：`components/ConversationItem.tsx`
- [ ] 标题（单行截断）
- [ ] 时间
- [ ] 删除确认

**文件**：`hooks/useConversations.ts`
- [ ] 加载对话列表
- [ ] 新建/删除/选中
- [ ] 搜索过滤
- [ ] 自动按 updatedAt 排序

**风格参考**：
- 背景：深色 `#1a1a2e` / 浅色 `#f8f9fa`
- 当前项：左侧蓝色竖条 accent
- 间距：紧凑但触控友好（每项 52-56px 高度）

**[观察: ]**

---

### Step 6: UI - 聊天区 (~1.5hr)

**目标**：消息气泡 + 流式输出 + Markdown + 代码高亮

**文件**：`components/ChatArea.tsx`
- [ ] 消息列表，滚动容器，自动滚到底
- [ ] 顶部 bar：对话标题 + 模型选择器 + 菜单按钮（竖屏时打开左栏）
- [ ] 空态：欢迎画面 + 快捷提示

**文件**：`components/MessageBubble.tsx`
- [ ] 用户消息：右对齐，深色背景（如 `#4a90d9`），白字
- [ ] Claude 消息：左对齐，浅灰背景（深色主题 `#2a2a3e` / 浅色 `#f0f0f5`）
- [ ] Markdown 渲染：`react-markdown` + `remark-gfm`（表格、列表等）
- [ ] 代码高亮：`rehype-highlight` + 代码块复制按钮
- [ ] 流式文本：逐字追加，光标闪烁动画
- [ ] 图片消息：缩略图展示，点击放大

**文件**：`components/MessageInput.tsx`
- [ ] 多行输入框（`textarea`，auto-resize）
- [ ] 发送按钮（Enter 发送，Shift+Enter 换行）
- [ ] 图片上传按钮（点击选图 / 拍照）
  - 接受 `image/*`，转 base64
  - 预览已选图片，可移除
- [ ] 发送中状态（禁用输入 + loading 指示）
- [ ] 停止生成按钮

**文件**：`hooks/useChat.ts`
```typescript
// 核心 hook
function useChat(conversationId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  // 发送消息
  async function send(content: string, images?: ImageData[]) {
    // 1. 保存用户消息到 IndexedDB
    // 2. fetch POST /api/chat (SSE)
    // 3. 逐 chunk 更新 assistant 消息
    // 4. 完成后保存完整 assistant 消息到 IndexedDB
  }

  // 停止生成
  function stop() { /* abort controller */ }

  return { messages, isStreaming, send, stop };
}
```

**依赖安装**：
```bash
npm i react-markdown remark-gfm rehype-highlight highlight.js
```

**[观察: ]**

---

### Step 7: 模型选择 + 主题系统 (~30min)

**文件**：`components/ModelSelector.tsx`
- [ ] 下拉选择：Sonnet (默认) / Opus / Haiku
- [ ] 显示在聊天区顶部 bar
- [ ] 切换后对新消息生效，不影响历史
- [ ] 记住上次选择（localStorage）

**文件**：`components/ThemeToggle.tsx`
- [ ] 三态：跟随系统 / 浅色 / 深色
- [ ] 图标切换（太阳/月亮/自动）

**文件**：`hooks/useTheme.ts` + `globals.css`
- [ ] CSS 变量方案：
  ```css
  :root { --bg-primary: #f8f9fa; --text-primary: #1a1a2e; ... }
  .dark { --bg-primary: #1a1a2e; --text-primary: #e8e8e8; ... }
  ```
- [ ] Tailwind `darkMode: 'class'`
- [ ] `prefers-color-scheme` 媒体查询检测系统偏好
- [ ] 存 localStorage，页面加载时无闪烁（script 在 head 注入）

**[观察: ]**

---

### Step 8: iPad 优化 + PWA 完善 (~30min)

**目标**：iPad 体验打磨

- [ ] **Safe area**：padding 使用 `env(safe-area-inset-*)`
- [ ] **触控区域**：所有按钮最小 44x44px
- [ ] **键盘处理**：
  - `visualViewport` API 监听键盘弹起
  - 输入框跟随键盘上移，不被遮挡
- [ ] **滚动行为**：`-webkit-overflow-scrolling: touch`，惯性滚动
- [ ] **PWA 图标**：生成 192x192 + 512x512 PNG icon
- [ ] **apple-touch-icon**：180x180
- [ ] **splash screen**：`apple-touch-startup-image`（可选）
- [ ] **Service Worker 策略**：
  - 静态资源：Cache First
  - API 请求：Network Only（聊天不缓存）
  - 离线时显示友好提示

**[观察: ]**

---

### Step 9: 测试 + 打磨 (~30min)

- [ ] **端到端流程**：新建对话 → 发消息 → 流式输出 → 切换对话 → 回来消息还在
- [ ] **多轮对话**：验证 `--session-id / --resume` Claude 记住上下文
- [ ] **图片上传**：拍照/选图 → 发送 → Claude 正确识别
- [ ] **模型切换**：Sonnet → Opus，新消息用新模型
- [ ] **主题切换**：深/浅/自动，无闪烁
- [ ] **响应式**：
  - iPad 横屏：左右分栏正常
  - iPad 竖屏：左栏收起/展开正常
  - iPhone（如果顺便支持）：纯右栏
- [ ] **PWA 安装**：Safari → 添加到主屏幕 → 全屏打开 → 无地址栏
- [ ] **异常处理**：
  - CC 未登录 → 友好错误提示
  - 网络断开 → 提示重连
  - 长时间无响应 → 超时处理

**[观察: ]**

---

## 风险 & 备选方案

| 风险 | 影响 | 备选 |
|---|---|---|
| CC CLI 不支持图片输入（非交互模式） | 图片功能不可用 | 用 `@anthropic-ai/sdk` + 提取 CC OAuth token 直接调 API |
| `--session-id/--resume` 不支持跨进程多轮 | 上下文丢失 | 前端拼接历史消息作为 prompt 上下文 |
| CC stream-json 格式复杂/不稳定 | 解析困难 | 用 `--output-format json` 非流式，牺牲流式体验 |
| iPad Safari PWA 限制 | 某些 Web API 不可用 | 查 caniuse，降级处理 |

## 依赖清单

```json
{
  "dependencies": {
    "next": "^14",
    "react": "^18",
    "react-dom": "^18",
    "react-markdown": "^9",
    "remark-gfm": "^4",
    "rehype-highlight": "^7",
    "highlight.js": "^11",
    "idb": "^8",
    "uuid": "^9"
  },
  "devDependencies": {
    "typescript": "^5",
    "tailwindcss": "^3",
    "@types/react": "^18",
    "@types/uuid": "^9"
  }
}
```

## 启动方式

```bash
# 开发
cd ~/Projects/claude-chat
npm run dev  # 默认 :3000

# iPad 访问（Tailscale）
# http://<mac-tailscale-ip>:3000
```
