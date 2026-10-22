-- Migration: 20261022000001_player_avatar_cooldown.sql
-- Feature: Display picture upload with 1-year (365 days) cooldown enforcement and admin override

-- 1. Add avatar_updated_at to public.players
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS avatar_updated_at timestamptz NULL;

-- 2. Stored procedure: update_player_avatar
-- Enforces 365-day cooldown unless authorized admin override is provided.
CREATE OR REPLACE FUNCTION public.update_player_avatar(
  p_group_id uuid,
  p_player_id uuid,
  p_avatar_url text,
  p_admin_override boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_player public.players%ROWTYPE;
  v_is_linked boolean;
  v_is_admin boolean;
  v_now timestamptz;
  v_cleaned_url text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  v_now := pg_catalog.clock_timestamp();
  v_cleaned_url := pg_catalog.nullif(pg_catalog.btrim(p_avatar_url), '');

  -- Validate avatar_url format & length
  IF v_cleaned_url IS NOT NULL AND pg_catalog.char_length(v_cleaned_url) > 512 THEN
    RAISE EXCEPTION 'avatar_url cannot exceed 512 characters'
      USING ERRCODE = '22001';
  END IF;

  -- Verify player exists in the specified group
  SELECT * INTO v_player
  FROM public.players
  WHERE id = p_player_id AND group_id = p_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'player not found in specified group'
      USING ERRCODE = 'P0002';
  END IF;

  -- Check if caller is group admin/owner
  v_is_admin := public.has_group_role(
    p_group_id,
    ARRAY['admin'::public.membership_role, 'owner'::public.membership_role]
  );

  -- Check if caller is linked to this player
  SELECT EXISTS(
    SELECT 1
    FROM public.group_memberships
    WHERE group_id = p_group_id
      AND user_id = v_caller_id
      AND linked_player_id = p_player_id
      AND status = 'approved'
  ) INTO v_is_linked;

  IF NOT v_is_linked AND NOT (p_admin_override AND v_is_admin) THEN
    RAISE EXCEPTION 'you are not authorized to update this player avatar'
      USING ERRCODE = '42501';
  END IF;

  -- If admin override requested, ensure caller is admin
  IF p_admin_override AND NOT v_is_admin THEN
    RAISE EXCEPTION 'only an admin or owner can use admin override'
      USING ERRCODE = '42501';
  END IF;

  -- Validate 365-day cooldown when NOT an admin override
  IF NOT p_admin_override THEN
    IF v_player.avatar_updated_at IS NOT NULL AND v_player.avatar_updated_at > (v_now - INTERVAL '365 days') THEN
      RAISE EXCEPTION 'Profile picture can only be updated once a year. Next update available on %',
        pg_catalog.to_char(v_player.avatar_updated_at + INTERVAL '365 days', 'YYYY-MM-DD HH24:MI:SS UTC')
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Perform the update
  UPDATE public.players
  SET
    avatar_url = v_cleaned_url,
    avatar_updated_at = v_now,
    updated_at = v_now
  WHERE id = p_player_id AND group_id = p_group_id;

  -- Write append-only audit event
  INSERT INTO public.audit_events (
    group_id,
    actor_user_id,
    action_type,
    entity_type,
    entity_id,
    reason,
    previous_state,
    new_state,
    metadata
  ) VALUES (
    p_group_id,
    v_caller_id,
    'update_player_avatar',
    'player',
    p_player_id,
    CASE WHEN p_admin_override THEN 'admin_override' ELSE 'self_update' END,
    pg_catalog.jsonb_build_object(
      'avatar_url', v_player.avatar_url,
      'avatar_updated_at', v_player.avatar_updated_at
    ),
    pg_catalog.jsonb_build_object(
      'avatar_url', v_cleaned_url,
      'avatar_updated_at', v_now
    ),
    pg_catalog.jsonb_build_object(
      'admin_override', p_admin_override
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'player_id', p_player_id,
    'avatar_url', v_cleaned_url,
    'avatar_updated_at', v_now
  );
END;
$$;

ALTER FUNCTION public.update_player_avatar(uuid, uuid, text, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_player_avatar(uuid, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_player_avatar(uuid, uuid, text, boolean) TO authenticated;

-- 3. Stored procedure: reset_player_avatar (Admin/Owner only)
CREATE OR REPLACE FUNCTION public.reset_player_avatar(
  p_group_id uuid,
  p_player_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_player public.players%ROWTYPE;
  v_now timestamptz;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_group_role(
    p_group_id,
    ARRAY['admin'::public.membership_role, 'owner'::public.membership_role]
  ) THEN
    RAISE EXCEPTION 'only an admin or owner can reset player avatar'
      USING ERRCODE = '42501';
  END IF;

  v_now := pg_catalog.clock_timestamp();

  SELECT * INTO v_player
  FROM public.players
  WHERE id = p_player_id AND group_id = p_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'player not found in specified group'
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.players
  SET
    avatar_url = NULL,
    avatar_updated_at = NULL,
    updated_at = v_now
  WHERE id = p_player_id AND group_id = p_group_id;

  INSERT INTO public.audit_events (
    group_id,
    actor_user_id,
    action_type,
    entity_type,
    entity_id,
    reason,
    previous_state,
    new_state,
    metadata
  ) VALUES (
    p_group_id,
    v_caller_id,
    'reset_player_avatar',
    'player',
    p_player_id,
    'admin_reset',
    pg_catalog.jsonb_build_object(
      'previous_avatar_url', v_player.avatar_url,
      'previous_avatar_updated_at', v_player.avatar_updated_at
    ),
    pg_catalog.jsonb_build_object(
      'avatar_url', NULL,
      'avatar_updated_at', NULL
    ),
    pg_catalog.jsonb_build_object(
      'admin_reset', true
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'player_id', p_player_id
  );
END;
$$;

ALTER FUNCTION public.reset_player_avatar(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reset_player_avatar(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_player_avatar(uuid, uuid) TO authenticated;

-- 4. Supabase Storage bucket for avatars (public read for group members)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880, -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'avatars_public_select'
  ) THEN
    CREATE POLICY avatars_public_select
      ON storage.objects FOR SELECT
      USING (bucket_id = 'avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'avatars_authenticated_insert'
  ) THEN
    CREATE POLICY avatars_authenticated_insert
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'avatars');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'avatars_authenticated_update'
  ) THEN
    CREATE POLICY avatars_authenticated_update
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'avatars');
  END IF;
END $$;
