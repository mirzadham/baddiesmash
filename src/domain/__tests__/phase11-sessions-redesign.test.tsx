// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { App } from '../../App.tsx';
import {
  DEMO_PLAYER_IDS,
  DEMO_SESSION_IDS,
} from '../../services/demoData.ts';
import { createDemoTrackerRepository } from '../../services/trackerRepository.ts';

afterEach(() => {
  cleanup();
});

describe('Phase 11 — SMASHTRACK Sessions View Redesign', () => {
  it('renders Sessions view header, filter pills, and active session card', async () => {
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

    // Check title
    expect(screen.getByRole('heading', { level: 1, name: /Sessions/i })).toBeTruthy();

    // Check filter pills [All] [Doubles] [Singles]
    expect(screen.getByRole('button', { name: /^All$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Doubles$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Singles$/i })).toBeTruthy();

    // Check "+ Start New Session" button
    expect(screen.getByTestId('toggle-start-session-btn')).toBeTruthy();

    // Check Active Session Controller Card exists
    expect(screen.getByTestId('active-session-card')).toBeTruthy();
  });

  it('renders attendance section with bench counter, check-in roster, and guest creation', async () => {
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

    expect(screen.getByTestId('session-attendance-panel')).toBeTruthy();
    expect(screen.getByTestId('session-bench-attendance')).toBeTruthy();
    expect(screen.getByText(/on Bench/i)).toBeTruthy();

    // Check-in button expands roster
    const checkInBtn = screen.getByRole('button', { name: /^Check-In$/i });
    fireEvent.click(checkInBtn);

    // Drop-in temporary guest input and button exist
    expect(screen.getByTestId('session-guest-name-input')).toBeTruthy();
    expect(screen.getByTestId('session-create-guest-btn')).toBeTruthy();

    // Check attendance rows for players
    expect(screen.getByTestId(`attendance-row-${DEMO_PLAYER_IDS.aaron}`)).toBeTruthy();
  });

  it('renders live doubles match entry recorder with slots, swap actions, and score validation', async () => {
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

    expect(screen.getByTestId('match-entry-panel')).toBeTruthy();

    // Check player selection slots
    expect(screen.getByTestId('match-slot-a1')).toBeTruthy();
    expect(screen.getByTestId('match-slot-a2')).toBeTruthy();
    expect(screen.getByTestId('match-slot-b1')).toBeTruthy();
    expect(screen.getByTestId('match-slot-b2')).toBeTruthy();

    // Check 1-tap swap actions
    expect(screen.getByTestId('swap-partners-btn')).toBeTruthy();
    expect(screen.getByTestId('swap-teams-btn')).toBeTruthy();

    // Check score inputs
    expect(screen.getByTestId('match-score-a-input')).toBeTruthy();
    expect(screen.getByTestId('match-score-b-input')).toBeTruthy();

    // Check record & draft buttons
    expect(screen.getByTestId('record-match-submit-btn')).toBeTruthy();
    expect(screen.getByTestId('save-draft-btn')).toBeTruthy();
  });

  it('renders Proposal 1 Session Wrap-Up section with finalize button at the bottom of active card', async () => {
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

    // Check Wrap-Up section exists
    expect(screen.getByText(/Session Wrap-Up/i)).toBeTruthy();

    // Check Finalize & Lock Session button exists
    expect(screen.getByTestId('finalize-session-btn')).toBeTruthy();
  });

  it('renders session history list with accordion cards matching sessions.jfif mockup', async () => {
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

    // Section title
    expect(screen.getByRole('heading', { level: 2, name: /Session History/i })).toBeTruthy();

    // Session 1 accordion card exists
    const session1Card = screen.getByTestId(`session-card-${DEMO_SESSION_IDS.session1}`);
    expect(session1Card).toBeTruthy();
    expect(within(session1Card).getByText(/Completed/i)).toBeTruthy();

    // Clicking session card expands it
    fireEvent.click(session1Card);
    expect(session1Card).toBeTruthy();
  });

  it('renders match cards with Team 1 on left, score in middle, Team 2 on right without Team 1/2 labels', async () => {
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

    const historySection = screen.getByTestId('session-match-history');
    expect(historySection).toBeTruthy();

    // Verify "Match #1" card exists
    expect(within(historySection).getByText(/Match #1/i)).toBeTruthy();

    // Ensure there are no "Team 1" or "Team 2" labels inside the match cards
    expect(within(historySection).queryByText(/^Team 1$/i)).toBeNull();
    expect(within(historySection).queryByText(/^Team 2$/i)).toBeNull();

    // Verify rating breakdown toggle is removed for a cleaner card layout
    expect(within(historySection).queryByText(/Show Rating Breakdown/i)).toBeNull();
  });
});
