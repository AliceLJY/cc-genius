'use client';

import { useEffect, useRef } from 'react';
import { filterCommands, type SlashCommand, type EffortLevel } from '@/lib/commands';

interface Props {
  filter: string
  selectedIndex: number
  onSelect: (command: SlashCommand) => void
  onEffortSelect?: (level: EffortLevel) => void
  showEffortSub?: boolean
  effortIndex?: number
}

const EFFORT_LEVELS: EffortLevel[] = ['low', 'medium', 'high'];
const EFFORT_LABELS: Record<EffortLevel, string> = {
  low: '低 — 快速回答',
  medium: '中 — 平衡模式',
  high: '高 — 深度思考',
};

export default function CommandPalette({
  filter,
  selectedIndex,
  onSelect,
  onEffortSelect,
  showEffortSub,
  effortIndex = 0,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const commands = filterCommands(filter);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const items = el.querySelectorAll('[data-cmd-item]');
    items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (commands.length === 0) return null;

  // Effort sub-menu
  if (showEffortSub) {
    return (
      <div
        ref={listRef}
        className="absolute bottom-full left-0 right-0 mb-1 mx-3
          bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden z-50"
      >
        <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-700">
          选择思考深度
        </div>
        {EFFORT_LEVELS.map((level, i) => (
          <button
            key={level}
            data-cmd-item
            onClick={() => onEffortSelect?.(level)}
            className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors
              ${i === effortIndex
                ? 'bg-blue-600/20 text-blue-300'
                : 'text-gray-200 hover:bg-gray-700/50'
              }`}
          >
            <span className="font-mono text-sm font-semibold">{level}</span>
            <span className="text-xs text-gray-400">{EFFORT_LABELS[level]}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-1 mx-3
        bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden z-50
        max-h-[280px] overflow-y-auto"
    >
      {commands.map((cmd, i) => (
        <button
          key={cmd.name}
          data-cmd-item
          onClick={() => onSelect(cmd)}
          className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors
            ${i === selectedIndex
              ? 'bg-blue-600/20 text-blue-300'
              : 'text-gray-200 hover:bg-gray-700/50'
            }`}
        >
          <span className="font-mono text-sm font-semibold min-w-[80px]">{cmd.name}</span>
          <span className="text-xs text-gray-400 flex-1">{cmd.description}</span>
          {cmd.args && (
            <span className="text-[10px] text-gray-500 font-mono">{cmd.args}</span>
          )}
        </button>
      ))}
    </div>
  );
}
