'use client';

import type { Conversation, ModelType } from '@/lib/types';
import ConversationItem from './ConversationItem';

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: (model?: ModelType) => void;
  onClose?: () => void;
}

export default function Sidebar({
  conversations,
  activeId,
  searchQuery,
  onSearchChange,
  onSelect,
  onDelete,
  onCreate,
  onClose,
}: Props) {
  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3">
        <h1 className="text-lg font-semibold text-gray-800 dark:text-gray-100 flex-1">
          CC Baby
        </h1>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 lg:hidden"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* New chat button */}
      <div className="px-3 pb-2">
        <button
          onClick={() => onCreate()}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl
            border-2 border-dashed border-gray-300 dark:border-gray-600
            text-gray-600 dark:text-gray-300
            hover:bg-gray-100 dark:hover:bg-gray-800
            hover:border-blue-400 dark:hover:border-blue-500
            transition-colors text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Chat
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search chats..."
          className="w-full px-3 py-2 text-sm rounded-lg
            bg-white dark:bg-gray-800
            border border-gray-200 dark:border-gray-700
            text-gray-700 dark:text-gray-200
            placeholder-gray-400 dark:placeholder-gray-500
            focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto py-1">
        {conversations.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
            {searchQuery ? 'No matches' : 'No conversations yet'}
          </div>
        ) : (
          conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isActive={conv.id === activeId}
              onSelect={() => onSelect(conv.id)}
              onDelete={() => onDelete(conv.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
