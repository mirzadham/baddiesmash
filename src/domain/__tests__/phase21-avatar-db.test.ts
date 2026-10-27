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
GRANT USAGE ON SCHEMA storage TO postgres, anon, authenticated;
GRANT ALL ON TABLE storage.buckets TO postgres, authenticated;
GRANT SELECT ON TABLE storage.objects TO anon;
GRANT ALL ON TABLE storage.objects TO postgres, authenticated;

-- Simulate Supabase hosted auto-RLS helper function before hardening migration runs
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- no-op stub representing Supabase's hosted DDL helper
END;
$$;
`;

describe('Phase 21 — PostgreSQL update_player_avatar RPC & Cooldown Invariants Suite', () => {
  let db: PGlite;
  const ownerUserId = '11111111-1111-4111-8111-111111111101';
  const memberUserId = '11111111-1111-4111-8111-111111111104';
  const pendingUserId = '11111111-1111-4111-8111-111111111109';
  let groupId: string;
  let ownerPlayerId: string;
  let memberPlayerId: string;

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

    // Run Migration 1
    const phase1Sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20261018000001_phase1_foundation_schema_and_rls.sql'),
      'utf8',
    );
    await db.exec(phase1Sql);

    // Run Migration 2
    const phase2Sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20261018000002_phase2_sessions_matches_and_elo_replay.sql'),
      'utf8',
    );
    await db.exec(phase2Sql);

    // Run Migration 3 (Avatar Cooldown)
    const phase21Sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20261022000001_player_avatar_cooldown.sql'),
      'utf8',
    );
    await db.exec(phase21Sql);

    // Run Migration 4 (Update Player Display Name)
    const phase24Sql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20261024000001_update_player_display_name.sql'),
      'utf8',
    );
    await db.exec(phase24Sql);

    // Run Migration 5 (Security Advisor Hardening)
    const hardeningSql = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20261027000001_security_advisor_hardening.sql'),
      'utf8',
    );
    await db.exec(hardeningSql);

    // Seed auth users
    await db.query(
      `INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
       ($1, 'owner@test.local', clock_timestamp()),
       ($2, 'member@test.local', clock_timestamp()),
       ($3, 'pending@test.local', clock_timestamp());`,
      [ownerUserId, memberUserId, pendingUserId],
    );

    // Bootstrap initial group with owner
    const bootstrapRes = await queryAs<{ bootstrap_initial_group: { group_id: string; player_id: string } }>(
      'authenticated',
      ownerUserId,
      `SELECT public.bootstrap_initial_group('Avatar Test Group', 'avatar-test-group', 'Owner Player');`,
    );
    groupId = bootstrapRes[0]!.bootstrap_initial_group.group_id;
    ownerPlayerId = bootstrapRes[0]!.bootstrap_initial_group.player_id;

    // Create a player profile for member and link it (seeded directly as superuser)
    const memberPlayerRes = await db.query<{ id: string }>(
      `INSERT INTO public.players (group_id, display_name, created_by_user_id)
       VALUES ($1, 'Member Player', $2) RETURNING id;`,
      [groupId, ownerUserId],
    );
    memberPlayerId = memberPlayerRes.rows[0]!.id;

    // Add approved membership linking memberUserId to memberPlayerId
    await db.query(
      `INSERT INTO public.group_memberships (group_id, user_id, role, status, linked_player_id, profile_link_status, approved_by_user_id, approved_at)
       VALUES ($1, $2, 'member', 'approved', $3, 'linked', $4, clock_timestamp());`,
      [groupId, memberUserId, memberPlayerId, ownerUserId],
    );
  });

  afterAll(async () => {
    if (db) {
      await db.close();
    }
  });

  it('successfully updates player avatar without pg_catalog.nullif error and trims whitespace', async () => {
    const res = await queryAs<{ update_player_avatar: { success: boolean; avatar_url: string; avatar_updated_at: string } }>(
      'authenticated',
      memberUserId,
      `SELECT public.update_player_avatar($1::uuid, $2::uuid, $3::text, false);`,
      [groupId, memberPlayerId, '   https://example.com/avatar1.png   '],
    );

    expect(res[0]!.update_player_avatar.success).toBe(true);
    expect(res[0]!.update_player_avatar.avatar_url).toBe('https://example.com/avatar1.png');
    expect(res[0]!.update_player_avatar.avatar_updated_at).toBeTruthy();

    // Verify database record
    const playerRows = await queryAs<{ avatar_url: string; avatar_updated_at: string }>(
      'authenticated',
      memberUserId,
      `SELECT avatar_url, avatar_updated_at FROM public.players WHERE id = $1;`,
      [memberPlayerId],
    );
    expect(playerRows[0]!.avatar_url).toBe('https://example.com/avatar1.png');
    expect(playerRows[0]!.avatar_updated_at).toBeTruthy();
  });

  it('rejects subsequent avatar update within 365 days when admin_override is false', async () => {
    await expect(
      queryAs(
        'authenticated',
        memberUserId,
        `SELECT public.update_player_avatar($1::uuid, $2::uuid, $3::text, false);`,
        [groupId, memberPlayerId, 'https://example.com/avatar2.png'],
      ),
    ).rejects.toThrow(/Profile picture can only be updated once a year/i);
  });

  it('allows admin/owner override to update avatar within cooldown window', async () => {
    const res = await queryAs<{ update_player_avatar: { success: boolean; avatar_url: string } }>(
      'authenticated',
      ownerUserId,
      `SELECT public.update_player_avatar($1::uuid, $2::uuid, $3::text, true);`,
      [groupId, memberPlayerId, 'https://example.com/avatar-override.png'],
    );

    expect(res[0]!.update_player_avatar.success).toBe(true);
    expect(res[0]!.update_player_avatar.avatar_url).toBe('https://example.com/avatar-override.png');
  });

  it('converts empty string to NULL using NULLIF construct without error', async () => {
    // Owner updates their own avatar with empty string and override
    const res = await queryAs<{ update_player_avatar: { success: boolean; avatar_url: string | null } }>(
      'authenticated',
      ownerUserId,
      `SELECT public.update_player_avatar($1::uuid, $2::uuid, $3::text, true);`,
      [groupId, ownerPlayerId, '     '],
    );

    expect(res[0]!.update_player_avatar.success).toBe(true);
    expect(res[0]!.update_player_avatar.avatar_url).toBeNull();
  });

  it('allows admin/owner to reset player avatar via reset_player_avatar', async () => {
    const res = await queryAs<{ reset_player_avatar: { success: boolean; player_id: string } }>(
      'authenticated',
      ownerUserId,
      `SELECT public.reset_player_avatar($1::uuid, $2::uuid);`,
      [groupId, memberPlayerId],
    );

    expect(res[0]!.reset_player_avatar.success).toBe(true);

    const playerRows = await queryAs<{ avatar_url: string | null; avatar_updated_at: string | null }>(
      'authenticated',
      ownerUserId,
      `SELECT avatar_url, avatar_updated_at FROM public.players WHERE id = $1;`,
      [memberPlayerId],
    );
    expect(playerRows[0]!.avatar_url).toBeNull();
    expect(playerRows[0]!.avatar_updated_at).toBeNull();
  });

  describe('Security Advisor Hardening (Migration 20261027000001)', () => {
    it('revokes EXECUTE on public.rls_auto_enable() from PUBLIC, anon, and authenticated', async () => {
      const res = await db.query<{
        anon_can_exec: boolean;
        auth_can_exec: boolean;
      }>(`
        SELECT
          pg_catalog.has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE') AS anon_can_exec,
          pg_catalog.has_function_privilege('authenticated', 'public.rls_auto_enable()', 'EXECUTE') AS auth_can_exec;
      `);

      expect(res.rows[0]!.anon_can_exec).toBe(false);
      expect(res.rows[0]!.auth_can_exec).toBe(false);

      await expect(
        queryAs('anon', null, `SELECT public.rls_auto_enable();`),
      ).rejects.toThrow(/permission denied/i);

      // Also verify migration remains safe when rls_auto_enable() does not exist
      await db.exec(`DROP FUNCTION public.rls_auto_enable();`);
      const hardeningSql = readFileSync(
        resolve(process.cwd(), 'supabase/migrations/20261027000001_security_advisor_hardening.sql'),
        'utf8',
      );
      await expect(db.exec(hardeningSql)).resolves.not.toThrow();
    });

    it('switches public.is_valid_badminton_score(int, int) to SECURITY INVOKER while preserving exact score validation', async () => {
      const meta = await db.query<{ prosecdef: boolean }>(`
        SELECT p.prosecdef
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'is_valid_badminton_score';
      `);
      expect(meta.rows[0]!.prosecdef).toBe(false);

      const checks = await queryAs<{
        valid_21_19: boolean;
        valid_30_29: boolean;
        invalid_21_20: boolean;
        invalid_30_30: boolean;
      }>(
        'authenticated',
        memberUserId,
        `SELECT
          public.is_valid_badminton_score(21, 19) AS valid_21_19,
          public.is_valid_badminton_score(30, 29) AS valid_30_29,
          public.is_valid_badminton_score(21, 20) AS invalid_21_20,
          public.is_valid_badminton_score(30, 30) AS invalid_30_30;`,
      );

      expect(checks[0]!).toEqual({
        valid_21_19: true,
        valid_30_29: true,
        invalid_21_20: false,
        invalid_30_30: false,
      });
    });

    it('blocks bucket listing on storage.objects while allowing authorized <groupId>/<playerId>/<file> INSERTs only', async () => {
      // 1. Linked member can INSERT into their own player folder
      await expect(
        queryAs(
          'authenticated',
          memberUserId,
          `INSERT INTO storage.objects (bucket_id, name, owner)
           VALUES ('avatars', $1, $2::uuid);`,
          [`${groupId}/${memberPlayerId}/1761547200000-abcd1234.jpg`, memberUserId],
        ),
      ).resolves.toEqual([]);

      // 2. Group owner/admin can INSERT into a member player's folder
      await expect(
        queryAs(
          'authenticated',
          ownerUserId,
          `INSERT INTO storage.objects (bucket_id, name, owner)
           VALUES ('avatars', $1, $2::uuid);`,
          [`${groupId}/${memberPlayerId}/1761547200001-adminovr.webp`, ownerUserId],
        ),
      ).resolves.toEqual([]);

      // 3. Ordinary member CANNOT INSERT into another player's folder
      await expect(
        queryAs(
          'authenticated',
          memberUserId,
          `INSERT INTO storage.objects (bucket_id, name, owner)
           VALUES ('avatars', $1, $2::uuid);`,
          [`${groupId}/${ownerPlayerId}/spoof.jpg`, memberUserId],
        ),
      ).rejects.toThrow(/row-level security/i);

      // 4. Unapproved user CANNOT INSERT into avatars bucket at all
      await expect(
        queryAs(
          'authenticated',
          pendingUserId,
          `INSERT INTO storage.objects (bucket_id, name, owner)
           VALUES ('avatars', $1, $2::uuid);`,
          [`${groupId}/${memberPlayerId}/unapproved.jpg`, pendingUserId],
        ),
      ).rejects.toThrow(/row-level security/i);

      // 5. Malformed non-UUID or multi-segment traversal paths fail closed via RLS without cast crash
      await expect(
        queryAs(
          'authenticated',
          memberUserId,
          `INSERT INTO storage.objects (bucket_id, name, owner)
           VALUES ('avatars', 'not-a-uuid/also-bad/photo.jpg', $1::uuid);`,
          [memberUserId],
        ),
      ).rejects.toThrow(/row-level security/i);

      await expect(
        queryAs(
          'authenticated',
          ownerUserId,
          `INSERT INTO storage.objects (bucket_id, name, owner)
           VALUES ('avatars', $1, $2::uuid);`,
          [`${groupId}/${memberPlayerId}/nested/extra.jpg`, ownerUserId],
        ),
      ).rejects.toThrow(/row-level security/i);

      // 6. Neither anon nor authenticated can list objects in the public 'avatars' bucket
      const anonList = await queryAs(
        'anon',
        null,
        `SELECT id, name FROM storage.objects WHERE bucket_id = 'avatars';`,
      );
      expect(anonList).toHaveLength(0);

      const authList = await queryAs(
        'authenticated',
        memberUserId,
        `SELECT id, name FROM storage.objects WHERE bucket_id = 'avatars';`,
      );
      expect(authList).toHaveLength(0);
    });
  });
});
