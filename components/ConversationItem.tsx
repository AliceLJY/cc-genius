'use client';

import type { Conversation } from '@/lib/types';

interface Props {
  conversation: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

function formatTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const day = 86400000;

  if (diff < day) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 2 * day) return 'Yesterday';
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function ConversationItem({ conversation, isActive, onSelect, onDelete }: Props) {
  return (
    <div
      onClick={onSelect}
      className={`group flex items-center gap-2 px-3 py-3 cursor-pointer rounded-lg mx-2 mb-0.5
        transition-colors relative
        ${
          isActive
            ? 'bg-blue-50 dark:bg-blue-900/30 border-l-3 border-blue-500'
            : 'hover:bg-gray-100 dark:hover:bg-gray-800 border-l-3 border-transparent'
        }`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate text-gray-800 dark:text-gray-200">
          {conversation.title}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {formatTime(conversation.updatedAt)}
        </div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          if (confirm('Delete this conversation?')) {
            onDelete();
          }
        }}
        className={`${
          isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        } p-1.5 rounded hover:bg-red-100
          dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-all`}
        title="Delete"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </button>
    </div>
  );
}
