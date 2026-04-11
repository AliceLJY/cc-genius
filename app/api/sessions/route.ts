import { readdirSync, statSync, createReadStream } from 'fs';
import { join, basename } from 'path';
import { createInterface } from 'readline';
import os from 'os';

export const runtime = 'nodejs';

const PROJECTS_DIR = join(process.env.HOME || os.homedir(), '.claude', 'projects');

interface SessionInfo {
  sessionId: string;
  displayName: string;
  firstTopic: string;
  lastTopic: string;
  lastActive: number;
  size: number;
  cwd: string;
  projectName: string;
}

// Strip bridge hints and file tags from user messages
const BRIDGE_HINT_RE = new RegExp('^\\[系统提示:.*?\\]\\s*', 's');
const FILE_TAG_RE = new RegExp('\\n?\\[(?:图片文件|文件):.*$', 's');

function cleanUserTopic(raw: string): string {
  if (!raw || raw.startsWith('[Request interrupted')) return '';
  return raw.replace(BRIDGE_HINT_RE, '').replace(FILE_TAG_RE, '').trim();
}

function extractUserText(content: unknown): string {
  if (Array.isArray(content)) {
    const txt = content.find(
      (c: unknown) => typeof c === 'object' && c !== null && (c as Record<string, unknown>).type === 'text'
    );
    return (txt as Record<string, string>)?.text || '';
  }
  return typeof content === 'string' ? content : '';
}

function listSessionFiles(limit: number) {
  const allFiles: { file: string; path: string; mtime: number; size: number; sessionId: string }[] = [];
  try {
    const dirs = readdirSync(PROJECTS_DIR).filter((d) => {
      try { return statSync(join(PROJECTS_DIR, d)).isDirectory(); } catch { return false; }
    });
    for (const dir of dirs) {
      const fullDir = join(PROJECTS_DIR, dir);
      try {
        const files = readdirSync(fullDir)
          .filter((f) => f.endsWith('.jsonl'))
          .map((f) => {
            const fp = join(fullDir, f);
            const stat = statSync(fp);
            return { file: f, path: fp, mtime: stat.mtimeMs, size: stat.size, sessionId: f.replace('.jsonl', '') };
          });
        allFiles.push(...files);
      } catch { /* skip */ }
    }
  } catch {
    return [];
  }
  allFiles.sort((a, b) => b.mtime - a.mtime);
  return allFiles.slice(0, limit);
}

async function parseSessionFile(fileInfo: { path: string; mtime: number; size: number; sessionId: string }): Promise<SessionInfo> {
  let firstTopic = '';
  let lastTopic = '';
  let resolvedCwd = '';

  try {
    const stream = createReadStream(fileInfo.path, { encoding: 'utf8' });
    const rl = createInterface({ input: stream });
    for await (const line of rl) {
      try {
        const d = JSON.parse(line);
        if (!resolvedCwd && typeof d.cwd === 'string' && d.cwd) {
          resolvedCwd = d.cwd;
        }
        if (d.message?.role === 'user') {
          const cleaned = cleanUserTopic(extractUserText(d.message.content));
          if (cleaned) {
            if (!firstTopic) firstTopic = cleaned.slice(0, 80);
            lastTopic = cleaned.slice(0, 80);
          }
        }
      } catch (parseErr) {
          // P2: Log skipped JSONL lines instead of silently swallowing
          console.warn('[CC Sessions] Skipped malformed JSONL line in', fileInfo.path, ':', parseErr instanceof Error ? parseErr.message : 'parse error');
        }
    }
    rl.close();
    stream.destroy();
  } catch { /* skip */ }

  return {
    sessionId: fileInfo.sessionId,
    displayName: lastTopic || firstTopic || '(empty session)',
    firstTopic,
    lastTopic,
    lastActive: fileInfo.mtime,
    size: fileInfo.size,
    cwd: resolvedCwd,
    projectName: resolvedCwd ? basename(resolvedCwd) : '',
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  // P2: NaN guard for limit parameter
  const rawLimit = parseInt(url.searchParams.get('limit') || '15', 10);
  const limit = Math.min(Number.isNaN(rawLimit) ? 15 : rawLimit, 30);

  const files = listSessionFiles(limit);
  const sessions: SessionInfo[] = [];
  for (const f of files) {
    sessions.push(await parseSessionFile(f));
  }

  return new Response(JSON.stringify({ sessions }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
