import { spawn, type ChildProcess } from 'child_process';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { parseStreamLine } from '@/lib/stream-parser';
import type { ChatRequest } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min timeout

const TEMP_DIR = '/tmp/cc-genius-uploads';

// Save base64 images/files to temp directory, return file paths
async function saveTempFiles(images: ChatRequest['images']): Promise<string[]> {
  if (!images || images.length === 0) return [];
  await mkdir(TEMP_DIR, { recursive: true });

  const paths: string[] = [];
  for (const img of images) {
    const ext = img.mediaType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
    const filename = `upload-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const filepath = join(TEMP_DIR, filename);
    await writeFile(filepath, Buffer.from(img.base64, 'base64'));
    paths.push(filepath);
  }
  return paths;
}

// Clean up temp files
function cleanupFiles(paths: string[]) {
  for (const p of paths) {
    unlink(p).catch(() => {});
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
      HOME: process.env.HOME || '/Users/anxianjingya',
    },
    cwd: process.env.HOME || '/Users/anxianjingya',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export async function POST(req: Request) {
  const body: ChatRequest = await req.json();
  const { message, model, ccSessionId, images, compact, effort } = body;

  if (!message && (!images || images.length === 0)) {
    return new Response(JSON.stringify({ error: 'No message or images provided' }), {
      status: 400,
    });
  }

  // Save uploaded images/files to temp directory
  let tempFiles: string[] = [];
  try {
    tempFiles = await saveTempFiles(images);
  } catch (err) {
    console.error('[CC Genius] Failed to save temp files:', err);
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

      function runProcess(procArgs: string[], isRetry: boolean) {
        console.log('[CC CLI] spawning:', 'claude', procArgs.join(' ').slice(0, 200));
        const proc = spawnCLI(procArgs);

        let buffer = '';
        let capturedSessionId = '';
        let gotTextOutput = false; // Only true when we get actual text content
        let resumeError = false;  // True when resume fails with error result

        proc.stdout?.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const parsed = parseStreamLine(line);
            if (!parsed) continue;

            switch (parsed.kind) {
              case 'text_delta':
                gotTextOutput = true;
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: 'delta', text: parsed.text })}\n\n`)
                );
                break;

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
          stderrBuffer += chunk.toString();
        });

        proc.on('close', (code) => {
          // Resume failed: either exit code non-zero or got error result with no real text
          const shouldRetry = attemptedResume && !isRetry && !gotTextOutput
            && (code !== 0 || resumeError);
          if (shouldRetry) {
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

        // Handle request abort
        req.signal?.addEventListener('abort', () => {
          proc.kill('SIGTERM');
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
