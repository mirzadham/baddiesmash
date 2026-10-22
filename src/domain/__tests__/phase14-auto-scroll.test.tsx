// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../App.tsx';
import { scrollToTop } from '../../lib/scroll.ts';
import {
  buildDeterministicDemoSnapshot,
} from '../../services/demoData.ts';
import { createDemoTrackerRepository } from '../../services/trackerRepository.ts';

describe('Phase 14 — Auto-Scroll to Top for Admin Tools and Session Selection', () => {
  let scrollToSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scrollToSpy = vi.fn();
    window.scrollTo = scrollToSpy;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('scrollToTop utility', () => {
    it('scrolls with smooth behavior by default when reduced motion is not requested', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      scrollToTop();

      expect(scrollToSpy).toHaveBeenCalledWith({
        top: 0,
        left: 0,
        behavior: 'smooth',
      });
    });

    it('scrolls with instant auto behavior when prefers-reduced-motion is active', () => {
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('prefers-reduced-motion: reduce'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      scrollToTop();

      expect(scrollToSpy).toHaveBeenCalledWith({
        top: 0,
        left: 0,
        behavior: 'auto',
      });
    });

    it('scrolls with instant auto behavior when forceInstant: true is passed', () => {
      window.matchMedia = vi.fn().mockImplementation(() => ({
        matches: false,
        media: '',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      scrollToTop({ forceInstant: true });

      expect(scrollToSpy).toHaveBeenCalledWith({
        top: 0,
        left: 0,
        behavior: 'auto',
      });
    });
  });

  describe('App integration auto-scroll triggers', () => {
    it('automatically scrolls to top when "Open Admin Tools" is clicked in ProfileView', async () => {
      const base = buildDeterministicDemoSnapshot();
      const repo = createDemoTrackerRepository({
        ...base,
        viewerMembership: {
          ...base.viewerMembership,
          role: 'admin',
        },
      });

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

      scrollToSpy.mockClear();

      // Click "Open Admin Tools" button
      const openAdminBtn = screen.getByTestId('toggle-admin-tools-profile-btn');
      expect(openAdminBtn).toBeTruthy();
      fireEvent.click(openAdminBtn);

      await waitFor(() => {
        expect(screen.getByTestId('admin-governance-panel')).toBeTruthy();
      });

      // Verify scrollTo was called with top: 0
      expect(scrollToSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          top: 0,
          left: 0,
        }),
      );
    });

    it('automatically scrolls to top when header Admin Tools toggle is clicked', async () => {
      const base = buildDeterministicDemoSnapshot();
      const repo = createDemoTrackerRepository({
        ...base,
        viewerMembership: {
          ...base.viewerMembership,
          role: 'owner',
        },
      });

      render(<App repository={repo} />);

      await waitFor(() => {
        expect(screen.getByTestId('view-home')).toBeTruthy();
      });

      scrollToSpy.mockClear();

      const headerAdminBtn = screen.getByTestId('toggle-admin-tools-btn');
      fireEvent.click(headerAdminBtn);

      await waitFor(() => {
        expect(screen.getByTestId('admin-governance-panel')).toBeTruthy();
      });

      expect(scrollToSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          top: 0,
          left: 0,
        }),
      );
    });

    it('automatically scrolls to top when a session is selected in SessionsView', async () => {
      const base = buildDeterministicDemoSnapshot();
      const repo = createDemoTrackerRepository(base);

      render(<App repository={repo} />);

      await waitFor(() => {
        expect(screen.getByTestId('view-home')).toBeTruthy();
      });

      // Navigate to Sessions tab
      const primaryNav = screen.getByRole('navigation', { name: /Primary navigation/i });
      fireEvent.click(within(primaryNav).getByRole('button', { name: /Sessions/i }));

      await waitFor(() => {
        expect(screen.getByTestId('view-sessions')).toBeTruthy();
      });

      scrollToSpy.mockClear();

      // Find past session card in session history
      const pastSession = base.sessions.find((s) => s.status === 'completed');
      expect(pastSession).toBeTruthy();

      const sessionCard = screen.getByTestId(`session-card-${pastSession!.id}`);
      expect(sessionCard).toBeTruthy();
      fireEvent.click(sessionCard);

      expect(scrollToSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          top: 0,
          left: 0,
        }),
      );
    });

    it('auto-minimizes previously expanded session when another session is clicked', async () => {
      const base = buildDeterministicDemoSnapshot();
      expect(base.sessions.length).toBeGreaterThanOrEqual(2);

      const s1 = base.sessions[0];
      const s2 = base.sessions[1];

      const repo = createDemoTrackerRepository(base);
      render(<App repository={repo} />);

      await waitFor(() => {
        expect(screen.getByTestId('view-home')).toBeTruthy();
      });

      const primaryNav = screen.getByRole('navigation', { name: /Primary navigation/i });
      fireEvent.click(within(primaryNav).getByRole('button', { name: /Sessions/i }));

      await waitFor(() => {
        expect(screen.getByTestId('view-sessions')).toBeTruthy();
      });

      const s1Card = screen.getByTestId(`session-card-${s1!.id}`);
      const s2Card = screen.getByTestId(`session-card-${s2!.id}`);

      // Click session 1 to expand it
      const s1HeaderBtn = within(s1Card).getByRole('button');
      fireEvent.click(s1HeaderBtn);

      expect(s1HeaderBtn.getAttribute('aria-expanded')).toBe('true');
      expect(within(s2Card).getByRole('button').getAttribute('aria-expanded')).toBe('false');

      // Now click session 2 to expand it
      const s2HeaderBtn = within(s2Card).getByRole('button');
      fireEvent.click(s2HeaderBtn);

      // Session 2 is now expanded, and session 1 automatically minimized
      expect(s2HeaderBtn.getAttribute('aria-expanded')).toBe('true');
      expect(within(s1Card).getByRole('button').getAttribute('aria-expanded')).toBe('false');
    });

    it('minimizes the session in place without scrolling to top when the minimize arrow is clicked', async () => {
      const base = buildDeterministicDemoSnapshot();
      const pastSession = base.sessions.find((s) => s.status === 'completed');
      expect(pastSession).toBeTruthy();

      const repo = createDemoTrackerRepository(base);
      render(<App repository={repo} />);

      await waitFor(() => {
        expect(screen.getByTestId('view-home')).toBeTruthy();
      });

      const primaryNav = screen.getByRole('navigation', { name: /Primary navigation/i });
      fireEvent.click(within(primaryNav).getByRole('button', { name: /Sessions/i }));

      await waitFor(() => {
        expect(screen.getByTestId('view-sessions')).toBeTruthy();
      });

      const sessionCard = screen.getByTestId(`session-card-${pastSession!.id}`);
      const headerBtn = within(sessionCard).getByRole('button');

      // First click: expand session (calls scrollToTop)
      fireEvent.click(headerBtn);
      expect(headerBtn.getAttribute('aria-expanded')).toBe('true');

      // Clear spy to test the minimize action specifically
      scrollToSpy.mockClear();

      // Second click: click minimize arrow to collapse
      fireEvent.click(headerBtn);

      // Card is now minimized
      expect(headerBtn.getAttribute('aria-expanded')).toBe('false');

      // scrollTo was NOT called when minimizing
      expect(scrollToSpy).not.toHaveBeenCalled();
    });

    it('automatically scrolls to top when clicking View Session from HomeView', async () => {
      const base = buildDeterministicDemoSnapshot();
      const repo = createDemoTrackerRepository(base);

      render(<App repository={repo} />);

      await waitFor(() => {
        expect(screen.getByTestId('view-home')).toBeTruthy();
      });

      scrollToSpy.mockClear();

      const viewSessionBtn = screen.getByRole('button', { name: /View Session/i });
      expect(viewSessionBtn).toBeTruthy();
      fireEvent.click(viewSessionBtn);

      expect(scrollToSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          top: 0,
          left: 0,
        }),
      );
    });
  });
});
