'use client';

import { useEffect, useRef } from 'react';
import type { Message, ModelType } from '@/lib/types';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import ModelSelector from './ModelSelector';
import type { ImageAttachment } from '@/lib/types';

interface Props {
  messages: Message[];
  isStreaming: boolean;
  model: ModelType;
  conversationId: string | null;
  onSend: (text: string, images?: ImageAttachment[]) => void;
  onStop: () => void;
  onModelChange: (m: ModelType) => void;
  onToggleSidebar: () => void;
}

export default function ChatArea({
  messages,
  isStreaming,
  model,
  conversationId,
  onSend,
  onStop,
  onModelChange,
  onToggleSidebar,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-950">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 dark:border-gray-800
        pt-[calc(0.625rem+env(safe-area-inset-top))]">
        {/* Sidebar toggle (mobile) */}
        <button
          onClick={onToggleSidebar}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 lg:hidden"
        >
          <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <div className="flex-1" />

        {/* Model selector */}
        <ModelSelector model={model} onChange={onModelChange} />
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {!conversationId ? (
          /* Welcome screen */
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-400 to-pink-500
              flex items-center justify-center text-white text-2xl font-bold mb-4">
              C
            </div>
            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
              CC Genius
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm max-w-sm">
              Start a new conversation or select one from the sidebar.
            </p>
          </div>
        ) : messages.length === 0 ? (
          /* Empty conversation */
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              Send a message to start the conversation.
            </p>
          </div>
        ) : (
          /* Message list */
          <div className="py-4">
            {messages.map((msg, i) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isStreaming={isStreaming && i === messages.length - 1 && msg.role === 'assistant'}
              />
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      {conversationId && (
        <MessageInput
          onSend={onSend}
          onStop={onStop}
          isStreaming={isStreaming}
          disabled={!conversationId}
        />
      )}
    </div>
  );
}
