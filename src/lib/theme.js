// Theme preference: 'system' | 'light' | 'dark'.
//
// 'system' is the default and deliberately removes the data-theme
// attribute rather than setting it to a value. tokens.css guards its dark
// block with `:root:not([data-theme='light'])`, so the attribute being
// absent is what lets prefers-color-scheme take over. Stamping
// data-theme="light" on every load -- which is what the app used to do --
// permanently suppressed that media query, leaving a chef whose phone was
// in dark mode staring at the light theme with no way to know the dark
// one existed except by finding the toggle.

const STORAGE_KEY = 'meal-diary-theme';
const ORDER = ['system', 'light', 'dark'];

export const THEME_LABELS = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

export function loadTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return ORDER.includes(stored) ? stored : 'system';
  } catch {
    return 'system'; // storage blocked; follow the OS
  }
}

export function saveTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // storage blocked, the choice just won't survive a reload
  }
}

export function nextTheme(theme) {
  return ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
}

export function applyTheme(theme) {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}
