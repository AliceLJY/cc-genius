/**
 * Parse Claude Code CLI stream-json output.
 *
 * Each line of stdout is a JSON object. We care about:
 *   - type:"stream_event" + event.type:"content_block_delta" → text delta
 *   - type:"stream_event" + event.type:"message_stop" → done
 *   - type:"result" → final result + session_id
 *   - type:"assistant" → full accumulated message (partial, with --include-partial-messages)
 *
 * We ignore: system, hook_*, rate_limit_event
 */

export interface ParsedChunk {
  kind: 'text_delta' | 'message_done' | 'result' | 'error' | 'session_id';
  text?: string;
  sessionId?: string;
  error?: string;
}

export function parseStreamLine(line: string): ParsedChunk | null {
  if (!line.trim()) return null;

  try {
    const data = JSON.parse(line);

    // Skip system/hook events
    if (data.type === 'system' || data.type === 'rate_limit_event') {
      // But capture session_id from first event
      if (data.session_id) {
        return { kind: 'session_id', sessionId: data.session_id };
      }
      return null;
    }

    // Stream events - the main content
    if (data.type === 'stream_event' && data.event) {
      const evt = data.event;

      if (evt.type === 'content_block_delta' && evt.delta?.text) {
        return { kind: 'text_delta', text: evt.delta.text };
      }

      if (evt.type === 'message_stop') {
        return { kind: 'message_done' };
      }

      // Capture session_id from message_start
      if (evt.type === 'message_start' && data.session_id) {
        return { kind: 'session_id', sessionId: data.session_id };
      }
    }

    // Final result
    if (data.type === 'result') {
      if (data.is_error) {
        return { kind: 'error', error: data.result || 'Unknown error' };
      }
      return {
        kind: 'result',
        text: data.result,
        sessionId: data.session_id,
      };
    }

    return null;
  } catch {
    // Non-JSON line, ignore
    return null;
  }
}
