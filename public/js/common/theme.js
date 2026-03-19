const THEME_KEY = 'workshop-theme';

export function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  localStorage.setItem(THEME_KEY, theme);
}

export function initThemeToggle(toggleEl, onChange) {
  const stored = localStorage.getItem(THEME_KEY) || 'light';
  applyTheme(stored);

  if (toggleEl) {
    toggleEl.addEventListener('click', async () => {
      const next = document.body.classList.contains('dark') ? 'light' : 'dark';
      applyTheme(next);
      if (onChange) {
        await onChange(next);
      }
    });
  }

  return stored;
}
