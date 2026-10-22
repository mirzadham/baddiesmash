/**
 * Safely scrolls the window to the top.
 *
 * Respects user's `prefers-reduced-motion` settings per WCAG 2.2 / Front-End Guidelines:
 * - If reduced motion is requested, scrolls instantly (`behavior: 'auto'`).
 * - Otherwise, scrolls smoothly (`behavior: 'smooth'`).
 */
export function scrollToTop(options?: { forceInstant?: boolean }): void {
  if (typeof window === 'undefined' || typeof window.scrollTo !== 'function') {
    return;
  }

  let prefersReducedMotion = false;
  try {
    prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    // Graceful fallback for environments where matchMedia is not implemented
  }

  const behavior: ScrollBehavior =
    options?.forceInstant || prefersReducedMotion ? 'auto' : 'smooth';

  window.scrollTo({
    top: 0,
    left: 0,
    behavior,
  });
}
