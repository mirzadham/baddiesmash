export type ThemePreference = 'dark';

const THEME_STORAGE_KEY = 'badminton_tracker_theme_pref';

/**
 * Enforces the dark theme on document.documentElement and cleans up any legacy
 * theme preference stored in localStorage.
 */
export function applyThemeToDocument(_theme?: ThemePreference): void {
  if (typeof document === 'undefined') {
    return;
  }
  document.documentElement.setAttribute('data-theme', 'dark');

  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }
}
