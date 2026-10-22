import { validateMatchParticipants, validateMatchScore } from './scoring.ts';

/**
 * Fixed-point scale matching PostgreSQL NUMERIC(10,4):
 * 1 rating point = 10,000 micro-units (10^4).
 */
export const NUMERIC4_SCALE = 10_000n;
export const NUMERIC4_SCALE_NUMBER = 10_000;
export const DEFAULT_BASELINE_RATING_SCALED = 10_000_000n; // 1000.0000
export const DEFAULT_PROVISIONAL_THRESHOLD = 3;

export type RecalculationStatus = 'idle' | 'running' | 'failed';
export type RatingPublicationHealth = 'current' | 'recalculating' | 'stale_or_failed';

export interface RatingPublicationStateInput {
  recalculationStatus: RecalculationStatus;
  publishedVersionMatchStateSeq: number | bigint | null;
  requiredMatchStateSeq: number | bigint;
  lastError?: string | null;
}

export interface RatingPublicationBannerState {
  health: RatingPublicationHealth;
  isCurrent: boolean;
  bannerTitle: string | null;
  bannerMessage: string | null;
  canAdminRetry: boolean;
}

/**
 * Determines whether the currently published rating version is Current, Recalculating,
 * or Stale/Failed so the UI never claims stale ratings reflect the latest match history.
 */
export function deriveRatingPublicationState(
  input: RatingPublicationStateInput,
): RatingPublicationBannerState {
  const requiredSeq = BigInt(input.requiredMatchStateSeq);
  const publishedSeq =
    input.publishedVersionMatchStateSeq === null
      ? -1n
      : BigInt(input.publishedVersionMatchStateSeq);

  if (input.recalculationStatus === 'running') {
    return {
      health: 'recalculating',
      isCurrent: false,
      bannerTitle: 'Results updating',
      bannerMessage:
        'Ratings are currently recalculating. Showing the last verified leaderboard version until calculation completes.',
      canAdminRetry: false,
    };
  }

  if (input.recalculationStatus === 'failed' || publishedSeq < requiredSeq) {
    const detail = input.lastError
      ? ` Last error: ${input.lastError}`
      : '';
    return {
      health: 'stale_or_failed',
      isCurrent: false,
      bannerTitle: 'Ratings out of date: recalculation required',
      bannerMessage: `Published ratings reflect match state #${publishedSeq >= 0n ? publishedSeq.toString() : 'none'} and do not yet include the latest match history (#${requiredSeq.toString()}).${detail}`,
      canAdminRetry: true,
    };
  }

  return {
    health: 'current',
    isCurrent: true,
    bannerTitle: null,
    bannerMessage: null,
    canAdminRetry: false,
  };
}

/**
 * Rounds an IEEE-754 floating-point number to a 10^4-scaled bigint using
 * PostgreSQL's exact half-away-from-zero rule:
 *   +0.00005 -> +0.0001
 *   -0.00005 -> -0.0001
 */
export function roundFloatToScaled4HalfAwayFromZero(value: number): bigint {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot convert non-finite number '${value}' to NUMERIC(10,4)`);
  }
  if (value === 0) {
    return 0n;
  }
  const sign = value < 0 ? -1n : 1n;
  const absScaled = Math.abs(value) * NUMERIC4_SCALE_NUMBER;
  // Guard against binary float representation just under an exact .5 boundary (e.g. 16 * 0.5)
  const roundedMag = BigInt(Math.floor(absScaled + 0.5 + 1e-12));
  return sign * roundedMag;
}

/**
 * Parses a decimal string or number into a 10^4-scaled bigint using half-away-from-zero rounding.
 */
export function parseNumeric4(value: string | number): bigint {
  if (typeof value === 'number') {
    return roundFloatToScaled4HalfAwayFromZero(value);
  }
  const trimmed = value.trim();
  const match = /^([+-])?(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid NUMERIC(10,4) string: '${value}'`);
  }
  const sign = match[1] === '-' ? -1n : 1n;
  const intPart = BigInt(match[2] ?? '0');
  const fracRaw = (match[3] ?? '').padEnd(5, '0');
  const firstFour = BigInt(fracRaw.slice(0, 4));
  const fifthDigit = Number(fracRaw[4] ?? '0');
  const roundUp = fifthDigit >= 5 ? 1n : 0n;
  return sign * (intPart * NUMERIC4_SCALE + firstFour + roundUp);
}

/**
 * Formats a 10^4-scaled bigint as an exact 4-decimal string matching PostgreSQL NUMERIC(10,4).
 */
export function formatNumeric4(scaled: bigint): string {
  const sign = scaled < 0n ? '-' : '';
  const abs = scaled < 0n ? -scaled : scaled;
  const intPart = abs / NUMERIC4_SCALE;
  const fracPart = (abs % NUMERIC4_SCALE).toString().padStart(4, '0');
  return `${sign}${intPart.toString()}.${fracPart}`;
}

/**
 * Rounds a 10^4-scaled rating to a whole integer using PostgreSQL's half-away-from-zero rule.
 * Used for displaying before/after ratings on leaderboards and match details.
 */
export function roundScaledToWholeNumber(scaled: bigint): number {
  const sign = scaled < 0n ? -1n : 1n;
  const abs = scaled < 0n ? -scaled : scaled;
  const rounded = sign * ((abs + 5_000n) / 10_000n);
  const asNum = Number(rounded);
  return Object.is(asNum, -0) ? 0 : asNum;
}

/**
 * Rounds a 10^4-scaled delta to 1 decimal place using PostgreSQL's half-away-from-zero rule.
 * Used for displaying per-match rating changes.
 */
export function roundScaledToOneDecimalNumber(scaled: bigint): number {
  const sign = scaled < 0n ? -1n : 1n;
  const abs = scaled < 0n ? -scaled : scaled;
  const tenths = sign * ((abs + 500n) / 1_000n);
  const asNum = Number(tenths) / 10;
  return Object.is(asNum, -0) ? 0 : asNum;
}

/**
 * Formats a 10^4-scaled delta as a signed 1-decimal string (e.g., "+16.0", "-14.3", "0.0").
 */
export function formatDeltaOneDecimal(scaled: bigint): string {
  const sign = scaled < 0n ? '-' : scaled > 0n ? '+' : '';
  const abs = scaled < 0n ? -scaled : scaled;
  const tenthsTotal = (abs + 500n) / 1_000n;
  if (tenthsTotal === 0n) {
    return '0.0';
  }
  const intPart = tenthsTotal / 10n;
  const tenthDigit = tenthsTotal % 10n;
  return `${sign}${intPart.toString()}.${tenthDigit.toString()}`;
}

export interface PlayerMatchRatingChange {
  playerId: string;
  team: 'A' | 'B';
  beforeScaled: bigint;
  afterScaled: bigint;
  deltaScaled: bigint;
  beforeDisplay: number;
  afterDisplay: number;
  changeDisplay: string;
  changeDisplayNumber: number;
}

export interface MatchEloCalculationResult {
  teamAAverageScaled: bigint;
  teamBAverageScaled: bigint;
  expectedScoreA: number;
  expectedScoreB: number;
  teamADeltaScaled: bigint;
  teamBDeltaScaled: bigint;
  playerChanges: readonly [
    PlayerMatchRatingChange,
    PlayerMatchRatingChange,
    PlayerMatchRatingChange,
    PlayerMatchRatingChange,
  ];
}

/**
 * Calculates the candidate doubles Elo outcome-only adjustment for a single completed match:
 *   E_A = 1 / (1 + 10^((R_B - R_A) / 400))
 *   delta_A = ROUND_HALF_AWAY_FROM_ZERO(K * (S_A - E_A), 4)
 *   delta_B = -delta_A
 */
export function calculateMatchEloUpdate(params: {
  teamAPlayers: readonly [string, string];
  teamBPlayers: readonly [string, string];
  teamARatingsScaled: readonly [bigint, bigint];
  teamBRatingsScaled: readonly [bigint, bigint];
  winner: 'A' | 'B';
  kFactor: number;
}): MatchEloCalculationResult {
  if (!Number.isFinite(params.kFactor) || params.kFactor <= 0) {
    throw new Error(`Invalid K-factor: ${params.kFactor}`);
  }

  const [rA1, rA2] = params.teamARatingsScaled;
  const [rB1, rB2] = params.teamBRatingsScaled;

  // Team averages in 10^4 scale (rounded half-away-from-zero for reporting if sum is odd)
  const sumA = rA1 + rA2;
  const sumB = rB1 + rB2;
  const teamAAverageScaled =
    sumA >= 0n ? (sumA + 1n) / 2n : -((-sumA + 1n) / 2n);
  const teamBAverageScaled =
    sumB >= 0n ? (sumB + 1n) / 2n : -((-sumB + 1n) / 2n);

  // Exact team average difference (R_B - R_A) in rating points:
  // ((rB1 + rB2)/2 - (rA1 + rA2)/2) / 10000 = ((sumB - sumA) / 20000)
  const diffBMinusA = Number(sumB - sumA) / 20_000;
  const expectedScoreA = 1 / (1 + Math.pow(10, diffBMinusA / 400));
  const expectedScoreB = 1 - expectedScoreA;

  const actualScoreA = params.winner === 'A' ? 1 : 0;
  const rawDeltaA = params.kFactor * (actualScoreA - expectedScoreA);

  const teamADeltaScaled = roundFloatToScaled4HalfAwayFromZero(rawDeltaA);
  const teamBDeltaScaled = -teamADeltaScaled; // Strictly zero-sum at NUMERIC(10,4)

  const buildPlayerChange = (
    playerId: string,
    team: 'A' | 'B',
    beforeScaled: bigint,
    deltaScaled: bigint,
  ): PlayerMatchRatingChange => {
    const afterScaled = beforeScaled + deltaScaled;
    return {
      playerId,
      team,
      beforeScaled,
      afterScaled,
      deltaScaled,
      beforeDisplay: roundScaledToWholeNumber(beforeScaled),
      afterDisplay: roundScaledToWholeNumber(afterScaled),
      changeDisplay: formatDeltaOneDecimal(deltaScaled),
      changeDisplayNumber: roundScaledToOneDecimalNumber(deltaScaled),
    };
  };

  return {
    teamAAverageScaled,
    teamBAverageScaled,
    expectedScoreA,
    expectedScoreB,
    teamADeltaScaled,
    teamBDeltaScaled,
    playerChanges: [
      buildPlayerChange(params.teamAPlayers[0], 'A', rA1, teamADeltaScaled),
      buildPlayerChange(params.teamAPlayers[1], 'A', rA2, teamADeltaScaled),
      buildPlayerChange(params.teamBPlayers[0], 'B', rB1, teamBDeltaScaled),
      buildPlayerChange(params.teamBPlayers[1], 'B', rB2, teamBDeltaScaled),
    ],
  };
}

export interface ReplaySessionRecord {
  id: string;
  groupId: string;
  seasonId: string | null;
  /** Authoritative session start timestamp (UTC ms) */
  sessionStartedAtUtcMs: number;
  /** Server row creation timestamp (UTC ms) for tie-breaking equal sessionStartedAtUtcMs */
  createdAtUtcMs: number;
}

export type MatchStatus = 'incomplete' | 'completed' | 'voided';

export interface ReplayMatchRecord {
  id: string;
  groupId: string;
  sessionId: string;
  /** Immutable per-session sequence number assigned at completion (null only while incomplete) */
  sequenceNumber: number | null;
  teamA: readonly [string, string];
  teamB: readonly [string, string];
  teamAScore: number;
  teamBScore: number;
  status: MatchStatus;
  /** Open dispute flag — disputed matches remain official in ratings until score/status changes */
  isDisputed?: boolean;
}

export interface ReplayPlayerIdentity {
  id: string;
  displayName: string;
  isGuest: boolean;
  /** If this guest profile was merged into a permanent profile, points to the target profile ID */
  mergedIntoPlayerId?: string | null;
}

export interface PlayerRatingSnapshot {
  playerId: string;
  ratingScaled: bigint;
  ratingNumeric4: string;
  ratingDisplay: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  isProvisional: boolean;
}

export interface ReplayedMatchRecord {
  matchId: string;
  sessionId: string;
  seasonId: string | null;
  sequenceNumber: number;
  globalReplayIndex: number;
  isDisputed: boolean;
  winner: 'A' | 'B';
  calculation: MatchEloCalculationResult;
}

export interface DeterministicReplayResult {
  groupId: string;
  seasonId: string | null;
  kFactor: number;
  baselineRatingScaled: bigint;
  provisionalThreshold: number;
  replayedMatches: readonly ReplayedMatchRecord[];
  playerSnapshots: ReadonlyMap<string, PlayerRatingSnapshot>;
}

/**
 * Resolves a player ID through any admin-confirmed guest-to-permanent profile merge chain.
 */
export function resolveMergedPlayerId(
  playerId: string,
  identities: ReadonlyMap<string, ReplayPlayerIdentity>,
): string {
  const visited = new Set<string>();
  let current = playerId;
  while (true) {
    if (visited.has(current)) {
      throw new Error(`Cycle detected in player identity merge chain at '${current}'`);
    }
    visited.add(current);
    const identity = identities.get(current);
    if (!identity || !identity.mergedIntoPlayerId) {
      return current;
    }
    current = identity.mergedIntoPlayerId;
  }
}

/**
 * Compares two eligible matches using the canonical global chronological ordering tuple:
 *   (session.session_started_at ASC, session.created_at ASC, session.id ASC, match.sequence_number ASC)
 */
export function compareCanonicalMatchOrder(
  matchA: ReplayMatchRecord,
  sessionA: ReplaySessionRecord,
  matchB: ReplayMatchRecord,
  sessionB: ReplaySessionRecord,
): number {
  if (sessionA.sessionStartedAtUtcMs !== sessionB.sessionStartedAtUtcMs) {
    return sessionA.sessionStartedAtUtcMs - sessionB.sessionStartedAtUtcMs;
  }
  if (sessionA.createdAtUtcMs !== sessionB.createdAtUtcMs) {
    return sessionA.createdAtUtcMs - sessionB.createdAtUtcMs;
  }
  if (sessionA.id !== sessionB.id) {
    return sessionA.id < sessionB.id ? -1 : 1;
  }
  const seqA = matchA.sequenceNumber ?? 0;
  const seqB = matchB.sequenceNumber ?? 0;
  if (seqA !== seqB) {
    return seqA - seqB;
  }
  return matchA.id < matchB.id ? -1 : matchA.id > matchB.id ? 1 : 0;
}

/**
 * Deterministically replays all eligible completed matches in canonical chronological order
 * to produce either All-Time ratings (`seasonId = null`) or a specific Season's ratings.
 */
export function replayRatings(params: {
  groupId: string;
  sessions: readonly ReplaySessionRecord[];
  matches: readonly ReplayMatchRecord[];
  players: readonly ReplayPlayerIdentity[];
  kFactor: number;
  seasonId?: string | null;
  baselineRatingScaled?: bigint;
  provisionalThreshold?: number;
}): DeterministicReplayResult {
  const baseline = params.baselineRatingScaled ?? DEFAULT_BASELINE_RATING_SCALED;
  const provisionalThreshold =
    params.provisionalThreshold ?? DEFAULT_PROVISIONAL_THRESHOLD;
  const targetSeasonId = params.seasonId ?? null;

  const sessionMap = new Map<string, ReplaySessionRecord>();
  for (const session of params.sessions) {
    if (session.groupId !== params.groupId) {
      throw new Error(
        `Cross-group session '${session.id}' detected in replay for group '${params.groupId}'`,
      );
    }
    sessionMap.set(session.id, session);
  }

  const identityMap = new Map<string, ReplayPlayerIdentity>();
  for (const player of params.players) {
    identityMap.set(player.id, player);
  }

  // Initialize active (non-merged) player snapshots at baseline 1000.0000
  const snapshots = new Map<string, PlayerRatingSnapshot>();
  for (const player of params.players) {
    if (!player.mergedIntoPlayerId) {
      snapshots.set(player.id, {
        playerId: player.id,
        ratingScaled: baseline,
        ratingNumeric4: formatNumeric4(baseline),
        ratingDisplay: roundScaledToWholeNumber(baseline),
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        isProvisional: true,
      });
    }
  }

  // Filter eligible matches: completed only (voided and incomplete are excluded; disputed remain eligible)
  const eligibleMatches: Array<{
    match: ReplayMatchRecord;
    session: ReplaySessionRecord;
  }> = [];

  const seenSessionSeq = new Set<string>();

  for (const match of params.matches) {
    if (match.groupId !== params.groupId) {
      throw new Error(
        `Cross-group match '${match.id}' detected in replay for group '${params.groupId}'`,
      );
    }
    const session = sessionMap.get(match.sessionId);
    if (!session) {
      throw new Error(
        `Match '${match.id}' references unknown session '${match.sessionId}'`,
      );
    }

    // For completed or voided matches, sequenceNumber must be a positive integer and unique per session
    if (match.status === 'completed' || match.status === 'voided') {
      if (
        match.sequenceNumber === null ||
        !Number.isInteger(match.sequenceNumber) ||
        match.sequenceNumber < 1
      ) {
        throw new Error(
          `Match '${match.id}' with status '${match.status}' has invalid sequenceNumber '${String(match.sequenceNumber)}'`,
        );
      }
      const seqKey = `${match.sessionId}:${match.sequenceNumber}`;
      if (seenSessionSeq.has(seqKey)) {
        throw new Error(
          `Duplicate sequence_number ${match.sequenceNumber} in session '${match.sessionId}'`,
        );
      }
      seenSessionSeq.add(seqKey);
    }

    if (match.status !== 'completed') {
      continue;
    }

    if (targetSeasonId !== null && session.seasonId !== targetSeasonId) {
      continue;
    }

    eligibleMatches.push({ match, session });
  }

  // Sort strictly by canonical ordering tuple
  eligibleMatches.sort((a, b) =>
    compareCanonicalMatchOrder(a.match, a.session, b.match, b.session),
  );

  const replayedMatches: ReplayedMatchRecord[] = [];

  for (let idx = 0; idx < eligibleMatches.length; idx++) {
    const entry = eligibleMatches[idx]!;
    const { match, session } = entry;

    const scoreValidation = validateMatchScore(
      match.teamAScore,
      match.teamBScore,
    );
    if (!scoreValidation.valid || !scoreValidation.winner) {
      throw new Error(
        `Invalid score ${match.teamAScore}–${match.teamBScore} in completed match '${match.id}': ${scoreValidation.reason ?? 'unknown'}`,
      );
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
      throw new Error(
        `Invalid participants in completed match '${match.id}': ${participantValidation.reason ?? 'unknown'}`,
      );
    }

    const ensureSnapshot = (playerId: string): PlayerRatingSnapshot => {
      let snap = snapshots.get(playerId);
      if (!snap) {
        snap = {
          playerId,
          ratingScaled: baseline,
          ratingNumeric4: formatNumeric4(baseline),
          ratingDisplay: roundScaledToWholeNumber(baseline),
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
          isProvisional: true,
        };
        snapshots.set(playerId, snap);
      }
      return snap;
    };

    const snapA1 = ensureSnapshot(resolvedTeamA[0]);
    const snapA2 = ensureSnapshot(resolvedTeamA[1]);
    const snapB1 = ensureSnapshot(resolvedTeamB[0]);
    const snapB2 = ensureSnapshot(resolvedTeamB[1]);

    const calculation = calculateMatchEloUpdate({
      teamAPlayers: resolvedTeamA,
      teamBPlayers: resolvedTeamB,
      teamARatingsScaled: [snapA1.ratingScaled, snapA2.ratingScaled],
      teamBRatingsScaled: [snapB1.ratingScaled, snapB2.ratingScaled],
      winner: scoreValidation.winner,
      kFactor: params.kFactor,
    });

    for (const change of calculation.playerChanges) {
      const prev = ensureSnapshot(change.playerId);
      const won =
        (change.team === 'A' && scoreValidation.winner === 'A') ||
        (change.team === 'B' && scoreValidation.winner === 'B');
      const matchesPlayed = prev.matchesPlayed + 1;
      snapshots.set(change.playerId, {
        playerId: change.playerId,
        ratingScaled: change.afterScaled,
        ratingNumeric4: formatNumeric4(change.afterScaled),
        ratingDisplay: change.afterDisplay,
        matchesPlayed,
        wins: prev.wins + (won ? 1 : 0),
        losses: prev.losses + (won ? 0 : 1),
        isProvisional: matchesPlayed < provisionalThreshold,
      });
    }

    replayedMatches.push({
      matchId: match.id,
      sessionId: session.id,
      seasonId: session.seasonId,
      sequenceNumber: match.sequenceNumber!,
      globalReplayIndex: idx + 1,
      isDisputed: Boolean(match.isDisputed),
      winner: scoreValidation.winner,
      calculation,
    });
  }

  return {
    groupId: params.groupId,
    seasonId: targetSeasonId,
    kFactor: params.kFactor,
    baselineRatingScaled: baseline,
    provisionalThreshold,
    replayedMatches,
    playerSnapshots: snapshots,
  };
}
