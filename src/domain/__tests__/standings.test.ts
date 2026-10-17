import { describe, expect, it } from 'vitest';
import { parseNumeric4, type PlayerRatingSnapshot } from '../elo.ts';
import {
  buildAllTimeLeaderboard,
  computeSessionStandings,
} from '../standings.ts';

describe('buildAllTimeLeaderboard (RATE-06, ID-01)', () => {
  it('sorts by full internal precision, shares competition rank only on exact internal ties, and labels unmerged Guests', () => {
    const snapshots = new Map<string, PlayerRatingSnapshot>([
      [
        'p1',
        {
          playerId: 'p1',
          ratingScaled: parseNumeric4('1015.4000'), // Displays 1015
          ratingNumeric4: '1015.4000',
          ratingDisplay: 1015,
          matchesPlayed: 5,
          wins: 3,
          losses: 2,
          isProvisional: false,
        },
      ],
      [
        'p2',
        {
          playerId: 'p2',
          ratingScaled: parseNumeric4('1015.1000'), // Also displays 1015, but strictly lower internal rating!
          ratingNumeric4: '1015.1000',
          ratingDisplay: 1015,
          matchesPlayed: 5,
          wins: 3,
          losses: 2,
          isProvisional: false,
        },
      ],
      [
        'g1',
        {
          playerId: 'g1',
          ratingScaled: parseNumeric4('1010.0000'),
          ratingNumeric4: '1010.0000',
          ratingDisplay: 1010,
          matchesPlayed: 2,
          wins: 1,
          losses: 1,
          isProvisional: true,
        },
      ],
      [
        'p3',
        {
          playerId: 'p3',
          ratingScaled: parseNumeric4('1010.0000'), // Exact internal tie with g1
          ratingNumeric4: '1010.0000',
          ratingDisplay: 1010,
          matchesPlayed: 4,
          wins: 2,
          losses: 2,
          isProvisional: false,
        },
      ],
      [
        'p4',
        {
          playerId: 'p4',
          ratingScaled: parseNumeric4('990.0000'),
          ratingNumeric4: '990.0000',
          ratingDisplay: 990,
          matchesPlayed: 4,
          wins: 1,
          losses: 3,
          isProvisional: false,
        },
      ],
    ]);

    const rows = buildAllTimeLeaderboard({
      profiles: [
        { id: 'p1', displayName: 'Alice', isGuest: false, isActive: true },
        { id: 'p2', displayName: 'Bob', isGuest: false, isActive: true },
        { id: 'g1', displayName: 'Guest Sam', isGuest: true, isActive: true },
        { id: 'p3', displayName: 'Charlie', isGuest: false, isActive: true },
        { id: 'p4', displayName: 'Dana', isGuest: false, isActive: true },
      ],
      snapshots,
    });

    // p1 and p2 both display 1015, but p1 is rank 1 and p2 is rank 2 (not tied)
    expect(rows[0]?.playerId).toBe('p1');
    expect(rows[0]?.rank).toBe(1);
    expect(rows[0]?.isTiedRank).toBe(false);
    expect(rows[0]?.ratingDisplay).toBe(1015);

    expect(rows[1]?.playerId).toBe('p2');
    expect(rows[1]?.rank).toBe(2);
    expect(rows[1]?.isTiedRank).toBe(false);
    expect(rows[1]?.ratingDisplay).toBe(1015);

    // p3 and g1 have exact internal tie (1010.0000) -> both share rank 3, and p4 gets rank 5 (1, 2, 3, 3, 5)
    expect(rows[2]?.rank).toBe(3);
    expect(rows[2]?.isTiedRank).toBe(true);
    expect(rows[3]?.rank).toBe(3);
    expect(rows[3]?.isTiedRank).toBe(true);

    const guestRow = rows.find((r) => r.playerId === 'g1')!;
    expect(guestRow.isGuest).toBe(true);
    expect(guestRow.guestLabel).toBe('Guest');
    expect(guestRow.isProvisional).toBe(true);

    expect(rows[4]?.playerId).toBe('p4');
    expect(rows[4]?.rank).toBe(5);
  });
});

describe('computeSessionStandings (ATT-01, Session Standings)', () => {
  it('ranks by wins, then win rate, then point difference, and keeps non-playing attendees separate', () => {
    const result = computeSessionStandings({
      attendees: [
        { playerId: 'p1', displayName: 'Alice', isGuest: false },
        { playerId: 'p2', displayName: 'Bob', isGuest: false },
        { playerId: 'p3', displayName: 'Charlie', isGuest: false },
        { playerId: 'p4', displayName: 'Dana', isGuest: false },
        { playerId: 'p5', displayName: 'Evan (Rested All Session)', isGuest: false },
      ],
      matches: [
        {
          id: 'm1',
          teamA: ['p1', 'p2'],
          teamB: ['p3', 'p4'],
          teamAScore: 21,
          teamBScore: 15,
          status: 'completed',
        },
      ],
      isSessionFinalized: false,
    });

    expect(result.isProvisionalUntilFinalized).toBe(true);
    expect(result.nonPlayingAttendees).toHaveLength(1);
    expect(result.nonPlayingAttendees[0]?.playerId).toBe('p5');
    expect(result.nonPlayingAttendees[0]?.rank).toBeNull();

    // p1 and p2 both have 1 win, 100% win rate, +6 point diff -> tied rank 1
    expect(result.playedRows[0]?.rank).toBe(1);
    expect(result.playedRows[0]?.isTiedRank).toBe(true);
    expect(result.playedRows[0]?.pointDifference).toBe(6);

    expect(result.playedRows[1]?.rank).toBe(1);
    expect(result.playedRows[1]?.isTiedRank).toBe(true);

    // p3 and p4 both have 0 wins, 0% win rate, -6 point diff -> tied rank 3
    expect(result.playedRows[2]?.rank).toBe(3);
    expect(result.playedRows[2]?.pointDifference).toBe(-6);
    expect(result.playedRows[3]?.rank).toBe(3);
  });
});
