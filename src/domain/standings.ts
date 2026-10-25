import {
  compareCanonicalMatchOrder,
  DEFAULT_BASELINE_RATING_SCALED,
  DEFAULT_PROVISIONAL_THRESHOLD,
  formatNumeric4,
  type PlayerRatingSnapshot,
  type ReplayMatchRecord,
  type ReplayPlayerIdentity,
  type ReplaySessionRecord,
  resolveMergedPlayerId,
  roundFloatToScaled4HalfAwayFromZero,
  roundScaledToWholeNumber,
} from './elo.ts';
import { validateMatchParticipants, validateMatchScore } from './scoring.ts';

export interface LeaderboardPlayerProfile {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  isGuest: boolean;
  isActive: boolean;
  createdAtSessionIndex?: number;
  sessionsAttendedCount?: number;
  sessionsHeldSinceCreationCount?: number;
}

export interface AllTimeLeaderboardRow {
  rank: number;
  isTiedRank: boolean;
  playerId: string;
  displayName: string;
  avatarUrl?: string | null;
  isGuest: boolean;
  guestLabel: 'Guest' | null;
  isActive: boolean;
  ratingScaled: bigint;
  ratingNumeric4: string;
  ratingDisplay: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRatePercentDisplay: string;
  attendanceRatePercentDisplay: string | null;
  sessionsAttendedCount: number;
  sessionsHeldSinceCreationCount: number;
  isProvisional: boolean;
}

/**
 * Builds the All-Time Elo Leaderboard:
 * - Includes unmerged temporary guests with a visible 'Guest' label (Owner Decision 4).
 * - Sorts strictly by full internal NUMERIC(10,4) precision (`ratingScaled DESC`).
 * - Shares competition rank (1, 1, 3) ONLY when internal `ratingScaled` values are identical.
 *   Two players with different internal decimals that round to the same whole integer do NOT tie.
 */
export function buildAllTimeLeaderboard(params: {
  profiles: readonly LeaderboardPlayerProfile[];
  snapshots: ReadonlyMap<string, PlayerRatingSnapshot>;
  includeInactive?: boolean;
}): AllTimeLeaderboardRow[] {
  const includeInactive = params.includeInactive ?? false;

  const eligible = params.profiles.filter(
    (profile) => includeInactive || profile.isActive,
  );

  const unsorted = eligible.map((profile) => {
    const snap = params.snapshots.get(profile.id);
    const ratingScaled = snap ? snap.ratingScaled : 10_000_000n;
    const matchesPlayed = snap ? snap.matchesPlayed : 0;
    const wins = snap ? snap.wins : 0;
    const losses = snap ? snap.losses : 0;
    const isProvisional = snap ? snap.isProvisional : true;

    const winRatePercentDisplay =
      matchesPlayed > 0
        ? `${((wins / matchesPlayed) * 100).toFixed(1)}% (${wins}/${matchesPlayed})`
        : '0.0% (0/0)';

    const attended = profile.sessionsAttendedCount ?? 0;
    const held = profile.sessionsHeldSinceCreationCount ?? 0;
    const attendanceRatePercentDisplay =
      held > 0
        ? `${((attended / held) * 100).toFixed(1)}% (${attended}/${held})`
        : null;

    return {
      playerId: profile.id,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl ?? null,
      isGuest: profile.isGuest,
      guestLabel: profile.isGuest ? ('Guest' as const) : null,
      isActive: profile.isActive,
      ratingScaled,
      ratingNumeric4: formatNumeric4(ratingScaled),
      ratingDisplay: roundScaledToWholeNumber(ratingScaled),
      matchesPlayed,
      wins,
      losses,
      winRatePercentDisplay,
      attendanceRatePercentDisplay,
      sessionsAttendedCount: attended,
      sessionsHeldSinceCreationCount: held,
      isProvisional,
    };
  });

  // Sort by internal ratingScaled DESC, then displayName ASC, then playerId ASC for presentation stability
  unsorted.sort((a, b) => {
    if (a.ratingScaled !== b.ratingScaled) {
      return a.ratingScaled > b.ratingScaled ? -1 : 1;
    }
    const nameCmp = a.displayName.localeCompare(b.displayName, 'en');
    if (nameCmp !== 0) {
      return nameCmp;
    }
    return a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0;
  });

  const rows: AllTimeLeaderboardRow[] = [];
  for (let i = 0; i < unsorted.length; i++) {
    const current = unsorted[i]!;
    const prev = i > 0 ? unsorted[i - 1] : undefined;
    const next = i + 1 < unsorted.length ? unsorted[i + 1] : undefined;

    const sameAsPrev =
      prev !== undefined && prev.ratingScaled === current.ratingScaled;
    const sameAsNext =
      next !== undefined && next.ratingScaled === current.ratingScaled;

    const rank = sameAsPrev ? rows[i - 1]!.rank : i + 1;
    rows.push({
      rank,
      isTiedRank: sameAsPrev || sameAsNext,
      ...current,
    });
  }

  return rows;
}

export const FIXED_POINTS_WIN_DELTA = 3;
export const FIXED_POINTS_LOSS_DELTA = -3;

export interface FixedPointsPlayerRecordInput {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  isGuest: boolean;
  isActive: boolean;
  wins: number;
  losses: number;
}

export interface FixedPointsLeaderboardRow {
  rank: number;
  isTiedRank: boolean;
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  isGuest: boolean;
  isActive: boolean;
  wins: number;
  losses: number;
  matchesPlayed: number;
  fixedPoints: number;
  fixedPointsDisplay: string;
  winRatePercentDisplay: string;
}

/**
 * Builds the "Ammar's Style" Fixed-Points Leaderboard:
 * - Every player starts at `0` points (`0 pts`).
 * - Each completed match Win awards `+3` points; each Loss deducts `-3` points.
 * - Ranks strictly by pure win/loss point total (`fixedPoints DESC`).
 * - Players with identical `fixedPoints` share the exact same competition rank (e.g. 1, 2, 3, 3, 5)
 *   and receive `isTiedRank = true`.
 */
export function buildFixedPointsLeaderboard(params: {
  players: readonly FixedPointsPlayerRecordInput[];
  includeInactive?: boolean;
}): FixedPointsLeaderboardRow[] {
  const includeInactive = params.includeInactive ?? false;
  const eligible = params.players.filter(
    (player) => includeInactive || player.isActive,
  );

  const unranked = eligible.map((player) => {
    const matchesPlayed = player.wins + player.losses;
    const rawPoints =
      player.wins * FIXED_POINTS_WIN_DELTA +
      player.losses * FIXED_POINTS_LOSS_DELTA;
    const fixedPoints = Object.is(rawPoints, -0) ? 0 : rawPoints;
    const fixedPointsDisplay =
      fixedPoints > 0 ? `+${fixedPoints}` : `${fixedPoints}`;
    const winRatePercentDisplay =
      matchesPlayed > 0
        ? `${((player.wins / matchesPlayed) * 100).toFixed(1)}%`
        : '0.0%';

    return {
      playerId: player.id,
      displayName: player.displayName,
      avatarUrl: player.avatarUrl ?? null,
      isGuest: player.isGuest,
      isActive: player.isActive,
      wins: player.wins,
      losses: player.losses,
      matchesPlayed,
      fixedPoints,
      fixedPointsDisplay,
      winRatePercentDisplay,
    };
  });

  // Sort strictly by fixedPoints DESC; alphabetical displayName & playerId are presentation stability only
  unranked.sort((a, b) => {
    if (a.fixedPoints !== b.fixedPoints) {
      return b.fixedPoints - a.fixedPoints;
    }
    const nameCmp = a.displayName.localeCompare(b.displayName, 'en');
    if (nameCmp !== 0) {
      return nameCmp;
    }
    return a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0;
  });

  const rows: FixedPointsLeaderboardRow[] = [];
  for (let i = 0; i < unranked.length; i++) {
    const current = unranked[i]!;
    const prev = i > 0 ? unranked[i - 1] : undefined;
    const next = i + 1 < unranked.length ? unranked[i + 1] : undefined;

    const sameAsPrev =
      prev !== undefined && prev.fixedPoints === current.fixedPoints;
    const sameAsNext =
      next !== undefined && current.fixedPoints === next.fixedPoints;

    const rank = sameAsPrev ? rows[i - 1]!.rank : i + 1;
    rows.push({
      rank,
      isTiedRank: sameAsPrev || sameAsNext,
      ...current,
    });
  }

  return rows;
}

export interface SessionCompletedMatchInput {
  id: string;
  teamA: readonly [string, string];
  teamB: readonly [string, string];
  teamAScore: number;
  teamBScore: number;
  status: 'incomplete' | 'completed' | 'voided';
}

export interface SessionAttendeeInput {
  playerId: string;
  displayName: string;
  avatarUrl?: string | null;
  isGuest: boolean;
}

export interface SessionStandingRow {
  rank: number | null;
  isTiedRank: boolean;
  playerId: string;
  displayName: string;
  avatarUrl?: string | null;
  isGuest: boolean;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRatePercentDisplay: string;
  pointsScored: number;
  pointsConceded: number;
  pointDifference: number;
}

export interface SessionStandingsResult {
  isProvisionalUntilFinalized: boolean;
  playedRows: readonly SessionStandingRow[];
  nonPlayingAttendees: readonly SessionStandingRow[];
}

/**
 * Computes single-session standings:
 * - Ranks players with >=1 completed match by:
 *   1. Wins DESC
 *   2. Win rate DESC (compared via exact cross-multiplication winsA * playedB vs winsB * playedA)
 *   3. Point difference DESC (team points scored minus team points conceded across completed matches)
 * - Exact ties on (wins, win rate, point difference) share competition rank (1, 1, 3).
 * - Attendees who played 0 matches remain in `nonPlayingAttendees` (attendance is distinct from match play).
 */
export function computeSessionStandings(params: {
  attendees: readonly SessionAttendeeInput[];
  matches: readonly SessionCompletedMatchInput[];
  isSessionFinalized: boolean;
}): SessionStandingsResult {
  const statsMap = new Map<
    string,
    {
      playerId: string;
      displayName: string;
      avatarUrl?: string | null;
      isGuest: boolean;
      matchesPlayed: number;
      wins: number;
      losses: number;
      pointsScored: number;
      pointsConceded: number;
    }
  >();

  for (const attendee of params.attendees) {
    statsMap.set(attendee.playerId, {
      playerId: attendee.playerId,
      displayName: attendee.displayName,
      avatarUrl: attendee.avatarUrl ?? null,
      isGuest: attendee.isGuest,
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      pointsScored: 0,
      pointsConceded: 0,
    });
  }

  for (const match of params.matches) {
    if (match.status !== 'completed') {
      continue;
    }
    const validation = validateMatchScore(match.teamAScore, match.teamBScore);
    if (!validation.valid || !validation.winner) {
      throw new Error(
        `Invalid completed match score ${match.teamAScore}–${match.teamBScore} in match '${match.id}'`,
      );
    }

    const recordParticipant = (
      playerId: string,
      teamScore: number,
      opponentScore: number,
      won: boolean,
    ) => {
      let entry = statsMap.get(playerId);
      if (!entry) {
        entry = {
          playerId,
          displayName: playerId,
          isGuest: false,
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
          pointsScored: 0,
          pointsConceded: 0,
        };
        statsMap.set(playerId, entry);
      }
      entry.matchesPlayed += 1;
      if (won) {
        entry.wins += 1;
      } else {
        entry.losses += 1;
      }
      entry.pointsScored += teamScore;
      entry.pointsConceded += opponentScore;
    };

    const aWon = validation.winner === 'A';
    for (const pA of match.teamA) {
      recordParticipant(pA, match.teamAScore, match.teamBScore, aWon);
    }
    for (const pB of match.teamB) {
      recordParticipant(pB, match.teamBScore, match.teamAScore, !aWon);
    }
  }

  const playedList: Array<Omit<SessionStandingRow, 'rank' | 'isTiedRank'>> = [];
  const nonPlayingAttendees: SessionStandingRow[] = [];

  for (const stat of statsMap.values()) {
    const pointDifference = stat.pointsScored - stat.pointsConceded;
    const winRatePercentDisplay =
      stat.matchesPlayed > 0
        ? `${((stat.wins / stat.matchesPlayed) * 100).toFixed(1)}% (${stat.wins}/${stat.matchesPlayed})`
        : '0.0% (0/0)';

    if (stat.matchesPlayed === 0) {
      nonPlayingAttendees.push({
        rank: null,
        isTiedRank: false,
        playerId: stat.playerId,
        displayName: stat.displayName,
        avatarUrl: stat.avatarUrl ?? null,
        isGuest: stat.isGuest,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        winRatePercentDisplay,
        pointsScored: 0,
        pointsConceded: 0,
        pointDifference: 0,
      });
    } else {
      playedList.push({
        playerId: stat.playerId,
        displayName: stat.displayName,
        avatarUrl: stat.avatarUrl ?? null,
        isGuest: stat.isGuest,
        matchesPlayed: stat.matchesPlayed,
        wins: stat.wins,
        losses: stat.losses,
        winRatePercentDisplay,
        pointsScored: stat.pointsScored,
        pointsConceded: stat.pointsConceded,
        pointDifference,
      });
    }
  }

  const compareStandingsMetrics = (
    a: Omit<SessionStandingRow, 'rank' | 'isTiedRank'>,
    b: Omit<SessionStandingRow, 'rank' | 'isTiedRank'>,
  ): number => {
    if (a.wins !== b.wins) {
      return b.wins - a.wins;
    }
    // Exact rational comparison of win rate: a.wins / a.matchesPlayed vs b.wins / b.matchesPlayed
    const lhs = a.wins * b.matchesPlayed;
    const rhs = b.wins * a.matchesPlayed;
    if (lhs !== rhs) {
      return rhs - lhs;
    }
    if (a.pointDifference !== b.pointDifference) {
      return b.pointDifference - a.pointDifference;
    }
    return 0;
  };

  playedList.sort((a, b) => {
    const metricCmp = compareStandingsMetrics(a, b);
    if (metricCmp !== 0) {
      return metricCmp;
    }
    const nameCmp = a.displayName.localeCompare(b.displayName, 'en');
    if (nameCmp !== 0) {
      return nameCmp;
    }
    return a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0;
  });

  const playedRows: SessionStandingRow[] = [];
  for (let i = 0; i < playedList.length; i++) {
    const current = playedList[i]!;
    const prev = i > 0 ? playedList[i - 1] : undefined;
    const next = i + 1 < playedList.length ? playedList[i + 1] : undefined;

    const sameAsPrev =
      prev !== undefined && compareStandingsMetrics(prev, current) === 0;
    const sameAsNext =
      next !== undefined && compareStandingsMetrics(current, next) === 0;

    const rank = sameAsPrev ? playedRows[i - 1]!.rank! : i + 1;
    playedRows.push({
      rank,
      isTiedRank: sameAsPrev || sameAsNext,
      ...current,
    });
  }

  nonPlayingAttendees.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, 'en'),
  );

  return {
    isProvisionalUntilFinalized: !params.isSessionFinalized,
    playedRows,
    nonPlayingAttendees,
  };
}

export type PairSortMode = 'elo' | 'wins' | 'win_rate';

export interface PairPlayerIdentityInput extends ReplayPlayerIdentity {
  avatarUrl?: string | null;
  isActive: boolean;
}

export interface PairPartnerInfo {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  isGuest: boolean;
  isActive: boolean;
}

export interface PairLeaderboardRow {
  rank: number;
  isTiedRank: boolean;
  pairKey: string;
  player1: PairPartnerInfo;
  player2: PairPartnerInfo;
  includesGuest: boolean;
  isActive: boolean;
  ratingScaled: bigint;
  ratingNumeric4: string;
  ratingDisplay: number;
  matchesPlayed: number;
  allTimeMatchesPlayed: number;
  wins: number;
  losses: number;
  winRatePercent: number;
  winRatePercentDisplay: string;
  pointsScored: number;
  pointsConceded: number;
  pointDifference: number;
  isProvisional: boolean;
}

/**
 * Produces a deterministic, slot-order-invariant canonical key for a 2-player partnership.
 */
export function canonicalizePairKey(
  playerAId: string,
  playerBId: string,
): { pairKey: string; firstId: string; secondId: string } {
  if (playerAId === playerBId) {
    throw new Error(`Invalid partnership: duplicate player ID '${playerAId}'`);
  }
  if (playerAId < playerBId) {
    return {
      pairKey: `${playerAId}:${playerBId}`,
      firstId: playerAId,
      secondId: playerBId,
    };
  }
  return {
    pairKey: `${playerBId}:${playerAId}`,
    firstId: playerBId,
    secondId: playerAId,
  };
}

/**
 * Calculates zero-sum Pair Elo delta at exact NUMERIC(10,4) fixed-point precision
 * when Pair A plays directly against Pair B.
 */
export function calculatePairMatchEloDelta(params: {
  pairARatingScaled: bigint;
  pairBRatingScaled: bigint;
  winner: 'A' | 'B';
  kFactor: number;
}): {
  pairADeltaScaled: bigint;
  pairBDeltaScaled: bigint;
  expectedScoreA: number;
} {
  if (!Number.isFinite(params.kFactor) || params.kFactor <= 0) {
    throw new Error(`Invalid K-factor: ${params.kFactor}`);
  }
  const diffBMinusA =
    Number(params.pairBRatingScaled - params.pairARatingScaled) / 10_000;
  const expectedScoreA = 1 / (1 + Math.pow(10, diffBMinusA / 400));
  const actualScoreA = params.winner === 'A' ? 1 : 0;
  const rawDeltaA = params.kFactor * (actualScoreA - expectedScoreA);
  const pairADeltaScaled = roundFloatToScaled4HalfAwayFromZero(rawDeltaA);
  const pairBDeltaScaled = -pairADeltaScaled;

  return {
    pairADeltaScaled,
    pairBDeltaScaled,
    expectedScoreA,
  };
}

/**
 * Deterministically replays completed matches in canonical chronological order to compute
 * Pair Elo ratings (`1000.0000` baseline) and partnership W-L / Win Rate / Point Difference records.
 *
 * - Slot-order invariant: `(P1, P2)` and `(P2, P1)` map to the exact same partnership.
 * - Includes only pairs with `>= 1` completed match in the target scope (`eligibleMatchIds` if provided, or all-time).
 * - Marks pairs with `< 3` all-time completed matches together as `Provisional`.
 * - Supports sorting by `'elo'` (default), `'wins'`, or `'win_rate'` with exact competition rank sharing (`1, 1, 3`).
 */
export function buildPairsLeaderboard(params: {
  groupId: string;
  sessions: readonly ReplaySessionRecord[];
  matches: readonly ReplayMatchRecord[];
  players: readonly PairPlayerIdentityInput[];
  kFactor: number;
  sortMode?: PairSortMode;
  includeInactive?: boolean;
  eligibleMatchIds?: ReadonlySet<string>;
  baselineRatingScaled?: bigint;
  provisionalThreshold?: number;
}): PairLeaderboardRow[] {
  const baseline = params.baselineRatingScaled ?? DEFAULT_BASELINE_RATING_SCALED;
  const provisionalThreshold =
    params.provisionalThreshold ?? DEFAULT_PROVISIONAL_THRESHOLD;
  const sortMode: PairSortMode = params.sortMode ?? 'elo';
  const includeInactive = params.includeInactive ?? false;

  const sessionMap = new Map<string, ReplaySessionRecord>();
  for (const session of params.sessions) {
    if (session.groupId !== params.groupId) {
      throw new Error(
        `Cross-group session '${session.id}' detected in pair replay for group '${params.groupId}'`,
      );
    }
    sessionMap.set(session.id, session);
  }

  const identityMap = new Map<string, PairPlayerIdentityInput>();
  for (const player of params.players) {
    identityMap.set(player.id, player);
  }

  const completedEntries: Array<{
    match: ReplayMatchRecord;
    session: ReplaySessionRecord;
  }> = [];

  for (const match of params.matches) {
    if (match.groupId !== params.groupId) {
      throw new Error(
        `Cross-group match '${match.id}' detected in pair replay for group '${params.groupId}'`,
      );
    }
    if (match.status !== 'completed') {
      continue;
    }
    const session = sessionMap.get(match.sessionId);
    if (!session) {
      continue;
    }
    completedEntries.push({ match, session });
  }

  completedEntries.sort((a, b) =>
    compareCanonicalMatchOrder(a.match, a.session, b.match, b.session),
  );

  interface PairAccumulator {
    pairKey: string;
    firstId: string;
    secondId: string;
    ratingScaled: bigint;
    allTimeMatchesPlayed: number;
    scopedMatchesPlayed: number;
    scopedWins: number;
    scopedLosses: number;
    scopedPointsScored: number;
    scopedPointsConceded: number;
  }

  const pairMap = new Map<string, PairAccumulator>();

  const ensurePair = (pA: string, pB: string): PairAccumulator => {
    const { pairKey, firstId, secondId } = canonicalizePairKey(pA, pB);
    let acc = pairMap.get(pairKey);
    if (!acc) {
      acc = {
        pairKey,
        firstId,
        secondId,
        ratingScaled: baseline,
        allTimeMatchesPlayed: 0,
        scopedMatchesPlayed: 0,
        scopedWins: 0,
        scopedLosses: 0,
        scopedPointsScored: 0,
        scopedPointsConceded: 0,
      };
      pairMap.set(pairKey, acc);
    }
    return acc;
  };

  for (const { match } of completedEntries) {
    const scoreValidation = validateMatchScore(
      match.teamAScore,
      match.teamBScore,
    );
    if (!scoreValidation.valid || !scoreValidation.winner) {
      continue;
    }

    const resolvedTeamA: [string, string] = [
      resolveMergedPlayerId(match.teamA[0], identityMap),
      resolveMergedPlayerId(match.teamA[1], identityMap),
    ];
    const resolvedTeamB: [string, string] = [
      resolveMergedPlayerId(match.teamB[0], identityMap),
      resolveMergedPlayerId(match.teamB[1], identityMap),
    ];

    const participantValidation = validateMatchParticipants({
      teamA: resolvedTeamA,
      teamB: resolvedTeamB,
    });
    if (!participantValidation.valid) {
      continue;
    }

    const pairA = ensurePair(resolvedTeamA[0], resolvedTeamA[1]);
    const pairB = ensurePair(resolvedTeamB[0], resolvedTeamB[1]);

    const { pairADeltaScaled, pairBDeltaScaled } = calculatePairMatchEloDelta({
      pairARatingScaled: pairA.ratingScaled,
      pairBRatingScaled: pairB.ratingScaled,
      winner: scoreValidation.winner,
      kFactor: params.kFactor,
    });

    pairA.ratingScaled += pairADeltaScaled;
    pairB.ratingScaled += pairBDeltaScaled;
    pairA.allTimeMatchesPlayed += 1;
    pairB.allTimeMatchesPlayed += 1;

    const inScope =
      !params.eligibleMatchIds || params.eligibleMatchIds.has(match.id);
    if (inScope) {
      const aWon = scoreValidation.winner === 'A';
      pairA.scopedMatchesPlayed += 1;
      pairA.scopedWins += aWon ? 1 : 0;
      pairA.scopedLosses += aWon ? 0 : 1;
      pairA.scopedPointsScored += match.teamAScore;
      pairA.scopedPointsConceded += match.teamBScore;

      pairB.scopedMatchesPlayed += 1;
      pairB.scopedWins += !aWon ? 1 : 0;
      pairB.scopedLosses += !aWon ? 0 : 1;
      pairB.scopedPointsScored += match.teamBScore;
      pairB.scopedPointsConceded += match.teamAScore;
    }
  }

  const buildPartnerInfo = (playerId: string): PairPartnerInfo => {
    const p = identityMap.get(playerId);
    return {
      playerId,
      displayName: p?.displayName ?? 'Unknown Player',
      avatarUrl: p?.avatarUrl ?? null,
      isGuest: p?.isGuest ?? false,
      isActive: p?.isActive ?? true,
    };
  };

  type UnrankedPairRow = Omit<PairLeaderboardRow, 'rank' | 'isTiedRank'>;
  const unranked: UnrankedPairRow[] = [];

  for (const acc of pairMap.values()) {
    if (acc.scopedMatchesPlayed < 1) {
      continue;
    }

    const pFirst = buildPartnerInfo(acc.firstId);
    const pSecond = buildPartnerInfo(acc.secondId);

    // Order partner display names alphabetically for clean, predictable presentation
    const firstBeforeSecond =
      pFirst.displayName.localeCompare(pSecond.displayName, 'en') < 0 ||
      (pFirst.displayName.localeCompare(pSecond.displayName, 'en') === 0 &&
        pFirst.playerId < pSecond.playerId);

    const player1 = firstBeforeSecond ? pFirst : pSecond;
    const player2 = firstBeforeSecond ? pSecond : pFirst;

    const isPairActive = player1.isActive && player2.isActive;
    if (!includeInactive && !isPairActive) {
      continue;
    }

    const winRateRaw =
      acc.scopedMatchesPlayed > 0
        ? (acc.scopedWins / acc.scopedMatchesPlayed) * 100
        : 0;
    const winRateRounded = Math.round(winRateRaw * 10) / 10;

    unranked.push({
      pairKey: acc.pairKey,
      player1,
      player2,
      includesGuest: player1.isGuest || player2.isGuest,
      isActive: isPairActive,
      ratingScaled: acc.ratingScaled,
      ratingNumeric4: formatNumeric4(acc.ratingScaled),
      ratingDisplay: roundScaledToWholeNumber(acc.ratingScaled),
      matchesPlayed: acc.scopedMatchesPlayed,
      allTimeMatchesPlayed: acc.allTimeMatchesPlayed,
      wins: acc.scopedWins,
      losses: acc.scopedLosses,
      winRatePercent: winRateRounded,
      winRatePercentDisplay: `${winRateRounded.toFixed(1)}%`,
      pointsScored: acc.scopedPointsScored,
      pointsConceded: acc.scopedPointsConceded,
      pointDifference: acc.scopedPointsScored - acc.scopedPointsConceded,
      isProvisional: acc.allTimeMatchesPlayed < provisionalThreshold,
    });
  }

  const compareExactWinRateDesc = (
    a: UnrankedPairRow,
    b: UnrankedPairRow,
  ): number => {
    const lhs = a.wins * b.matchesPlayed;
    const rhs = b.wins * a.matchesPlayed;
    if (lhs !== rhs) {
      return rhs - lhs;
    }
    return 0;
  };

  const compareSortMetrics = (
    a: UnrankedPairRow,
    b: UnrankedPairRow,
  ): number => {
    if (sortMode === 'elo') {
      if (a.ratingScaled !== b.ratingScaled) {
        return a.ratingScaled > b.ratingScaled ? -1 : 1;
      }
      return 0;
    }

    if (sortMode === 'wins') {
      if (a.wins !== b.wins) {
        return b.wins - a.wins;
      }
      const wrCmp = compareExactWinRateDesc(a, b);
      if (wrCmp !== 0) {
        return wrCmp;
      }
      if (a.pointDifference !== b.pointDifference) {
        return b.pointDifference - a.pointDifference;
      }
      if (a.ratingScaled !== b.ratingScaled) {
        return a.ratingScaled > b.ratingScaled ? -1 : 1;
      }
      return 0;
    }

    // sortMode === 'win_rate'
    const wrCmp = compareExactWinRateDesc(a, b);
    if (wrCmp !== 0) {
      return wrCmp;
    }
    if (a.wins !== b.wins) {
      return b.wins - a.wins;
    }
    if (a.pointDifference !== b.pointDifference) {
      return b.pointDifference - a.pointDifference;
    }
    if (a.ratingScaled !== b.ratingScaled) {
      return a.ratingScaled > b.ratingScaled ? -1 : 1;
    }
    return 0;
  };

  unranked.sort((a, b) => {
    const metricCmp = compareSortMetrics(a, b);
    if (metricCmp !== 0) {
      return metricCmp;
    }
    // Presentation tie-breakers (do not break competition rank sharing)
    if (a.wins !== b.wins) {
      return b.wins - a.wins;
    }
    const wrCmp = compareExactWinRateDesc(a, b);
    if (wrCmp !== 0) {
      return wrCmp;
    }
    if (a.pointDifference !== b.pointDifference) {
      return b.pointDifference - a.pointDifference;
    }
    const p1Cmp = a.player1.displayName.localeCompare(b.player1.displayName, 'en');
    if (p1Cmp !== 0) {
      return p1Cmp;
    }
    const p2Cmp = a.player2.displayName.localeCompare(b.player2.displayName, 'en');
    if (p2Cmp !== 0) {
      return p2Cmp;
    }
    return a.pairKey < b.pairKey ? -1 : a.pairKey > b.pairKey ? 1 : 0;
  });

  const rows: PairLeaderboardRow[] = [];
  for (let i = 0; i < unranked.length; i++) {
    const current = unranked[i]!;
    const prev = i > 0 ? unranked[i - 1] : undefined;
    const next = i + 1 < unranked.length ? unranked[i + 1] : undefined;

    const sameAsPrev =
      prev !== undefined && compareSortMetrics(prev, current) === 0;
    const sameAsNext =
      next !== undefined && compareSortMetrics(current, next) === 0;

    const rank = sameAsPrev ? rows[i - 1]!.rank : i + 1;
    rows.push({
      rank,
      isTiedRank: sameAsPrev || sameAsNext,
      ...current,
    });
  }

  return rows;
}
