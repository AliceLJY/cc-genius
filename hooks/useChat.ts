'use client';

import { useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Message, ModelType, ImageAttachment } from '@/lib/types';
import * as db from '@/lib/db';

interface SSEEvent {
  type: 'delta' | 'session_id' | 'done' | 'result' | 'error' | 'close';
  text?: string;
  sessionId?: string;
  error?: string;
}

export function useChat(conversationId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [ccSessionId, setCcSessionId] = useState<string | undefined>();
  const abortRef = useRef<AbortController | null>(null);

  // Load messages from IndexedDB
  const loadMessages = useCallback(async () => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    const msgs = await db.getMessages(conversationId);
    setMessages(msgs);

    // Try to recover ccSessionId from conversation
    const conv = await db.getConversation(conversationId);
    if (conv?.ccSessionId) {
      setCcSessionId(conv.ccSessionId);
    }
  }, [conversationId]);

  // Send a message (overrideConvId allows callers to pass a freshly-created ID)
  const send = useCallback(
    async (content: string, model: ModelType, images?: ImageAttachment[], overrideConvId?: string, effort?: string) => {
      const convId = overrideConvId || conversationId;
      if (!convId || (!content.trim() && (!images || images.length === 0))) return;

      // Save user message
      const userMsg: Message = {
        id: uuidv4(),
        conversationId: convId,
        role: 'user',
        content: content.trim(),
        images,
        timestamp: Date.now(),
      };
      await db.addMessage(userMsg);
      setMessages((prev) => [...prev, userMsg]);

      // Update conversation title from first user message
      const conv = await db.getConversation(convId);
      if (conv && conv.title === 'New Chat') {
        const title = content.trim().slice(0, 50) || 'New Chat';
        await db.updateConversation(convId, {
          title,
          updatedAt: Date.now(),
        });
      }

      // Create placeholder for assistant message
      const assistantMsgId = uuidv4();
      const assistantMsg: Message = {
        id: assistantMsgId,
        conversationId: convId,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setIsStreaming(true);

      // Abort controller for cancellation
      const abortController = new AbortController();
      abortRef.current = abortController;

      let accumulated = '';

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: content.trim(),
            model,
            conversationId: convId,
            ccSessionId,
            images,
            effort: effort || undefined,
          }),
          signal: abortController.signal,
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6);

            try {
              const event: SSEEvent = JSON.parse(jsonStr);

              switch (event.type) {
                case 'delta':
                  if (event.text) {
                    accumulated += event.text;
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMsgId ? { ...m, content: accumulated } : m
                      )
                    );
                  }
                  break;

                case 'session_id':
                  // Only store session_id on first message (no resume).
                  // When resuming, CC CLI returns a NEW temp session_id
                  // but the ORIGINAL one (from 'result') is what works for future resumes.
                  if (event.sessionId && !ccSessionId) {
                    setCcSessionId(event.sessionId);
                    await db.updateConversation(convId, {
                      ccSessionId: event.sessionId,
                    });
                  }
                  break;

                case 'error':
                  accumulated += `\n\n⚠️ Error: ${event.error}`;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId ? { ...m, content: accumulated } : m
                    )
                  );
                  break;

                case 'done':
                case 'result':
                case 'close':
                  break;
              }
            } catch {
              // Parse error, skip
            }
          }
        }

        // Save final assistant message
        if (accumulated) {
          await db.addMessage({
            ...assistantMsg,
            content: accumulated,
            timestamp: Date.now(),
          });

          // Update conversation timestamp
          await db.updateConversation(convId, {
            updatedAt: Date.now(),
          });
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          // User cancelled
          if (accumulated) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, content: accumulated + '\n\n_(Stopped)_' }
                  : m
              )
            );
          }
        } else {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: `⚠️ Error: ${errorMessage}` }
                : m
            )
          );
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [conversationId, ccSessionId]
  );

  // Stop streaming
  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // Clear all messages in current conversation (keep conversation itself)
  const clearMessages = useCallback(
    async () => {
      if (!conversationId) return;
      await db.deleteMessages(conversationId);
      await db.updateConversation(conversationId, { ccSessionId: undefined });
      setMessages([]);
      setCcSessionId(undefined);
    },
    [conversationId]
  );

  // Send a compact request
  const compact = useCallback(
    async (model: ModelType) => {
      const convId = conversationId;
      if (!convId) return;

      setIsStreaming(true);
      const abortController = new AbortController();
      abortRef.current = abortController;

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'compact',
            model,
            conversationId: convId,
            ccSessionId,
            compact: true,
          }),
          signal: abortController.signal,
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        }

        // Consume the stream but don't display (compact is a background operation)
        const reader = res.body?.getReader();
        if (reader) {
          while (true) {
            const { done } = await reader.read();
            if (done) break;
          }
        }
      } catch (err: unknown) {
        if (!(err instanceof Error && err.name === 'AbortError')) {
          console.error('[CC Genius] Compact failed:', err);
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [conversationId, ccSessionId]
  );

  return { messages, isStreaming, send, stop, loadMessages, clearMessages, compact, ccSessionId };
}
