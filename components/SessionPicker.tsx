'use client';

import { useState, useEffect, useCallback } from 'react';

interface ExternalSession {
  sessionId: string;
  displayName: string;
  firstTopic: string;
  lastTopic: string;
  lastActive: number;
  size: number;
  cwd: string;
  projectName: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onResume: (sessionId: string, title: string) => void;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function SessionPicker({ open, onClose, onResume }: Props) {
  const [sessions, setSessions] = useState<ExternalSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/sessions?limit=15');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchSessions();
  }, [open, fetchSessions]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg max-h-[80vh] flex flex-col
        bg-white dark:bg-gray-900 rounded-2xl shadow-2xl
        border border-gray-200 dark:border-gray-700 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
            Resume CC Session
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-2">
          {loading && (
            <div className="flex items-center justify-center py-12 text-gray-400 dark:text-gray-500 text-sm">
              Scanning sessions...
            </div>
          )}

          {error && (
            <div className="px-4 py-8 text-center text-sm text-red-500">
              {error}
            </div>
          )}

          {!loading && !error && sessions.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
              No sessions found
            </div>
          )}

          {!loading && sessions.map((s) => (
            <button
              key={s.sessionId}
              onClick={() => onResume(s.sessionId, s.displayName)}
              className="w-full text-left px-3 py-2.5 rounded-xl mb-1
                hover:bg-gray-100 dark:hover:bg-gray-800
                transition-colors group"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                    {s.displayName}
                  </div>
                  {s.firstTopic && s.firstTopic !== s.lastTopic && (
                    <div className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                      Started: {s.firstTopic}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-400 dark:text-gray-500">
                    <span>{timeAgo(s.lastActive)}</span>
                    <span>{formatSize(s.size)}</span>
                    {s.projectName && (
                      <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                        {s.projectName}
                      </span>
                    )}
                  </div>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity
                  text-xs text-blue-500 dark:text-blue-400 whitespace-nowrap mt-1">
                  Resume
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
