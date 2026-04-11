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
  try {
    const db = await getDB();
    await db.put('conversations', conv);
    return conv;
  } catch (err) {
    console.error('[CC Genius DB] createConversation failed:', err);
    throw err;
  }
}

export async function getConversation(id: string): Promise<Conversation | undefined> {
  try {
    const db = await getDB();
    return db.get('conversations', id);
  } catch (err) {
    console.error('[CC Genius DB] getConversation failed:', err);
    return undefined;
  }
}

export async function listConversations(): Promise<Conversation[]> {
  try {
    const db = await getDB();
    const all = await db.getAll('conversations');
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (err) {
    console.error('[CC Genius DB] listConversations failed:', err);
    return [];
  }
}

export async function updateConversation(
  id: string,
  updates: Partial<Conversation>
): Promise<void> {
  try {
    const db = await getDB();
    const conv = await db.get('conversations', id);
    if (conv) {
      await db.put('conversations', { ...conv, ...updates });
    }
  } catch (err) {
    console.error('[CC Genius DB] updateConversation failed:', err);
  }
}

export async function deleteConversation(id: string): Promise<void> {
  try {
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
  } catch (err) {
    console.error('[CC Genius DB] deleteConversation failed:', err);
    throw err;
  }
}

export async function searchConversations(query: string): Promise<Conversation[]> {
  try {
    const all = await listConversations();
    const q = query.toLowerCase();
    return all.filter((c) => c.title.toLowerCase().includes(q));
  } catch (err) {
    console.error('[CC Genius DB] searchConversations failed:', err);
    return [];
  }
}

// ─── Messages ───

export async function addMessage(msg: Message): Promise<Message> {
  try {
    const db = await getDB();
    await db.put('messages', msg);
    return msg;
  } catch (err) {
    console.error('[CC Genius DB] addMessage failed:', err);
    throw err;
  }
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  try {
    const db = await getDB();
    const index = db.transaction('messages').store.index('conversationId');
    const all = await index.getAll(conversationId);
    return all.sort((a, b) => a.timestamp - b.timestamp);
  } catch (err) {
    console.error('[CC Genius DB] getMessages failed:', err);
    return [];
  }
}

export async function updateMessage(id: string, content: string): Promise<void> {
  try {
    const db = await getDB();
    const msg = await db.get('messages', id);
    if (msg) {
      await db.put('messages', { ...msg, content });
    }
  } catch (err) {
    console.error('[CC Genius DB] updateMessage failed:', err);
  }
}

export async function deleteMessages(conversationId: string): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction('messages', 'readwrite');
    const index = tx.store.index('conversationId');
    let cursor = await index.openCursor(conversationId);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  } catch (err) {
    console.error('[CC Genius DB] deleteMessages failed:', err);
    throw err;
  }
}
