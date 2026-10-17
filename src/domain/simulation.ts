import {
  calculateMatchEloUpdate,
  DEFAULT_BASELINE_RATING_SCALED,
  formatDeltaOneDecimal,
  formatNumeric4,
  NUMERIC4_SCALE,
  type ReplayMatchRecord,
  type ReplayPlayerIdentity,
  replayRatings,
  type ReplaySessionRecord,
  roundScaledToOneDecimalNumber,
  roundScaledToWholeNumber,
} from './elo.ts';

export const CANDIDATE_K_FACTORS = [16, 24, 32] as const;
export type CandidateKFactor = (typeof CANDIDATE_K_FACTORS)[number];

/**
 * Deterministic Mulberry32 PRNG for reproducible synthetic Elo simulations.
 */
export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SyntheticPlayerSpec {
  id: string;
  displayName: string;
  trueSkill: number;
  attendanceProbability: number;
  isGuest: boolean;
  joinedAtSession: number;
  mergedIntoPlayerId?: string | null;
}

export interface KFactorSimulationMetrics {
  kFactor: CandidateKFactor;
  /** Spearman rank correlation with true latent skill after 10, 20, and 40 sessions */
  spearmanAtSession10: number;
  spearmanAtSession20: number;
  spearmanAtSession40: number;
  /** Root-Mean-Square Error against true latent skill (centered at 1000) for regular players */
  rmseRegularsAtSession40: number;
  /** Rating spread (max - min) at session 40 */
  ratingSpreadAtSession40: number;
  /** Maximum single-match rating change observed */
  maxSingleMatchDelta: number;
  /** Maximum single-session (8 matches / ~4 played per attendee) rating swing for a single player */
  maxSingleSessionPlayerSwing: number;
  /** Matches required for a strong newcomer (true skill 1180, rank #2, joining at S21) to enter Top 4 leaderboard rank */
  newcomerMatchesToTop4: number | null;
  /** Final rating of the late-joining strong newcomer (p10) at Session 40 */
  newcomerRatingAtSession40: number;
  /** Matches of partner rotation required for a 1200-skill player to recover from a 1025 fixed-pair plateau to >= 1100 */
  postFixedPairRecoveryMatchesTo1100: number | null;
  /** Zero-sum sum of all player rating differences from 1000.0000 across all replayed matches */
  totalNetDriftFromBaselineScaled: bigint;
  /** Exact match between incremental replay and post-correction/void/merge replay */
  replayDeterminismVerified: boolean;
}

export interface SyntheticStudyResult {
  seed: number;
  metricsByK: ReadonlyMap<CandidateKFactor, KFactorSimulationMetrics>;
  seasonIndependenceVerified: boolean;
  disputedMatchIncludedVerified: boolean;
}

function computeSpearmanRankCorrelation(
  items: ReadonlyArray<{ trueSkill: number; estimatedRating: number }>,
): number {
  const n = items.length;
  if (n < 2) return 1;

  const rankBy = (selector: (x: { trueSkill: number; estimatedRating: number }) => number) => {
    const indexed = items.map((item, idx) => ({ idx, val: selector(item) }));
    indexed.sort((a, b) => b.val - a.val);
    const ranks = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      ranks[indexed[i]!.idx] = i + 1;
    }
    return ranks;
  };

  const trueRanks = rankBy((x) => x.trueSkill);
  const estRanks = rankBy((x) => x.estimatedRating);

  let sumDiffSq = 0;
  for (let i = 0; i < n; i++) {
    const d = (trueRanks[i] ?? 0) - (estRanks[i] ?? 0);
    sumDiffSq += d * d;
  }

  return 1 - (6 * sumDiffSq) / (n * (n * n - 1));
}

/**
 * Runs the comprehensive synthetic Elo simulation study across K = 16, 24, 32
 * covering all required scenarios in `docs/02-engineering/elo-validation-and-replay.md`.
 */
export function runSyntheticEloStudy(seed = 20261017): SyntheticStudyResult {
  const players: SyntheticPlayerSpec[] = [
    { id: 'p01', displayName: 'Player 01 (Elite Regular)', trueSkill: 1240, attendanceProbability: 0.95, isGuest: false, joinedAtSession: 1 },
    { id: 'p02', displayName: 'Player 02 (Strong Regular)', trueSkill: 1160, attendanceProbability: 0.90, isGuest: false, joinedAtSession: 1 },
    { id: 'p03', displayName: 'Player 03 (Upper-Mid Regular)', trueSkill: 1090, attendanceProbability: 0.85, isGuest: false, joinedAtSession: 1 },
    { id: 'p04', displayName: 'Player 04 (Mid Regular A)', trueSkill: 1020, attendanceProbability: 0.90, isGuest: false, joinedAtSession: 1 },
    { id: 'p05', displayName: 'Player 05 (Mid Regular B)', trueSkill: 980, attendanceProbability: 0.85, isGuest: false, joinedAtSession: 1 },
    { id: 'p06', displayName: 'Player 06 (Developing Regular)', trueSkill: 910, attendanceProbability: 0.85, isGuest: false, joinedAtSession: 1 },
    { id: 'p07', displayName: 'Player 07 (Casual Sparse Strong)', trueSkill: 1130, attendanceProbability: 0.35, isGuest: false, joinedAtSession: 1 },
    { id: 'p08', displayName: 'Player 08 (Casual Sparse Developing)', trueSkill: 870, attendanceProbability: 0.35, isGuest: false, joinedAtSession: 1 },
    { id: 'p09', displayName: 'Player 09 (Beginner Regular)', trueSkill: 790, attendanceProbability: 0.80, isGuest: false, joinedAtSession: 1 },
    { id: 'p10', displayName: 'Player 10 (Late-Joining Strong)', trueSkill: 1180, attendanceProbability: 0.95, isGuest: false, joinedAtSession: 21 },
    { id: 'p11', displayName: 'Player 11 (Promoted Guest Target)', trueSkill: 1050, attendanceProbability: 0.75, isGuest: false, joinedAtSession: 6 },
    { id: 'g01', displayName: 'Temp Guest 01 (Merged into P11)', trueSkill: 1050, attendanceProbability: 0.0, isGuest: true, joinedAtSession: 1, mergedIntoPlayerId: 'p11' },
    { id: 'g02', displayName: 'Temp Guest 02 (Unmerged Visitor)', trueSkill: 940, attendanceProbability: 0.15, isGuest: true, joinedAtSession: 1 },
  ];

  const rng = createSeededRng(seed);
  const sessions: ReplaySessionRecord[] = [];
  const allMatches: ReplayMatchRecord[] = [];

  const baseTimestampMs = Date.UTC(2026, 0, 7, 12, 0, 0); // 2026-01-07 20:00 MYT
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

  for (let sIdx = 1; sIdx <= 40; sIdx++) {
    const seasonId =
      sIdx <= 15 ? 'season-1' : sIdx <= 30 ? 'season-2' : null;
    const sessionId = `session-${String(sIdx).padStart(2, '0')}`;
    const sessionStartedAtUtcMs = baseTimestampMs + (sIdx - 1) * oneWeekMs;

    sessions.push({
      id: sessionId,
      groupId: 'group-1',
      seasonId,
      sessionStartedAtUtcMs,
      createdAtUtcMs: sessionStartedAtUtcMs + 1000,
    });

    // Determine attendees for this session
    const attendees = players.filter((p) => {
      if (p.id === 'g01') {
        return sIdx >= 1 && sIdx <= 4; // Plays as guest in sessions 1..4 before becoming p11
      }
      if (sIdx < p.joinedAtSession) {
        return false;
      }
      return rng() <= p.attendanceProbability;
    });

    // Ensure at least 5 attendees by topping up from core regulars
    if (attendees.length < 5) {
      for (const p of players) {
        if (
          p.joinedAtSession <= sIdx &&
          p.id !== 'g01' &&
          !attendees.includes(p)
        ) {
          attendees.push(p);
          if (attendees.length >= 5) break;
        }
      }
    }

    // Play 8 doubles matches per session
    for (let mSeq = 1; mSeq <= 8; mSeq++) {
      // Shuffle attendees deterministically
      const shuffled = [...attendees];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const temp = shuffled[i]!;
        shuffled[i] = shuffled[j]!;
        shuffled[j] = temp;
      }

      const [pA1, pA2, pB1, pB2] = [
        shuffled[0]!,
        shuffled[1]!,
        shuffled[2]!,
        shuffled[3]!,
      ];

      const trueTeamA = (pA1.trueSkill + pA2.trueSkill) / 2;
      const trueTeamB = (pB1.trueSkill + pB2.trueSkill) / 2;
      const winProbA = 1 / (1 + Math.pow(10, (trueTeamB - trueTeamA) / 400));
      const aWins = rng() < winProbA;

      allMatches.push({
        id: `match-${String(sIdx).padStart(2, '0')}-${String(mSeq).padStart(2, '0')}`,
        groupId: 'group-1',
        sessionId,
        sequenceNumber: mSeq,
        teamA: [pA1.id, pA2.id],
        teamB: [pB1.id, pB2.id],
        teamAScore: aWins ? 21 : 17,
        teamBScore: aWins ? 17 : 21,
        status: mSeq === 8 && sIdx === 10 ? 'voided' : 'completed',
        isDisputed: sIdx === 12 && mSeq === 3,
      });
    }
  }

  const replayIdentities: ReplayPlayerIdentity[] = players.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    isGuest: p.isGuest,
    mergedIntoPlayerId: p.mergedIntoPlayerId ?? null,
  }));

  const metricsByK = new Map<CandidateKFactor, KFactorSimulationMetrics>();

  for (const kFactor of CANDIDATE_K_FACTORS) {
    const runUpToSession = (maxSessionIdx: number) => {
      const subSessions = sessions.slice(0, maxSessionIdx);
      const allowedSessionIds = new Set(subSessions.map((s) => s.id));
      const subMatches = allMatches.filter((m) =>
        allowedSessionIds.has(m.sessionId),
      );
      return replayRatings({
        groupId: 'group-1',
        sessions: subSessions,
        matches: subMatches,
        players: replayIdentities,
        kFactor,
      });
    };

    const replay10 = runUpToSession(10);
    const replay20 = runUpToSession(20);
    const replay40 = runUpToSession(40);

    const corePlayersAt = (maxSessionIdx: number, snapMap: ReadonlyMap<string, { ratingScaled: bigint }>) =>
      players
        .filter((p) => !p.mergedIntoPlayerId && p.joinedAtSession <= maxSessionIdx && p.id !== 'g02')
        .map((p) => ({
          trueSkill: p.trueSkill,
          estimatedRating:
            Number(snapMap.get(p.id)?.ratingScaled ?? DEFAULT_BASELINE_RATING_SCALED) /
            Number(NUMERIC4_SCALE),
        }));

    const spearman10 = computeSpearmanRankCorrelation(
      corePlayersAt(10, replay10.playerSnapshots),
    );
    const spearman20 = computeSpearmanRankCorrelation(
      corePlayersAt(20, replay20.playerSnapshots),
    );
    const spearman40 = computeSpearmanRankCorrelation(
      corePlayersAt(40, replay40.playerSnapshots),
    );

    const regulars40 = corePlayersAt(40, replay40.playerSnapshots);
    const rmseRegularsAtSession40 = Math.sqrt(
      regulars40.reduce(
        (acc, item) => acc + Math.pow(item.estimatedRating - item.trueSkill, 2),
        0,
      ) / regulars40.length,
    );

    const ratings40 = regulars40.map((x) => x.estimatedRating);
    const ratingSpreadAtSession40 =
      Math.max(...ratings40) - Math.min(...ratings40);

    let maxSingleMatchDelta = 0;
    const sessionPlayerSwingMap = new Map<string, bigint>();

    for (const rm of replay40.replayedMatches) {
      const deltaAbs =
        Number(
          rm.calculation.teamADeltaScaled < 0n
            ? -rm.calculation.teamADeltaScaled
            : rm.calculation.teamADeltaScaled,
        ) / Number(NUMERIC4_SCALE);
      if (deltaAbs > maxSingleMatchDelta) {
        maxSingleMatchDelta = deltaAbs;
      }
      for (const pc of rm.calculation.playerChanges) {
        const key = `${rm.sessionId}:${pc.playerId}`;
        sessionPlayerSwingMap.set(
          key,
          (sessionPlayerSwingMap.get(key) ?? 0n) + pc.deltaScaled,
        );
      }
    }

    let maxSingleSessionPlayerSwing = 0;
    for (const netScaled of sessionPlayerSwingMap.values()) {
      const absSwing =
        Number(netScaled < 0n ? -netScaled : netScaled) /
        Number(NUMERIC4_SCALE);
      if (absSwing > maxSingleSessionPlayerSwing) {
        maxSingleSessionPlayerSwing = absSwing;
      }
    }

    // Track newcomer p10 (true skill 1180, rank #2, joins at session 21) match count to enter Top 4
    const liveRatings = new Map<string, bigint>();
    for (const p of players) {
      if (!p.mergedIntoPlayerId) {
        liveRatings.set(p.id, DEFAULT_BASELINE_RATING_SCALED);
      }
    }
    let p10Matches = 0;
    let newcomerMatchesToTop4: number | null = null;
    for (const rm of replay40.replayedMatches) {
      for (const pc of rm.calculation.playerChanges) {
        liveRatings.set(pc.playerId, pc.afterScaled);
      }
      const p10Change = rm.calculation.playerChanges.find(
        (c) => c.playerId === 'p10',
      );
      if (p10Change) {
        p10Matches += 1;
        if (newcomerMatchesToTop4 === null) {
          const p10Current = liveRatings.get('p10') ?? DEFAULT_BASELINE_RATING_SCALED;
          let strictlyHigherCount = 0;
          for (const [pid, rating] of liveRatings.entries()) {
            if (pid !== 'p10' && rating > p10Current) {
              strictlyHigherCount += 1;
            }
          }
          if (strictlyHigherCount < 4) {
            newcomerMatchesToTop4 = p10Matches;
          }
        }
      }
    }

    const newcomerRatingAtSession40 = Number(
      (
        Number(
          replay40.playerSnapshots.get('p10')?.ratingScaled ??
            DEFAULT_BASELINE_RATING_SCALED,
        ) / Number(NUMERIC4_SCALE)
      ).toFixed(1),
    );

    // Sub-simulation: Fixed partnership plateau followed by partner rotation recovery
    // Phase A: Strong (true 1200) + Weak (true 850) play 12 matches exclusively together vs two 1025 opponents (50% win rate)
    let strongRating = DEFAULT_BASELINE_RATING_SCALED;
    let weakRating = DEFAULT_BASELINE_RATING_SCALED;
    let opp1Rating = DEFAULT_BASELINE_RATING_SCALED;
    let opp2Rating = DEFAULT_BASELINE_RATING_SCALED;
    for (let m = 0; m < 12; m++) {
      const res = calculateMatchEloUpdate({
        teamAPlayers: ['strong', 'weak'],
        teamBPlayers: ['opp1', 'opp2'],
        teamARatingsScaled: [strongRating, weakRating],
        teamBRatingsScaled: [opp1Rating, opp2Rating],
        winner: m % 2 === 0 ? 'A' : 'B',
        kFactor,
      });
      strongRating = res.playerChanges[0].afterScaled;
      weakRating = res.playerChanges[1].afterScaled;
      opp1Rating = res.playerChanges[2].afterScaled;
      opp2Rating = res.playerChanges[3].afterScaled;
    }
    // Phase B: Strong (true 1200) rotates with average 1000-rated partners against 1000-rated opponents (2 wins per 3 matches ~ 66.7%)
    let postFixedPairRecoveryMatchesTo1100: number | null = null;
    for (let m = 1; m <= 40; m++) {
      const res = calculateMatchEloUpdate({
        teamAPlayers: ['strong', 'avgPartner'],
        teamBPlayers: ['avgOpp1', 'avgOpp2'],
        teamARatingsScaled: [strongRating, DEFAULT_BASELINE_RATING_SCALED],
        teamBRatingsScaled: [
          DEFAULT_BASELINE_RATING_SCALED,
          DEFAULT_BASELINE_RATING_SCALED,
        ],
        winner: m % 3 !== 0 ? 'A' : 'B',
        kFactor,
      });
      strongRating = res.playerChanges[0].afterScaled;
      if (
        postFixedPairRecoveryMatchesTo1100 === null &&
        strongRating >= 11_000_000n
      ) {
        postFixedPairRecoveryMatchesTo1100 = m;
      }
    }

    // Verify strict zero-sum across all active snapshots
    let totalNetDriftFromBaselineScaled = 0n;
    for (const snap of replay40.playerSnapshots.values()) {
      totalNetDriftFromBaselineScaled +=
        snap.ratingScaled - DEFAULT_BASELINE_RATING_SCALED;
    }

    // Verify deterministic replay after score correction on match-05-02
    const correctedMatches = allMatches.map((m) =>
      m.id === 'match-05-02'
        ? {
            ...m,
            teamAScore: m.teamBScore,
            teamBScore: m.teamAScore,
          }
        : m,
    );
    const replayCorrectedA = replayRatings({
      groupId: 'group-1',
      sessions,
      matches: correctedMatches,
      players: replayIdentities,
      kFactor,
    });
    const replayCorrectedB = replayRatings({
      groupId: 'group-1',
      sessions: [...sessions].reverse(),
      matches: [...correctedMatches].reverse(),
      players: replayIdentities,
      kFactor,
    });

    let replayDeterminismVerified = true;
    for (const [pid, snapA] of replayCorrectedA.playerSnapshots.entries()) {
      const snapB = replayCorrectedB.playerSnapshots.get(pid);
      if (!snapB || snapB.ratingScaled !== snapA.ratingScaled) {
        replayDeterminismVerified = false;
      }
    }

    metricsByK.set(kFactor, {
      kFactor,
      spearmanAtSession10: Number(spearman10.toFixed(3)),
      spearmanAtSession20: Number(spearman20.toFixed(3)),
      spearmanAtSession40: Number(spearman40.toFixed(3)),
      rmseRegularsAtSession40: Number(rmseRegularsAtSession40.toFixed(1)),
      ratingSpreadAtSession40: Number(ratingSpreadAtSession40.toFixed(1)),
      maxSingleMatchDelta: Number(maxSingleMatchDelta.toFixed(2)),
      maxSingleSessionPlayerSwing: Number(
        maxSingleSessionPlayerSwing.toFixed(1),
      ),
      newcomerMatchesToTop4,
      newcomerRatingAtSession40,
      postFixedPairRecoveryMatchesTo1100,
      totalNetDriftFromBaselineScaled,
      replayDeterminismVerified,
    });
  }

  // Verify season independence (Season 2 starts at 1000.0000 independent of Season 1)
  const season1Replay = replayRatings({
    groupId: 'group-1',
    sessions,
    matches: allMatches,
    players: replayIdentities,
    kFactor: 24,
    seasonId: 'season-1',
  });
  const season2Replay = replayRatings({
    groupId: 'group-1',
    sessions,
    matches: allMatches,
    players: replayIdentities,
    kFactor: 24,
    seasonId: 'season-2',
  });
  const firstSeason2Match = season2Replay.replayedMatches[0];
  const seasonIndependenceVerified =
    season1Replay.replayedMatches.length > 0 &&
    firstSeason2Match !== undefined &&
    firstSeason2Match.calculation.playerChanges.every(
      (pc) => pc.beforeScaled === DEFAULT_BASELINE_RATING_SCALED,
    );

  const disputedMatchEntry = season1Replay.replayedMatches.find(
    (m) => m.matchId === 'match-12-03',
  );
  const disputedMatchIncludedVerified =
    disputedMatchEntry !== undefined && disputedMatchEntry.isDisputed === true;

  return {
    seed,
    metricsByK,
    seasonIndependenceVerified,
    disputedMatchIncludedVerified,
  };
}

export {
  formatDeltaOneDecimal,
  formatNumeric4,
  roundScaledToOneDecimalNumber,
  roundScaledToWholeNumber,
};
