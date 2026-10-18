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
