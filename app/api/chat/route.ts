import { spawn } from 'child_process';
import { parseStreamLine } from '@/lib/stream-parser';
import type { ChatRequest } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 min timeout

export async function POST(req: Request) {
  const body: ChatRequest = await req.json();
  const { message, model, ccSessionId, images } = body;

  if (!message && (!images || images.length === 0)) {
    return new Response(JSON.stringify({ error: 'No message or images provided' }), {
      status: 400,
    });
  }

  // Build CLI args
  const args: string[] = [
    '-p', // print mode (non-interactive)
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--model', model || 'sonnet',
    '--no-session-persistence', // we manage our own persistence
  ];

  // Multi-turn: resume previous CC session
  if (ccSessionId) {
    args.push('--resume', ccSessionId);
  }

  // Build the prompt - for now, just the message text
  // Images handled via stdin stream-json if supported, otherwise as file refs
  args.push(message || 'Describe this image.');

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      console.log('[CC CLI] spawning:', 'claude', args.join(' '));
      const proc = spawn('claude', args, {
        env: {
          ...process.env,
          LANG: 'en_US.UTF-8',
          HOME: process.env.HOME || '/Users/anxianjingya',
        },
        cwd: process.env.HOME || '/Users/anxianjingya',
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let buffer = '';
      let capturedSessionId = '';

      proc.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete last line in buffer

        for (const line of lines) {
          const parsed = parseStreamLine(line);
          if (!parsed) continue;

          switch (parsed.kind) {
            case 'text_delta':
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
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: 'error', error: parsed.error })}\n\n`
                )
              );
              break;
          }
        }
      });

      let stderrBuffer = '';
      proc.stderr.on('data', (chunk: Buffer) => {
        stderrBuffer += chunk.toString();
      });

      proc.stderr.on('end', () => {
        if (stderrBuffer.trim()) {
          console.error('[CC CLI stderr]', stderrBuffer.trim());
        }
      });

      proc.on('close', (code) => {
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
