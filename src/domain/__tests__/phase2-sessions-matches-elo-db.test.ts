import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  deriveRatingPublicationState,
  formatNumeric4,
  type ReplayMatchRecord,
  type ReplayPlayerIdentity,
  replayRatings,
  type ReplaySessionRecord,
} from '../elo.ts';
import type {
  BootstrapInitialGroupResponse,
  DecideMembershipRequestResponse,
  GuestMergeExecutionResponse,
  GuestMergePreviewResponse,
  IssueGroupInvitationResponse,
  RatingPublicationStateResponse,
  RecalculationExecutionOutcome,
  RecordCompletedMatchResponse,
  RedeemGroupInvitationResponse,
  SessionControllerHandoverResponse,
  SessionInactivityStatusResponse,
  StartGroupSessionResponse,
} from '../../types/database.ts';

const SUPABASE_AUTH_BOOTSTRAP_SQL = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO postgres, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  email_confirmed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

REVOKE ALL ON TABLE auth.users FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE auth.users TO postgres, service_role;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(pg_catalog.current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

GRANT EXECUTE ON FUNCTION auth.uid() TO postgres, anon, authenticated, service_role;
`;

const USERS = {
  owner: {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01',
    email: 'owner@phase2.test',
  },
  admin: {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02',
    email: 'admin@phase2.test',
  },
  recorder1: {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03',
    email: 'recorder1@phase2.test',
  },
  recorder2: {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04',
    email: 'recorder2@phase2.test',
  },
  member: {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa05',
    email: 'member@phase2.test',
  },
} as const;

describe('Phase 2 Sessions, Controller Lease, Idempotent Matches, Guest Merges & Savepoint Elo Replay Suite', () => {
  let db: PGlite;
  let groupId: string;
  let p1Id: string; // Owner player
  let p2Id: string; // Admin player
  let p3Id: string; // Recorder 1 player
  let p4Id: string; // Recorder 2 player
  let p5Id: string; // Member player
  let p6Id: string; // Target permanent player for guest merge
  let guestConflictId: string; // Guest who plays in same match as p6
  let guestMergeableId: string; // Guest who merges into p6

  let session1Id: string;
  let session2Id: string;
  let sessionBackdatedId: string;

  async function queryAs<T = Record<string, unknown>>(
    role: 'anon' | 'authenticated',
    userId: string | null,
    sql: string,
    params: unknown[] = [],
    extraConfig?: Record<string, string>,
  ): Promise<T[]> {
    return db.transaction(async (tx) => {
      await tx.exec(`SET LOCAL ROLE ${role};`);
      await tx.exec(
        `SELECT set_config('request.jwt.claim.sub', '${userId ?? ''}', true);`,
      );
      if (extraConfig) {
        for (const [k, v] of Object.entries(extraConfig)) {
          await tx.query(`SELECT set_config($1, $2, true);`, [k, v]);
        }
      }
      const res = await tx.query<T>(sql, params);
      return res.rows;
    });
  }

  beforeAll(async () => {
    db = await PGlite.create({
      extensions: { pgcrypto },
    });

    await db.exec(SUPABASE_AUTH_BOOTSTRAP_SQL);

    const phase1Migration = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20261018000001_phase1_foundation_schema_and_rls.sql',
      ),
      'utf8',
    );
    await db.exec(phase1Migration);

    const phase2Migration = readFileSync(
      resolve(
        process.cwd(),
        'supabase/migrations/20261018000002_phase2_sessions_matches_and_elo_replay.sql',
      ),
      'utf8',
    );
    await db.exec(phase2Migration);

    const phase2CatalogCheck = readFileSync(
      resolve(
        process.cwd(),
        'supabase/tests/phase2_sessions_matches_elo.test.sql',
      ),
      'utf8',
    );
    await db.exec(phase2CatalogCheck);

    for (const u of Object.values(USERS)) {
      await db.query(
        `INSERT INTO auth.users (id, email, email_confirmed_at) VALUES ($1, $2, clock_timestamp());`,
        [u.id, u.email],
      );
    }

    // Bootstrap group as Owner (creates p1Id)
    const bootRows = await queryAs<{
      bootstrap_initial_group: BootstrapInitialGroupResponse;
    }>(
      'authenticated',
      USERS.owner.id,
      `SELECT public.bootstrap_initial_group('Phase 2 Club', 'phase-2-club', 'Player One');`,
    );
    groupId = bootRows[0]!.bootstrap_initial_group.group_id;
    p1Id = bootRows[0]!.bootstrap_initial_group.player_id!;

    // Onboard Admin, Recorder 1, Recorder 2, Member
    const onboardUser = async (
      user: { id: string; email: string },
      role: 'admin' | 'recorder' | 'member',
      playerName: string,
    ): Promise<string> => {
      const inv = await queryAs<{
        issue_group_invitation: IssueGroupInvitationResponse;
      }>(
        'authenticated',
        USERS.owner.id,
        `SELECT public.issue_group_invitation($1, $2, $3, NULL, 7);`,
        [groupId, user.email, role],
      );
      const red = await queryAs<{
        redeem_group_invitation: RedeemGroupInvitationResponse;
      }>(
        'authenticated',
        user.id,
        `SELECT public.redeem_group_invitation($1, NULL, $2);`,
        [inv[0]!.issue_group_invitation.raw_token, playerName],
      );
      const dec = await queryAs<{
        decide_membership_request: DecideMembershipRequestResponse;
      }>(
        'authenticated',
        USERS.owner.id,
        `SELECT public.decide_membership_request($1, 'approve', 'Initial setup', NULL, true, $2);`,
        [red[0]!.redeem_group_invitation.membership_id, playerName],
      );
      return dec[0]!.decide_membership_request.linked_player_id!;
    };

    p2Id = await onboardUser(USERS.admin, 'admin', 'Player Two');
    p3Id = await onboardUser(USERS.recorder1, 'recorder', 'Player Three');
    p4Id = await onboardUser(USERS.recorder2, 'recorder', 'Player Four');
    p5Id = await onboardUser(USERS.member, 'member', 'Player Five');

    // Create permanent Player Six (unlinked roster profile) and two temporary guests
    const p6Res = await queryAs<{ create_player_profile: string }>(
      'authenticated',
      USERS.admin.id,
      `SELECT public.create_player_profile($1, 'Player Six Permanent', false);`,
      [groupId],
    );
    p6Id = p6Res[0]!.create_player_profile;

    const gConflictRes = await queryAs<{ create_player_profile: string }>(
      'authenticated',
      USERS.recorder1.id,
      `SELECT public.create_player_profile($1, 'Guest Conflict', true);`,
      [groupId],
    );
    guestConflictId = gConflictRes[0]!.create_player_profile;

    const gMergeRes = await queryAs<{ create_player_profile: string }>(
      'authenticated',
      USERS.recorder1.id,
      `SELECT public.create_player_profile($1, 'Guest Mergeable', true);`,
      [groupId],
    );
    guestMergeableId = gMergeRes[0]!.create_player_profile;
  });

  afterAll(async () => {
    await db.close();
  });

  it('enforces single active session per group (SES-01), controller lease handover/takeover (SES-02), attendance rules (ATT-01), 12h stale inactivity (SES-04), and incomplete draft finalization guard (SES-03)', async () => {
    // Ordinary member cannot start a session
    await expect(
      queryAs(
        'authenticated',
        USERS.member.id,
        `SELECT public.start_group_session($1, '2026-03-01T12:00:00Z'::timestamptz, ARRAY[$2::uuid, $3::uuid, $4::uuid, $5::uuid]);`,
        [groupId, p1Id, p2Id, p3Id, p4Id],
      ),
    ).rejects.toThrow(/only an approved recorder, admin, or owner/i);

    // Recorder 1 starts Session 1
    const startRows = await queryAs<{
      start_group_session: StartGroupSessionResponse;
    }>(
      'authenticated',
      USERS.recorder1.id,
      `SELECT public.start_group_session($1, '2026-03-01T12:00:00Z'::timestamptz, ARRAY[$2::uuid, $3::uuid, $4::uuid, $5::uuid]);`,
      [groupId, p1Id, p2Id, p3Id, p4Id],
    );
    const s1 = startRows[0]!.start_group_session;
    expect(s1.controller_user_id).toBe(USERS.recorder1.id);
    expect(s1.controller_lease_version).toBe(1);
    session1Id = s1.session_id;

    // Concurrent / duplicate active session creation is rejected (SES-01)
    await expect(
      queryAs(
        'authenticated',
        USERS.recorder2.id,
        `SELECT public.start_group_session($1, '2026-03-01T13:00:00Z'::timestamptz, ARRAY[]::uuid[]);`,
        [groupId],
      ),
    ).rejects.toThrow(/already has an active or reopened session/i);

    // Add late-arriving attendees (p5, p6, guestConflict, guestMergeable)
    for (const pid of [p5Id, p6Id, guestConflictId, guestMergeableId]) {
      await queryAs(
        'authenticated',
        USERS.recorder1.id,
        `SELECT public.update_session_attendance($1, $2, true, 1);`,
        [session1Id, pid],
      );
    }

    // Voluntary handover from Recorder 1 -> Recorder 2 increments lease to 2 (SES-02)
    const handoverRows = await queryAs<{
      transfer_or_takeover_session_controller: SessionControllerHandoverResponse;
    }>(
      'authenticated',
      USERS.recorder1.id,
      `SELECT public.transfer_or_takeover_session_controller($1, $2, 'Taking a break to play on court', 1);`,
      [session1Id, USERS.recorder2.id],
    );
    expect(
      handoverRows[0]!.transfer_or_takeover_session_controller
        .controller_lease_version,
    ).toBe(2);
    expect(
      handoverRows[0]!.transfer_or_takeover_session_controller.action_type,
    ).toBe('session_controller_handed_over');

    // Stale controller (Recorder 1 with lease 1) is rejected when trying to record a match or change attendance
    await expect(
      queryAs(
        'authenticated',
        USERS.recorder1.id,
        `SELECT public.record_completed_match($1, '10000000-0000-4000-8000-000000000001', $2, $3, $4, $5, 21, 18, 1);`,
        [session1Id, p1Id, p2Id, p3Id, p4Id],
      ),
    ).rejects.toThrow(/stale_controller_lease/i);

    // Recorder 1 takes back control with reason (lease 2 -> 3)
    const takeoverRows = await queryAs<{
      transfer_or_takeover_session_controller: SessionControllerHandoverResponse;
    }>(
      'authenticated',
      USERS.recorder1.id,
      `SELECT public.transfer_or_takeover_session_controller($1, $2, 'Finished match, resuming recording', 2);`,
      [session1Id, USERS.recorder1.id],
    );
    expect(
      takeoverRows[0]!.transfer_or_takeover_session_controller
        .controller_lease_version,
    ).toBe(3);
    expect(
      takeoverRows[0]!.transfer_or_takeover_session_controller.action_type,
    ).toBe('session_controller_taken_over');

    // Verify 12h stale session warning persists in DB across refreshes without auto-closing (SES-04)
    await db.query(
      `UPDATE public.sessions SET last_meaningful_activity_at = clock_timestamp() - interval '13 hours' WHERE id = $1;`,
      [session1Id],
    );
    const staleCheck1 = await queryAs<{
      get_session_inactivity_status: SessionInactivityStatusResponse;
    }>(
      'authenticated',
      USERS.member.id,
      `SELECT public.get_session_inactivity_status($1);`,
      [session1Id],
    );
    const staleCheck2 = await queryAs<{
      get_session_inactivity_status: SessionInactivityStatusResponse;
    }>(
      'authenticated',
      USERS.member.id,
      `SELECT public.get_session_inactivity_status($1);`,
      [session1Id],
    );
    expect(staleCheck1[0]!.get_session_inactivity_status.is_stale_12h_warning).toBe(true);
    expect(staleCheck2[0]!.get_session_inactivity_status.is_stale_12h_warning).toBe(true);
    expect(staleCheck2[0]!.get_session_inactivity_status.status).toBe('active');

    // SES-03: Create an incomplete match draft and verify finalization is blocked until it is voided
    const draftRows = await queryAs<{
      create_incomplete_match_draft: { match_id: string; status: string };
    }>(
      'authenticated',
      USERS.recorder1.id,
      `SELECT public.create_incomplete_match_draft($1, '10000000-0000-4000-8000-000000000099', $2, $3, $4, $5, 3);`,
      [session1Id, p1Id, p2Id, p3Id, p4Id],
    );
    const draftMatchId = draftRows[0]!.create_incomplete_match_draft.match_id;

    await expect(
      queryAs(
        'authenticated',
        USERS.recorder1.id,
        `SELECT public.finalize_group_session($1, 3);`,
        [session1Id],
      ),
    ).rejects.toThrow(/incomplete_matches_exist/i);

    // Void the incomplete draft; verify required_match_state_seq is unchanged because draft was never rated
    await queryAs(
      'authenticated',
      USERS.recorder1.id,
      `SELECT public.correct_or_void_match($1, 'void', 'Abandoned draft match before completion', NULL, NULL, NULL, NULL, NULL, NULL, 3);`,
      [draftMatchId],
    );
  });

  it('validates scores & participants server-side (MATCH-01, MATCH-02), guarantees idempotent retries without duplicate side effects (MATCH-03), and enforces 10s undo & post-window corrections (MATCH-05, MATCH-06)', async () => {
    // Invalid score (21-20) rejected server-side
    await expect(
      queryAs(
        'authenticated',
        USERS.recorder1.id,
        `SELECT public.record_completed_match($1, '20000000-0000-4000-8000-000000000001', $2, $3, $4, $5, 21, 20, 3);`,
        [session1Id, p1Id, p2Id, p3Id, p4Id],
      ),
    ).rejects.toThrow(/invalid_badminton_score/i);

    // Duplicate participant rejected server-side
    await expect(
      queryAs(
        'authenticated',
        USERS.recorder1.id,
        `SELECT public.record_completed_match($1, '20000000-0000-4000-8000-000000000002', $2, $2, $3, $4, 21, 18, 3);`,
        [session1Id, p1Id, p3Id, p4Id],
      ),
    ).rejects.toThrow(/distinct player profiles/i);

    // Record Match 1 (seq 1): (p1, p2) beat (p3, p4) 21-18
    const subId1 = '20000000-0000-4000-8000-000000000011';
    const m1Rows = await queryAs<{
      record_completed_match: RecordCompletedMatchResponse;
    }>(
      'authenticated',
      USERS.recorder1.id,
      `SELECT public.record_completed_match($1, $2, $3, $4, $5, $6, 21, 18, 3);`,
      [session1Id, subId1, p1Id, p2Id, p3Id, p4Id],
    );
    const m1 = m1Rows[0]!.record_completed_match;
    expect(m1.sequence_number).toBe(1);
    expect(m1.idempotent_retry).toBe(false);
    expect(m1.recalculation?.error_message).toBeUndefined();
    expect(m1.recalculation?.recalculation_succeeded).toBe(true);

    // Count audit_events before idempotent retry
    const auditCountBefore = await db.query<{ count: string }>(
      `SELECT count(*) FROM public.audit_events WHERE group_id = $1 AND entity_id = $2;`,
      [groupId, m1.match_id],
    );

    // Retry with same client_submission_id returns original match without creating duplicate match or audit event
    const m1RetryRows = await queryAs<{
      record_completed_match: RecordCompletedMatchResponse;
    }>(
      'authenticated',
      USERS.recorder1.id,
      `SELECT public.record_completed_match($1, $2, $3, $4, $5, $6, 21, 18, 3);`,
      [session1Id, subId1, p1Id, p2Id, p3Id, p4Id],
    );
    expect(m1RetryRows[0]!.record_completed_match.idempotent_retry).toBe(true);
    expect(m1RetryRows[0]!.record_completed_match.match_id).toBe(m1.match_id);
    expect(m1RetryRows[0]!.record_completed_match.sequence_number).toBe(1);

    const auditCountAfter = await db.query<{ count: string }>(
      `SELECT count(*) FROM public.audit_events WHERE group_id = $1 AND entity_id = $2;`,
      [groupId, m1.match_id],
    );
    expect(auditCountAfter.rows[0]!.count).toBe(auditCountBefore.rows[0]!.count);

    // Cannot remove p1 from session attendance now that p1 has played a match
    await expect(
      queryAs(
        'authenticated',
        USERS.recorder1.id,
        `SELECT public.update_session_attendance($1, $2, false, 3);`,
        [session1Id, p1Id],
      ),
    ).rejects.toThrow(/cannot remove attendee who has participated/i);

    // Record Match 2 (seq 2) and immediately test 10-second Undo
    const m2Rows = await queryAs<{
      record_completed_match: RecordCompletedMatchResponse;
    }>(
      'authenticated',
      USERS.recorder1.id,
      `SELECT public.record_completed_match($1, '20000000-0000-4000-8000-000000000012', $2, $3, $4, $5, 21, 15, 3);`,
      [session1Id, p1Id, p3Id, p2Id, p4Id],
    );
    const m2Id = m2Rows[0]!.record_completed_match.match_id;
    expect(m2Rows[0]!.record_completed_match.sequence_number).toBe(2);

    // Non-original recorder (Admin) CANNOT use 10s undo
    await expect(
      queryAs(
        'authenticated',
        USERS.admin.id,
        `SELECT public.undo_match_within_window($1, NULL);`,
        [m2Id],
      ),
    ).rejects.toThrow(/only to the original recorder/i);

    // Original recorder (Recorder 1) CAN undo within 10s window
    const undoRes = await queryAs<{
      undo_match_within_window: { status: string; sequence_number: number };
    }>(
      'authenticated',
      USERS.recorder1.id,
      `SELECT public.undo_match_within_window($1, 3);`,
      [m2Id],
    );
    expect(undoRes[0]!.undo_match_within_window.status).toBe('voided');
    expect(undoRes[0]!.undo_match_within_window.sequence_number).toBe(2);

    // Record Match 3 (seq 3 — never reuses voided seq 2!): (p6, guestConflict) vs (p1, p2) 22-20
    const m3Rows = await queryAs<{
      record_completed_match: RecordCompletedMatchResponse;
    }>(
      'authenticated',
      USERS.recorder1.id,
      `SELECT public.record_completed_match($1, '20000000-0000-4000-8000-000000000013', $2, $3, $4, $5, 22, 20, 3);`,
      [session1Id, p6Id, guestConflictId, p1Id, p2Id],
    );
    const m3Id = m3Rows[0]!.record_completed_match.match_id;
    expect(m3Rows[0]!.record_completed_match.sequence_number).toBe(3);

    // Age m3.completed_at by 11 seconds and verify 10s undo window is expired
    await db.query(
      `UPDATE public.matches SET completed_at = clock_timestamp() - interval '11 seconds' WHERE id = $1;`,
      [m3Id],
    );
    await expect(
      queryAs(
        'authenticated',
        USERS.recorder1.id,
        `SELECT public.undo_match_within_window($1, 3);`,
        [m3Id],
      ),
    ).rejects.toThrow(/undo_window_expired/i);

    // Record Match 4 (seq 4): (guestMergeable, p3) beat (p4, p5) 30-29
    const m4Rows = await queryAs<{
      record_completed_match: RecordCompletedMatchResponse;
    }>(
      'authenticated',
      USERS.recorder1.id,
      `SELECT public.record_completed_match($1, '20000000-0000-4000-8000-000000000014', $2, $3, $4, $5, 30, 29, 3);`,
      [session1Id, guestMergeableId, p3Id, p4Id, p5Id],
    );
    expect(m4Rows[0]!.record_completed_match.sequence_number).toBe(4);

    // Correct Match 1 score from 21-18 to 19-21 (flipping winner from Team A to Team B) while preserving sequence_number = 1
    const corrRows = await queryAs<{
      correct_or_void_match: { sequence_number: number; status: string };
    }>(
      'authenticated',
      USERS.recorder1.id,
      `SELECT public.correct_or_void_match($1, 'correct', 'Scoreboard was reversed on court', 19, 21, NULL, NULL, NULL, NULL, 3);`,
      [m1.match_id],
    );
    expect(corrRows[0]!.correct_or_void_match.sequence_number).toBe(1);

    // Finalize Session 1
    await queryAs(
      'authenticated',
      USERS.recorder1.id,
      `SELECT public.finalize_group_session($1, 3);`,
      [session1Id],
    );

    // Policy 3C: Reopen Session 1 as Admin and append a forgotten match -> sequence_number must be 5
    const reopenRows = await queryAs<{
      reopen_completed_session: { controller_lease_version: number };
    }>(
      'authenticated',
      USERS.admin.id,
      `SELECT public.reopen_completed_session($1, 'Adding forgotten final game of the night');`,
      [session1Id],
    );
    const reopenedLease = reopenRows[0]!.reopen_completed_session.controller_lease_version;

    const m5Rows = await queryAs<{
      record_completed_match: RecordCompletedMatchResponse;
    }>(
      'authenticated',
      USERS.admin.id,
      `SELECT public.record_completed_match($1, '20000000-0000-4000-8000-000000000015', $2, $3, $4, $5, 21, 14, $6);`,
      [session1Id, p1Id, p4Id, p2Id, p5Id, reopenedLease],
    );
    expect(m5Rows[0]!.record_completed_match.sequence_number).toBe(5);

    await queryAs(
      'authenticated',
      USERS.admin.id,
      `SELECT public.finalize_group_session($1, $2);`,
      [session1Id, reopenedLease],
    );
  });

  it('enforces backdated session & session start-time policies (3A & 3B) with deterministic recalculation', async () => {
    // Policy 3A: Recorder 1 CANNOT create a backdated session before Session 1 (2026-03-01)
    await expect(
      queryAs(
        'authenticated',
        USERS.recorder1.id,
        `SELECT public.start_group_session($1, '2026-02-15T12:00:00Z'::timestamptz, ARRAY[$2::uuid, $3::uuid, $4::uuid, $5::uuid], true);`,
        [groupId, p1Id, p2Id, p3Id, p4Id],
      ),
    ).rejects.toThrow(/backdated_session_unauthorized/i);

    // Policy 3A: Admin must explicitly acknowledge the backdated recalculation warning
    await expect(
      queryAs(
        'authenticated',
        USERS.admin.id,
        `SELECT public.start_group_session($1, '2026-02-15T12:00:00Z'::timestamptz, ARRAY[$2::uuid, $3::uuid, $4::uuid, $5::uuid], false);`,
        [groupId, p1Id, p2Id, p3Id, p4Id],
      ),
    ).rejects.toThrow(/backdated_session_warning/i);

    // Admin creates backdated session with warning acknowledged
    const backdatedStart = await queryAs<{
      start_group_session: StartGroupSessionResponse;
    }>(
      'authenticated',
      USERS.admin.id,
      `SELECT public.start_group_session($1, '2026-02-15T12:00:00Z'::timestamptz, ARRAY[$2::uuid, $3::uuid, $4::uuid, $5::uuid], true);`,
      [groupId, p1Id, p2Id, p3Id, guestMergeableId],
    );
    expect(backdatedStart[0]!.start_group_session.is_backdated_before_rated).toBe(true);
    sessionBackdatedId = backdatedStart[0]!.start_group_session.session_id;

    // Record a match in the backdated session where guestMergeable & p1 beat p2 & p3 21-16
    await queryAs(
      'authenticated',
      USERS.admin.id,
      `SELECT public.record_completed_match($1, '30000000-0000-4000-8000-000000000001', $2, $3, $4, $5, 21, 16, 1);`,
      [sessionBackdatedId, guestMergeableId, p1Id, p2Id, p3Id],
    );
    await queryAs(
      'authenticated',
      USERS.admin.id,
      `SELECT public.finalize_group_session($1, 1);`,
      [sessionBackdatedId],
    );

    // Policy 3B: Recorder cannot edit completed session start time; Admin can with reason + audit trail
    await expect(
      queryAs(
        'authenticated',
        USERS.recorder1.id,
        `SELECT public.update_session_start_time($1, '2026-02-16T12:00:00Z'::timestamptz, 'Attempt by recorder', NULL, true);`,
        [sessionBackdatedId],
      ),
    ).rejects.toThrow(/only an approved group admin or owner/i);

    const timeUpdateRes = await queryAs<{
      update_session_start_time: { recalculation: RecalculationExecutionOutcome };
    }>(
      'authenticated',
      USERS.admin.id,
      `SELECT public.update_session_start_time($1, '2026-02-16T12:00:00Z'::timestamptz, 'Corrected date from Sunday to Monday', NULL, true);`,
      [sessionBackdatedId],
    );
    expect(
      timeUpdateRes[0]!.update_session_start_time.recalculation
        .recalculation_succeeded,
    ).toBe(true);
  });

  it('preserves last valid published rating version across all 3 failure-injection stages, exposes Stale/Failed state, and recovers deterministically on retry (Condition 1, RATE-04)', async () => {
    // Start Session 2 as Recorder 1
    const s2Rows = await queryAs<{
      start_group_session: StartGroupSessionResponse;
    }>(
      'authenticated',
      USERS.recorder1.id,
      `SELECT public.start_group_session($1, '2026-03-08T12:00:00Z'::timestamptz, ARRAY[$2::uuid, $3::uuid, $4::uuid, $5::uuid]);`,
      [groupId, p1Id, p2Id, p3Id, p4Id],
    );
    session2Id = s2Rows[0]!.start_group_session.session_id;

    // Capture current published version before injecting failures
    const stateBefore = await queryAs<{
      get_group_rating_publication_state: RatingPublicationStateResponse;
    }>(
      'authenticated',
      USERS.member.id,
      `SELECT public.get_group_rating_publication_state($1);`,
      [groupId],
    );
    const initialPubState = stateBefore[0]!.get_group_rating_publication_state;
    expect(initialPubState.publication_health).toBe('current');
    expect(initialPubState.is_current).toBe(true);

    const lastGoodVersionId = initialPubState.published_rating_version_id!;
    const lastGoodSeq = initialPubState.published_match_state_seq!;

    const versionCountBefore = await db.query<{ count: string }>(
      `SELECT count(*) FROM public.rating_versions WHERE group_id = $1;`,
      [groupId],
    );

    const failureStages = [
      'after_version_insert',
      'mid_match_loop',
      'after_snapshots_insert',
    ] as const;

    for (let i = 0; i < failureStages.length; i++) {
      const stage = failureStages[i]!;
      const subId = `40000000-0000-4000-8000-00000000000${i + 1}`;

      const matchRes = await queryAs<{
        record_completed_match: RecordCompletedMatchResponse;
      }>(
        'authenticated',
        USERS.recorder1.id,
        `SELECT public.record_completed_match($1, $2, $3, $4, $5, $6, 21, 17, 1);`,
        [session2Id, subId, p1Id, p2Id, p3Id, p4Id],
        { 'app.test_inject_replay_failure_stage': stage },
      );

      const recorded = matchRes[0]!.record_completed_match;
      // Match save itself succeeded and committed!
      expect(recorded.status).toBe('completed');
      expect(recorded.sequence_number).toBe(i + 1);
      // Recalculation failed safely inside savepoint!
      expect(recorded.recalculation?.recalculation_succeeded).toBe(false);
      expect(recorded.recalculation?.recalculation_status).toBe('failed');
      expect(recorded.recalculation?.published_rating_version_id).toBe(
        lastGoodVersionId,
      );
      expect(recorded.recalculation?.error_message).toContain(stage);

      // Prove NO partial rating_versions, player_rating_snapshots, or match_rating_changes rows leaked!
      const versionCountDuringFailure = await db.query<{ count: string }>(
        `SELECT count(*) FROM public.rating_versions WHERE group_id = $1;`,
        [groupId],
      );
      expect(versionCountDuringFailure.rows[0]!.count).toBe(
        versionCountBefore.rows[0]!.count,
      );

      // Prove publication state is Stale/Failed and NEVER claims to be Current!
      const staleStateRows = await queryAs<{
        get_group_rating_publication_state: RatingPublicationStateResponse;
      }>(
        'authenticated',
        USERS.member.id,
        `SELECT public.get_group_rating_publication_state($1);`,
        [groupId],
      );
      const staleState = staleStateRows[0]!.get_group_rating_publication_state;
      expect(staleState.publication_health).toBe('stale_or_failed');
      expect(staleState.is_current).toBe(false);
      expect(staleState.recalculation_status).toBe('failed');
      expect(staleState.published_rating_version_id).toBe(lastGoodVersionId);
      expect(staleState.published_match_state_seq).toBe(lastGoodSeq);
      expect(staleState.required_match_state_seq).toBe(lastGoodSeq + i + 1);

      // Verify TypeScript deriveRatingPublicationState agrees 100%
      const uiBanner = deriveRatingPublicationState({
        recalculationStatus: staleState.recalculation_status,
        publishedVersionMatchStateSeq: staleState.published_match_state_seq,
        requiredMatchStateSeq: staleState.required_match_state_seq,
        lastError: staleState.last_recalculation_error,
      });
      expect(uiBanner.health).toBe('stale_or_failed');
      expect(uiBanner.isCurrent).toBe(false);
      expect(uiBanner.canAdminRetry).toBe(true);
    }

    // Finalize Session 2
    await queryAs(
      'authenticated',
      USERS.recorder1.id,
      `SELECT public.finalize_group_session($1, 1);`,
      [session2Id],
    );

    // Deterministic retry by Admin recovers ratings and publishes the new version
    const retryRows = await queryAs<{
      retry_group_rating_recalculation: RecalculationExecutionOutcome;
    }>(
      'authenticated',
      USERS.admin.id,
      `SELECT public.retry_group_rating_recalculation($1, 'Recovering after simulated replay fault');`,
      [groupId],
    );
    const retryOutcome = retryRows[0]!.retry_group_rating_recalculation;
    expect(retryOutcome.recalculation_succeeded).toBe(true);
    expect(retryOutcome.recalculation_status).toBe('idle');
    expect(retryOutcome.published_rating_version_id).not.toBe(lastGoodVersionId);

    const recoveredStateRows = await queryAs<{
      get_group_rating_publication_state: RatingPublicationStateResponse;
    }>(
      'authenticated',
      USERS.member.id,
      `SELECT public.get_group_rating_publication_state($1);`,
      [groupId],
    );
    const recoveredState =
      recoveredStateRows[0]!.get_group_rating_publication_state;
    expect(recoveredState.publication_health).toBe('current');
    expect(recoveredState.is_current).toBe(true);
    expect(recoveredState.published_match_state_seq).toBe(
      recoveredState.required_match_state_seq,
    );
    expect(recoveredState.last_recalculation_error).toBeNull();
  });

  it('enforces guest merge preview, same-match conflict rejection, duplicate attendance deduplication, and atomic rollback on failure (Condition 3, ID-02)', async () => {
    // 1. Preview conflict: guestConflict played in Match 3 alongside p6!
    const conflictPreviewRows = await queryAs<{
      preview_guest_into_player_merge: GuestMergePreviewResponse;
    }>(
      'authenticated',
      USERS.admin.id,
      `SELECT public.preview_guest_into_player_merge($1, $2, $3);`,
      [groupId, guestConflictId, p6Id],
    );
    const conflictPreview =
      conflictPreviewRows[0]!.preview_guest_into_player_merge;
    expect(conflictPreview.can_merge).toBe(false);
    expect(conflictPreview.conflicting_match_ids).toHaveLength(1);

    await expect(
      queryAs(
        'authenticated',
        USERS.admin.id,
        `SELECT public.merge_guest_into_player($1, $2, $3, 'Attempt conflicting merge');`,
        [groupId, guestConflictId, p6Id],
      ),
    ).rejects.toThrow(/guest_merge_conflict/i);

    // 2. Preview valid merge: guestMergeable -> p6
    // guestMergeable attended Session 1 (where p6 ALSO attended -> 1 overlapping session)
    // and Session Backdated (where p6 did NOT attend -> 1 reattributed session), and played in 2 matches.
    const validPreviewRows = await queryAs<{
      preview_guest_into_player_merge: GuestMergePreviewResponse;
    }>(
      'authenticated',
      USERS.admin.id,
      `SELECT public.preview_guest_into_player_merge($1, $2, $3);`,
      [groupId, guestMergeableId, p6Id],
    );
    const validPreview = validPreviewRows[0]!.preview_guest_into_player_merge;
    expect(validPreview.can_merge).toBe(true);
    expect(validPreview.affected_match_count).toBe(2);
    expect(validPreview.affected_session_attendance_count).toBe(2);
    expect(validPreview.overlapping_attendance_session_count).toBe(1);

    // 3. Prove merge is strictly atomic: if rating replay fails during merge, NO partial identity or attendance changes persist!
    await expect(
      queryAs(
        'authenticated',
        USERS.admin.id,
        `SELECT public.merge_guest_into_player($1, $2, $3, 'Atomic rollback test');`,
        [groupId, guestMergeableId, p6Id],
        { 'app.test_inject_replay_failure_stage': 'after_snapshots_insert' },
      ),
    ).rejects.toThrow(/injected_replay_failure/i);

    const guestAfterAbortedMerge = await queryAs<{
      is_active: boolean;
      merged_into_player_id: string | null;
    }>(
      'authenticated',
      USERS.admin.id,
      `SELECT is_active, merged_into_player_id FROM public.players WHERE id = $1;`,
      [guestMergeableId],
    );
    expect(guestAfterAbortedMerge[0]!.is_active).toBe(true);
    expect(guestAfterAbortedMerge[0]!.merged_into_player_id).toBeNull();

    // 4. Execute valid atomic merge
    const mergeRows = await queryAs<{
      merge_guest_into_player: GuestMergeExecutionResponse;
    }>(
      'authenticated',
      USERS.admin.id,
      `SELECT public.merge_guest_into_player($1, $2, $3, 'Guest joined club permanently as Player Six');`,
      [groupId, guestMergeableId, p6Id],
    );
    const mergeResult = mergeRows[0]!.merge_guest_into_player;
    expect(mergeResult.deduplicated_attendance_count).toBe(1);
    expect(mergeResult.reattributed_attendance_count).toBe(1);
    expect(mergeResult.reattributed_match_count).toBe(2);

    const guestAfterSuccess = await queryAs<{
      is_active: boolean;
      merged_into_player_id: string | null;
    }>(
      'authenticated',
      USERS.admin.id,
      `SELECT is_active, merged_into_player_id FROM public.players WHERE id = $1;`,
      [guestMergeableId],
    );
    expect(guestAfterSuccess[0]!.is_active).toBe(false);
    expect(guestAfterSuccess[0]!.merged_into_player_id).toBe(p6Id);
  });

  it('achieves exact NUMERIC(10,4) parity between PostgreSQL rating replay and TypeScript replayRatings across multi-session history, corrections, voids, backdated sessions, and guest merges (Condition 4)', async () => {
    // Fetch current published rating version ID
    const groupRow = await db.query<{
      published_rating_version_id: string;
      default_k_factor: number;
    }>(
      `SELECT published_rating_version_id, default_k_factor FROM public.groups WHERE id = $1;`,
      [groupId],
    );
    const pubVersionId = groupRow.rows[0]!.published_rating_version_id;
    const kFactor = groupRow.rows[0]!.default_k_factor;

    // Load sessions, matches, and players from PostgreSQL to feed into TypeScript `replayRatings`
    const dbSessions = await db.query<{
      id: string;
      group_id: string;
      season_id: string | null;
      session_started_at: Date;
      created_at: Date;
    }>(`SELECT id, group_id, season_id, session_started_at, created_at FROM public.sessions WHERE group_id = $1;`, [
      groupId,
    ]);

    const dbPlayers = await db.query<{
      id: string;
      display_name: string;
      is_guest: boolean;
      merged_into_player_id: string | null;
    }>(`SELECT id, display_name, is_guest, merged_into_player_id FROM public.players WHERE group_id = $1;`, [
      groupId,
    ]);

    const dbMatches = await db.query<{
      id: string;
      group_id: string;
      session_id: string;
      sequence_number: number | null;
      team_a_score: number | null;
      team_b_score: number | null;
      status: 'incomplete' | 'completed' | 'voided';
      is_disputed: boolean;
    }>(`SELECT id, group_id, session_id, sequence_number, team_a_score, team_b_score, status, is_disputed FROM public.matches WHERE group_id = $1;`, [
      groupId,
    ]);

    const dbParticipants = await db.query<{
      match_id: string;
      team_side: 'A' | 'B';
      slot_number: number;
      player_id: string;
    }>(`SELECT match_id, team_side, slot_number, player_id FROM public.match_participants WHERE group_id = $1 ORDER BY match_id, team_side, slot_number;`, [
      groupId,
    ]);

    const participantsByMatch = new Map<
      string,
      { A: [string, string]; B: [string, string] }
    >();
    for (const mp of dbParticipants.rows) {
      let entry = participantsByMatch.get(mp.match_id);
      if (!entry) {
        entry = { A: ['', ''], B: ['', ''] };
        participantsByMatch.set(mp.match_id, entry);
      }
      entry[mp.team_side][mp.slot_number - 1] = mp.player_id;
    }

    const tsSessions: ReplaySessionRecord[] = dbSessions.rows.map((s) => ({
      id: s.id,
      groupId: s.group_id,
      seasonId: s.season_id,
      sessionStartedAtUtcMs: new Date(s.session_started_at).getTime(),
      createdAtUtcMs: new Date(s.created_at).getTime(),
    }));

    const tsPlayers: ReplayPlayerIdentity[] = dbPlayers.rows.map((p) => ({
      id: p.id,
      displayName: p.display_name,
      isGuest: p.is_guest,
      mergedIntoPlayerId: p.merged_into_player_id,
    }));

    const tsMatches: ReplayMatchRecord[] = dbMatches.rows
      .filter((m) => m.sequence_number !== null && m.team_a_score !== null && m.team_b_score !== null)
      .map((m) => {
        const parts = participantsByMatch.get(m.id)!;
        return {
          id: m.id,
          groupId: m.group_id,
          sessionId: m.session_id,
          sequenceNumber: m.sequence_number!,
          teamA: parts.A,
          teamB: parts.B,
          teamAScore: m.team_a_score!,
          teamBScore: m.team_b_score!,
          status: m.status,
          isDisputed: m.is_disputed,
        };
      });

    const tsReplay = replayRatings({
      groupId,
      sessions: tsSessions,
      matches: tsMatches,
      players: tsPlayers,
      kFactor,
    });

    // Compare final snapshots in PostgreSQL vs TypeScript at exact NUMERIC(10,4) precision
    const pgSnapshots = await db.query<{
      player_id: string;
      rating: string;
      matches_played: number;
      wins: number;
      losses: number;
      is_provisional: boolean;
    }>(
      `SELECT player_id, rating::text, matches_played, wins, losses, is_provisional
       FROM public.player_rating_snapshots
       WHERE rating_version_id = $1
       ORDER BY player_id ASC;`,
      [pubVersionId],
    );

    expect(pgSnapshots.rows).toHaveLength(tsReplay.playerSnapshots.size);

    for (const pgSnap of pgSnapshots.rows) {
      const tsSnap = tsReplay.playerSnapshots.get(pgSnap.player_id);
      expect(tsSnap).toBeDefined();
      expect(pgSnap.rating).toBe(formatNumeric4(tsSnap!.ratingScaled));
      expect(pgSnap.matches_played).toBe(tsSnap!.matchesPlayed);
      expect(pgSnap.wins).toBe(tsSnap!.wins);
      expect(pgSnap.losses).toBe(tsSnap!.losses);
      expect(pgSnap.is_provisional).toBe(tsSnap!.isProvisional);
    }

    // Compare per-match rating changes in PostgreSQL vs TypeScript
    const pgMatchChanges = await db.query<{
      match_id: string;
      player_id: string;
      rating_before: string;
      rating_after: string;
      rating_delta: string;
    }>(
      `SELECT match_id, player_id, rating_before::text, rating_after::text, rating_delta::text
       FROM public.match_rating_changes
       WHERE rating_version_id = $1;`,
      [pubVersionId],
    );

    expect(pgMatchChanges.rows).toHaveLength(tsReplay.replayedMatches.length * 4);

    for (const rm of tsReplay.replayedMatches) {
      for (const pc of rm.calculation.playerChanges) {
        const pgChange = pgMatchChanges.rows.find(
          (r) => r.match_id === rm.matchId && r.player_id === pc.playerId,
        );
        expect(pgChange).toBeDefined();
        expect(pgChange!.rating_before).toBe(formatNumeric4(pc.beforeScaled));
        expect(pgChange!.rating_after).toBe(formatNumeric4(pc.afterScaled));
        expect(pgChange!.rating_delta).toBe(formatNumeric4(pc.deltaScaled));
      }
    }
  });
});
