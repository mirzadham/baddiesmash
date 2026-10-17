import { describe, expect, it } from 'vitest';
import {
  calculateMatchEloUpdate,
  DEFAULT_BASELINE_RATING_SCALED,
  deriveRatingPublicationState,
  formatDeltaOneDecimal,
  formatNumeric4,
  parseNumeric4,
  type ReplayMatchRecord,
  type ReplayPlayerIdentity,
  replayRatings,
  type ReplaySessionRecord,
  roundFloatToScaled4HalfAwayFromZero,
  roundScaledToOneDecimalNumber,
  roundScaledToWholeNumber,
} from '../elo.ts';
import { runSyntheticEloStudy } from '../simulation.ts';

describe('NUMERIC(10,4) fixed-point precision and half-away-from-zero rounding (RATE-01)', () => {
  it('rounds half away from zero symmetrically for positive and negative values', () => {
    // PostgreSQL ROUND(0.00005, 4) = 0.0001; ROUND(-0.00005, 4) = -0.0001
    expect(roundFloatToScaled4HalfAwayFromZero(0.00005)).toBe(1n);
    expect(roundFloatToScaled4HalfAwayFromZero(-0.00005)).toBe(-1n);

    // Whole-number display rounding: +1000.5000 -> 1001, -1000.5000 -> -1001, 1000.4999 -> 1000
    expect(roundScaledToWholeNumber(parseNumeric4('1000.5000'))).toBe(1001);
    expect(roundScaledToWholeNumber(parseNumeric4('-1000.5000'))).toBe(-1001);
    expect(roundScaledToWholeNumber(parseNumeric4('1000.4999'))).toBe(1000);

    // 1-decimal delta display rounding: +15.4500 -> +15.5, -15.4500 -> -15.5, +15.4499 -> +15.4
    expect(formatDeltaOneDecimal(parseNumeric4('15.4500'))).toBe('+15.5');
    expect(formatDeltaOneDecimal(parseNumeric4('-15.4500'))).toBe('-15.5');
    expect(formatDeltaOneDecimal(parseNumeric4('15.4499'))).toBe('+15.4');
    expect(roundScaledToOneDecimalNumber(parseNumeric4('-15.4500'))).toBe(-15.5);
  });

  it('rounds before, after, and change independently as documented (Decision 3)', () => {
    // Example: before = 1000.4000 (displays 1000), delta = +15.4000 (displays +15.4), after = 1015.8000 (displays 1016)
    const before = parseNumeric4('1000.4000');
    const delta = parseNumeric4('15.4000');
    const after = before + delta;

    expect(formatNumeric4(after)).toBe('1015.8000');
    expect(roundScaledToWholeNumber(before)).toBe(1000);
    expect(formatDeltaOneDecimal(delta)).toBe('+15.4');
    expect(roundScaledToWholeNumber(after)).toBe(1016);
  });

  it('matches independent reference values for doubles team-average Elo', () => {
    // Case 1: Equal teams at 1000.0000, K = 32 -> E_A = 0.5 -> delta_A = +16.0000, delta_B = -16.0000
    const equalResult = calculateMatchEloUpdate({
      teamAPlayers: ['p1', 'p2'],
      teamBPlayers: ['p3', 'p4'],
      teamARatingsScaled: [
        DEFAULT_BASELINE_RATING_SCALED,
        DEFAULT_BASELINE_RATING_SCALED,
      ],
      teamBRatingsScaled: [
        DEFAULT_BASELINE_RATING_SCALED,
        DEFAULT_BASELINE_RATING_SCALED,
      ],
      winner: 'A',
      kFactor: 32,
    });

    expect(equalResult.expectedScoreA).toBeCloseTo(0.5, 10);
    expect(formatNumeric4(equalResult.teamADeltaScaled)).toBe('16.0000');
    expect(formatNumeric4(equalResult.teamBDeltaScaled)).toBe('-16.0000');
    expect(equalResult.playerChanges[0].afterDisplay).toBe(1016);
    expect(equalResult.playerChanges[0].changeDisplay).toBe('+16.0');
    expect(equalResult.playerChanges[2].afterDisplay).toBe(984);
    expect(equalResult.playerChanges[2].changeDisplay).toBe('-16.0');

    // Case 2: Team A average 1200.0000 (1300 + 1100), Team B average 1000.0000 (1000 + 1000)
    // R_B - R_A = -200 -> 10^(-200/400) = 10^(-0.5) = 0.31622776601683794
    // E_A = 1 / 1.316227766016838 = 0.7597469266479578
    // Underdog Team B wins (S_A = 0) with K = 24:
    // raw delta_A = 24 * (0 - 0.7597469266479578) = -18.233926239550987 -> -18.2339
    const upsetResult = calculateMatchEloUpdate({
      teamAPlayers: ['p1', 'p2'],
      teamBPlayers: ['p3', 'p4'],
      teamARatingsScaled: [
        parseNumeric4('1300.0000'),
        parseNumeric4('1100.0000'),
      ],
      teamBRatingsScaled: [
        parseNumeric4('1000.0000'),
        parseNumeric4('1000.0000'),
      ],
      winner: 'B',
      kFactor: 24,
    });

    expect(formatNumeric4(upsetResult.teamADeltaScaled)).toBe('-18.2339');
    expect(formatNumeric4(upsetResult.teamBDeltaScaled)).toBe('18.2339');
    expect(
      upsetResult.teamADeltaScaled + upsetResult.teamBDeltaScaled,
    ).toBe(0n);
  });
});

describe('Canonical chronological ordering, replay, corrections, voids, disputes, and merges (RATE-03, RATE-05, DIS-01)', () => {
  const players: ReplayPlayerIdentity[] = [
    { id: 'p1', displayName: 'Alice', isGuest: false },
    { id: 'p2', displayName: 'Bob', isGuest: false },
    { id: 'p3', displayName: 'Charlie', isGuest: false },
    { id: 'p4', displayName: 'Dana', isGuest: false },
    { id: 'g1', displayName: 'Guest Dan', isGuest: true },
  ];

  const sessions: ReplaySessionRecord[] = [
    {
      id: 'sess-b',
      groupId: 'g1',
      seasonId: 's1',
      sessionStartedAtUtcMs: 2_000_000,
      createdAtUtcMs: 2_000_100,
    },
    // Backdated session with earlier sessionStartedAtUtcMs but later createdAtUtcMs
    {
      id: 'sess-a-backdated',
      groupId: 'g1',
      seasonId: 's1',
      sessionStartedAtUtcMs: 1_000_000,
      createdAtUtcMs: 3_000_000,
    },
    // Same sessionStartedAtUtcMs as sess-b, tie-broken by createdAtUtcMs
    {
      id: 'sess-c-same-start',
      groupId: 'g1',
      seasonId: 's2',
      sessionStartedAtUtcMs: 2_000_000,
      createdAtUtcMs: 2_000_200,
    },
  ];

  it('orders matches deterministically by (session_started_at, created_at, session.id, sequence_number)', () => {
    const matches: ReplayMatchRecord[] = [
      {
        id: 'm-b2',
        groupId: 'g1',
        sessionId: 'sess-b',
        sequenceNumber: 2,
        teamA: ['p1', 'p3'],
        teamB: ['p2', 'p4'],
        teamAScore: 21,
        teamBScore: 18,
        status: 'completed',
      },
      {
        id: 'm-b1-voided',
        groupId: 'g1',
        sessionId: 'sess-b',
        sequenceNumber: 1,
        teamA: ['p1', 'p2'],
        teamB: ['p3', 'p4'],
        teamAScore: 21,
        teamBScore: 10,
        status: 'voided', // Voided match keeps sequenceNumber=1 and is excluded from rating changes
      },
      {
        id: 'm-a1',
        groupId: 'g1',
        sessionId: 'sess-a-backdated',
        sequenceNumber: 1,
        teamA: ['p1', 'p2'],
        teamB: ['p3', 'p4'],
        teamAScore: 21,
        teamBScore: 19,
        status: 'completed',
        isDisputed: true, // Disputed match stays official in replay
      },
      {
        id: 'm-c1',
        groupId: 'g1',
        sessionId: 'sess-c-same-start',
        sequenceNumber: 1,
        teamA: ['p1', 'p4'],
        teamB: ['p2', 'p3'],
        teamAScore: 15,
        teamBScore: 21,
        status: 'completed',
      },
      {
        id: 'm-draft',
        groupId: 'g1',
        sessionId: 'sess-c-same-start',
        sequenceNumber: null,
        teamA: ['p1', 'p2'],
        teamB: ['p3', 'p4'],
        teamAScore: 11,
        teamBScore: 9,
        status: 'incomplete',
      },
    ];

    const replay = replayRatings({
      groupId: 'g1',
      sessions,
      matches,
      players,
      kFactor: 32,
    });

    expect(replay.replayedMatches.map((m) => m.matchId)).toEqual([
      'm-a1',
      'm-b2',
      'm-c1',
    ]);
    expect(replay.replayedMatches[0]?.isDisputed).toBe(true);
  });

  it('recalculates deterministically when a guest is merged into a permanent player profile (ID-02)', () => {
    const matches: ReplayMatchRecord[] = [
      {
        id: 'm1',
        groupId: 'g1',
        sessionId: 'sess-a-backdated',
        sequenceNumber: 1,
        teamA: ['p1', 'g1'],
        teamB: ['p2', 'p3'],
        teamAScore: 21,
        teamBScore: 17,
        status: 'completed',
      },
      {
        id: 'm2',
        groupId: 'g1',
        sessionId: 'sess-b',
        sequenceNumber: 1,
        teamA: ['p1', 'p4'],
        teamB: ['p2', 'p3'],
        teamAScore: 21,
        teamBScore: 19,
        status: 'completed',
      },
    ];

    const mergedPlayers: ReplayPlayerIdentity[] = players.map((p) =>
      p.id === 'g1' ? { ...p, mergedIntoPlayerId: 'p4' } : p,
    );

    const replayAfterMerge = replayRatings({
      groupId: 'g1',
      sessions,
      matches,
      players: mergedPlayers,
      kFactor: 24,
    });

    expect(replayAfterMerge.playerSnapshots.has('g1')).toBe(false);
    expect(replayAfterMerge.playerSnapshots.get('p4')?.matchesPlayed).toBe(2);
    expect(replayAfterMerge.playerSnapshots.get('p4')?.wins).toBe(2);
  });
});

describe('Rating publication state machine: Current vs Recalculating vs Stale/Failed (RATE-04)', () => {
  it('identifies Current state only when idle and published seq matches required seq', () => {
    const state = deriveRatingPublicationState({
      recalculationStatus: 'idle',
      publishedVersionMatchStateSeq: 12,
      requiredMatchStateSeq: 12,
    });
    expect(state.health).toBe('current');
    expect(state.isCurrent).toBe(true);
    expect(state.bannerTitle).toBeNull();
  });

  it('identifies Recalculating state when status is running', () => {
    const state = deriveRatingPublicationState({
      recalculationStatus: 'running',
      publishedVersionMatchStateSeq: 11,
      requiredMatchStateSeq: 12,
    });
    expect(state.health).toBe('recalculating');
    expect(state.isCurrent).toBe(false);
    expect(state.bannerTitle).toBe('Results updating');
  });

  it('identifies Stale/Failed state when failed or when published version lags required match state seq', () => {
    const failedState = deriveRatingPublicationState({
      recalculationStatus: 'failed',
      publishedVersionMatchStateSeq: 11,
      requiredMatchStateSeq: 12,
      lastError: 'Simulated constraint violation',
    });
    expect(failedState.health).toBe('stale_or_failed');
    expect(failedState.isCurrent).toBe(false);
    expect(failedState.canAdminRetry).toBe(true);
    expect(failedState.bannerMessage).toContain('#11');
    expect(failedState.bannerMessage).toContain('#12');

    const laggingIdleState = deriveRatingPublicationState({
      recalculationStatus: 'idle',
      publishedVersionMatchStateSeq: 9,
      requiredMatchStateSeq: 10,
    });
    expect(laggingIdleState.health).toBe('stale_or_failed');
    expect(laggingIdleState.isCurrent).toBe(false);
  });
});

describe('Synthetic Elo simulation study (RATE-02)', () => {
  it('runs deterministically across K = 16, 24, 32 and verifies zero-sum and season independence', () => {
    const studyA = runSyntheticEloStudy(20261017);
    const studyB = runSyntheticEloStudy(20261017);

    expect(studyA.seasonIndependenceVerified).toBe(true);
    expect(studyA.disputedMatchIncludedVerified).toBe(true);

    for (const k of [16, 24, 32] as const) {
      const mA = studyA.metricsByK.get(k)!;
      const mB = studyB.metricsByK.get(k)!;
      expect(mA).toEqual(mB);
      expect(mA.totalNetDriftFromBaselineScaled).toBe(0n);
      expect(mA.replayDeterminismVerified).toBe(true);
      expect(mA.spearmanAtSession40).toBeGreaterThan(0.8);
    }
  });
});
