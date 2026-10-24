import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SUPABASE_AUTH_STORAGE_BOOTSTRAP_SQL = `
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

-- Storage mock for PGlite testing
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean DEFAULT false,
  file_size_limit bigint NULL,
  allowed_mime_types text[] NULL
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT ALL ON SCHEMA storage TO postgres, authenticated;
GRANT ALL ON TABLE storage.buckets TO postgres, authenticated;
GRANT ALL ON TABLE storage.objects TO postgres, authenticated;
`;

describe('Update Player Display Name — PostgreSQL RPC & Security Suite', () => {
  let db: PGlite;
  const ownerUserId = '22222222-2222-4222-8222-222222222201';
  const memberUserId = '22222222-2222-4222-8222-222222222202';
  const otherMemberUserId = '22222222-2222-4222-8222-222222222203';
  let groupId: string;
  let ownerPlayerId: string;
  let memberPlayerId: string;
  let otherPlayerId: string;

  async function queryAs<T = Record<string, unknown>>(
    role: 'anon' | 'authenticated',
    userId: string | null,
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    return db.transaction(async (tx) => {
      await tx.exec(`SET LOCAL ROLE ${role};`);
      await tx.exec(
        `SELECT set_config('request.jwt.claim.sub', '${userId ?? ''}', true);`,
      );
      const res = await tx.query<T>(sql, params);
      return res.rows;
    });
  }

  beforeAll(async () => {
    db = await PGlite.create({
      extensions: { pgcrypto },
    });

    await db.exec(SUPABASE_AUTH_STORAGE_BOOTSTRAP_SQL);

    // Migration 1
    const phase1Sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20261018000001_phase1_foundation_schema_and_rls.sql'),
      'utf8',
    );
    await db.exec(phase1Sql);

    // Migration 2
    const phase2Sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20261018000002_phase2_sessions_matches_and_elo_replay.sql'),
      'utf8',
    );
    await db.exec(phase2Sql);

    // Migration 3 (Avatar Cooldown)
    const phase21Sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20261022000001_player_avatar_cooldown.sql'),
      'utf8',
    );
    await db.exec(phase21Sql);

    // Migration 4 (Update Player Display Name)
    const updateNameSql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20261024000001_update_player_display_name.sql'),
      'utf8',
    );
    await db.exec(updateNameSql);

    // Seed auth users
    await db.query(
      `INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
       ($1, 'owner@test.local', clock_timestamp()),
       ($2, 'member@test.local', clock_timestamp()),
       ($3, 'other@test.local', clock_timestamp());`,
      [ownerUserId, memberUserId, otherMemberUserId],
    );

    // Bootstrap initial group with owner
    const bootstrapRes = await queryAs<{ bootstrap_initial_group: { group_id: string; player_id: string } }>(
      'authenticated',
      ownerUserId,
      `SELECT public.bootstrap_initial_group('Display Name Test Group', 'display-name-group', 'Owner Initial Name');`,
    );
    groupId = bootstrapRes[0]!.bootstrap_initial_group.group_id;
    ownerPlayerId = bootstrapRes[0]!.bootstrap_initial_group.player_id;

    // Create player profiles
    const memberPlayerRes = await db.query<{ id: string }>(
      `INSERT INTO public.players (group_id, display_name, created_by_user_id)
       VALUES ($1, 'Original Member Name', $2) RETURNING id;`,
      [groupId, ownerUserId],
    );
    memberPlayerId = memberPlayerRes.rows[0]!.id;

    const otherPlayerRes = await db.query<{ id: string }>(
      `INSERT INTO public.players (group_id, display_name, created_by_user_id)
       VALUES ($1, 'Other Member Name', $2) RETURNING id;`,
      [groupId, ownerUserId],
    );
    otherPlayerId = otherPlayerRes.rows[0]!.id;

    // Link memberships
    await db.query(
      `INSERT INTO public.group_memberships (group_id, user_id, role, status, linked_player_id, profile_link_status, approved_by_user_id, approved_at)
       VALUES ($1, $2, 'member', 'approved', $3, 'linked', $4, clock_timestamp());`,
      [groupId, memberUserId, memberPlayerId, ownerUserId],
    );

    await db.query(
      `INSERT INTO public.group_memberships (group_id, user_id, role, status, linked_player_id, profile_link_status, approved_by_user_id, approved_at)
       VALUES ($1, $2, 'member', 'approved', $3, 'linked', $4, clock_timestamp());`,
      [groupId, otherMemberUserId, otherPlayerId, ownerUserId],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  it('allows a linked member to change their own player display name', async () => {
    const res = await queryAs<{ update_player_display_name: { success: boolean; display_name: string } }>(
      'authenticated',
      memberUserId,
      `SELECT public.update_player_display_name($1::uuid, $2::uuid, $3::text);`,
      [groupId, memberPlayerId, 'Updated Member Name'],
    );

    expect(res[0]!.update_player_display_name.success).toBe(true);
    expect(res[0]!.update_player_display_name.display_name).toBe('Updated Member Name');

    // Verify in players table
    const playerCheck = await db.query<{ display_name: string }>(
      `SELECT display_name FROM public.players WHERE id = $1;`,
      [memberPlayerId],
    );
    expect(playerCheck.rows[0]!.display_name).toBe('Updated Member Name');

    // Verify audit event
    const auditRes = await db.query<{ action_type: string; reason: string; previous_state: Record<string, unknown>; new_state: Record<string, unknown> }>(
      `SELECT action_type, reason, previous_state, new_state FROM public.audit_events
       WHERE entity_id = $1 AND action_type = 'update_player_display_name'
       ORDER BY created_at DESC LIMIT 1;`,
      [memberPlayerId],
    );
    expect(auditRes.rows[0]!.action_type).toBe('update_player_display_name');
    expect(auditRes.rows[0]!.reason).toBe('self_update');
    expect(auditRes.rows[0]!.previous_state.display_name).toBe('Original Member Name');
    expect(auditRes.rows[0]!.new_state.display_name).toBe('Updated Member Name');
  });

  it('allows an owner/admin to change any player display name', async () => {
    // Owner renames own profile
    const ownerRes = await queryAs<{ update_player_display_name: { success: boolean; display_name: string } }>(
      'authenticated',
      ownerUserId,
      `SELECT public.update_player_display_name($1::uuid, $2::uuid, $3::text);`,
      [groupId, ownerPlayerId, 'Owner New Name'],
    );
    expect(ownerRes[0]!.update_player_display_name.success).toBe(true);
    expect(ownerRes[0]!.update_player_display_name.display_name).toBe('Owner New Name');

    // Owner renames another player
    const res = await queryAs<{ update_player_display_name: { success: boolean; display_name: string } }>(
      'authenticated',
      ownerUserId,
      `SELECT public.update_player_display_name($1::uuid, $2::uuid, $3::text);`,
      [groupId, otherPlayerId, 'Admin Renamed Other'],
    );

    expect(res[0]!.update_player_display_name.success).toBe(true);
    expect(res[0]!.update_player_display_name.display_name).toBe('Admin Renamed Other');

    const auditRes = await db.query<{ action_type: string; reason: string }>(
      `SELECT action_type, reason FROM public.audit_events
       WHERE entity_id = $1 AND action_type = 'update_player_display_name'
       ORDER BY created_at DESC LIMIT 1;`,
      [otherPlayerId],
    );
    expect(auditRes.rows[0]!.reason).toBe('admin_update');
  });

  it('blocks a non-linked member from changing another player display name', async () => {
    await expect(
      queryAs(
        'authenticated',
        memberUserId,
        `SELECT public.update_player_display_name($1::uuid, $2::uuid, $3::text);`,
        [groupId, otherPlayerId, 'Hacked Name'],
      ),
    ).rejects.toThrow(/you are not authorized to update this player display name/);
  });

  it('rejects blank or whitespace-only display names', async () => {
    await expect(
      queryAs(
        'authenticated',
        memberUserId,
        `SELECT public.update_player_display_name($1::uuid, $2::uuid, $3::text);`,
        [groupId, memberPlayerId, '   '],
      ),
    ).rejects.toThrow(/display name must be between 1 and 80 characters/);
  });

  it('rejects display names exceeding 80 characters', async () => {
    const longName = 'A'.repeat(81);
    await expect(
      queryAs(
        'authenticated',
        memberUserId,
        `SELECT public.update_player_display_name($1::uuid, $2::uuid, $3::text);`,
        [groupId, memberPlayerId, longName],
      ),
    ).rejects.toThrow(/display name must be between 1 and 80 characters/);
  });

  it('blocks renaming a merged guest profile', async () => {
    // Create a guest and mark merged (must have is_active = false per players_merged_must_be_guest_and_inactive)
    const guestRes = await db.query<{ id: string }>(
      `INSERT INTO public.players (group_id, display_name, is_guest, is_active, merged_into_player_id, created_by_user_id)
       VALUES ($1, 'Guest Player', true, false, $2, $3) RETURNING id;`,
      [groupId, memberPlayerId, ownerUserId],
    );
    const guestPlayerId = guestRes.rows[0]!.id;

    await expect(
      queryAs(
        'authenticated',
        ownerUserId,
        `SELECT public.update_player_display_name($1::uuid, $2::uuid, $3::text);`,
        [groupId, guestPlayerId, 'Renamed Guest'],
      ),
    ).rejects.toThrow(/cannot update display name of a merged guest profile/);
  });

  it('blocks unauthenticated anon calls', async () => {
    await expect(
      queryAs(
        'anon',
        null,
        `SELECT public.update_player_display_name($1::uuid, $2::uuid, $3::text);`,
        [groupId, memberPlayerId, 'Anon Name'],
      ),
    ).rejects.toThrow();
  });
});
