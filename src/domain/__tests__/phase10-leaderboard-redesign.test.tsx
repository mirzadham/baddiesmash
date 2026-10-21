// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { App } from '../../App.tsx';
import {
  DEMO_PLAYER_IDS,
} from '../../services/demoData.ts';
import { createDemoTrackerRepository } from '../../services/trackerRepository.ts';

afterEach(() => {
  cleanup();
});

describe('Phase 10 — SMASHTRACK Leaderboard Interface Redesign', () => {
  it('renders Leaderboard title, Filter dropdown button, and Singles/Doubles switcher', async () => {
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

    // Check title and subtitle
    expect(screen.getByRole('heading', { level: 1, name: /Leaderboard/i })).toBeTruthy();
    expect(screen.getByText(/See who's leading the court/i)).toBeTruthy();

    // Check Filter dropdown trigger button
    const filterBtn = screen.getByRole('button', { name: /Filter leaderboard/i });
    expect(filterBtn).toBeTruthy();
    expect(within(filterBtn).getByText(/^Filter$/i)).toBeTruthy();

    // Check Singles | Doubles switcher
    expect(screen.getByRole('button', { name: /^Singles$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Doubles$/i })).toBeTruthy();
  });

  it('renders 3D podium with 1st Gold Crown, 2nd Silver, and 3rd Bronze blocks with points and W-L', async () => {
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

    const podium = screen.getByTestId('leaderboard-podium');

    // 1st Place (Aaron Tan)
    const aaronPodium = within(podium).getByTestId(`leaderboard-row-${DEMO_PLAYER_IDS.aaron}`);
    expect(within(aaronPodium).getByText('Aaron Tan')).toBeTruthy();
    expect(within(aaronPodium).getByText('1036')).toBeTruthy();
    expect(within(aaronPodium).getByText('1st')).toBeTruthy();

    // 2nd Place (Chong Wei)
    const chongPodium = within(podium).getByTestId(`leaderboard-row-${DEMO_PLAYER_IDS.chong}`);
    expect(within(chongPodium).getByText('Chong Wei')).toBeTruthy();
    expect(within(chongPodium).getByText('2nd')).toBeTruthy();

    // 3rd Place (Farah Aziz)
    const farahPodium = within(podium).getByTestId(`leaderboard-row-${DEMO_PLAYER_IDS.farahProvisional}`);
    expect(within(farahPodium).getByText('Farah Aziz')).toBeTruthy();
    expect(within(farahPodium).getByText('3rd')).toBeTruthy();
  });

  it('renders rank #4 and below in the dark ranking card with #Rank, points, and W-L', async () => {
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

    // Check Brenda Lim (#5)
    const brendaRow = screen.getByTestId(`leaderboard-row-${DEMO_PLAYER_IDS.brenda}`);
    expect(within(brendaRow).getByText(/#5/)).toBeTruthy();
    expect(within(brendaRow).getByText('Brenda Lim')).toBeTruthy();
    expect(within(brendaRow).getByText('988')).toBeTruthy();
    expect(within(brendaRow).getByText('1W - 2L • 33.3% Win Rate')).toBeTruthy();

    // Check Diana
    const dianaRow = screen.getByTestId(`leaderboard-row-${DEMO_PLAYER_IDS.diana}`);
    expect(within(dianaRow).getByText('Diana Ong')).toBeTruthy();

    // Check Ethan Guest
    const ethanRow = screen.getByTestId(`leaderboard-row-${DEMO_PLAYER_IDS.ethanGuest}`);
    expect(within(ethanRow).getByText('Ethan (Drop-in)')).toBeTruthy();
    expect(within(ethanRow).getByTestId('status-badge-guest')).toBeTruthy();
  });

  it('toggles Singles mode with informative Stage 2 preview and switches back to Doubles', async () => {
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

    // Click Singles
    fireEvent.click(screen.getByRole('button', { name: /^Singles$/i }));

    await waitFor(() => {
      expect(screen.getByText(/Singles Tracking Queued for Stage 2/i)).toBeTruthy();
      expect(screen.queryByTestId('leaderboard-podium')).toBeNull();
    });

    // Switch back to Doubles
    fireEvent.click(screen.getByRole('button', { name: /View Official Doubles Leaderboard/i }));

    await waitFor(() => {
      expect(screen.getByTestId('leaderboard-podium')).toBeTruthy();
      expect(screen.queryByText(/Singles Tracking Queued for Stage 2/i)).toBeNull();
    });
  });

  it('supports switching between All-Time and Weekly via the Filter dropdown', async () => {
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

    // Switch to Weekly
    fireEvent.click(screen.getByRole('button', { name: /Weekly Leaderboard/i }));

    await waitFor(() => {
      expect(screen.getByText(/Filter: Weekly/i)).toBeTruthy();
      expect(screen.getByText(/Current Week/i)).toBeTruthy();
    });

    // Switch back to All Time
    fireEvent.click(screen.getByRole('button', { name: /^All Time$/i }));

    await waitFor(() => {
      expect(screen.getByText(/^Filter$/i)).toBeTruthy();
    });
  });
});
