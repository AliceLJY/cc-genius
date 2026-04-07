'use client';

import { useState, useEffect, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import ChatArea from '@/components/ChatArea';
import ThemeToggle from '@/components/ThemeToggle';
import { useConversations } from '@/hooks/useConversations';
import { useChat } from '@/hooks/useChat';
import { useTheme } from '@/hooks/useTheme';
import type { ModelType, ImageAttachment } from '@/lib/types';

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [model, setModel] = useState<ModelType>('sonnet');
  const { theme, setTheme } = useTheme();

  const {
    conversations,
    activeId,
    create,
    remove,
    select,
    refresh,
    searchQuery,
    setSearchQuery,
  } = useConversations();

  const { messages, isStreaming, send, stop, loadMessages } = useChat(activeId);

  // Load messages when conversation changes
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Load saved model preference
  useEffect(() => {
    const saved = localStorage.getItem('preferred-model') as ModelType | null;
    if (saved) setModel(saved);
  }, []);

  // Detect screen size for sidebar
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => setSidebarOpen(e.matches);
    setSidebarOpen(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const handleModelChange = useCallback((m: ModelType) => {
    setModel(m);
    localStorage.setItem('preferred-model', m);
  }, []);

  const handleSend = useCallback(
    async (text: string, images?: ImageAttachment[]) => {
      let targetId = activeId;
      if (!targetId) {
        const conv = await create(model);
        targetId = conv.id;
      }
      send(text, model, images);
      // Refresh sidebar to update title/order
      setTimeout(() => refresh(), 500);
    },
    [activeId, model, create, send, refresh]
  );

  const handleNewChat = useCallback(async () => {
    await create(model);
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, [create, model]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      select(id);
      if (window.innerWidth < 1024) {
        setSidebarOpen(false);
      }
    },
    [select]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (confirm('Delete this conversation?')) {
        await remove(id);
        refresh();
      }
    },
    [remove, refresh]
  );

  return (
    <div className="h-dvh flex overflow-hidden bg-white dark:bg-gray-950">
      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50 w-[280px] transform transition-transform duration-200
          lg:relative lg:translate-x-0 lg:z-auto
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <Sidebar
          conversations={conversations}
          activeId={activeId}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSelect={handleSelectConversation}
          onDelete={handleDelete}
          onCreate={handleNewChat}
          onClose={() => setSidebarOpen(false)}
        />
        {/* Theme toggle at bottom of sidebar */}
        <div className="absolute bottom-4 left-3 pb-[env(safe-area-inset-bottom)]">
          <ThemeToggle theme={theme} setTheme={setTheme} />
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 min-w-0">
        <ChatArea
          messages={messages}
          isStreaming={isStreaming}
          model={model}
          conversationId={activeId}
          onSend={handleSend}
          onStop={stop}
          onModelChange={handleModelChange}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />
      </div>
    </div>
  );
}
