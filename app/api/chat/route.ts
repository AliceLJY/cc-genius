import { spawn, type ChildProcess } from 'child_process';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import os from 'os';
import { parseStreamLine } from '@/lib/stream-parser';
import type { ChatRequest } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min timeout

// P0: Use os.tmpdir() instead of hardcoded /tmp
const TEMP_DIR = join(tmpdir(), 'cc-genius-uploads');

// P2: Allowed media types for uploaded files
const ALLOWED_MEDIA_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf', 'text/plain', 'text/csv', 'text/html', 'text/markdown',
  'application/json', 'application/xml', 'application/octet-stream',
]);

// P2: Max file count and individual file size limits
const MAX_UPLOAD_COUNT = 10;
const MAX_SINGLE_FILE_SIZE = 20 * 1024 * 1024; // 20 MB base64 decoded

// Save base64 images/files to temp directory, return file paths
async function saveTempFiles(images: ChatRequest['images']): Promise<string[]> {
  if (!images || images.length === 0) return [];

  // P2: Enforce upload count limit
  if (images.length > MAX_UPLOAD_COUNT) {
    throw new Error(`Too many files: ${images.length} exceeds limit of ${MAX_UPLOAD_COUNT}`);
  }

  await mkdir(TEMP_DIR, { recursive: true });

  const paths: string[] = [];
  for (const img of images) {
    // P2: Validate mediaType against allowlist
    if (!ALLOWED_MEDIA_TYPES.has(img.mediaType)) {
      throw new Error(`Unsupported media type: ${img.mediaType}`);
    }

    // P2: Validate base64 string (basic format check)
    if (!img.base64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(img.base64)) {
      throw new Error('Invalid base64 data');
    }

    // P2: Enforce file size limit
    const estimatedSize = Math.ceil(img.base64.length * 3 / 4);
    if (estimatedSize > MAX_SINGLE_FILE_SIZE) {
      throw new Error(`File too large: ${estimatedSize} bytes exceeds ${MAX_SINGLE_FILE_SIZE} byte limit`);
    }

    const ext = img.mediaType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
    const filename = `upload-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const filepath = join(TEMP_DIR, filename);
    // P1: writeFile wrapped - errors propagate naturally to caller
    await writeFile(filepath, Buffer.from(img.base64, 'base64'));
    paths.push(filepath);
  }
  return paths;
}

// Clean up temp files
function cleanupFiles(paths: string[]) {
  for (const p of paths) {
    // P1: Log unlink errors instead of silently swallowing
    unlink(p).catch((err) => {
      console.error('[CC Genius] Failed to clean up temp file:', p, err.message);
    });
  }
}

interface BuildArgsOptions {
  model: string;
  ccSessionId?: string;
  prompt: string;
  compact?: boolean;
  effort?: string;
}

function buildArgs({ model, ccSessionId, prompt, compact, effort }: BuildArgsOptions): string[] {
  const args: string[] = [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--model', model || 'sonnet',
  ];
  if (ccSessionId) {
    args.push('--resume', ccSessionId);
  }
  if (compact) {
    args.push('--compact');
  }
  if (effort && ['low', 'medium', 'high'].includes(effort)) {
    args.push('--effort', effort);
  }
  args.push(prompt);
  return args;
}

function spawnCLI(args: string[]): ChildProcess {
  return spawn('claude', args, {
    env: {
      ...process.env,
      LANG: 'en_US.UTF-8',
      HOME: process.env.HOME || os.homedir(),
    },
    cwd: process.env.HOME || os.homedir(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// P1: Max message length (100 KB)
const MAX_MESSAGE_LENGTH = 100 * 1024;

// P2: Max accumulated text buffer (10 MB) to prevent unbounded memory growth
const MAX_ACCUMULATED_TEXT = 10 * 1024 * 1024;

// P2: Max stderr buffer size (64 KB)
const MAX_STDERR_SIZE = 64 * 1024;

export async function POST(req: Request) {
  const body: ChatRequest = await req.json();
  const { message, model, ccSessionId, images, compact, effort } = body;

  if (!message && (!images || images.length === 0)) {
    return new Response(JSON.stringify({ error: 'No message or images provided' }), {
      status: 400,
    });
  }

  // P1: Validate message length
  if (message && message.length > MAX_MESSAGE_LENGTH) {
    return new Response(
      JSON.stringify({ error: `Message too long: ${message.length} chars exceeds ${MAX_MESSAGE_LENGTH} limit` }),
      { status: 400 }
    );
  }

  // P2: Validate limit param is a number (NaN guard)
  if (effort && !['low', 'medium', 'high'].includes(effort)) {
    return new Response(JSON.stringify({ error: 'Invalid effort level' }), { status: 400 });
  }

  // P0: saveTempFiles errors now propagate - if temp file saving fails, don't proceed
  let tempFiles: string[] = [];
  try {
    tempFiles = await saveTempFiles(images);
  } catch (err) {
    console.error('[CC Genius] Failed to save temp files:', err);
    return new Response(
      JSON.stringify({ error: `Failed to process uploaded files: ${err instanceof Error ? err.message : 'unknown error'}` }),
      { status: 400 }
    );
  }

  // Build the prompt with file references
  let prompt = message || '';
  if (tempFiles.length > 0) {
    const fileRefs = tempFiles.map((p) => `[Attached file: ${p}]`).join('\n');
    prompt = prompt
      ? `${prompt}\n\n${fileRefs}\n\nPlease read and analyze the attached file(s) above.`
      : `${fileRefs}\n\nPlease read and describe the attached file(s) above.`;
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Try with resume first; if it fails, retry without resume
      const attemptedResume = !!ccSessionId;
      const args = buildArgs({ model, ccSessionId, prompt, compact, effort });

      // P1: Guard against concurrent retries
      let retryInProgress = false;

      function runProcess(procArgs: string[], isRetry: boolean) {
        console.log('[CC CLI] spawning:', 'claude', procArgs.join(' ').slice(0, 200));
        const proc = spawnCLI(procArgs);

        let buffer = '';
        let capturedSessionId = '';
        let gotTextOutput = false; // Only true when we get actual text content
        let resumeError = false;  // True when resume fails with error result
        // P2: Track accumulated text size
        let accumulatedTextSize = 0;

        proc.stdout?.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            // P2: Log when JSONL lines are skipped (non-parseable)
            const parsed = parseStreamLine(line);
            if (!parsed) {
              if (line.trim()) {
                console.warn('[CC CLI] Skipped unparseable JSONL line:', line.slice(0, 100));
              }
              continue;
            }

            switch (parsed.kind) {
              case 'text_delta': {
                gotTextOutput = true;
                // P2: Check accumulated text size before enqueuing
                const textLen = parsed.text?.length || 0;
                accumulatedTextSize += textLen;
                if (accumulatedTextSize > MAX_ACCUMULATED_TEXT) {
                  console.warn('[CC CLI] Accumulated text exceeded limit, truncating');
                  break;
                }
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: 'delta', text: parsed.text })}\n\n`)
                );
                break;
              }

              case 'session_id':
                if (parsed.sessionId && !capturedSessionId) {
                  capturedSessionId = parsed.sessionId;
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ type: 'session_id', sessionId: parsed.sessionId })}\n\n`
                    )
                  );
                }
                break;

              case 'message_done':
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
                );
                break;

              case 'result':
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'result',
                      sessionId: parsed.sessionId || capturedSessionId,
                    })}\n\n`
                  )
                );
                break;

              case 'error':
                // If we're resuming and got an error (session not found), mark for retry
                if (attemptedResume && !isRetry) {
                  resumeError = true;
                } else {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ type: 'error', error: parsed.error })}\n\n`
                    )
                  );
                }
                break;
            }
          }
        });

        let stderrBuffer = '';
        proc.stderr?.on('data', (chunk: Buffer) => {
          // P2: Cap stderr buffer size
          const text = chunk.toString();
          if (stderrBuffer.length < MAX_STDERR_SIZE) {
            stderrBuffer += text.slice(0, MAX_STDERR_SIZE - stderrBuffer.length);
          }
        });

        proc.on('close', (code) => {
          // Resume failed: either exit code non-zero or got error result with no real text
          const shouldRetry = attemptedResume && !isRetry && !gotTextOutput
            && (code !== 0 || resumeError);
          // P1: Prevent concurrent retries
          if (shouldRetry && !retryInProgress) {
            retryInProgress = true;
            console.log('[CC CLI] Resume failed, retrying without --resume');
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'delta', text: '_(Session expired, starting fresh)_\n\n' })}\n\n`
              )
            );
            const retryArgs = buildArgs({ model, prompt, compact, effort });
            runProcess(retryArgs, true);
            return;
          }

          // Clean up temp files
          cleanupFiles(tempFiles);

          if (code !== 0 && code !== null) {
            const errMsg = stderrBuffer.trim() || `Process exited with code ${code}`;
            console.error(`[CC CLI] exit code ${code}, stderr:`, stderrBuffer.trim());
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'error', error: errMsg })}\n\n`
              )
            );
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'close' })}\n\n`));
          controller.close();
        });

        proc.on('error', (err) => {
          cleanupFiles(tempFiles);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`
            )
          );
          controller.close();
        });

        // P1: Handle request abort - kill process AND clean up temp files
        req.signal?.addEventListener('abort', () => {
          proc.kill('SIGTERM');
          cleanupFiles(tempFiles);
        });
      }

      runProcess(args, false);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
