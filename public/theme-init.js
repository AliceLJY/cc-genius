// Theme initialization - runs before React hydration to prevent flash
(function () {
  try {
    var t = localStorage.getItem('theme') || 'system';
    var isDark =
      t === 'dark' ||
      (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (e) {
    // localStorage unavailable (private browsing etc.) — fall through
  }
})();
