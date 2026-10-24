/**
 * TypeScript Database Schema & RPC Contracts for Badminton Group Tracker (Phase 1)
 * Mirrors `supabase/migrations/20261018000001_phase1_foundation_schema_and_rls.sql`.
 */

export type MembershipRole = 'member' | 'recorder' | 'admin' | 'owner';

export type MembershipStatus =
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'suspended'
  | 'departed';

export type ProfileLinkStatus = 'unlinked' | 'pending_link_approval' | 'linked';

export type InvitationStatus =
  | 'pending'
  | 'redeemed'
  | 'revoked'
  | 'expired'
  | 'rejected';

export type SessionStatus = 'active' | 'completed' | 'reopened';

export type MatchStatus = 'incomplete' | 'completed' | 'voided';

export type TeamSide = 'A' | 'B';

export type RecalculationStatus = 'idle' | 'running' | 'failed';

export interface DbGroupRow {
  id: string;
  slug: string;
  name: string;
  timezone: string;
  default_k_factor: 16 | 24 | 32;
  current_rules_version: string;
  required_match_state_seq: number;
  published_rating_version_id: string | null;
  recalculation_status: RecalculationStatus;
  last_recalculation_error: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface DbPlayerRow {
  id: string;
  group_id: string;
  display_name: string;
  avatar_url: string | null;
  avatar_updated_at?: string | null;
  is_guest: boolean;
  is_active: boolean;
  merged_into_player_id: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface DbGroupMembershipRow {
  id: string;
  group_id: string;
  user_id: string;
  role: MembershipRole;
  status: MembershipStatus;
  linked_player_id: string | null;
  requested_player_id: string | null;
  requested_new_player_name: string | null;
  profile_link_status: ProfileLinkStatus;
  approved_by_user_id: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbInvitationRow {
  id: string;
  group_id: string;
  token_hash: string;
  invited_email_normalized: string;
  intended_role: Exclude<MembershipRole, 'owner'>;
  proposed_player_id: string | null;
  status: InvitationStatus;
  expires_at: string;
  created_by_user_id: string;
  redeemed_by_user_id: string | null;
  redeemed_at: string | null;
  revoked_by_user_id: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbSeasonRow {
  id: string;
  group_id: string;
  name: string;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  created_by_user_id: string;
  created_at: string;
}

export interface DbSessionRow {
  id: string;
  group_id: string;
  season_id: string | null;
  status: SessionStatus;
  session_started_at: string;
  session_ended_at: string | null;
  controller_user_id: string;
  controller_lease_version: number;
  last_meaningful_activity_at: string;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface DbSessionAttendeeRow {
  session_id: string;
  group_id: string;
  player_id: string;
  added_by_user_id: string;
  created_at: string;
}

export interface DbMatchRow {
  id: string;
  group_id: string;
  session_id: string;
  sequence_number: number | null;
  status: MatchStatus;
  team_a_score: number | null;
  team_b_score: number | null;
  is_disputed: boolean;
  client_submission_id: string;
  recorded_by_user_id: string;
  completed_at: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMatchParticipantRow {
  match_id: string;
  group_id: string;
  team_side: TeamSide;
  slot_number: 1 | 2;
  player_id: string;
}

export interface DbRatingVersionRow {
  id: string;
  group_id: string;
  season_id: string | null;
  match_state_seq: number;
  rules_version: string;
  k_factor: 16 | 24 | 32;
  baseline_rating: string;
  trigger_reason: string;
  triggered_by_user_id: string | null;
  created_at: string;
}

export interface DbPlayerRatingSnapshotRow {
  rating_version_id: string;
  group_id: string;
  player_id: string;
  rating: string;
  matches_played: number;
  wins: number;
  losses: number;
  is_provisional: boolean;
}

export interface DbMatchRatingChangeRow {
  rating_version_id: string;
  group_id: string;
  match_id: string;
  player_id: string;
  team_side: TeamSide;
  rating_before: string;
  rating_after: string;
  rating_delta: string;
}

export interface DbRatingRecalculationRunRow {
  id: string;
  group_id: string;
  target_match_state_seq: number;
  status: RecalculationStatus;
  error_message: string | null;
  produced_rating_version_id: string | null;
  triggered_by_user_id: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface DbAuditEventRow {
  id: string;
  group_id: string;
  actor_user_id: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  reason: string | null;
  previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface BootstrapInitialGroupResponse {
  group_id: string;
  membership_id: string;
  player_id: string | null;
  idempotent_retry: boolean;
}

export interface IssueGroupInvitationResponse {
  invitation_id: string;
  raw_token: string;
  expires_at: string;
}

export interface RedeemGroupInvitationResponse {
  membership_id: string;
  group_id: string;
  status: 'pending_approval';
}

export interface DecideMembershipRequestResponse {
  membership_id: string;
  status: 'approved' | 'rejected';
  linked_player_id: string | null;
}

export interface AdminMembershipDirectoryEntry {
  membership_id: string;
  user_id: string;
  account_email: string;
  role: MembershipRole;
  status: MembershipStatus;
  linked_player_id: string | null;
  requested_player_id: string | null;
  requested_new_player_name: string | null;
  profile_link_status: ProfileLinkStatus;
  created_at: string;
}

export interface RatingPublicationStateResponse {
  group_id: string;
  publication_health: 'current' | 'recalculating' | 'stale_or_failed';
  is_current: boolean;
  recalculation_status: RecalculationStatus;
  required_match_state_seq: number;
  published_rating_version_id: string | null;
  published_match_state_seq: number | null;
  last_recalculation_error: string | null;
}

export interface RecalculationExecutionOutcome {
  recalculation_succeeded: boolean;
  recalculation_status: RecalculationStatus;
  published_rating_version_id: string | null;
  required_match_state_seq: number;
  recalculation_run_id: string;
  error_message?: string;
}

export interface UpdatePlayerDisplayNameResponse {
  player_id: string;
  display_name: string;
  updated_at: string;
}

export interface StartGroupSessionResponse {
  session_id: string;
  group_id: string;
  controller_user_id: string;
  controller_lease_version: number;
  is_backdated_before_rated: boolean;
}

export interface SessionControllerHandoverResponse {
  session_id: string;
  controller_user_id: string;
  controller_lease_version: number;
  action_type:
    | 'session_controller_handed_over'
    | 'session_controller_taken_over';
}

export interface SessionInactivityStatusResponse {
  session_id: string;
  status: SessionStatus;
  last_meaningful_activity_at: string;
  inactive_seconds: number;
  is_stale_12h_warning: boolean;
}

export interface RecordCompletedMatchResponse {
  match_id: string;
  session_id: string;
  sequence_number: number;
  status: MatchStatus;
  idempotent_retry: boolean;
  recalculation?: RecalculationExecutionOutcome;
}

export interface UpdateSessionStartTimeResponse {
  session_id: string;
  session_started_at: string;
  recalculation: RecalculationExecutionOutcome | null;
}

export interface FinalizeGroupSessionResponse {
  session_id: string;
  status: 'completed';
  session_ended_at: string;
}

export interface ReopenCompletedSessionResponse {
  session_id: string;
  status: 'reopened';
  controller_user_id: string;
  controller_lease_version: number;
}

export interface CreateIncompleteMatchDraftResponse {
  match_id: string;
  status: 'incomplete';
}

export interface UndoMatchWithinWindowResponse {
  match_id: string;
  sequence_number: number | null;
  status: 'voided';
  recalculation: RecalculationExecutionOutcome;
}

export interface CorrectOrVoidMatchResponse {
  match_id: string;
  sequence_number: number | null;
  status: 'completed' | 'voided';
  recalculation: RecalculationExecutionOutcome | null;
}

export interface GuestMergePreviewResponse {
  group_id: string;
  source_guest_player_id: string;
  source_guest_display_name: string;
  target_permanent_player_id: string;
  target_permanent_display_name: string;
  can_merge: boolean;
  conflicting_match_ids: string[];
  affected_match_count: number;
  affected_session_attendance_count: number;
  overlapping_attendance_session_count: number;
}

export interface GuestMergeExecutionResponse {
  source_guest_player_id: string;
  target_permanent_player_id: string;
  deduplicated_attendance_count: number;
  reattributed_attendance_count: number;
  reattributed_match_count: number;
  published_rating_version_id: string;
}


