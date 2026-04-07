'use client';

import type { ModelType } from '@/lib/types';

interface ModelSelectorProps {
  model: ModelType;
  onChange: (m: ModelType) => void;
}

const models: { value: ModelType; label: string; desc: string }[] = [
  { value: 'sonnet', label: 'Sonnet', desc: 'Fast & smart' },
  { value: 'opus', label: 'Opus', desc: 'Most capable' },
  { value: 'haiku', label: 'Haiku', desc: 'Quick & light' },
];

export default function ModelSelector({ model, onChange }: ModelSelectorProps) {
  return (
    <select
      value={model}
      onChange={(e) => onChange(e.target.value as ModelType)}
      className="px-2 py-1 text-sm rounded-lg border border-gray-300 dark:border-gray-600
        bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200
        focus:outline-none focus:ring-2 focus:ring-blue-500
        cursor-pointer"
    >
      {models.map((m) => (
        <option key={m.value} value={m.value}>
          {m.label} — {m.desc}
        </option>
      ))}
    </select>
  );
}
