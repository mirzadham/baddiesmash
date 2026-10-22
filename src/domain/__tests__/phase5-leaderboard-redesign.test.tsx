// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { App } from '../../App.tsx';
import {
  buildDeterministicDemoSnapshot,
  DEMO_PLAYER_IDS,
} from '../../services/demoData.ts';
import { createDemoTrackerRepository } from '../../services/trackerRepository.ts';

afterEach(() => {
  cleanup();
});

describe('Phase 5 — Leaderboard UI Redesign & Theming', () => {
  it('renders the custom brand mark, header title, and quick theme toggle in App header', async () => {
    const repo = createDemoTrackerRepository();
    render(<App repository={repo} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    // Check brand title
    expect(screen.getByText('BADDIESMASH')).toBeTruthy();

    // Check theme toggle button
    const toggleBtn = screen.getByRole('button', { name: /toggle theme/i });
    expect(toggleBtn).toBeTruthy();

    // Toggle theme to dark
    fireEvent.click(toggleBtn);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    // Toggle theme to light
    fireEvent.click(toggleBtn);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('renders custom 3D podium for top 3 and ranking list for rank 4 and below', async () => {
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

    // Verify page heading
    expect(screen.getByRole('heading', { level: 1, name: /Leaderboard/i })).toBeTruthy();
    expect(screen.getByText(/See who's leading the court/i)).toBeTruthy();

    // Verify 3D Podium presence
    const podium = screen.getByTestId('leaderboard-podium');
    expect(podium).toBeTruthy();

    // Verify Top 3 players appear on the podium with competition ranks
    expect(within(podium).getByTestId(`leaderboard-row-${DEMO_PLAYER_IDS.aaron}`)).toBeTruthy();
    expect(within(podium).getByTestId(`leaderboard-row-${DEMO_PLAYER_IDS.chong}`)).toBeTruthy();
    expect(within(podium).getByTestId(`leaderboard-row-${DEMO_PLAYER_IDS.farahProvisional}`)).toBeTruthy();

    // Verify Rank 4 and below appear in the seamless ranking list
    expect(screen.getByTestId(`leaderboard-row-${DEMO_PLAYER_IDS.brenda}`)).toBeTruthy();
    expect(screen.getByTestId(`leaderboard-row-${DEMO_PLAYER_IDS.diana}`)).toBeTruthy();
    expect(screen.getByTestId(`leaderboard-row-${DEMO_PLAYER_IDS.ethanGuest}`)).toBeTruthy();
  });

  it('highlights the authenticated player with "You" pill in their genuine position', async () => {
    const base = buildDeterministicDemoSnapshot();
    // Aaron is viewer's linked player (rank 1 on podium)
    const repo1 = createDemoTrackerRepository({
      ...base,
      viewerMembership: {
        ...base.viewerMembership,
        linked_player_id: DEMO_PLAYER_IDS.aaron,
      },
    });

    const { unmount } = render(<App repository={repo1} />);
    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    const primaryNav = screen.getByRole('navigation', { name: /Primary navigation/i });
    fireEvent.click(within(primaryNav).getByRole('button', { name: /Leaderboard/i }));

    await waitFor(() => {
      const aaronOnPodium = screen.getByTestId(`leaderboard-row-${DEMO_PLAYER_IDS.aaron}`);
      expect(within(aaronOnPodium).getByText('You')).toBeTruthy();
    });
    unmount();

    // Diana is viewer's linked player (rank 4 in ranking list below podium)
    const repo2 = createDemoTrackerRepository({
      ...base,
      viewerMembership: {
        ...base.viewerMembership,
        linked_player_id: DEMO_PLAYER_IDS.diana,
      },
    });

    render(<App repository={repo2} />);
    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    const primaryNav2 = screen.getByRole('navigation', { name: /Primary navigation/i });
    fireEvent.click(within(primaryNav2).getByRole('button', { name: /Leaderboard/i }));

    await waitFor(() => {
      const dianaInList = screen.getByTestId(`leaderboard-row-${DEMO_PLAYER_IDS.diana}`);
      expect(within(dianaInList).getByText('You')).toBeTruthy();
    });
  });

  it('displays provisional badge on players with fewer than 3 completed matches', async () => {
    const repo = createDemoTrackerRepository();
    render(<App repository={repo} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    const primaryNav = screen.getByRole('navigation', { name: /Primary navigation/i });
    fireEvent.click(within(primaryNav).getByRole('button', { name: /Leaderboard/i }));

    await waitFor(() => {
      const farahRow = screen.getByTestId(`leaderboard-row-${DEMO_PLAYER_IDS.farahProvisional}`);
      expect(within(farahRow).getByTestId('status-badge-provisional')).toBeTruthy();
      expect(within(farahRow).getByText(/Provisional/i)).toBeTruthy();
    });
  });

  it('handles groups with fewer than 3 ranked players and empty state gracefully', async () => {
    const base = buildDeterministicDemoSnapshot();
    // Only 2 players
    const twoPlayersBase = {
      ...base,
      players: base.players.slice(0, 2),
      ratingSnapshots: base.ratingSnapshots.slice(0, 2),
    };
    const repoTwo = createDemoTrackerRepository(twoPlayersBase);
    const { unmount } = render(<App repository={repoTwo} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    const primaryNav = screen.getByRole('navigation', { name: /Primary navigation/i });
    fireEvent.click(within(primaryNav).getByRole('button', { name: /Leaderboard/i }));

    await waitFor(() => {
      const podium = screen.getByTestId('leaderboard-podium');
      expect(within(podium).getByTestId(`leaderboard-row-${twoPlayersBase.players[0]!.id}`)).toBeTruthy();
      expect(within(podium).getByTestId(`leaderboard-row-${twoPlayersBase.players[1]!.id}`)).toBeTruthy();
      // 3rd place slot is empty, does not fabricate a 3rd player
      expect(within(podium).queryByText(/Rank 3/i)).toBeNull();
    });
    unmount();

    // 0 players -> friendly empty state
    const emptyBase = {
      ...base,
      players: [],
      ratingSnapshots: [],
    };
    const repoEmpty = createDemoTrackerRepository(emptyBase);
    render(<App repository={repoEmpty} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    const primaryNavEmpty = screen.getByRole('navigation', { name: /Primary navigation/i });
    fireEvent.click(within(primaryNavEmpty).getByRole('button', { name: /Leaderboard/i }));

    await waitFor(() => {
      expect(screen.getByText(/No Rankings Yet/i)).toBeTruthy();
      expect(screen.queryByTestId('leaderboard-podium')).toBeNull();
    });
  });

  it('handles long player names without throwing or clipping ratings', async () => {
    const base = buildDeterministicDemoSnapshot();
    const longName = 'Maximilianus Christopher-Montgomery III';
    const longNameBase = {
      ...base,
      players: base.players.map((p, idx) =>
        idx === 0 ? { ...p, display_name: longName } : p,
      ),
    };
    const repo = createDemoTrackerRepository(longNameBase);
    render(<App repository={repo} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    const primaryNav = screen.getByRole('navigation', { name: /Primary navigation/i });
    fireEvent.click(within(primaryNav).getByRole('button', { name: /Leaderboard/i }));

    await waitFor(() => {
      expect(screen.getByTitle(longName)).toBeTruthy();
    });
  });
});
