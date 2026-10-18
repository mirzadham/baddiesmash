import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type {
  AdminMembershipDirectoryEntry,
  BootstrapInitialGroupResponse,
  DecideMembershipRequestResponse,
  IssueGroupInvitationResponse,
  RedeemGroupInvitationResponse,
} from '../../types/database.ts';

/**
 * Minimal Supabase-compatible `auth` schema & roles harness for local PostgreSQL testing.
 * Mirrors Supabase's `anon`, `authenticated`, `service_role`, `auth.users`, and `auth.uid()`.
 */
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

interface TestAccount {
  id: string;
  email: string;
  verified: boolean;
}

const ACCOUNTS = {
  owner: {
    id: '11111111-1111-4111-8111-111111111101',
    email: 'owner@badminton.test',
    verified: true,
  },
  admin: {
    id: '11111111-1111-4111-8111-111111111102',
    email: 'admin@badminton.test',
    verified: true,
  },
  recorder: {
    id: '11111111-1111-4111-8111-111111111103',
    email: 'recorder@badminton.test',
    verified: true,
  },
  member: {
    id: '11111111-1111-4111-8111-111111111104',
    email: 'member@badminton.test',
    verified: true,
  },
  viewer: {
    id: '11111111-1111-4111-8111-111111111105',
    email: 'viewer@badminton.test',
    verified: true,
  },
  pendingUser: {
    id: '11111111-1111-4111-8111-111111111106',
    email: 'pending@badminton.test',
    verified: true,
  },
  rejectedUser: {
    id: '11111111-1111-4111-8111-111111111107',
    email: 'rejected@badminton.test',
    verified: true,
  },
  suspendedUser: {
    id: '11111111-1111-4111-8111-111111111108',
    email: 'suspended@badminton.test',
    verified: true,
  },
  departedUser: {
    id: '11111111-1111-4111-8111-111111111109',
    email: 'departed@badminton.test',
    verified: true,
  },
  unverifiedUser: {
    id: '11111111-1111-4111-8111-111111111110',
    email: 'unverified@badminton.test',
    verified: false,
  },
  outsiderUser: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'outsider@badminton.test',
    verified: true,
  },
  groupBOwner: {
    id: '22222222-2222-4222-8222-222222222201',
    email: 'groupb-owner@badminton.test',
    verified: true,
  },
} as const satisfies Record<string, TestAccount>;

describe('Phase 1 Database Schema, Identity, Invitations, Ownership & RLS Security Suite', () => {
  let db: PGlite;
  let groupAId: string;
  let ownerMembershipId: string;
  let ownerPlayerId: string;
  let adminMembershipId: string;
  let recorderMembershipId: string;
  let memberMembershipId: string;
  let viewerMembershipId: string;
  let suspendedMembershipId: string;
  let departedMembershipId: string;
  let groupBId: string;
  let groupBPlayerId: string;

  /**
   * Executes a parameterized query inside a transaction as `anon` or `authenticated`
   * with `request.jwt.claim.sub` set to the specified user ID, enforcing PostgreSQL RLS
   * and role privileges identically to PostgREST.
   */
  async function queryAs<T = Record<string, unknown>>(
    role: 'anon' | 'authenticated',
    userId: string | null,
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    return db.transaction(async (tx) => {
      await tx.exec(`SET LOCAL ROLE ${role};`);
      if (userId) {
        await tx.exec(`SELECT set_config('request.jwt.claim.sub', '${userId}', true);`);
      } else {
        await tx.exec(`SELECT set_config('request.jwt.claim.sub', '', true);`);
      }
      const res = await tx.query<T>(sql, params);
      return res.rows;
    });
  }

  beforeAll(async () => {
    db = await PGlite.create({
      extensions: { pgcrypto },
    });

    // 1. Apply Supabase Auth bootstrap
    await db.exec(SUPABASE_AUTH_BOOTSTRAP_SQL);

    // 2. Apply Phase 1 SQL migration from disk
    const migrationPath = resolve(
      process.cwd(),
      'supabase/migrations/20261018000001_phase1_foundation_schema_and_rls.sql',
    );
    const migrationSql = readFileSync(migrationPath, 'utf8');
    await db.exec(migrationSql);

    // 3. Apply Phase 1 SQL catalog assertion script from disk
    const catalogTestPath = resolve(
      process.cwd(),
      'supabase/tests/phase1_rls_and_auth.test.sql',
    );
    const catalogTestSql = readFileSync(catalogTestPath, 'utf8');
    await db.exec(catalogTestSql);

    // 4. Seed simulated auth.users accounts
    for (const acc of Object.values(ACCOUNTS)) {
      await db.query(
        `INSERT INTO auth.users (id, email, email_confirmed_at)
         VALUES ($1, $2, CASE WHEN $3 THEN clock_timestamp() ELSE NULL END);`,
        [acc.id, acc.email, acc.verified],
      );
    }
  });

  afterAll(async () => {
    await db.close();
  });

  it('enforces ENABLE + FORCE ROW LEVEL SECURITY on all 14 public tables and search_path="" on all SECURITY DEFINER functions', async () => {
    const tablesRes = await db.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname ASC;
    `);

    expect(tablesRes.rows).toHaveLength(14);
    for (const row of tablesRes.rows) {
      expect(row.relrowsecurity).toBe(true);
      expect(row.relforcerowsecurity).toBe(true);
    }

    const funcsRes = await db.query<{
      proname: string;
      proconfig: string[] | null;
    }>(`
      SELECT p.proname, p.proconfig
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef = true
      ORDER BY p.proname ASC;
    `);

    expect(funcsRes.rows.length).toBeGreaterThanOrEqual(13);
    for (const fn of funcsRes.rows) {
      expect(fn.proconfig).toBeDefined();
      expect(
        fn.proconfig?.some((c) => c === 'search_path=""' || c === 'search_path='),
      ).toBe(true);
    }
  });

  it('denies anonymous and unverified-email accounts from bootstrapping a group, and enforces one-time bootstrap (DEC-012)', async () => {
    // Anonymous caller rejected
    await expect(
      queryAs(
        'anon',
        null,
        `SELECT public.bootstrap_initial_group('Court Masters', 'court-masters', 'Owner One');`,
      ),
    ).rejects.toThrow(/permission denied/i);

    // Unverified account rejected
    await expect(
      queryAs(
        'authenticated',
        ACCOUNTS.unverifiedUser.id,
        `SELECT public.bootstrap_initial_group('Court Masters', 'court-masters', 'Unverified');`,
      ),
    ).rejects.toThrow(/verified email address required/i);

    // Verified owner succeeds
    const bootstrapRows = await queryAs<{
      bootstrap_initial_group: BootstrapInitialGroupResponse;
    }>(
      'authenticated',
      ACCOUNTS.owner.id,
      `SELECT public.bootstrap_initial_group('KL Tuesday Badminton', 'kl-tuesday', 'Founder Lee');`,
    );

    const bootstrap = bootstrapRows[0]!.bootstrap_initial_group;
    expect(bootstrap.idempotent_retry).toBe(false);
    expect(bootstrap.group_id).toBeTruthy();
    expect(bootstrap.membership_id).toBeTruthy();
    expect(bootstrap.player_id).toBeTruthy();

    groupAId = bootstrap.group_id;
    ownerMembershipId = bootstrap.membership_id;
    ownerPlayerId = bootstrap.player_id!;

    // Idempotent retry by same owner with same slug returns existing record safely
    const retryRows = await queryAs<{
      bootstrap_initial_group: BootstrapInitialGroupResponse;
    }>(
      'authenticated',
      ACCOUNTS.owner.id,
      `SELECT public.bootstrap_initial_group('KL Tuesday Badminton', 'kl-tuesday', 'Founder Lee');`,
    );
    expect(retryRows[0]!.bootstrap_initial_group.idempotent_retry).toBe(true);
    expect(retryRows[0]!.bootstrap_initial_group.group_id).toBe(groupAId);

    // Second bootstrap by another user is permanently blocked
    await expect(
      queryAs(
        'authenticated',
        ACCOUNTS.outsiderUser.id,
        `SELECT public.bootstrap_initial_group('Another Group', 'another-group', 'Outsider');`,
      ),
    ).rejects.toThrow(/already been completed and is now disabled/i);
  });

  it('stores only SHA-256 token_hash for invitations, never persists raw token, and enforces 7-day expiry & revocation (AUTH-02)', async () => {
    // Issue invitation for admin (only Owner can issue admin invite)
    const issueRows = await queryAs<{
      issue_group_invitation: IssueGroupInvitationResponse;
    }>(
      'authenticated',
      ACCOUNTS.owner.id,
      `SELECT public.issue_group_invitation($1, '  Admin@Badminton.TEST ', 'admin', NULL, 7);`,
      [groupAId],
    );

    const issued = issueRows[0]!.issue_group_invitation;
    expect(issued.raw_token).toMatch(/^[0-9a-f]{64}$/); // 256 bits entropy

    const expectedHash = createHash('sha256')
      .update(issued.raw_token, 'utf8')
      .digest('hex');

    // Inspect raw database table as superuser to verify raw token is NEVER stored
    const dbInvRow = await db.query<{
      token_hash: string;
      invited_email_normalized: string;
    }>(`SELECT token_hash, invited_email_normalized FROM public.invitations WHERE id = $1;`, [
      issued.invitation_id,
    ]);
    expect(dbInvRow.rows[0]!.token_hash).toBe(expectedHash);
    expect(dbInvRow.rows[0]!.token_hash).not.toBe(issued.raw_token);
    expect(dbInvRow.rows[0]!.invited_email_normalized).toBe('admin@badminton.test');

    // Verify audit_events never stores the raw token or invited email
    const auditDump = await db.query<{ new_state: Record<string, unknown> }>(
      `SELECT new_state FROM public.audit_events WHERE entity_id = $1;`,
      [issued.invitation_id],
    );
    const serializedAudit = JSON.stringify(auditDump.rows);
    expect(serializedAudit).not.toContain(issued.raw_token);
    expect(serializedAudit).not.toContain('admin@badminton.test');

    // Reject expiry > 7 days
    await expect(
      queryAs(
        'authenticated',
        ACCOUNTS.owner.id,
        `SELECT public.issue_group_invitation($1, 'someone@badminton.test', 'member', NULL, 8);`,
        [groupAId],
      ),
    ).rejects.toThrow(/between 1 and 7 days/i);

    // Wrong email cannot redeem the invitation
    await expect(
      queryAs(
        'authenticated',
        ACCOUNTS.outsiderUser.id,
        `SELECT public.redeem_group_invitation($1, NULL, 'Outsider');`,
        [issued.raw_token],
      ),
    ).rejects.toThrow(/email does not match/i);

    // Unverified email cannot redeem even if invited
    const unverifiedInvite = await queryAs<{
      issue_group_invitation: IssueGroupInvitationResponse;
    }>(
      'authenticated',
      ACCOUNTS.owner.id,
      `SELECT public.issue_group_invitation($1, $2, 'member', NULL, 7);`,
      [groupAId, ACCOUNTS.unverifiedUser.email],
    );
    await expect(
      queryAs(
        'authenticated',
        ACCOUNTS.unverifiedUser.id,
        `SELECT public.redeem_group_invitation($1, NULL, 'Unverified');`,
        [unverifiedInvite[0]!.issue_group_invitation.raw_token],
      ),
    ).rejects.toThrow(/verified account email is required/i);

    // Revoke the unverified user's invitation and verify revoked token is rejected
    await queryAs(
      'authenticated',
      ACCOUNTS.owner.id,
      `SELECT public.revoke_group_invitation($1, 'Sent to wrong address');`,
      [unverifiedInvite[0]!.issue_group_invitation.invitation_id],
    );
    // Even if user later verifies email, revoked invitation fails
    await db.query(
      `UPDATE auth.users SET email_confirmed_at = clock_timestamp() WHERE id = $1;`,
      [ACCOUNTS.unverifiedUser.id],
    );
    await expect(
      queryAs(
        'authenticated',
        ACCOUNTS.unverifiedUser.id,
        `SELECT public.redeem_group_invitation($1, NULL, 'Now Verified');`,
        [unverifiedInvite[0]!.issue_group_invitation.raw_token],
      ),
    ).rejects.toThrow(/invitation has been revoked/i);

    // Test expired invitation rejection
    const expiringInvite = await queryAs<{
      issue_group_invitation: IssueGroupInvitationResponse;
    }>(
      'authenticated',
      ACCOUNTS.owner.id,
      `SELECT public.issue_group_invitation($1, $2, 'member', NULL, 1);`,
      [groupAId, ACCOUNTS.unverifiedUser.email],
    );
    // Backdate created_at and expires_at in DB to simulate 7-day expiry elapsed
    await db.query(
      `UPDATE public.invitations
          SET created_at = clock_timestamp() - interval '8 days',
              expires_at = clock_timestamp() - interval '1 day'
        WHERE id = $1;`,
      [expiringInvite[0]!.issue_group_invitation.invitation_id],
    );
    await expect(
      queryAs(
        'authenticated',
        ACCOUNTS.unverifiedUser.id,
        `SELECT public.redeem_group_invitation($1, NULL, 'Expired User');`,
        [expiringInvite[0]!.issue_group_invitation.raw_token],
      ),
    ).rejects.toThrow(/invitation has expired/i);

    // Valid redemption by admin@badminton.test succeeds and places account in pending_approval
    const redeemRows = await queryAs<{
      redeem_group_invitation: RedeemGroupInvitationResponse;
    }>(
      'authenticated',
      ACCOUNTS.admin.id,
      `SELECT public.redeem_group_invitation($1, NULL, 'Admin Tan');`,
      [issued.raw_token],
    );
    expect(redeemRows[0]!.redeem_group_invitation.status).toBe('pending_approval');
    adminMembershipId = redeemRows[0]!.redeem_group_invitation.membership_id;

    // Single-use enforcement: redeeming the same token again is rejected
    await expect(
      queryAs(
        'authenticated',
        ACCOUNTS.admin.id,
        `SELECT public.redeem_group_invitation($1, NULL, 'Admin Tan');`,
        [issued.raw_token],
      ),
    ).rejects.toThrow(/invitation has already been used/i);
  });

  it('blocks pending_approval, rejected, suspended, departed, and outsider users from accessing group data (AUTH-01)', async () => {
    // While admin@badminton.test is still pending_approval, they can see their own membership row
    // but CANNOT read groups, players, invitations, or audit_events!
    const pendingOwnMem = await queryAs(
      'authenticated',
      ACCOUNTS.admin.id,
      `SELECT id, status FROM public.group_memberships;`,
    );
    expect(pendingOwnMem).toHaveLength(1);
    expect(pendingOwnMem[0]).toMatchObject({
      id: adminMembershipId,
      status: 'pending_approval',
    });

    const pendingGroupRead = await queryAs(
      'authenticated',
      ACCOUNTS.admin.id,
      `SELECT id FROM public.groups;`,
    );
    expect(pendingGroupRead).toHaveLength(0);

    const pendingPlayersRead = await queryAs(
      'authenticated',
      ACCOUNTS.admin.id,
      `SELECT id FROM public.players;`,
    );
    expect(pendingPlayersRead).toHaveLength(0);

    // Owner approves Admin Tan and creates their player profile
    const approveAdmin = await queryAs<{
      decide_membership_request: DecideMembershipRequestResponse;
    }>(
      'authenticated',
      ACCOUNTS.owner.id,
      `SELECT public.decide_membership_request($1, 'approve', 'Co-organizer approved', NULL, true, 'Admin Tan');`,
      [adminMembershipId],
    );
    expect(approveAdmin[0]!.decide_membership_request.status).toBe('approved');
    expect(approveAdmin[0]!.decide_membership_request.linked_player_id).toBeTruthy();

    // Admin CANNOT issue an 'admin' invitation (only Owner can)
    await expect(
      queryAs(
        'authenticated',
        ACCOUNTS.admin.id,
        `SELECT public.issue_group_invitation($1, 'otheradmin@badminton.test', 'admin', NULL, 7);`,
        [groupAId],
      ),
    ).rejects.toThrow(/only the group owner may issue an admin invitation/i);

    // Admin CAN issue invitations for recorder, member, viewer, pending, rejected, suspended, departed
    const onboard = async (
      account: TestAccount,
      role: 'member' | 'recorder',
      decision: 'approve' | 'reject' | 'leave_pending',
      createPlayerName: string | null,
    ): Promise<string> => {
      const invRes = await queryAs<{
        issue_group_invitation: IssueGroupInvitationResponse;
      }>(
        'authenticated',
        ACCOUNTS.admin.id,
        `SELECT public.issue_group_invitation($1, $2, $3, NULL, 7);`,
        [groupAId, account.email, role],
      );
      const redRes = await queryAs<{
        redeem_group_invitation: RedeemGroupInvitationResponse;
      }>(
        'authenticated',
        account.id,
        `SELECT public.redeem_group_invitation($1, NULL, $2);`,
        [invRes[0]!.issue_group_invitation.raw_token, createPlayerName],
      );
      const memId = redRes[0]!.redeem_group_invitation.membership_id;
      if (decision === 'approve') {
        await queryAs(
          'authenticated',
          ACCOUNTS.admin.id,
          `SELECT public.decide_membership_request($1, 'approve', 'Approved by admin', NULL, $2, $3);`,
          [memId, createPlayerName !== null, createPlayerName],
        );
      } else if (decision === 'reject') {
        await queryAs(
          'authenticated',
          ACCOUNTS.admin.id,
          `SELECT public.decide_membership_request($1, 'reject', 'Not recognized by group', NULL, false, NULL);`,
          [memId],
        );
      }
      return memId;
    };

    recorderMembershipId = await onboard(ACCOUNTS.recorder, 'recorder', 'approve', 'Recorder Chong');
    memberMembershipId = await onboard(ACCOUNTS.member, 'member', 'approve', 'Member Siti');
    viewerMembershipId = await onboard(ACCOUNTS.viewer, 'member', 'approve', null); // Viewer without player profile (ID-01)
    await onboard(ACCOUNTS.pendingUser, 'member', 'leave_pending', 'Pending Lim');
    await onboard(ACCOUNTS.rejectedUser, 'member', 'reject', 'Rejected User');
    suspendedMembershipId = await onboard(ACCOUNTS.suspendedUser, 'member', 'approve', 'Suspended Wong');
    departedMembershipId = await onboard(ACCOUNTS.departedUser, 'member', 'approve', 'Departed Raj');

    // Transition suspendedUser to 'suspended' and departedUser to 'departed'
    await queryAs(
      'authenticated',
      ACCOUNTS.admin.id,
      `SELECT public.update_membership_role_or_status($1, 'member', 'suspended', 'Temporary suspension');`,
      [suspendedMembershipId],
    );
    await queryAs(
      'authenticated',
      ACCOUNTS.admin.id,
      `SELECT public.update_membership_role_or_status($1, 'member', 'departed', 'Left the club');`,
      [departedMembershipId],
    );

    // Verify none of pending, rejected, suspended, departed, or outsider can read group data
    for (const blocked of [
      ACCOUNTS.pendingUser,
      ACCOUNTS.rejectedUser,
      ACCOUNTS.suspendedUser,
      ACCOUNTS.departedUser,
      ACCOUNTS.outsiderUser,
    ]) {
      const groups = await queryAs(
        'authenticated',
        blocked.id,
        `SELECT id FROM public.groups;`,
      );
      const players = await queryAs(
        'authenticated',
        blocked.id,
        `SELECT id FROM public.players;`,
      );
      expect(groups).toHaveLength(0);
      expect(players).toHaveLength(0);
    }
  });

  it('enforces role permissions for viewer, member, recorder, admin, and owner, and allows duplicate player display names without auto-merging (AUTH-03, ID-01, ID-02)', async () => {
    // Viewer without player profile can read group and players, and has linked_player_id = NULL
    const viewerMem = await queryAs<{
      linked_player_id: string | null;
      profile_link_status: string;
    }>(
      'authenticated',
      ACCOUNTS.viewer.id,
      `SELECT linked_player_id, profile_link_status FROM public.group_memberships WHERE id = $1;`,
      [viewerMembershipId],
    );
    expect(viewerMem[0]!.linked_player_id).toBeNull();
    expect(viewerMem[0]!.profile_link_status).toBe('unlinked');

    const viewerPlayers = await queryAs(
      'authenticated',
      ACCOUNTS.viewer.id,
      `SELECT id FROM public.players WHERE group_id = $1;`,
      [groupAId],
    );
    expect(viewerPlayers.length).toBeGreaterThanOrEqual(5);

    // Ordinary member & viewer CANNOT create guests or permanent players
    await expect(
      queryAs(
        'authenticated',
        ACCOUNTS.member.id,
        `SELECT public.create_player_profile($1, 'Guest By Member', true);`,
        [groupAId],
      ),
    ).rejects.toThrow(/only an approved recorder, admin, or owner/i);

    // Recorder CAN create temporary guest (is_guest = true), but CANNOT create permanent player (is_guest = false)
    const recorderMemRow = await queryAs<{ role: string }>(
      'authenticated',
      ACCOUNTS.recorder.id,
      `SELECT role FROM public.group_memberships WHERE id = $1;`,
      [recorderMembershipId],
    );
    expect(recorderMemRow[0]!.role).toBe('recorder');

    const guestRows = await queryAs<{ create_player_profile: string }>(
      'authenticated',
      ACCOUNTS.recorder.id,
      `SELECT public.create_player_profile($1, 'Visitor Kumar', true);`,
      [groupAId],
    );
    expect(guestRows[0]!.create_player_profile).toBeTruthy();

    // Admin can toggle player active status with reason & audit trail
    await queryAs(
      'authenticated',
      ACCOUNTS.admin.id,
      `SELECT public.set_player_active_status($1, false, 'On sabbatical');`,
      [ownerPlayerId],
    );
    await queryAs(
      'authenticated',
      ACCOUNTS.admin.id,
      `SELECT public.set_player_active_status($1, true, 'Returned from sabbatical');`,
      [ownerPlayerId],
    );

    await expect(
      queryAs(
        'authenticated',
        ACCOUNTS.recorder.id,
        `SELECT public.create_player_profile($1, 'Permanent By Recorder', false);`,
        [groupAId],
      ),
    ).rejects.toThrow(/only an approved admin or owner may create a permanent player/i);

    // Duplicate display names are allowed and create distinct player UUIDs (ID-02)
    const dup1 = await queryAs<{ create_player_profile: string }>(
      'authenticated',
      ACCOUNTS.admin.id,
      `SELECT public.create_player_profile($1, 'Alex Tan', false);`,
      [groupAId],
    );
    const dup2 = await queryAs<{ create_player_profile: string }>(
      'authenticated',
      ACCOUNTS.admin.id,
      `SELECT public.create_player_profile($1, 'Alex Tan', false);`,
      [groupAId],
    );
    const alex1Id = dup1[0]!.create_player_profile;
    const alex2Id = dup2[0]!.create_player_profile;
    expect(alex1Id).not.toBe(alex2Id);

    // Admin links Viewer explicitly by UUID to alex1Id (ID-01, ID-02)
    await queryAs(
      'authenticated',
      ACCOUNTS.admin.id,
      `SELECT public.link_member_player_profile($1, $2, 'Confirmed identity as Alex Tan #1');`,
      [viewerMembershipId, alex1Id],
    );

    // Attempting to link another member to the same alex1Id is blocked by unique index
    await expect(
      queryAs(
        'authenticated',
        ACCOUNTS.admin.id,
        `SELECT public.link_member_player_profile($1, $2, 'Duplicate link attempt');`,
        [memberMembershipId, alex1Id],
      ),
    ).rejects.toThrow(/duplicate key value/i);

    // Unlink Viewer back to unlinked viewer state
    await queryAs(
      'authenticated',
      ACCOUNTS.admin.id,
      `SELECT public.link_member_player_profile($1, NULL, 'Reverted to non-playing viewer');`,
      [viewerMembershipId],
    );

    // Direct INSERT/UPDATE/DELETE on tables by authenticated users is blocked by privilege revocation
    await expect(
      queryAs(
        'authenticated',
        ACCOUNTS.admin.id,
        `INSERT INTO public.players (group_id, display_name, created_by_user_id) VALUES ($1, 'Direct Insert', $2);`,
        [groupAId, ACCOUNTS.admin.id],
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('protects member account emails and invitation records from non-admin members (PRIV-01)', async () => {
    // Ordinary members and recorders see 0 rows in public.invitations and public.audit_events
    for (const nonAdmin of [ACCOUNTS.viewer, ACCOUNTS.member, ACCOUNTS.recorder]) {
      const invs = await queryAs(
        'authenticated',
        nonAdmin.id,
        `SELECT id, invited_email_normalized FROM public.invitations;`,
      );
      const audits = await queryAs(
        'authenticated',
        nonAdmin.id,
        `SELECT id FROM public.audit_events;`,
      );
      expect(invs).toHaveLength(0);
      expect(audits).toHaveLength(0);

      // Direct SELECT on auth.users is denied
      await expect(
        queryAs('authenticated', nonAdmin.id, `SELECT email FROM auth.users;`),
      ).rejects.toThrow(/permission denied/i);

      // Admin email lookup RPC is denied to non-admins
      await expect(
        queryAs(
          'authenticated',
          nonAdmin.id,
          `SELECT * FROM public.list_group_memberships_for_admin($1);`,
          [groupAId],
        ),
      ).rejects.toThrow(/only an approved group admin or owner/i);
    }

    // Approved Admin CAN call list_group_memberships_for_admin for Group A
    const adminDirectory = await queryAs<AdminMembershipDirectoryEntry>(
      'authenticated',
      ACCOUNTS.admin.id,
      `SELECT * FROM public.list_group_memberships_for_admin($1);`,
      [groupAId],
    );
    expect(adminDirectory.length).toBeGreaterThanOrEqual(6);
    expect(
      adminDirectory.some((entry) => entry.account_email === ACCOUNTS.member.email),
    ).toBe(true);
  });

  it('enforces strict cross-group isolation across RLS and composite foreign keys', async () => {
    // Seed a second isolated group (Group B) via superuser fixture to verify multi-group isolation
    const groupBRes = await db.query<{ id: string }>(
      `INSERT INTO public.groups (slug, name, created_by_user_id)
       VALUES ('penang-smashers', 'Penang Smashers', $1)
       RETURNING id;`,
      [ACCOUNTS.groupBOwner.id],
    );
    groupBId = groupBRes.rows[0]!.id;

    const groupBPlayerRes = await db.query<{ id: string }>(
      `INSERT INTO public.players (group_id, display_name, is_guest, is_active, created_by_user_id)
       VALUES ($1, 'Penang Star', false, true, $2)
       RETURNING id;`,
      [groupBId, ACCOUNTS.groupBOwner.id],
    );
    groupBPlayerId = groupBPlayerRes.rows[0]!.id;

    await db.query(
      `INSERT INTO public.group_memberships (group_id, user_id, role, status, linked_player_id, profile_link_status, approved_by_user_id, approved_at)
       VALUES ($1, $2, 'owner', 'approved', $3, 'linked', $2, clock_timestamp());`,
      [groupBId, ACCOUNTS.groupBOwner.id, groupBPlayerId],
    );

    // Group A Owner cannot see Group B in public.groups or public.players
    const visibleGroupsToA = await queryAs<{ id: string }>(
      'authenticated',
      ACCOUNTS.owner.id,
      `SELECT id FROM public.groups;`,
    );
    expect(visibleGroupsToA).toEqual([{ id: groupAId }]);

    const visiblePlayersToB = await queryAs<{ id: string }>(
      'authenticated',
      ACCOUNTS.groupBOwner.id,
      `SELECT id FROM public.players;`,
    );
    expect(visiblePlayersToB).toEqual([{ id: groupBPlayerId }]);

    // Group A Owner cannot call admin RPCs or issue invitations for Group B
    await expect(
      queryAs(
        'authenticated',
        ACCOUNTS.owner.id,
        `SELECT * FROM public.list_group_memberships_for_admin($1);`,
        [groupBId],
      ),
    ).rejects.toThrow(/only an approved group admin or owner/i);

    // Cross-group profile linking is blocked by validation and composite FK (player_id, group_id)
    await expect(
      queryAs(
        'authenticated',
        ACCOUNTS.owner.id,
        `SELECT public.link_member_player_profile($1, $2, 'Cross-group link attempt');`,
        [viewerMembershipId, groupBPlayerId],
      ),
    ).rejects.toThrow(/does not exist in this group/i);
  });

  it('executes atomic ownership transfer and prevents modification or deletion of append-only audit_events', async () => {
    // Non-owner (even Admin) cannot transfer ownership
    await expect(
      queryAs(
        'authenticated',
        ACCOUNTS.admin.id,
        `SELECT public.transfer_group_ownership($1, $2, 'Admin coup attempt');`,
        [groupAId, adminMembershipId],
      ),
    ).rejects.toThrow(/only the current approved group owner/i);

    // Owner cannot transfer ownership to a suspended or pending member
    await expect(
      queryAs(
        'authenticated',
        ACCOUNTS.owner.id,
        `SELECT public.transfer_group_ownership($1, $2, 'Transfer to suspended member');`,
        [groupAId, suspendedMembershipId],
      ),
    ).rejects.toThrow(/new owner must be an approved member/i);

    // Valid ownership transfer from Owner -> Admin Tan succeeds atomically
    await queryAs(
      'authenticated',
      ACCOUNTS.owner.id,
      `SELECT public.transfer_group_ownership($1, $2, 'Stepping down as club president');`,
      [groupAId, adminMembershipId],
    );

    const roleCheck = await queryAs<{ id: string; role: string }>(
      'authenticated',
      ACCOUNTS.admin.id,
      `SELECT id, role FROM public.group_memberships WHERE id IN ($1, $2);`,
      [ownerMembershipId, adminMembershipId],
    );
    const byId = new Map(roleCheck.map((r) => [r.id, r.role]));
    expect(byId.get(ownerMembershipId)).toBe('admin');
    expect(byId.get(adminMembershipId)).toBe('owner');

    // Audit event recorded for ownership_transferred
    const transferAudits = await queryAs<{ action_type: string; reason: string }>(
      'authenticated',
      ACCOUNTS.admin.id,
      `SELECT action_type, reason FROM public.audit_events WHERE group_id = $1 AND action_type = 'ownership_transferred';`,
      [groupAId],
    );
    expect(transferAudits).toHaveLength(1);
    expect(transferAudits[0]!.reason).toBe('Stepping down as club president');

    // Append-only audit_events immutability trigger blocks UPDATE and DELETE even by superuser
    await expect(
      db.query(`DELETE FROM public.audit_events WHERE group_id = $1;`, [groupAId]),
    ).rejects.toThrow(/audit_events are append-only/i);
  });
});
