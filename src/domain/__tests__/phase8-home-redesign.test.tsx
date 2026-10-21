// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { App } from '../../App.tsx';
import {
  buildDeterministicDemoSnapshot,
} from '../../services/demoData.ts';
import { deriveWeeklyLeaderboardFromSnapshot } from '../../services/readViewModels.ts';
import { createDemoTrackerRepository } from '../../services/trackerRepository.ts';

afterEach(() => {
  cleanup();
});

describe('Phase 8 — SMASHTRACK Home Interface & Shell Redesign', () => {
  it('renders SMASHTRACK brand logo and user avatar in header with zero hamburger menu icon', async () => {
    const repo = createDemoTrackerRepository();
    render(<App repository={repo} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    // Verify SMASHTRACK brand text
    expect(screen.getByText('SMASH')).toBeTruthy();
    expect(screen.getByText('TRACK')).toBeTruthy();

    // Verify NO hamburger menu icon exists
    expect(screen.queryByLabelText(/menu/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /hamburger/i })).toBeNull();

    // Verify User profile avatar exists and navigates to Profile
    const avatarBtn = screen.getByRole('button', { name: /view user profile/i });
    expect(avatarBtn).toBeTruthy();

    fireEvent.click(avatarBtn);
    await waitFor(() => {
      expect(screen.getByTestId('view-profile')).toBeTruthy();
    });
  });

  it('renders primary + Start New Session / Resume CTA and navigates to Sessions tab', async () => {
    const repo = createDemoTrackerRepository();
    render(<App repository={repo} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    const ctaBtn = screen.getByRole('button', {
      name: /resume active session|start new session/i,
    });
    expect(ctaBtn).toBeTruthy();

    fireEvent.click(ctaBtn);
    await waitFor(() => {
      expect(screen.getByTestId('view-sessions')).toBeTruthy();
    });
  });

  it('renders Latest Session hero card with attendees count, matches completed, and royal blue View Session button', async () => {
    const repo = createDemoTrackerRepository();
    render(<App repository={repo} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    // Verify Latest / Current Session card heading
    expect(screen.getByRole('heading', { level: 2, name: /session/i })).toBeTruthy();

    // Verify Attendees label and count
    expect(screen.getByText('Attendees')).toBeTruthy();

    // Verify Matches Completed label and count
    expect(screen.getByText('Matches Completed')).toBeTruthy();

    // Verify View Session > button
    const viewSessionBtn = screen.getByRole('button', { name: /view session/i });
    expect(viewSessionBtn).toBeTruthy();

    fireEvent.click(viewSessionBtn);
    await waitFor(() => {
      expect(screen.getByTestId('view-sessions')).toBeTruthy();
    });
  });

  it('computes Weekly Leaderboard with medal badges, win-loss records, win rate percentage, and Elo points', async () => {
    const snapshot = buildDeterministicDemoSnapshot();
    const weeklyRows = deriveWeeklyLeaderboardFromSnapshot(snapshot);

    expect(weeklyRows.length).toBeGreaterThanOrEqual(3);
    const top1 = weeklyRows[0]!;
    expect(top1.rank).toBe(1);
    expect(top1.winRatePercentDisplay).toMatch(/%/);
    expect(top1.ratingDisplay).toBeTruthy();

    const repo = createDemoTrackerRepository();
    render(<App repository={repo} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    // Verify Weekly Leaderboard section heading
    expect(screen.getByRole('heading', { level: 2, name: /weekly leaderboard/i })).toBeTruthy();

    // Verify "See All" link navigates to Leaderboard
    const seeAllBtn = screen.getByRole('button', { name: /see all/i });
    expect(seeAllBtn).toBeTruthy();

    // Verify Win Rate and points display on the top player row
    expect(screen.getAllByText(new RegExp(`${top1.wins}W - ${top1.losses}L`, 'i')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(new RegExp(`${top1.winRatePercentDisplay} Win Rate`, 'i')).length).toBeGreaterThan(0);
    expect(screen.getByText(new RegExp(`${top1.ratingDisplay} pts`, 'i'))).toBeTruthy();

    // Clicking See All navigates to Leaderboard tab
    fireEvent.click(seeAllBtn);
    await waitFor(() => {
      expect(screen.getByTestId('view-leaderboard')).toBeTruthy();
    });
  });

  it('navigates to player Profile when clicking player name in Weekly Leaderboard', async () => {
    const repo = createDemoTrackerRepository();
    render(<App repository={repo} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    // Click on top player name (e.g. Aaron Tan)
    const playerBtn = screen.getByRole('button', { name: /Aaron Tan/i });
    expect(playerBtn).toBeTruthy();

    fireEvent.click(playerBtn);
    await waitFor(() => {
      expect(screen.getByTestId('view-profile')).toBeTruthy();
    });
  });

  it('highlights active Home tab with the top indicator line in bottom navigation', async () => {
    const repo = createDemoTrackerRepository();
    render(<App repository={repo} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    const primaryNav = screen.getByRole('navigation', { name: /Primary navigation/i });
    const homeNavBtn = within(primaryNav).getByRole('button', { name: /Home/i });
    expect(homeNavBtn.getAttribute('aria-current')).toBe('page');

    // Indicator class is rendered inside the active tab button
    expect(homeNavBtn.querySelector('.bottom-nav-indicator')).toBeTruthy();
  });
});
