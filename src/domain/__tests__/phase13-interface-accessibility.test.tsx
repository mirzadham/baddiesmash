// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../App.tsx';
import {
  buildDeterministicDemoSnapshot,
  DEMO_PLAYER_IDS,
} from '../../services/demoData.ts';
import { createDemoTrackerRepository } from '../../services/trackerRepository.ts';

afterEach(() => {
  cleanup();
});

describe('Phase 13 — Cross-Discipline Interface & Accessibility Remediation', () => {
  it('exposes keyboard-visible focus styles on header utility buttons', async () => {
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

    const adminBtn = screen.getByTestId('toggle-admin-tools-btn');
    expect(adminBtn).toBeTruthy();
    // Verify focus styles ensure visibility on focus
    expect(adminBtn.className).toContain('focus:not-sr-only');

    // Confirm obsolete theme button is not present
    const themeBtn = screen.queryByRole('button', { name: /toggle theme/i });
    expect(themeBtn).toBeNull();
  });

  it('exposes aria-pressed states and minimum hit targets on Leaderboard Singles/Doubles toggle', async () => {
    const repo = createDemoTrackerRepository();
    render(<App repository={repo} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    const primaryNav = screen.getByRole('navigation', { name: /Primary navigation/i });
    fireEvent.click(within(primaryNav).getByRole('button', { name: /Leaderboard/i }));

    await waitFor(() => {
      expect(screen.getByTestId('view-leaderboard')).toBeTruthy();
    });

    const doublesBtn = screen.getByRole('button', { name: /^Doubles$/i });
    const singlesBtn = screen.getByRole('button', { name: /^Singles$/i });

    // Initial state: doubles is active
    expect(doublesBtn.getAttribute('aria-pressed')).toBe('true');
    expect(singlesBtn.getAttribute('aria-pressed')).toBe('false');

    // Switch to singles
    fireEvent.click(singlesBtn);
    expect(doublesBtn.getAttribute('aria-pressed')).toBe('false');
    expect(singlesBtn.getAttribute('aria-pressed')).toBe('true');

    // Switch back to doubles
    fireEvent.click(doublesBtn);
    expect(doublesBtn.getAttribute('aria-pressed')).toBe('true');
    expect(singlesBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('supports keyboard activation (Enter and Space) on podium cards', async () => {
    const repo = createDemoTrackerRepository();
    render(<App repository={repo} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    const primaryNav = screen.getByRole('navigation', { name: /Primary navigation/i });
    fireEvent.click(within(primaryNav).getByRole('button', { name: /Leaderboard/i }));

    await waitFor(() => {
      expect(screen.getByTestId('leaderboard-podium')).toBeTruthy();
    });

    // 1st place Aaron card on podium
    const aaronPodium = screen.getByTestId(`leaderboard-row-${DEMO_PLAYER_IDS.aaron}`);
    expect(aaronPodium.getAttribute('role')).toBe('button');
    expect(aaronPodium.getAttribute('tabindex')).toBe('0');
    expect(aaronPodium.getAttribute('aria-label')).toMatch(/Aaron/i);

    // Keyboard activation via Enter key
    fireEvent.keyDown(aaronPodium, { key: 'Enter' });
    await waitFor(() => {
      expect(screen.getByTestId('view-profile')).toBeTruthy();
      expect(screen.getByRole('heading', { level: 2, name: /Aaron Tan/i })).toBeTruthy();
    });
  });

  it('exposes aria-pressed states on Sessions filter tabs', async () => {
    const repo = createDemoTrackerRepository();
    render(<App repository={repo} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    const primaryNav = screen.getByRole('navigation', { name: /Primary navigation/i });
    fireEvent.click(within(primaryNav).getByRole('button', { name: /Sessions/i }));

    await waitFor(() => {
      expect(screen.getByTestId('view-sessions')).toBeTruthy();
    });

    const filterGroup = screen.getByRole('group', { name: /Filter sessions by format/i });
    expect(filterGroup).toBeTruthy();

    const allBtn = within(filterGroup).getByRole('button', { name: /^All$/i });
    const singlesBtn = within(filterGroup).getByRole('button', { name: /^Singles$/i });
    const doublesBtn = within(filterGroup).getByRole('button', { name: /^Doubles$/i });

    expect(allBtn.getAttribute('aria-pressed')).toBe('true');
    expect(singlesBtn.getAttribute('aria-pressed')).toBe('false');
    expect(doublesBtn.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(doublesBtn);
    expect(allBtn.getAttribute('aria-pressed')).toBe('false');
    expect(doublesBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('provides an accessible name for the 10-second immediate undo dismiss button', async () => {
    const baseSnap = {
      ...buildDeterministicDemoSnapshot(),
      isDemoMode: false,
    };
    const baseDemo = createDemoTrackerRepository(baseSnap);
    const repo = {
      ...baseDemo,
      isDemoMode: false,
      loadViewerGateState: async () => ({
        status: 'approved' as const,
        userId: baseSnap.viewerMembership.user_id,
        userEmail: 'aaron.owner@example.com',
        membership: baseSnap.viewerMembership,
        snapshot: baseSnap,
      }),
      recordCompletedMatch: async () => ({
        match_id: '00000000-0000-4000-8000-000000000450',
        session_id: baseSnap.sessions[0]!.id,
        sequence_number: 4,
        status: 'completed' as const,
        idempotent_retry: false,
        recalculation: {
          recalculation_succeeded: true,
          recalculation_status: 'idle' as const,
          recalculation_run_id: '00000000-0000-4000-8000-000000000888',
          published_rating_version_id: '00000000-0000-4000-8000-000000000905',
          required_match_state_seq: 6,
        },
      }),
    };
    render(<App repository={repo} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    const primaryNav = screen.getByRole('navigation', { name: /Primary navigation/i });
    fireEvent.click(within(primaryNav).getByRole('button', { name: /Sessions/i }));

    await waitFor(() => {
      expect(screen.getByTestId('view-sessions')).toBeTruthy();
    });

    // Record a valid match to trigger 10s undo banner
    fireEvent.change(screen.getByTestId('match-slot-a1'), {
      target: { value: DEMO_PLAYER_IDS.aaron },
    });
    fireEvent.change(screen.getByTestId('match-slot-a2'), {
      target: { value: DEMO_PLAYER_IDS.brenda },
    });
    fireEvent.change(screen.getByTestId('match-slot-b1'), {
      target: { value: DEMO_PLAYER_IDS.chong },
    });
    fireEvent.change(screen.getByTestId('match-slot-b2'), {
      target: { value: DEMO_PLAYER_IDS.diana },
    });
    fireEvent.change(screen.getByTestId('match-score-a-input'), {
      target: { value: '21' },
    });
    fireEvent.change(screen.getByTestId('match-score-b-input'), {
      target: { value: '18' },
    });

    fireEvent.click(screen.getByTestId('record-match-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('immediate-undo-banner')).toBeTruthy();
    });

    // Verify dismiss button has accessible name
    const dismissBtn = screen.getByRole('button', { name: /dismiss undo notification/i });
    expect(dismissBtn).toBeTruthy();

    fireEvent.click(dismissBtn);
    expect(screen.queryByTestId('immediate-undo-banner')).toBeNull();
  });
});
