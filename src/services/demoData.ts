import {
  formatNumeric4,
  replayRatings,
  type ReplayMatchRecord,
  type ReplayPlayerIdentity,
  type ReplaySessionRecord,
} from '../domain/elo.ts';
import type {
  AdminMembershipDirectoryEntry,
  DbGroupMembershipRow,
  DbGroupRow,
  DbInvitationRow,
  DbMatchParticipantRow,
  DbMatchRatingChangeRow,
  DbMatchRow,
  DbPlayerRatingSnapshotRow,
  DbPlayerRow,
  DbSessionAttendeeRow,
  DbSessionRow,
  RatingPublicationStateResponse,
} from '../types/database.ts';

export type InvitationMetadataRow = Omit<DbInvitationRow, 'token_hash'>;

export interface AdminGovernanceSnapshot {
  readonly invitations: readonly InvitationMetadataRow[];
  readonly memberships: readonly AdminMembershipDirectoryEntry[];
}

export const DEMO_GROUP_ID = '00000000-0000-4000-8000-000000000101';
export const DEMO_RATING_VERSION_ID = '00000000-0000-4000-8000-000000000901';
export const DEMO_VIEWER_USER_ID = '00000000-0000-4000-8000-000000000001';

export const DEMO_PLAYER_IDS = {
  aaron: '00000000-0000-4000-8000-000000000201',
  brenda: '00000000-0000-4000-8000-000000000202',
  chong: '00000000-0000-4000-8000-000000000203',
  diana: '00000000-0000-4000-8000-000000000204',
  ethanGuest: '00000000-0000-4000-8000-000000000205',
  farahProvisional: '00000000-0000-4000-8000-000000000206',
  gavinBench: '00000000-0000-4000-8000-000000000207',
} as const;

export const DEMO_SESSION_IDS = {
  session1: '00000000-0000-4000-8000-000000000301',
  session2: '00000000-0000-4000-8000-000000000302',
} as const;

export const DEMO_MATCH_IDS = {
  m1: '00000000-0000-4000-8000-000000000401',
  m2: '00000000-0000-4000-8000-000000000402',
  m3: '00000000-0000-4000-8000-000000000403',
  m4Disputed: '00000000-0000-4000-8000-000000000404',
  m5Voided: '00000000-0000-4000-8000-000000000405',
} as const;

export interface GroupReadSnapshot {
  isDemoMode: boolean;
  group: DbGroupRow;
  viewerMembership: DbGroupMembershipRow;
  publicationState: RatingPublicationStateResponse | null;
  players: readonly DbPlayerRow[];
  sessions: readonly DbSessionRow[];
  sessionAttendees: readonly DbSessionAttendeeRow[];
  matches: readonly DbMatchRow[];
  matchParticipants: readonly DbMatchParticipantRow[];
  ratingSnapshots: readonly DbPlayerRatingSnapshotRow[];
  matchRatingChanges: readonly DbMatchRatingChangeRow[];
}

/**
 * Builds the deterministic, read-only Demo Mode snapshot using the canonical TypeScript
 * Elo replay engine (`replayRatings`) so all numbers match PostgreSQL `NUMERIC(10,4)` rules.
 */
export function buildDeterministicDemoSnapshot(): GroupReadSnapshot {
  const players: DbPlayerRow[] = [
    {
      id: DEMO_PLAYER_IDS.aaron,
      group_id: DEMO_GROUP_ID,
      display_name: 'Aaron Tan',
      avatar_url: null,
      is_guest: false,
      is_active: true,
      merged_into_player_id: null,
      created_by_user_id: DEMO_VIEWER_USER_ID,
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-01T10:00:00Z',
    },
    {
      id: DEMO_PLAYER_IDS.brenda,
      group_id: DEMO_GROUP_ID,
      display_name: 'Brenda Lim',
      avatar_url: null,
      is_guest: false,
      is_active: true,
      merged_into_player_id: null,
      created_by_user_id: DEMO_VIEWER_USER_ID,
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-01T10:00:00Z',
    },
    {
      id: DEMO_PLAYER_IDS.chong,
      group_id: DEMO_GROUP_ID,
      display_name: 'Chong Wei',
      avatar_url: null,
      is_guest: false,
      is_active: true,
      merged_into_player_id: null,
      created_by_user_id: DEMO_VIEWER_USER_ID,
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-01T10:00:00Z',
    },
    {
      id: DEMO_PLAYER_IDS.diana,
      group_id: DEMO_GROUP_ID,
      display_name: 'Diana Ong',
      avatar_url: null,
      is_guest: false,
      is_active: true,
      merged_into_player_id: null,
      created_by_user_id: DEMO_VIEWER_USER_ID,
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-01T10:00:00Z',
    },
    {
      id: DEMO_PLAYER_IDS.ethanGuest,
      group_id: DEMO_GROUP_ID,
      display_name: 'Ethan (Drop-in)',
      avatar_url: null,
      is_guest: true,
      is_active: true,
      merged_into_player_id: null,
      created_by_user_id: DEMO_VIEWER_USER_ID,
      created_at: '2026-10-05T10:00:00Z',
      updated_at: '2026-10-05T10:00:00Z',
    },
    {
      id: DEMO_PLAYER_IDS.farahProvisional,
      group_id: DEMO_GROUP_ID,
      display_name: 'Farah Aziz',
      avatar_url: null,
      is_guest: false,
      is_active: true,
      merged_into_player_id: null,
      created_by_user_id: DEMO_VIEWER_USER_ID,
      created_at: '2026-10-12T10:00:00Z',
      updated_at: '2026-10-12T10:00:00Z',
    },
    {
      id: DEMO_PLAYER_IDS.gavinBench,
      group_id: DEMO_GROUP_ID,
      display_name: 'Gavin Yap',
      avatar_url: null,
      is_guest: false,
      is_active: true,
      merged_into_player_id: null,
      created_by_user_id: DEMO_VIEWER_USER_ID,
      created_at: '2026-10-12T10:00:00Z',
      updated_at: '2026-10-12T10:00:00Z',
    },
  ];

  const sessions: DbSessionRow[] = [
    {
      id: DEMO_SESSION_IDS.session2,
      group_id: DEMO_GROUP_ID,
      season_id: null,
      status: 'active',
      session_started_at: '2026-10-15T12:00:00Z',
      session_ended_at: null,
      controller_user_id: DEMO_VIEWER_USER_ID,
      controller_lease_version: 1,
      last_meaningful_activity_at: '2026-10-15T13:15:00Z',
      created_by_user_id: DEMO_VIEWER_USER_ID,
      created_at: '2026-10-15T12:00:00Z',
      updated_at: '2026-10-15T13:15:00Z',
    },
    {
      id: DEMO_SESSION_IDS.session1,
      group_id: DEMO_GROUP_ID,
      season_id: null,
      status: 'completed',
      session_started_at: '2026-10-08T12:00:00Z',
      session_ended_at: '2026-10-08T14:00:00Z',
      controller_user_id: DEMO_VIEWER_USER_ID,
      controller_lease_version: 1,
      last_meaningful_activity_at: '2026-10-08T14:00:00Z',
      created_by_user_id: DEMO_VIEWER_USER_ID,
      created_at: '2026-10-08T12:00:00Z',
      updated_at: '2026-10-08T14:00:00Z',
    },
  ];

  const sessionAttendees: DbSessionAttendeeRow[] = [
    // Session 1 attendees (5 players)
    {
      session_id: DEMO_SESSION_IDS.session1,
      group_id: DEMO_GROUP_ID,
      player_id: DEMO_PLAYER_IDS.aaron,
      added_by_user_id: DEMO_VIEWER_USER_ID,
      created_at: '2026-10-08T12:00:00Z',
    },
    {
      session_id: DEMO_SESSION_IDS.session1,
      group_id: DEMO_GROUP_ID,
      player_id: DEMO_PLAYER_IDS.brenda,
      added_by_user_id: DEMO_VIEWER_USER_ID,
      created_at: '2026-10-08T12:00:00Z',
    },
    {
      session_id: DEMO_SESSION_IDS.session1,
      group_id: DEMO_GROUP_ID,
      player_id: DEMO_PLAYER_IDS.chong,
      added_by_user_id: DEMO_VIEWER_USER_ID,
      created_at: '2026-10-08T12:00:00Z',
    },
    {
      session_id: DEMO_SESSION_IDS.session1,
      group_id: DEMO_GROUP_ID,
      player_id: DEMO_PLAYER_IDS.diana,
      added_by_user_id: DEMO_VIEWER_USER_ID,
      created_at: '2026-10-08T12:00:00Z',
    },
    {
      session_id: DEMO_SESSION_IDS.session1,
      group_id: DEMO_GROUP_ID,
      player_id: DEMO_PLAYER_IDS.ethanGuest,
      added_by_user_id: DEMO_VIEWER_USER_ID,
      created_at: '2026-10-08T12:00:00Z',
    },
    // Session 2 attendees (includes Gavin on bench with 0 matches played — ATT-01)
    {
      session_id: DEMO_SESSION_IDS.session2,
      group_id: DEMO_GROUP_ID,
      player_id: DEMO_PLAYER_IDS.aaron,
      added_by_user_id: DEMO_VIEWER_USER_ID,
      created_at: '2026-10-15T12:00:00Z',
    },
    {
      session_id: DEMO_SESSION_IDS.session2,
      group_id: DEMO_GROUP_ID,
      player_id: DEMO_PLAYER_IDS.brenda,
      added_by_user_id: DEMO_VIEWER_USER_ID,
      created_at: '2026-10-15T12:00:00Z',
    },
    {
      session_id: DEMO_SESSION_IDS.session2,
      group_id: DEMO_GROUP_ID,
      player_id: DEMO_PLAYER_IDS.chong,
      added_by_user_id: DEMO_VIEWER_USER_ID,
      created_at: '2026-10-15T12:00:00Z',
    },
    {
      session_id: DEMO_SESSION_IDS.session2,
      group_id: DEMO_GROUP_ID,
      player_id: DEMO_PLAYER_IDS.diana,
      added_by_user_id: DEMO_VIEWER_USER_ID,
      created_at: '2026-10-15T12:00:00Z',
    },
    {
      session_id: DEMO_SESSION_IDS.session2,
      group_id: DEMO_GROUP_ID,
      player_id: DEMO_PLAYER_IDS.ethanGuest,
      added_by_user_id: DEMO_VIEWER_USER_ID,
      created_at: '2026-10-15T12:00:00Z',
    },
    {
      session_id: DEMO_SESSION_IDS.session2,
      group_id: DEMO_GROUP_ID,
      player_id: DEMO_PLAYER_IDS.farahProvisional,
      added_by_user_id: DEMO_VIEWER_USER_ID,
      created_at: '2026-10-15T12:00:00Z',
    },
    {
      session_id: DEMO_SESSION_IDS.session2,
      group_id: DEMO_GROUP_ID,
      player_id: DEMO_PLAYER_IDS.gavinBench,
      added_by_user_id: DEMO_VIEWER_USER_ID,
      created_at: '2026-10-15T12:00:00Z',
    },
  ];

  const matches: DbMatchRow[] = [
    // Session 1, Match 1: Aaron + Brenda beat Chong + Diana 21-18
    {
      id: DEMO_MATCH_IDS.m1,
      group_id: DEMO_GROUP_ID,
      session_id: DEMO_SESSION_IDS.session1,
      sequence_number: 1,
      status: 'completed',
      team_a_score: 21,
      team_b_score: 18,
      is_disputed: false,
      client_submission_id: '10000000-0000-4000-8000-000000000001',
      recorded_by_user_id: DEMO_VIEWER_USER_ID,
      completed_at: '2026-10-08T12:30:00Z',
      voided_at: null,
      void_reason: null,
      created_at: '2026-10-08T12:30:00Z',
      updated_at: '2026-10-08T12:30:00Z',
    },
    // Session 1, Match 2: Aaron + Chong beat Brenda + Ethan (Guest) 22-20
    {
      id: DEMO_MATCH_IDS.m2,
      group_id: DEMO_GROUP_ID,
      session_id: DEMO_SESSION_IDS.session1,
      sequence_number: 2,
      status: 'completed',
      team_a_score: 22,
      team_b_score: 20,
      is_disputed: false,
      client_submission_id: '10000000-0000-4000-8000-000000000002',
      recorded_by_user_id: DEMO_VIEWER_USER_ID,
      completed_at: '2026-10-08T13:10:00Z',
      voided_at: null,
      void_reason: null,
      created_at: '2026-10-08T13:10:00Z',
      updated_at: '2026-10-08T13:10:00Z',
    },
    // Session 2, Match 1: Aaron + Ethan (Guest) beat Brenda + Diana 21-15
    {
      id: DEMO_MATCH_IDS.m3,
      group_id: DEMO_GROUP_ID,
      session_id: DEMO_SESSION_IDS.session2,
      sequence_number: 1,
      status: 'completed',
      team_a_score: 21,
      team_b_score: 15,
      is_disputed: false,
      client_submission_id: '10000000-0000-4000-8000-000000000003',
      recorded_by_user_id: DEMO_VIEWER_USER_ID,
      completed_at: '2026-10-15T12:35:00Z',
      voided_at: null,
      void_reason: null,
      created_at: '2026-10-15T12:35:00Z',
      updated_at: '2026-10-15T12:35:00Z',
    },
    // Session 2, Match 2 (Disputed — stays official per DIS-01): Chong + Farah beat Diana + Ethan 30-29
    {
      id: DEMO_MATCH_IDS.m4Disputed,
      group_id: DEMO_GROUP_ID,
      session_id: DEMO_SESSION_IDS.session2,
      sequence_number: 2,
      status: 'completed',
      team_a_score: 30,
      team_b_score: 29,
      is_disputed: true,
      client_submission_id: '10000000-0000-4000-8000-000000000004',
      recorded_by_user_id: DEMO_VIEWER_USER_ID,
      completed_at: '2026-10-15T13:05:00Z',
      voided_at: null,
      void_reason: null,
      created_at: '2026-10-15T13:05:00Z',
      updated_at: '2026-10-15T13:05:00Z',
    },
    // Session 2, Match 3 (Voided — excluded from ratings/standings):
    {
      id: DEMO_MATCH_IDS.m5Voided,
      group_id: DEMO_GROUP_ID,
      session_id: DEMO_SESSION_IDS.session2,
      sequence_number: 3,
      status: 'voided',
      team_a_score: 21,
      team_b_score: 14,
      is_disputed: false,
      client_submission_id: '10000000-0000-4000-8000-000000000005',
      recorded_by_user_id: DEMO_VIEWER_USER_ID,
      completed_at: '2026-10-15T13:14:00Z',
      voided_at: '2026-10-15T13:15:00Z',
      void_reason: 'Immediate 10-second undo by original recorder',
      created_at: '2026-10-15T13:14:00Z',
      updated_at: '2026-10-15T13:15:00Z',
    },
  ];

  const matchParticipants: DbMatchParticipantRow[] = [
    // m1: (Aaron, Brenda) vs (Chong, Diana)
    { match_id: DEMO_MATCH_IDS.m1, group_id: DEMO_GROUP_ID, team_side: 'A', slot_number: 1, player_id: DEMO_PLAYER_IDS.aaron },
    { match_id: DEMO_MATCH_IDS.m1, group_id: DEMO_GROUP_ID, team_side: 'A', slot_number: 2, player_id: DEMO_PLAYER_IDS.brenda },
    { match_id: DEMO_MATCH_IDS.m1, group_id: DEMO_GROUP_ID, team_side: 'B', slot_number: 1, player_id: DEMO_PLAYER_IDS.chong },
    { match_id: DEMO_MATCH_IDS.m1, group_id: DEMO_GROUP_ID, team_side: 'B', slot_number: 2, player_id: DEMO_PLAYER_IDS.diana },
    // m2: (Aaron, Chong) vs (Brenda, EthanGuest)
    { match_id: DEMO_MATCH_IDS.m2, group_id: DEMO_GROUP_ID, team_side: 'A', slot_number: 1, player_id: DEMO_PLAYER_IDS.aaron },
    { match_id: DEMO_MATCH_IDS.m2, group_id: DEMO_GROUP_ID, team_side: 'A', slot_number: 2, player_id: DEMO_PLAYER_IDS.chong },
    { match_id: DEMO_MATCH_IDS.m2, group_id: DEMO_GROUP_ID, team_side: 'B', slot_number: 1, player_id: DEMO_PLAYER_IDS.brenda },
    { match_id: DEMO_MATCH_IDS.m2, group_id: DEMO_GROUP_ID, team_side: 'B', slot_number: 2, player_id: DEMO_PLAYER_IDS.ethanGuest },
    // m3: (Aaron, EthanGuest) vs (Brenda, Diana)
    { match_id: DEMO_MATCH_IDS.m3, group_id: DEMO_GROUP_ID, team_side: 'A', slot_number: 1, player_id: DEMO_PLAYER_IDS.aaron },
    { match_id: DEMO_MATCH_IDS.m3, group_id: DEMO_GROUP_ID, team_side: 'A', slot_number: 2, player_id: DEMO_PLAYER_IDS.ethanGuest },
    { match_id: DEMO_MATCH_IDS.m3, group_id: DEMO_GROUP_ID, team_side: 'B', slot_number: 1, player_id: DEMO_PLAYER_IDS.brenda },
    { match_id: DEMO_MATCH_IDS.m3, group_id: DEMO_GROUP_ID, team_side: 'B', slot_number: 2, player_id: DEMO_PLAYER_IDS.diana },
    // m4Disputed: (Chong, Farah) vs (Diana, EthanGuest)
    { match_id: DEMO_MATCH_IDS.m4Disputed, group_id: DEMO_GROUP_ID, team_side: 'A', slot_number: 1, player_id: DEMO_PLAYER_IDS.chong },
    { match_id: DEMO_MATCH_IDS.m4Disputed, group_id: DEMO_GROUP_ID, team_side: 'A', slot_number: 2, player_id: DEMO_PLAYER_IDS.farahProvisional },
    { match_id: DEMO_MATCH_IDS.m4Disputed, group_id: DEMO_GROUP_ID, team_side: 'B', slot_number: 1, player_id: DEMO_PLAYER_IDS.diana },
    { match_id: DEMO_MATCH_IDS.m4Disputed, group_id: DEMO_GROUP_ID, team_side: 'B', slot_number: 2, player_id: DEMO_PLAYER_IDS.ethanGuest },
    // m5Voided: (Aaron, Brenda) vs (Chong, Farah)
    { match_id: DEMO_MATCH_IDS.m5Voided, group_id: DEMO_GROUP_ID, team_side: 'A', slot_number: 1, player_id: DEMO_PLAYER_IDS.aaron },
    { match_id: DEMO_MATCH_IDS.m5Voided, group_id: DEMO_GROUP_ID, team_side: 'A', slot_number: 2, player_id: DEMO_PLAYER_IDS.brenda },
    { match_id: DEMO_MATCH_IDS.m5Voided, group_id: DEMO_GROUP_ID, team_side: 'B', slot_number: 1, player_id: DEMO_PLAYER_IDS.chong },
    { match_id: DEMO_MATCH_IDS.m5Voided, group_id: DEMO_GROUP_ID, team_side: 'B', slot_number: 2, player_id: DEMO_PLAYER_IDS.farahProvisional },
  ];

  // Replay ratings using the canonical domain engine (`src/domain/elo.ts`)
  const replaySessions: ReplaySessionRecord[] = sessions.map((s) => ({
    id: s.id,
    groupId: s.group_id,
    seasonId: s.season_id,
    sessionStartedAtUtcMs: Date.parse(s.session_started_at),
    createdAtUtcMs: Date.parse(s.created_at),
  }));

  const replayPlayers: ReplayPlayerIdentity[] = players.map((p) => ({
    id: p.id,
    displayName: p.display_name,
    isGuest: p.is_guest,
    mergedIntoPlayerId: p.merged_into_player_id,
  }));

  const replayMatches: ReplayMatchRecord[] = matches.map((m) => {
    const pRows = matchParticipants.filter((mp) => mp.match_id === m.id);
    const a1 = pRows.find((r) => r.team_side === 'A' && r.slot_number === 1)!.player_id;
    const a2 = pRows.find((r) => r.team_side === 'A' && r.slot_number === 2)!.player_id;
    const b1 = pRows.find((r) => r.team_side === 'B' && r.slot_number === 1)!.player_id;
    const b2 = pRows.find((r) => r.team_side === 'B' && r.slot_number === 2)!.player_id;
    return {
      id: m.id,
      groupId: m.group_id,
      sessionId: m.session_id,
      sequenceNumber: m.sequence_number,
      teamA: [a1, a2] as const,
      teamB: [b1, b2] as const,
      teamAScore: m.team_a_score ?? 0,
      teamBScore: m.team_b_score ?? 0,
      status: m.status,
      isDisputed: m.is_disputed,
    };
  });

  const replayResult = replayRatings({
    groupId: DEMO_GROUP_ID,
    sessions: replaySessions,
    matches: replayMatches,
    players: replayPlayers,
    kFactor: 24,
  });

  const ratingSnapshots: DbPlayerRatingSnapshotRow[] = Array.from(
    replayResult.playerSnapshots.values(),
  ).map((snap) => ({
    rating_version_id: DEMO_RATING_VERSION_ID,
    group_id: DEMO_GROUP_ID,
    player_id: snap.playerId,
    rating: snap.ratingNumeric4,
    matches_played: snap.matchesPlayed,
    wins: snap.wins,
    losses: snap.losses,
    is_provisional: snap.isProvisional,
  }));

  const matchRatingChanges: DbMatchRatingChangeRow[] = [];
  for (const rm of replayResult.replayedMatches) {
    for (const pc of rm.calculation.playerChanges) {
      matchRatingChanges.push({
        rating_version_id: DEMO_RATING_VERSION_ID,
        group_id: DEMO_GROUP_ID,
        match_id: rm.matchId,
        player_id: pc.playerId,
        team_side: pc.team,
        rating_before: formatNumeric4(pc.beforeScaled),
        rating_after: formatNumeric4(pc.afterScaled),
        rating_delta: formatNumeric4(pc.deltaScaled),
      });
    }
  }

  const group: DbGroupRow = {
    id: DEMO_GROUP_ID,
    slug: 'kl-badminton-regulars-demo',
    name: 'KL Badminton Regulars (Demo)',
    timezone: 'Asia/Kuala_Lumpur',
    default_k_factor: 24,
    current_rules_version: 'elo-v1-num10_4',
    required_match_state_seq: 5,
    published_rating_version_id: DEMO_RATING_VERSION_ID,
    recalculation_status: 'idle',
    last_recalculation_error: null,
    created_by_user_id: DEMO_VIEWER_USER_ID,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-15T13:15:00Z',
  };

  const viewerMembership: DbGroupMembershipRow = {
    id: '00000000-0000-4000-8000-000000000501',
    group_id: DEMO_GROUP_ID,
    user_id: DEMO_VIEWER_USER_ID,
    role: 'owner',
    status: 'approved',
    linked_player_id: DEMO_PLAYER_IDS.aaron,
    requested_player_id: null,
    requested_new_player_name: null,
    profile_link_status: 'linked',
    approved_by_user_id: DEMO_VIEWER_USER_ID,
    approved_at: '2026-10-01T10:00:00Z',
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
  };

  const publicationState: RatingPublicationStateResponse = {
    group_id: DEMO_GROUP_ID,
    publication_health: 'current',
    is_current: true,
    recalculation_status: 'idle',
    required_match_state_seq: 5,
    published_rating_version_id: DEMO_RATING_VERSION_ID,
    published_match_state_seq: 5,
    last_recalculation_error: null,
  };

  return {
    isDemoMode: true,
    group,
    viewerMembership,
    publicationState,
    players,
    sessions,
    sessionAttendees,
    matches,
    matchParticipants,
    ratingSnapshots,
    matchRatingChanges,
  };
}

export const DEMO_INVITATION_IDS = {
  pendingMember: '00000000-0000-4000-8000-000000000601',
  redeemedPendingApproval: '00000000-0000-4000-8000-000000000602',
} as const;

export const DEMO_MEMBERSHIP_IDS = {
  ownerAaron: '00000000-0000-4000-8000-000000000501',
  adminBrenda: '00000000-0000-4000-8000-000000000502',
  recorderChong: '00000000-0000-4000-8000-000000000503',
  pendingHannah: '00000000-0000-4000-8000-000000000504',
} as const;

/**
 * Deterministic read-only Admin Governance snapshot for Demo Mode.
 * Never exposes raw invitation tokens or `token_hash`.
 */
export function buildDeterministicDemoAdminGovernanceSnapshot(): AdminGovernanceSnapshot {
  return {
    invitations: [
      {
        id: DEMO_INVITATION_IDS.pendingMember,
        group_id: DEMO_GROUP_ID,
        invited_email_normalized: 'newplayer@example.com',
        intended_role: 'member',
        proposed_player_id: null,
        status: 'pending',
        expires_at: '2026-10-25T10:00:00Z',
        created_by_user_id: DEMO_VIEWER_USER_ID,
        redeemed_by_user_id: null,
        redeemed_at: null,
        revoked_by_user_id: null,
        revoked_at: null,
        revoke_reason: null,
        created_at: '2026-10-18T10:00:00Z',
        updated_at: '2026-10-18T10:00:00Z',
      },
      {
        id: DEMO_INVITATION_IDS.redeemedPendingApproval,
        group_id: DEMO_GROUP_ID,
        invited_email_normalized: 'hannah@example.com',
        intended_role: 'member',
        proposed_player_id: null,
        status: 'redeemed',
        expires_at: '2026-10-24T10:00:00Z',
        created_by_user_id: DEMO_VIEWER_USER_ID,
        redeemed_by_user_id: '00000000-0000-4000-8000-000000000004',
        redeemed_at: '2026-10-18T11:00:00Z',
        revoked_by_user_id: null,
        revoked_at: null,
        revoke_reason: null,
        created_at: '2026-10-17T10:00:00Z',
        updated_at: '2026-10-18T11:00:00Z',
      },
    ],
    memberships: [
      {
        membership_id: DEMO_MEMBERSHIP_IDS.ownerAaron,
        user_id: DEMO_VIEWER_USER_ID,
        account_email: 'aaron.owner@example.com',
        role: 'owner',
        status: 'approved',
        linked_player_id: DEMO_PLAYER_IDS.aaron,
        requested_player_id: null,
        requested_new_player_name: null,
        profile_link_status: 'linked',
        created_at: '2026-10-01T10:00:00Z',
      },
      {
        membership_id: DEMO_MEMBERSHIP_IDS.adminBrenda,
        user_id: '00000000-0000-4000-8000-000000000002',
        account_email: 'brenda.admin@example.com',
        role: 'admin',
        status: 'approved',
        linked_player_id: DEMO_PLAYER_IDS.brenda,
        requested_player_id: null,
        requested_new_player_name: null,
        profile_link_status: 'linked',
        created_at: '2026-10-01T10:05:00Z',
      },
      {
        membership_id: DEMO_MEMBERSHIP_IDS.recorderChong,
        user_id: '00000000-0000-4000-8000-000000000003',
        account_email: 'chong.recorder@example.com',
        role: 'recorder',
        status: 'approved',
        linked_player_id: DEMO_PLAYER_IDS.chong,
        requested_player_id: null,
        requested_new_player_name: null,
        profile_link_status: 'linked',
        created_at: '2026-10-01T10:10:00Z',
      },
      {
        membership_id: DEMO_MEMBERSHIP_IDS.pendingHannah,
        user_id: '00000000-0000-4000-8000-000000000004',
        account_email: 'hannah@example.com',
        role: 'member',
        status: 'pending_approval',
        linked_player_id: null,
        requested_player_id: null,
        requested_new_player_name: 'Hannah Tan',
        profile_link_status: 'pending_link_approval',
        created_at: '2026-10-18T11:00:00Z',
      },
    ],
  };
}

