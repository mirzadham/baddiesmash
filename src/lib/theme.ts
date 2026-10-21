export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_STORAGE_KEY = 'badminton_tracker_theme_pref';

export function getInitialThemePreference(): ThemePreference {
  if (typeof window === 'undefined') {
    return 'system';
  }
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const qTheme = urlParams.get('theme');
    if (qTheme === 'light' || qTheme === 'dark' || qTheme === 'system') {
      return qTheme;
    }
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
  } catch {
    // Ignore storage errors (private mode, SSR, etc.)
  }
  return 'system';
}

export function persistThemePreference(theme: ThemePreference): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    if (theme === 'system') {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  } catch {
    // Ignore storage errors
  }
}

export function applyThemeToDocument(theme: ThemePreference): void {
  if (typeof document === 'undefined') {
    return;
  }
  const root = document.documentElement;

  // Suppress transitions temporarily to prevent color smearing on theme switch
  let styleEl: HTMLStyleElement | null = null;
  if (document.head) {
    styleEl = document.createElement('style');
    styleEl.appendChild(
      document.createTextNode(
        '*, *::before, *::after { transition: none !important; }',
      ),
    );
    document.head.appendChild(styleEl);
  }

  if (theme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }

  if (styleEl && document.head) {
    // Force a style flush then re-enable transitions on the next frame
    if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
      void window.getComputedStyle(root).opacity;
    }
    const cleanup = () => {
      if (styleEl && styleEl.parentNode) {
        styleEl.parentNode.removeChild(styleEl);
      }
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(cleanup);
    } else {
      setTimeout(cleanup, 0);
    }
  }
}
