'use client';

type Theme = 'light' | 'dark' | 'system';

interface ThemeToggleProps {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const icons: Record<Theme, string> = {
  light: '☀️',
  dark: '🌙',
  system: '💻',
};

const next: Record<Theme, Theme> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

export default function ThemeToggle({ theme, setTheme }: ThemeToggleProps) {
  return (
    <button
      onClick={() => setTheme(next[theme])}
      className="flex items-center justify-center w-9 h-9 rounded-lg
        hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      title={`Theme: ${theme}`}
    >
      <span className="text-lg">{icons[theme]}</span>
    </button>
  );
}
