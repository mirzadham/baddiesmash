// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { App } from '../../App.tsx';
import { createDemoTrackerRepository } from '../../services/trackerRepository.ts';
import { ProfileView } from '../../views/ProfileView.tsx';
import { buildDeterministicDemoSnapshot } from '../../services/demoData.ts';
import {
  isRunningStandalone,
  isIosSafari,
} from '../../lib/pwa.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (window as any).matchMedia;
});

describe('Phase 33 — Performance Code-Splitting & PWA Polish', () => {
  it('renders PWA support card under Preferences & Account in ProfileView', async () => {
    const snapshot = buildDeterministicDemoSnapshot();
    render(
      <ProfileView
        snapshot={snapshot}
        selectedPlayerId={null}
        onSelectPlayer={() => {}}
      />,
    );

    // Preferences & Account heading exists
    expect(screen.getByRole('heading', { name: /Preferences & Account/i })).toBeTruthy();

    // Default web environment renders PWA mobile card
    expect(screen.getByTestId('pwa-supported-card')).toBeTruthy();
    expect(screen.getByText(/Mobile Web App \(PWA\)/i)).toBeTruthy();
  });

  it('renders install button and triggers prompt when beforeinstallprompt event is fired', async () => {
    const promptSpy = vi.fn().mockResolvedValue(undefined);
    const mockPromptEvent = new Event('beforeinstallprompt') as any;
    mockPromptEvent.prompt = promptSpy;
    mockPromptEvent.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });

    // Render ProfileView
    const snapshot = buildDeterministicDemoSnapshot();
    const { unmount } = render(
      <ProfileView
        snapshot={snapshot}
        selectedPlayerId={null}
        onSelectPlayer={() => {}}
      />,
    );

    // Dispatch beforeinstallprompt event
    window.dispatchEvent(mockPromptEvent);

    await waitFor(() => {
      expect(screen.getByTestId('pwa-install-prompt-card')).toBeTruthy();
      expect(screen.getByTestId('pwa-install-btn')).toBeTruthy();
    });

    // Click install button
    fireEvent.click(screen.getByTestId('pwa-install-btn'));
    expect(promptSpy).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('renders standalone active badge when app is running as an installed PWA', () => {
    // Mock matchMedia to report display-mode: standalone
    window.matchMedia = vi.fn().mockImplementation((query: string) => {
      return {
        matches: query === '(display-mode: standalone)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } as unknown as MediaQueryList;
    });

    expect(isRunningStandalone()).toBe(true);

    const snapshot = buildDeterministicDemoSnapshot();
    render(
      <ProfileView
        snapshot={snapshot}
        selectedPlayerId={null}
        onSelectPlayer={() => {}}
      />,
    );

    const installedCard = screen.getByTestId('pwa-installed-card');
    expect(installedCard).toBeTruthy();
    expect(within(installedCard).getByText(/App Installed/i)).toBeTruthy();
    expect(within(installedCard).getByText(/Active/i)).toBeTruthy();
  });

  it('renders iOS Safari Home Screen instructions when userAgent is iOS Safari', () => {
    const originalUserAgent = navigator.userAgent;
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
      configurable: true,
    });

    expect(isIosSafari()).toBe(true);

    const snapshot = buildDeterministicDemoSnapshot();
    render(
      <ProfileView
        snapshot={snapshot}
        selectedPlayerId={null}
        onSelectPlayer={() => {}}
      />,
    );

    expect(screen.getByTestId('pwa-ios-instructions-card')).toBeTruthy();
    expect(screen.getByText(/Install on iPhone \/ iPad/i)).toBeTruthy();
    expect(screen.getByText(/Add to Home Screen/i)).toBeTruthy();

    Object.defineProperty(navigator, 'userAgent', {
      value: originalUserAgent,
      configurable: true,
    });
  });

  it('loads code-split AdminGovernanceView via Suspense when Open Admin Tools is clicked in App', async () => {
    const repo = createDemoTrackerRepository();
    render(<App repository={repo} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    // Navigate to Profile tab
    const primaryNav = screen.getByRole('navigation', { name: /Primary navigation/i });
    fireEvent.click(within(primaryNav).getByRole('button', { name: /Profile/i }));

    await waitFor(() => {
      expect(screen.getByTestId('view-profile')).toBeTruthy();
    });

    // Open Admin Tools
    const openAdminBtn = screen.getByTestId('toggle-admin-tools-profile-btn');
    fireEvent.click(openAdminBtn);

    // Verify Admin view loads through Suspense and displays Admin panel
    await waitFor(() => {
      expect(screen.getByTestId('admin-governance-panel')).toBeTruthy();
      expect(screen.getByRole('heading', { name: /Admin & Governance/i })).toBeTruthy();
    });
  });
});
