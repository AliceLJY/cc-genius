'use client';

import { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Conversation, ModelType } from '@/lib/types';
import * as db from '@/lib/db';

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Load conversations
  const load = useCallback(async () => {
    const convs = searchQuery
      ? await db.searchConversations(searchQuery)
      : await db.listConversations();
    setConversations(convs);
  }, [searchQuery]);

  useEffect(() => {
    load();
  }, [load]);

  // Create new conversation
  const create = useCallback(
    async (model: ModelType = 'sonnet') => {
      // Generate ID with fallback for non-secure contexts
      let id: string;
      try {
        id = uuidv4();
      } catch {
        id = Date.now().toString(36) + Math.random().toString(36).slice(2);
      }

      const conv: Conversation = {
        id,
        title: 'New Chat',
        model,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await db.createConversation(conv);
      setConversations((prev) => [conv, ...prev]);
      setActiveId(conv.id);
      return conv;
    },
    []
  );

  // Delete conversation
  const remove = useCallback(
    async (id: string) => {
      await db.deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        setActiveId(null);
      }
    },
    [activeId]
  );

  // Select conversation
  const select = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  // Refresh single conversation (after title update etc.)
  const refresh = useCallback(async () => {
    await load();
  }, [load]);

  // Resume an external CC session (from terminal/TG)
  const resumeSession = useCallback(
    async (ccSessionId: string, title: string, model: ModelType = 'sonnet') => {
      let id: string;
      try {
        id = uuidv4();
      } catch {
        id = Date.now().toString(36) + Math.random().toString(36).slice(2);
      }

      const conv: Conversation = {
        id,
        title: title || 'Resumed Session',
        model,
        ccSessionId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await db.createConversation(conv);
      setConversations((prev) => [conv, ...prev]);
      setActiveId(conv.id);
      return conv;
    },
    []
  );

  const active = conversations.find((c) => c.id === activeId) || null;

  return {
    conversations,
    active,
    activeId,
    create,
    resumeSession,
    remove,
    select,
    refresh,
    searchQuery,
    setSearchQuery,
  };
}
