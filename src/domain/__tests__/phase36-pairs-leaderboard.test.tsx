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
  buildPairsLeaderboard,
  canonicalizePairKey,
  type PairPlayerIdentityInput,
} from '../standings.ts';
import type { ReplayMatchRecord, ReplaySessionRecord } from '../elo.ts';
import {
  buildDeterministicDemoSnapshot,
  DEMO_GROUP_ID,
  DEMO_PLAYER_IDS,
  DEMO_SESSION_IDS,
} from '../../services/demoData.ts';
import { createDemoTrackerRepository } from '../../services/trackerRepository.ts';

afterEach(() => {
  cleanup();
});

describe('Phase 36 — Doubles Pairs (Partnership) Leaderboard & Elo Ranking', () => {
  const samplePlayers: PairPlayerIdentityInput[] = [
    { id: 'p-1', displayName: 'Alice', isGuest: false, isActive: true },
    { id: 'p-2', displayName: 'Bob', isGuest: false, isActive: true },
    { id: 'p-3', displayName: 'Charlie', isGuest: false, isActive: true },
    { id: 'p-4', displayName: 'Diana', isGuest: true, isActive: true },
    { id: 'p-5', displayName: 'Evan', isGuest: false, isActive: true },
    { id: 'p-6', displayName: 'Fiona', isGuest: false, isActive: false },
  ];

  const sampleSessions: ReplaySessionRecord[] = [
    {
      id: 's-1',
      groupId: 'g-1',
      seasonId: null,
      sessionStartedAtUtcMs: 1_700_000_000_000,
      createdAtUtcMs: 1_700_000_000_000,
    },
  ];

  it('aggregates (P1, P2) and (P2, P1) into a single canonical pair, updates zero-sum Pair Elo, and marks <3 matches Provisional', () => {
    expect(canonicalizePairKey('p-2', 'p-1').pairKey).toBe('p-1:p-2');
    expect(canonicalizePairKey('p-1', 'p-2').pairKey).toBe('p-1:p-2');

    const matches: ReplayMatchRecord[] = [
      // Match 1: (p-1, p-2) beat (p-3, p-4) 21-18
      {
        id: 'm-1',
        groupId: 'g-1',
        sessionId: 's-1',
        sequenceNumber: 1,
        teamA: ['p-1', 'p-2'],
        teamB: ['p-3', 'p-4'],
        teamAScore: 21,
        teamBScore: 18,
        status: 'completed',
      },
      // Match 2: reversed slot order (p-2, p-1) beat (p-4, p-3) 21-15
      {
        id: 'm-2',
        groupId: 'g-1',
        sessionId: 's-1',
        sequenceNumber: 2,
        teamA: ['p-2', 'p-1'],
        teamB: ['p-4', 'p-3'],
        teamAScore: 21,
        teamBScore: 15,
        status: 'completed',
      },
      // Match 3: (p-1, p-2) beat (p-3, p-4) 22-20 -> reaches 3 matches (non-provisional)
      {
        id: 'm-3',
        groupId: 'g-1',
        sessionId: 's-1',
        sequenceNumber: 3,
        teamA: ['p-1', 'p-2'],
        teamB: ['p-3', 'p-4'],
        teamAScore: 22,
        teamBScore: 20,
        status: 'completed',
      },
      // Match 4: (p-1, p-5) beat (p-3, p-4) 21-19 -> (p-1, p-5) has 1 match (provisional)
      {
        id: 'm-4',
        groupId: 'g-1',
        sessionId: 's-1',
        sequenceNumber: 4,
        teamA: ['p-1', 'p-5'],
        teamB: ['p-3', 'p-4'],
        teamAScore: 21,
        teamBScore: 19,
        status: 'completed',
      },
      // Voided match: must be ignored
      {
        id: 'm-5-voided',
        groupId: 'g-1',
        sessionId: 's-1',
        sequenceNumber: 5,
        teamA: ['p-3', 'p-5'],
        teamB: ['p-1', 'p-2'],
        teamAScore: 21,
        teamBScore: 10,
        status: 'voided',
      },
    ];

    const rows = buildPairsLeaderboard({
      groupId: 'g-1',
      sessions: sampleSessions,
      matches,
      players: samplePlayers,
      kFactor: 24,
      sortMode: 'elo',
    });

    // Only pairs with >= 1 completed match appear: (p-1:p-2), (p-1:p-5), (p-3:p-4)
    expect(rows.map((r) => r.pairKey)).toEqual(['p-1:p-2', 'p-1:p-5', 'p-3:p-4']);

    const topPair = rows[0]!;
    expect(topPair.rank).toBe(1);
    expect(topPair.matchesPlayed).toBe(3);
    expect(topPair.wins).toBe(3);
    expect(topPair.losses).toBe(0);
    expect(topPair.isProvisional).toBe(false);
    expect(topPair.includesGuest).toBe(false);
    expect(topPair.ratingScaled > 10_000_000n).toBe(true);

    const secondPair = rows[1]!;
    expect(secondPair.pairKey).toBe('p-1:p-5');
    expect(secondPair.matchesPlayed).toBe(1);
    expect(secondPair.isProvisional).toBe(true);

    const thirdPair = rows[2]!;
    expect(thirdPair.pairKey).toBe('p-3:p-4');
    expect(thirdPair.matchesPlayed).toBe(4);
    expect(thirdPair.isProvisional).toBe(false);
    expect(thirdPair.includesGuest).toBe(true);

    // Zero-sum check across all 3 pairs relative to 3 * 1000.0000 baseline
    const totalScaled =
      topPair.ratingScaled + secondPair.ratingScaled + thirdPair.ratingScaled;
    expect(totalScaled).toBe(30_000_000n);
  });

  it('supports sorting pairs by Pair Elo, Most Wins, and Win Rate, and filters inactive partners unless includeInactive is true', () => {
    const matches: ReplayMatchRecord[] = [
      // Pair (p-1, p-2): 2W - 1L (66.7% win rate, 2 wins)
      {
        id: 'm-1',
        groupId: 'g-1',
        sessionId: 's-1',
        sequenceNumber: 1,
        teamA: ['p-1', 'p-2'],
        teamB: ['p-3', 'p-4'],
        teamAScore: 21,
        teamBScore: 15,
        status: 'completed',
      },
      {
        id: 'm-2',
        groupId: 'g-1',
        sessionId: 's-1',
        sequenceNumber: 2,
        teamA: ['p-1', 'p-2'],
        teamB: ['p-3', 'p-4'],
        teamAScore: 21,
        teamBScore: 17,
        status: 'completed',
      },
      {
        id: 'm-3',
        groupId: 'g-1',
        sessionId: 's-1',
        sequenceNumber: 3,
        teamA: ['p-3', 'p-4'],
        teamB: ['p-1', 'p-2'],
        teamAScore: 21,
        teamBScore: 19,
        status: 'completed',
      },
      // Pair (p-1, p-5): 1W - 0L (100.0% win rate, 1 win) against inactive p-6 + p-3
      {
        id: 'm-4',
        groupId: 'g-1',
        sessionId: 's-1',
        sequenceNumber: 4,
        teamA: ['p-1', 'p-5'],
        teamB: ['p-3', 'p-6'],
        teamAScore: 21,
        teamBScore: 12,
        status: 'completed',
      },
    ];

    // By Most Wins (active only -> p-3:p-6 excluded because p-6 is inactive)
    const byWins = buildPairsLeaderboard({
      groupId: 'g-1',
      sessions: sampleSessions,
      matches,
      players: samplePlayers,
      kFactor: 24,
      sortMode: 'wins',
      includeInactive: false,
    });
    expect(byWins.map((r) => r.pairKey)).toEqual(['p-1:p-2', 'p-1:p-5', 'p-3:p-4']);
    expect(byWins[0]!.wins).toBe(2);

    // By Win Rate: (p-1, p-5) has 100.0% (1/1) ahead of (p-1, p-2) at 66.7% (2/3)
    const byWinRate = buildPairsLeaderboard({
      groupId: 'g-1',
      sessions: sampleSessions,
      matches,
      players: samplePlayers,
      kFactor: 24,
      sortMode: 'win_rate',
      includeInactive: false,
    });
    expect(byWinRate[0]!.pairKey).toBe('p-1:p-5');
    expect(byWinRate[0]!.winRatePercentDisplay).toBe('100.0%');
    expect(byWinRate[1]!.pairKey).toBe('p-1:p-2');
    expect(byWinRate[1]!.winRatePercentDisplay).toBe('66.7%');

    // Include inactive brings in p-3:p-6
    const withInactive = buildPairsLeaderboard({
      groupId: 'g-1',
      sessions: sampleSessions,
      matches,
      players: samplePlayers,
      kFactor: 24,
      sortMode: 'elo',
      includeInactive: true,
    });
    expect(withInactive.some((r) => r.pairKey === 'p-3:p-6')).toBe(true);
  });

  it('renders Pairs Leaderboard UI with 3D Pairs Podium, #4+ rows, sort pills, badges, and partner profile navigation', async () => {
    const base = buildDeterministicDemoSnapshot();
    // Add two extra completed matches between Aaron & Brenda vs Chong & Diana so Aaron & Brenda reach 3 matches (non-provisional) and #1 solo rank
    const enrichedSnapshot = {
      ...base,
      matches: [
        ...base.matches,
        {
          id: '00000000-0000-4000-8000-000000000491',
          group_id: DEMO_GROUP_ID,
          session_id: DEMO_SESSION_IDS.session2,
          sequence_number: 4,
          status: 'completed' as const,
          team_a_score: 21,
          team_b_score: 16,
          is_disputed: false,
          client_submission_id: '10000000-0000-4000-8000-000000000091',
          recorded_by_user_id: base.viewerMembership.user_id,
          completed_at: '2026-10-15T13:25:00Z',
          voided_at: null,
          void_reason: null,
          created_at: '2026-10-15T13:25:00Z',
          updated_at: '2026-10-15T13:25:00Z',
        },
        {
          id: '00000000-0000-4000-8000-000000000492',
          group_id: DEMO_GROUP_ID,
          session_id: DEMO_SESSION_IDS.session2,
          sequence_number: 5,
          status: 'completed' as const,
          team_a_score: 21,
          team_b_score: 19,
          is_disputed: false,
          client_submission_id: '10000000-0000-4000-8000-000000000092',
          recorded_by_user_id: base.viewerMembership.user_id,
          completed_at: '2026-10-15T13:35:00Z',
          voided_at: null,
          void_reason: null,
          created_at: '2026-10-15T13:35:00Z',
          updated_at: '2026-10-15T13:35:00Z',
        },
      ],
      matchParticipants: [
        ...base.matchParticipants,
        // Match 491: Brenda slot 1, Aaron slot 2 (reversed slot order!)
        { match_id: '00000000-0000-4000-8000-000000000491', group_id: DEMO_GROUP_ID, team_side: 'A' as const, slot_number: 1 as const, player_id: DEMO_PLAYER_IDS.brenda },
        { match_id: '00000000-0000-4000-8000-000000000491', group_id: DEMO_GROUP_ID, team_side: 'A' as const, slot_number: 2 as const, player_id: DEMO_PLAYER_IDS.aaron },
        { match_id: '00000000-0000-4000-8000-000000000491', group_id: DEMO_GROUP_ID, team_side: 'B' as const, slot_number: 1 as const, player_id: DEMO_PLAYER_IDS.chong },
        { match_id: '00000000-0000-4000-8000-000000000491', group_id: DEMO_GROUP_ID, team_side: 'B' as const, slot_number: 2 as const, player_id: DEMO_PLAYER_IDS.diana },
        // Match 492: Aaron slot 1, Brenda slot 2
        { match_id: '00000000-0000-4000-8000-000000000492', group_id: DEMO_GROUP_ID, team_side: 'A' as const, slot_number: 1 as const, player_id: DEMO_PLAYER_IDS.aaron },
        { match_id: '00000000-0000-4000-8000-000000000492', group_id: DEMO_GROUP_ID, team_side: 'A' as const, slot_number: 2 as const, player_id: DEMO_PLAYER_IDS.brenda },
        { match_id: '00000000-0000-4000-8000-000000000492', group_id: DEMO_GROUP_ID, team_side: 'B' as const, slot_number: 1 as const, player_id: DEMO_PLAYER_IDS.chong },
        { match_id: '00000000-0000-4000-8000-000000000492', group_id: DEMO_GROUP_ID, team_side: 'B' as const, slot_number: 2 as const, player_id: DEMO_PLAYER_IDS.diana },
      ],
    };

    const repo = createDemoTrackerRepository(enrichedSnapshot);
    render(<App repository={repo} />);

    await waitFor(() => {
      expect(screen.getByTestId('view-home')).toBeTruthy();
    });

    const primaryNav = screen.getByRole('navigation', { name: /Primary navigation/i });
    fireEvent.click(within(primaryNav).getByRole('button', { name: /Leaderboard/i }));

    await waitFor(() => {
      expect(screen.getByTestId('view-leaderboard')).toBeTruthy();
    });

    // Switch to Pairs tab
    const pairsBtn = screen.getByRole('button', { name: /^Pairs$/i });
    fireEvent.click(pairsBtn);

    await waitFor(() => {
      expect(screen.getByTestId('leaderboard-pairs-panel')).toBeTruthy();
      expect(screen.getByTestId('pairs-leaderboard-podium')).toBeTruthy();
    });

    const pairsPodium = screen.getByTestId('pairs-leaderboard-podium');
    const aaronBrendaKey = `${DEMO_PLAYER_IDS.aaron}:${DEMO_PLAYER_IDS.brenda}`;
    const champCard = within(pairsPodium).getByTestId(
      `pair-leaderboard-row-${aaronBrendaKey}`,
    );

    expect(within(champCard).getByText('1st')).toBeTruthy();
    expect(within(champCard).getByText('Aaron Tan')).toBeTruthy();
    expect(within(champCard).getByText(/Brenda Lim/i)).toBeTruthy();
    expect(within(champCard).getByText('You')).toBeTruthy();
    expect(within(champCard).getByText(/3W - 0L/i)).toBeTruthy();
    // 3 matches together -> no longer provisional
    expect(within(champCard).queryByTestId('status-badge-provisional')).toBeNull();

    // Sort pills toggle aria-pressed cleanly
    const eloSortBtn = screen.getByTestId('pair-sort-elo');
    const winsSortBtn = screen.getByTestId('pair-sort-wins');
    const winRateSortBtn = screen.getByTestId('pair-sort-win-rate');

    expect(eloSortBtn.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(winsSortBtn);
    expect(winsSortBtn.getAttribute('aria-pressed')).toBe('true');
    expect(eloSortBtn.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(winRateSortBtn);
    expect(winRateSortBtn.getAttribute('aria-pressed')).toBe('true');

    // Clicking Brenda Lim's name button on the pair podium opens Brenda Lim's player profile
    fireEvent.click(within(champCard).getByRole('button', { name: /^&\s*Brenda Lim$/i }));

    await waitFor(() => {
      expect(screen.getByTestId('view-profile')).toBeTruthy();
      expect(screen.getByRole('heading', { level: 2, name: /Brenda Lim/i })).toBeTruthy();
    });
  });
});
