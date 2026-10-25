// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { App } from '../../App.tsx';
import {
  buildFixedPointsLeaderboard,
  type FixedPointsPlayerRecordInput,
} from '../standings.ts';
import {
  buildDeterministicDemoSnapshot,
  DEMO_PLAYER_IDS,
} from '../../services/demoData.ts';
import { createDemoTrackerRepository } from '../../services/trackerRepository.ts';

afterEach(() => {
  cleanup();
});

describe("Phase 37 — Ammar's Style 🤙🏻 Fixed-Points (+3W / -3L) Leaderboard Section", () => {
  it('computes +3 per win, -3 per loss starting from 0, and shares exact competition rank on ties', () => {
    const players: FixedPointsPlayerRecordInput[] = [
      {
        id: 'p-michan',
        displayName: 'Michan',
        isGuest: false,
        isActive: true,
        wins: 6,
        losses: 2,
      },
      {
        id: 'p-mirza',
        displayName: 'Mirza Yunan',
        isGuest: false,
        isActive: true,
        wins: 4,
        losses: 4,
      },
      {
        id: 'p-alip',
        displayName: 'Alip_cutie',
        isGuest: false,
        isActive: true,
        wins: 3,
        losses: 5,
      },
      {
        id: 'p-ammar',
        displayName: 'smash terkuat',
        isGuest: false,
        isActive: true,
        wins: 3,
        losses: 5,
      },
      {
        id: 'p-inactive',
        displayName: 'Retired Legend',
        isGuest: false,
        isActive: false,
        wins: 10,
        losses: 0,
      },
    ];

    const activeOnly = buildFixedPointsLeaderboard({
      players,
      includeInactive: false,
    });

    expect(activeOnly).toHaveLength(4);

    // #1 Michan: 6*3 - 2*3 = +12 pts
    expect(activeOnly[0]!.playerId).toBe('p-michan');
    expect(activeOnly[0]!.rank).toBe(1);
    expect(activeOnly[0]!.isTiedRank).toBe(false);
    expect(activeOnly[0]!.fixedPoints).toBe(12);
    expect(activeOnly[0]!.fixedPointsDisplay).toBe('+12');

    // #2 Mirza Yunan: 4*3 - 4*3 = 0 pts
    expect(activeOnly[1]!.playerId).toBe('p-mirza');
    expect(activeOnly[1]!.rank).toBe(2);
    expect(activeOnly[1]!.isTiedRank).toBe(false);
    expect(activeOnly[1]!.fixedPoints).toBe(0);
    expect(activeOnly[1]!.fixedPointsDisplay).toBe('0');

    // #3 (T) Alip_cutie & smash terkuat: 3*3 - 5*3 = -6 pts (exact shared rank!)
    expect(activeOnly[2]!.playerId).toBe('p-alip');
    expect(activeOnly[2]!.rank).toBe(3);
    expect(activeOnly[2]!.isTiedRank).toBe(true);
    expect(activeOnly[2]!.fixedPoints).toBe(-6);
    expect(activeOnly[2]!.fixedPointsDisplay).toBe('-6');

    expect(activeOnly[3]!.playerId).toBe('p-ammar');
    expect(activeOnly[3]!.rank).toBe(3);
    expect(activeOnly[3]!.isTiedRank).toBe(true);
    expect(activeOnly[3]!.fixedPoints).toBe(-6);
    expect(activeOnly[3]!.fixedPointsDisplay).toBe('-6');

    // Newcomer starting late with 0W - 0L starts at 0 pts and ties Mirza at 0 pts
    const withNewcomer = buildFixedPointsLeaderboard({
      players: [
        ...players,
        {
          id: 'p-new',
          displayName: 'Kimi',
          isGuest: true,
          isActive: true,
          wins: 0,
          losses: 0,
        },
      ],
      includeInactive: false,
    });
    const kimiRow = withNewcomer.find((r) => r.playerId === 'p-new')!;
    const mirzaRow = withNewcomer.find((r) => r.playerId === 'p-mirza')!;
    expect(kimiRow.fixedPoints).toBe(0);
    expect(kimiRow.fixedPointsDisplay).toBe('0');
    expect(kimiRow.rank).toBe(2);
    expect(mirzaRow.rank).toBe(2);
    expect(kimiRow.isTiedRank).toBe(true);
    expect(mirzaRow.isTiedRank).toBe(true);
    // And Alip & smash terkuat become #4 (T) per standard competition ranking (1, 2, 2, 4, 4)
    expect(withNewcomer.find((r) => r.playerId === 'p-alip')!.rank).toBe(4);
    expect(withNewcomer.find((r) => r.playerId === 'p-ammar')!.rank).toBe(4);

    // Include inactive brings in Retired Legend at +30 pts (#1)
    const withInactive = buildFixedPointsLeaderboard({
      players,
      includeInactive: true,
    });
    expect(withInactive[0]!.playerId).toBe('p-inactive');
    expect(withInactive[0]!.fixedPointsDisplay).toBe('+30');
  });

  it("renders Ammar's Style 🤙🏻 below the untouched Elo leaderboard, toggles Rules/Weekly/Inactive, and navigates to player profile", async () => {
    const base = buildDeterministicDemoSnapshot();
    const repo = createDemoTrackerRepository(base);
    render(<App repository={repo} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    const primaryNav = screen.getByRole('navigation', {
      name: /Primary navigation/i,
    });
    fireEvent.click(
      within(primaryNav).getByRole('button', { name: /Leaderboard/i }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('view-leaderboard')).toBeTruthy();
    });

    // Primary Elo podium & rows remain completely untouched above
    const podium = screen.getByTestId('leaderboard-podium');
    expect(
      within(podium).getByTestId(`leaderboard-row-${DEMO_PLAYER_IDS.aaron}`),
    ).toBeTruthy();

    // Ammar's Style section renders below inside leaderboard-all-time-panel
    const ammarSection = screen.getByTestId('leaderboard-ammars-style-section');
    expect(
      within(ammarSection).getByRole('heading', {
        level: 2,
        name: /Ammar's Style 🤙🏻/i,
      }),
    ).toBeTruthy();

    // Verify Aaron Tan (3W - 0L -> +9 pts) and Brenda Lim (1W - 2L -> -3 pts)
    const aaronFixedRow = within(ammarSection).getByTestId(
      `fixed-points-row-${DEMO_PLAYER_IDS.aaron}`,
    );
    expect(within(aaronFixedRow).getByText('#1')).toBeTruthy();
    expect(within(aaronFixedRow).getByText('+9')).toBeTruthy();
    expect(within(aaronFixedRow).getByText('You')).toBeTruthy();

    const brendaFixedRow = within(ammarSection).getByTestId(
      `fixed-points-row-${DEMO_PLAYER_IDS.brenda}`,
    );
    expect(within(brendaFixedRow).getByText('-3')).toBeTruthy();

    // Toggle Rules info drawer
    const rulesBtn = within(ammarSection).getByTestId('ammars-style-rules-btn');
    expect(rulesBtn.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(rulesBtn);
    expect(rulesBtn.getAttribute('aria-expanded')).toBe('true');
    expect(
      within(ammarSection).getByTestId('ammars-style-rules-panel'),
    ).toBeTruthy();

    // Switch to Weekly Leaderboard scope -> shows Weekly Scope badge in Ammar's Style
    fireEvent.click(screen.getByRole('button', { name: /Weekly Leaderboard/i }));
    await waitFor(() => {
      expect(within(ammarSection).getByText('Weekly Scope')).toBeTruthy();
    });

    // Switch back to All Time and click Brenda's row to navigate to her profile
    fireEvent.click(screen.getByRole('button', { name: /^All Time$/i }));
    await waitFor(() => {
      expect(within(ammarSection).queryByText('Weekly Scope')).toBeNull();
    });

    fireEvent.click(
      within(ammarSection).getByTestId(
        `fixed-points-row-${DEMO_PLAYER_IDS.brenda}`,
      ),
    );
    await waitFor(() => {
      expect(screen.getByTestId('view-profile')).toBeTruthy();
      expect(
        screen.getByRole('heading', { level: 2, name: /Brenda Lim/i }),
      ).toBeTruthy();
    });
  });
});
