'use client';

import { openDB, type IDBPDatabase } from 'idb';
import type { Conversation, Message } from './types';

const DB_NAME = 'cc-genius';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Conversations store
        if (!db.objectStoreNames.contains('conversations')) {
          const convStore = db.createObjectStore('conversations', { keyPath: 'id' });
          convStore.createIndex('updatedAt', 'updatedAt');
        }
        // Messages store
        if (!db.objectStoreNames.contains('messages')) {
          const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
          msgStore.createIndex('conversationId', 'conversationId');
          msgStore.createIndex('timestamp', 'timestamp');
        }
      },
    });
  }
  return dbPromise;
}

// ─── Conversations ───

export async function createConversation(conv: Conversation): Promise<Conversation> {
  const db = await getDB();
  await db.put('conversations', conv);
  return conv;
}

export async function getConversation(id: string): Promise<Conversation | undefined> {
  const db = await getDB();
  return db.get('conversations', id);
}

export async function listConversations(): Promise<Conversation[]> {
  const db = await getDB();
  const all = await db.getAll('conversations');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function updateConversation(
  id: string,
  updates: Partial<Conversation>
): Promise<void> {
  const db = await getDB();
  const conv = await db.get('conversations', id);
  if (conv) {
    await db.put('conversations', { ...conv, ...updates });
  }
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('conversations', id);
  // Delete associated messages
  const tx = db.transaction('messages', 'readwrite');
  const index = tx.store.index('conversationId');
  let cursor = await index.openCursor(id);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function searchConversations(query: string): Promise<Conversation[]> {
  const all = await listConversations();
  const q = query.toLowerCase();
  return all.filter((c) => c.title.toLowerCase().includes(q));
}

// ─── Messages ───

export async function addMessage(msg: Message): Promise<Message> {
  const db = await getDB();
  await db.put('messages', msg);
  return msg;
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const db = await getDB();
  const index = db.transaction('messages').store.index('conversationId');
  const all = await index.getAll(conversationId);
  return all.sort((a, b) => a.timestamp - b.timestamp);
}

export async function updateMessage(id: string, content: string): Promise<void> {
  const db = await getDB();
  const msg = await db.get('messages', id);
  if (msg) {
    await db.put('messages', { ...msg, content });
  }
}

export async function deleteMessages(conversationId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('messages', 'readwrite');
  const index = tx.store.index('conversationId');
  let cursor = await index.openCursor(conversationId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}
