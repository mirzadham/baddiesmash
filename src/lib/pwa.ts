import { useEffect, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent immediate mini-infobar on mobile Chrome
    e.preventDefault();
    deferredPrompt = e;
    promptListeners.forEach((listener) => listener());
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    promptListeners.forEach((listener) => listener());
  });
}

/**
 * Registers the PWA service worker in production environments.
 */
export function registerServiceWorker(): void {
  if (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    import.meta.env.PROD
  ) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('Service worker registration failed:', err);
      });
    });
  }
}

/**
 * Checks if the app is currently running as a standalone PWA.
 */
export function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    const mediaQueryList =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)')
        : null;
    const isMatchMediaStandalone = Boolean(mediaQueryList?.matches);

    const isNavStandalone =
      typeof navigator !== 'undefined' &&
      (navigator as unknown as { standalone?: boolean }).standalone === true;

    return Boolean(isMatchMediaStandalone || isNavStandalone);
  } catch {
    return false;
  }
}

/**
 * Checks if the current browser is iOS Safari.
 */
export function isIosSafari(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) && !(window as unknown as { MSStream?: boolean }).MSStream;
  const isSafari = /WebKit/.test(ua) && !/CriOS|FxiOS|OPiOS|mercury/i.test(ua);
  return isIos && isSafari;
}

/**
 * React hook to access PWA installation state and trigger install prompt.
 */
export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState<boolean>(Boolean(deferredPrompt));
  const [isStandalone, setIsStandalone] = useState<boolean>(() => isRunningStandalone());
  const [isIos] = useState<boolean>(() => isIosSafari());
  const [installOutcome, setInstallOutcome] = useState<'idle' | 'accepted' | 'dismissed'>('idle');

  useEffect(() => {
    const update = () => {
      setCanInstall(Boolean(deferredPrompt));
      setIsStandalone(isRunningStandalone());
    };

    promptListeners.add(update);
    update();

    return () => {
      promptListeners.delete(update);
    };
  }, []);

  const triggerInstallPrompt = async () => {
    if (!deferredPrompt) {
      return;
    }
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setInstallOutcome(outcome);
    if (outcome === 'accepted') {
      deferredPrompt = null;
      setCanInstall(false);
    }
  };

  return {
    canInstall,
    isStandalone,
    isIos,
    installOutcome,
    triggerInstallPrompt,
  };
}
