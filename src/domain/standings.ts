import {
  formatNumeric4,
  type PlayerRatingSnapshot,
  roundScaledToWholeNumber,
} from './elo.ts';
import { validateMatchScore } from './scoring.ts';

export interface LeaderboardPlayerProfile {
  id: string;
  displayName: string;
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
  isGuest: boolean;
}

export interface SessionStandingRow {
  rank: number | null;
  isTiedRank: boolean;
  playerId: string;
  displayName: string;
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
