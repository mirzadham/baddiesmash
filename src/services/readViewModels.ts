import {
  formatDeltaOneDecimal,
  parseNumeric4,
  type PlayerRatingSnapshot,
  roundScaledToOneDecimalNumber,
  roundScaledToWholeNumber,
} from '../domain/elo.ts';
import {
  type AllTimeLeaderboardRow,
  buildAllTimeLeaderboard,
  computeSessionStandings,
  type LeaderboardPlayerProfile,
  type SessionAttendeeInput,
  type SessionCompletedMatchInput,
  type SessionStandingsResult,
} from '../domain/standings.ts';
import type {
  DbMatchRow,
  DbPlayerRow,
  DbSessionRow,
  TeamSide,
} from '../types/database.ts';
import type { GroupReadSnapshot } from './demoData.ts';

export interface EnrichedParticipantSlot {
  playerId: string;
  displayName: string;
  isGuest: boolean;
  teamSide: TeamSide;
  slotNumber: 1 | 2;
  beforeDisplay: number | null;
  afterDisplay: number | null;
  changeDisplay: string | null;
  changeNumber: number | null;
}

export interface EnrichedMatchCard {
  match: DbMatchRow;
  sessionStartedAt: string;
  sessionDateDisplay: string;
  teamA: readonly [EnrichedParticipantSlot, EnrichedParticipantSlot];
  teamB: readonly [EnrichedParticipantSlot, EnrichedParticipantSlot];
  winnerSide: 'A' | 'B' | null;
}

export interface EnrichedSessionDetail {
  session: DbSessionRow;
  dateDisplay: string;
  attendeeCount: number;
  completedMatchCount: number;
  voidedMatchCount: number;
  incompleteMatchCount: number;
  standings: SessionStandingsResult;
  matches: readonly EnrichedMatchCard[];
}

/**
 * Formats an ISO UTC timestamp into `DD MMM YYYY` in `Asia/Kuala_Lumpur` (`DEC-022`).
 */
export function formatMalaysiaDate(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kuala_Lumpur',
  }).format(date);
}

/**
 * Formats an ISO UTC timestamp into `MMMM YYYY` in `Asia/Kuala_Lumpur` (e.g. "October 2026").
 */
export function formatMalaysiaMonthYear(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kuala_Lumpur',
  }).format(date);
}

/**
 * Formats an ISO UTC timestamp into `DD MMM YYYY, HH:mm MYT` in `Asia/Kuala_Lumpur`.
 */
export function formatMalaysiaDateTime(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }
  const formatted = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kuala_Lumpur',
  }).format(date);
  return `${formatted} MYT`;
}

/**
 * Builds the All-Time Elo Leaderboard from a `GroupReadSnapshot`, preserving full
 * `NUMERIC(10,4)` precision for tie/rank calculation and computing attendance rates
 * relative to sessions held since each player profile's creation (`DEC-044`).
 */
export function deriveLeaderboardFromSnapshot(
  snapshot: GroupReadSnapshot,
  includeInactive = false,
): AllTimeLeaderboardRow[] {
  const snapshotMap = new Map<string, PlayerRatingSnapshot>();
  for (const row of snapshot.ratingSnapshots) {
    const scaled = parseNumeric4(row.rating);
    snapshotMap.set(row.player_id, {
      playerId: row.player_id,
      ratingScaled: scaled,
      ratingNumeric4: row.rating,
      ratingDisplay: roundScaledToWholeNumber(scaled),
      matchesPlayed: row.matches_played,
      wins: row.wins,
      losses: row.losses,
      isProvisional: row.is_provisional,
    });
  }

  const eligiblePlayers = snapshot.players.filter(
    (p) => p.merged_into_player_id === null,
  );

  const profiles: LeaderboardPlayerProfile[] = eligiblePlayers.map((player) => {
    const playerCreatedMs = Date.parse(player.created_at);
    const sessionsHeldSinceCreation = snapshot.sessions.filter(
      (s) => Date.parse(s.session_started_at) >= playerCreatedMs,
    );
    const heldIds = new Set(sessionsHeldSinceCreation.map((s) => s.id));
    const attendedCount = snapshot.sessionAttendees.filter(
      (sa) => sa.player_id === player.id && heldIds.has(sa.session_id),
    ).length;

    return {
      id: player.id,
      displayName: player.display_name,
      avatarUrl: player.avatar_url,
      isGuest: player.is_guest,
      isActive: player.is_active,
      sessionsAttendedCount: attendedCount,
      sessionsHeldSinceCreationCount: sessionsHeldSinceCreation.length,
    };
  });

  return buildAllTimeLeaderboard({
    profiles,
    snapshots: snapshotMap,
    includeInactive,
  });
}

export interface WeeklyLeaderboardRow {
  playerId: string;
  displayName: string;
  avatarUrl: string | null;
  isGuest: boolean;
  isProvisional: boolean;
  rank: number;
  isTiedRank: boolean;
  wins: number;
  losses: number;
  matchesPlayed: number;
  winRatePercent: number;
  winRatePercentDisplay: string;
  ratingDisplay: string;
  weekLabel: string;
}

/**
 * Calculates start and end of week (Monday 00:00:00 to Sunday 23:59:59 MYT)
 * in UTC timestamps for a given date.
 */
function getMalaysiaWeekBounds(targetDate: Date): { startMs: number; endMs: number; weekLabel: string } {
  // Offset by +8 hours to align with Malaysia calendar days
  const mytDate = new Date(targetDate.getTime() + 8 * 60 * 60 * 1000);
  const dayOfWeek = mytDate.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const mondayYear = mytDate.getUTCFullYear();
  const mondayMonth = mytDate.getUTCMonth();
  const mondayDate = mytDate.getUTCDate() + diffToMonday;

  // Monday 00:00:00 MYT converted back to UTC ms
  const mondayUtcMidnight = Date.UTC(mondayYear, mondayMonth, mondayDate, 0, 0, 0, 0);
  const startMs = mondayUtcMidnight - 8 * 60 * 60 * 1000;
  const endMs = startMs + 7 * 24 * 60 * 60 * 1000 - 1;

  const startFmt = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kuala_Lumpur',
  }).format(new Date(startMs));

  const endFmt = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kuala_Lumpur',
  }).format(new Date(endMs));

  return {
    startMs,
    endMs,
    weekLabel: `${startFmt} – ${endFmt}`,
  };
}

/**
 * Derives the Weekly Leaderboard from snapshot matches for the current calendar week
 * in Malaysia time (or most recent week with matches if current week has none).
 */
export function deriveWeeklyLeaderboardFromSnapshot(
  snapshot: GroupReadSnapshot,
): WeeklyLeaderboardRow[] {
  const completedMatches = snapshot.matches.filter(
    (m) =>
      m.status === 'completed' &&
      m.team_a_score !== null &&
      m.team_b_score !== null,
  );

  const playerMap = new Map<string, DbPlayerRow>();
  for (const p of snapshot.players) {
    if (p.merged_into_player_id === null) {
      playerMap.set(p.id, p);
    }
  }

  const sessionMap = new Map<string, DbSessionRow>();
  for (const s of snapshot.sessions) {
    sessionMap.set(s.id, s);
  }

  const snapshotMap = new Map<string, PlayerRatingSnapshot>();
  for (const row of snapshot.ratingSnapshots) {
    const scaled = parseNumeric4(row.rating);
    snapshotMap.set(row.player_id, {
      playerId: row.player_id,
      ratingScaled: scaled,
      ratingNumeric4: row.rating,
      ratingDisplay: roundScaledToWholeNumber(scaled),
      matchesPlayed: row.matches_played,
      wins: row.wins,
      losses: row.losses,
      isProvisional: row.is_provisional,
    });
  }

  if (completedMatches.length === 0) {
    return [];
  }

  // 1. Determine target week (current week first, or latest week with matches)
  const now = new Date();
  let weekBounds = getMalaysiaWeekBounds(now);

  let weekMatches = completedMatches.filter((m) => {
    const s = sessionMap.get(m.session_id);
    const timeMs = Date.parse(s?.session_started_at ?? m.created_at);
    return timeMs >= weekBounds.startMs && timeMs <= weekBounds.endMs;
  });

  if (weekMatches.length === 0) {
    // Find latest completed match date
    let latestMs = 0;
    for (const m of completedMatches) {
      const s = sessionMap.get(m.session_id);
      const timeMs = Date.parse(s?.session_started_at ?? m.created_at);
      if (timeMs > latestMs) {
        latestMs = timeMs;
      }
    }
    if (latestMs > 0) {
      weekBounds = getMalaysiaWeekBounds(new Date(latestMs));
      weekMatches = completedMatches.filter((m) => {
        const s = sessionMap.get(m.session_id);
        const timeMs = Date.parse(s?.session_started_at ?? m.created_at);
        return timeMs >= weekBounds.startMs && timeMs <= weekBounds.endMs;
      });
    }
  }

  // 2. Count wins and losses in the target week
  const weeklyStats = new Map<string, { wins: number; losses: number }>();

  for (const match of weekMatches) {
    const parts = snapshot.matchParticipants.filter((mp) => mp.match_id === match.id);
    const teamA = parts.filter((p) => p.team_side === 'A').map((p) => p.player_id);
    const teamB = parts.filter((p) => p.team_side === 'B').map((p) => p.player_id);

    const aScore = match.team_a_score ?? 0;
    const bScore = match.team_b_score ?? 0;

    if (aScore > bScore) {
      for (const pid of teamA) {
        const stat = weeklyStats.get(pid) ?? { wins: 0, losses: 0 };
        stat.wins += 1;
        weeklyStats.set(pid, stat);
      }
      for (const pid of teamB) {
        const stat = weeklyStats.get(pid) ?? { wins: 0, losses: 0 };
        stat.losses += 1;
        weeklyStats.set(pid, stat);
      }
    } else if (bScore > aScore) {
      for (const pid of teamB) {
        const stat = weeklyStats.get(pid) ?? { wins: 0, losses: 0 };
        stat.wins += 1;
        weeklyStats.set(pid, stat);
      }
      for (const pid of teamA) {
        const stat = weeklyStats.get(pid) ?? { wins: 0, losses: 0 };
        stat.losses += 1;
        weeklyStats.set(pid, stat);
      }
    }
  }

  // 3. Build candidate list: players with weekly activity first, or top all-time players
  const rows: WeeklyLeaderboardRow[] = [];

  for (const [playerId, stats] of weeklyStats.entries()) {
    const player = playerMap.get(playerId);
    if (!player || !player.is_active) {
      continue;
    }
    const snap = snapshotMap.get(playerId);
    const matchesPlayed = stats.wins + stats.losses;
    const winRatePercent = matchesPlayed > 0 ? (stats.wins / matchesPlayed) * 100 : 0;
    const ratingDisplay = (snap?.ratingDisplay ?? 1000).toLocaleString();

    rows.push({
      playerId,
      displayName: player.display_name,
      avatarUrl: player.avatar_url,
      isGuest: player.is_guest,
      isProvisional: snap?.isProvisional ?? true,
      rank: 1,
      isTiedRank: false,
      wins: stats.wins,
      losses: stats.losses,
      matchesPlayed,
      winRatePercent: Math.round(winRatePercent * 10) / 10,
      winRatePercentDisplay: `${(Math.round(winRatePercent * 10) / 10).toFixed(1)}%`,
      ratingDisplay,
      weekLabel: weekBounds.weekLabel,
    });
  }

  // If fewer than 3 players had matches this week, backfill from other active players
  if (rows.length < 3) {
    const includedIds = new Set(rows.map((r) => r.playerId));
    const otherPlayers = Array.from(playerMap.values())
      .filter((p) => p.is_active && !includedIds.has(p.id))
      .sort((a, b) => {
        const rA = Number(snapshotMap.get(a.id)?.ratingScaled ?? 10000000);
        const rB = Number(snapshotMap.get(b.id)?.ratingScaled ?? 10000000);
        return rB - rA;
      });

    for (const p of otherPlayers) {
      if (rows.length >= 3) break;
      const snap = snapshotMap.get(p.id);
      rows.push({
        playerId: p.id,
        displayName: p.display_name,
        avatarUrl: p.avatar_url,
        isGuest: p.is_guest,
        isProvisional: snap?.isProvisional ?? true,
        rank: 1,
        isTiedRank: false,
        wins: 0,
        losses: 0,
        matchesPlayed: 0,
        winRatePercent: 0,
        winRatePercentDisplay: '0.0%',
        ratingDisplay: (snap?.ratingDisplay ?? 1000).toLocaleString(),
        weekLabel: weekBounds.weekLabel,
      });
    }
  }

  // 4. Sort weekly rows:
  // (a) wins DESC
  // (b) winRatePercent DESC
  // (c) ratingDisplay (raw numeric value) DESC
  // (d) displayName ASC
  rows.sort((a, b) => {
    if (a.wins !== b.wins) {
      return b.wins - a.wins;
    }
    if (a.winRatePercent !== b.winRatePercent) {
      return b.winRatePercent - a.winRatePercent;
    }
    const numA = parseInt(a.ratingDisplay.replace(/,/g, ''), 10) || 0;
    const numB = parseInt(b.ratingDisplay.replace(/,/g, ''), 10) || 0;
    if (numA !== numB) {
      return numB - numA;
    }
    return a.displayName.localeCompare(b.displayName);
  });

  // 5. Assign competition ranks
  for (let i = 0; i < rows.length; i++) {
    const curr = rows[i];
    if (!curr) continue;
    const prev = rows[i - 1];
    if (
      prev &&
      prev.wins === curr.wins &&
      prev.winRatePercent === curr.winRatePercent &&
      prev.ratingDisplay === curr.ratingDisplay
    ) {
      curr.rank = prev.rank;
      curr.isTiedRank = true;
      prev.isTiedRank = true;
    } else {
      curr.rank = i + 1;
      curr.isTiedRank = false;
    }
  }

  return rows;
}

/**
 * Enriches all matches in the snapshot with participant names, guest flags, and
 * rounded rating before/after/delta values (`DEC-036`).
 */
export function deriveEnrichedMatchesFromSnapshot(
  snapshot: GroupReadSnapshot,
): EnrichedMatchCard[] {
  const playerMap = new Map<string, DbPlayerRow>();
  for (const p of snapshot.players) {
    playerMap.set(p.id, p);
  }

  const sessionMap = new Map<string, DbSessionRow>();
  for (const s of snapshot.sessions) {
    sessionMap.set(s.id, s);
  }

  const changeByMatchAndPlayer = new Map<
    string,
    { beforeDisplay: number; afterDisplay: number; changeDisplay: string; changeNumber: number }
  >();
  for (const ch of snapshot.matchRatingChanges) {
    const beforeScaled = parseNumeric4(ch.rating_before);
    const afterScaled = parseNumeric4(ch.rating_after);
    const deltaScaled = parseNumeric4(ch.rating_delta);
    changeByMatchAndPlayer.set(`${ch.match_id}:${ch.player_id}`, {
      beforeDisplay: roundScaledToWholeNumber(beforeScaled),
      afterDisplay: roundScaledToWholeNumber(afterScaled),
      changeDisplay: formatDeltaOneDecimal(deltaScaled),
      changeNumber: roundScaledToOneDecimalNumber(deltaScaled),
    });
  }

  const buildSlot = (
    matchId: string,
    teamSide: TeamSide,
    slotNumber: 1 | 2,
    playerId: string,
  ): EnrichedParticipantSlot => {
    const player = playerMap.get(playerId);
    const ratingInfo = changeByMatchAndPlayer.get(`${matchId}:${playerId}`);
    return {
      playerId,
      displayName: player?.display_name ?? 'Unknown Player',
      isGuest: player?.is_guest ?? false,
      teamSide,
      slotNumber,
      beforeDisplay: ratingInfo?.beforeDisplay ?? null,
      afterDisplay: ratingInfo?.afterDisplay ?? null,
      changeDisplay: ratingInfo?.changeDisplay ?? null,
      changeNumber: ratingInfo?.changeNumber ?? null,
    };
  };

  const cards: EnrichedMatchCard[] = [];

  for (const match of snapshot.matches) {
    const pRows = snapshot.matchParticipants.filter(
      (mp) => mp.match_id === match.id,
    );
    const a1 = pRows.find((r) => r.team_side === 'A' && r.slot_number === 1);
    const a2 = pRows.find((r) => r.team_side === 'A' && r.slot_number === 2);
    const b1 = pRows.find((r) => r.team_side === 'B' && r.slot_number === 1);
    const b2 = pRows.find((r) => r.team_side === 'B' && r.slot_number === 2);

    if (!a1 || !a2 || !b1 || !b2) {
      continue;
    }

    const session = sessionMap.get(match.session_id);
    const sessionStartedAt = session?.session_started_at ?? match.created_at;
    const winnerSide: 'A' | 'B' | null =
      match.status === 'completed' &&
      match.team_a_score !== null &&
      match.team_b_score !== null &&
      match.team_a_score !== match.team_b_score
        ? match.team_a_score > match.team_b_score
          ? 'A'
          : 'B'
        : null;

    cards.push({
      match,
      sessionStartedAt,
      sessionDateDisplay: formatMalaysiaDate(sessionStartedAt),
      teamA: [
        buildSlot(match.id, 'A', 1, a1.player_id),
        buildSlot(match.id, 'A', 2, a2.player_id),
      ],
      teamB: [
        buildSlot(match.id, 'B', 1, b1.player_id),
        buildSlot(match.id, 'B', 2, b2.player_id),
      ],
      winnerSide,
    });
  }

  // Sort newest first for match history display (`DEC-052`)
  cards.sort((a, b) => {
    const sA = Date.parse(a.sessionStartedAt);
    const sB = Date.parse(b.sessionStartedAt);
    if (sA !== sB) {
      return sB - sA;
    }
    const seqA = a.match.sequence_number ?? 0;
    const seqB = b.match.sequence_number ?? 0;
    return seqB - seqA;
  });

  return cards;
}

/**
 * Builds the enriched detail model for a single session, including `computeSessionStandings`
 * (separating played rows from bench attendees with 0 matches played, `ATT-01`).
 */
export function deriveSessionDetailFromSnapshot(
  snapshot: GroupReadSnapshot,
  sessionId: string,
): EnrichedSessionDetail | null {
  const session = snapshot.sessions.find((s) => s.id === sessionId);
  if (!session) {
    return null;
  }

  const playerMap = new Map<string, DbPlayerRow>();
  for (const p of snapshot.players) {
    playerMap.set(p.id, p);
  }

  const attendees: SessionAttendeeInput[] = snapshot.sessionAttendees
    .filter((sa) => sa.session_id === sessionId)
    .map((sa) => {
      const p = playerMap.get(sa.player_id);
      return {
        playerId: sa.player_id,
        displayName: p?.display_name ?? 'Unknown Player',
        avatarUrl: p?.avatar_url ?? null,
        isGuest: p?.is_guest ?? false,
      };
    });

  const allEnrichedMatches = deriveEnrichedMatchesFromSnapshot(snapshot).filter(
    (c) => c.match.session_id === sessionId,
  );

  // Order within session detail by sequence_number ASC
  const sessionMatchesChronological = [...allEnrichedMatches].sort(
    (a, b) => (a.match.sequence_number ?? 999) - (b.match.sequence_number ?? 999),
  );

  const matchInputs: SessionCompletedMatchInput[] =
    sessionMatchesChronological.map((c) => ({
      id: c.match.id,
      teamA: [c.teamA[0].playerId, c.teamA[1].playerId] as const,
      teamB: [c.teamB[0].playerId, c.teamB[1].playerId] as const,
      teamAScore: c.match.team_a_score ?? 0,
      teamBScore: c.match.team_b_score ?? 0,
      status: c.match.status,
    }));

  const standings = computeSessionStandings({
    attendees,
    matches: matchInputs,
    isSessionFinalized: session.status === 'completed',
  });

  const completedMatchCount = sessionMatchesChronological.filter(
    (m) => m.match.status === 'completed',
  ).length;
  const voidedMatchCount = sessionMatchesChronological.filter(
    (m) => m.match.status === 'voided',
  ).length;
  const incompleteMatchCount = sessionMatchesChronological.filter(
    (m) => m.match.status === 'incomplete',
  ).length;

  return {
    session,
    dateDisplay: formatMalaysiaDate(session.session_started_at),
    attendeeCount: attendees.length,
    completedMatchCount,
    voidedMatchCount,
    incompleteMatchCount,
    standings,
    matches: sessionMatchesChronological,
  };
}

export interface AvatarCooldownStatus {
  canUpdate: boolean;
  daysRemaining: number;
  nextAvailableDate: string | null;
  lastUpdatedAt: string | null;
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Calculates 1-year (365 days) rolling cooldown for player display picture updates.
 */
export function getAvatarCooldownStatus(
  avatarUpdatedAt: string | null | undefined,
  nowMs: number = Date.now(),
): AvatarCooldownStatus {
  if (!avatarUpdatedAt) {
    return {
      canUpdate: true,
      daysRemaining: 0,
      nextAvailableDate: null,
      lastUpdatedAt: null,
    };
  }

  const updatedTime = new Date(avatarUpdatedAt).getTime();
  if (isNaN(updatedTime)) {
    return {
      canUpdate: true,
      daysRemaining: 0,
      nextAvailableDate: null,
      lastUpdatedAt: null,
    };
  }

  const nextAvailableMs = updatedTime + ONE_YEAR_MS;
  const diffMs = nextAvailableMs - nowMs;

  if (diffMs <= 0) {
    return {
      canUpdate: true,
      daysRemaining: 0,
      nextAvailableDate: null,
      lastUpdatedAt: avatarUpdatedAt,
    };
  }

  const daysRemaining = Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
  const nextDateFormatted = formatMalaysiaDate(new Date(nextAvailableMs).toISOString());

  return {
    canUpdate: false,
    daysRemaining,
    nextAvailableDate: nextDateFormatted,
    lastUpdatedAt: avatarUpdatedAt,
  };
}
