-- Migration: 20261027000001_security_advisor_hardening.sql
-- Feature: Supabase Security Advisor free-tier hardening:
--   1. Revoke public RPC execution (PUBLIC, anon, authenticated) on Supabase's
--      auto-generated DDL event-trigger function public.rls_auto_enable() if present
--      (clears linter rules 0028 and 0029).
--   2. Switch pure score-math helper public.is_valid_badminton_score(integer, integer)
--      from SECURITY DEFINER to SECURITY INVOKER (clears linter rule 0029).
--   3. Remove broad SELECT/UPDATE policies on storage.objects for public bucket 'avatars'
--      (clears linter rule 0025_public_bucket_allows_listing) and restrict INSERT
--      to authorized <group_id>/<player_id>/<filename> object paths.

BEGIN;

-- 1. Conditionally lock down public.rls_auto_enable() when present in hosted Supabase
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'rls_auto_enable'
      AND pg_catalog.pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated';
  END IF;
END $$;

-- 2. Switch pure score validator helper to SECURITY INVOKER (touches zero tables)
ALTER FUNCTION public.is_valid_badminton_score(integer, integer) SECURITY INVOKER;

-- 3. Harden storage.objects RLS policies for the public 'avatars' bucket
DROP POLICY IF EXISTS avatars_public_select ON storage.objects;
DROP POLICY IF EXISTS avatars_authenticated_update ON storage.objects;
DROP POLICY IF EXISTS avatars_authenticated_insert ON storage.objects;

CREATE POLICY avatars_authenticated_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND name IS NOT NULL
    AND pg_catalog.split_part(name, '/', 3) <> ''
    AND pg_catalog.split_part(name, '/', 4) = ''
    AND pg_catalog.btrim(pg_catalog.split_part(name, '/', 3)) NOT IN ('', '.', '..')
    AND EXISTS (
      SELECT 1
      FROM public.players p
      JOIN public.group_memberships gm
        ON gm.group_id = p.group_id
      WHERE p.group_id::text = pg_catalog.lower(pg_catalog.split_part(name, '/', 1))
        AND p.id::text = pg_catalog.lower(pg_catalog.split_part(name, '/', 2))
        AND gm.user_id = auth.uid()
        AND gm.status = 'approved'::public.membership_status
        AND (
          gm.linked_player_id = p.id
          OR gm.role IN ('admin'::public.membership_role, 'owner'::public.membership_role)
        )
    )
  );

COMMIT;
