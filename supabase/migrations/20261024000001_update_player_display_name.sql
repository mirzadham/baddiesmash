-- Migration: 20261024000001_update_player_display_name.sql
-- Feature: Allow users to change their own player display name, and admins to change any player display name.

-- 1. Stored procedure: update_player_display_name
-- Authorizes linked player member or group admin/owner to update a player's display name.
-- Preserves stable UUID, validates 1-80 chars trimmed length, blocks merged profiles, and logs audit event.
CREATE OR REPLACE FUNCTION public.update_player_display_name(
  p_group_id uuid,
  p_player_id uuid,
  p_display_name text,
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
  v_cleaned_name text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  v_now := pg_catalog.clock_timestamp();
  v_cleaned_name := pg_catalog.btrim(COALESCE(p_display_name, ''));

  -- Validate display_name format & length (1 to 80 chars, matching table check constraint)
  IF pg_catalog.char_length(v_cleaned_name) < 1 OR pg_catalog.char_length(v_cleaned_name) > 80 THEN
    RAISE EXCEPTION 'display name must be between 1 and 80 characters'
      USING ERRCODE = '22023';
  END IF;

  -- Verify player exists in the specified group
  SELECT * INTO v_player
  FROM public.players
  WHERE id = p_player_id AND group_id = p_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'player not found in specified group'
      USING ERRCODE = 'P0002';
  END IF;

  -- Merged profiles cannot be renamed
  IF v_player.merged_into_player_id IS NOT NULL THEN
    RAISE EXCEPTION 'cannot update display name of a merged guest profile'
      USING ERRCODE = '22023';
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

  IF NOT v_is_linked AND NOT v_is_admin THEN
    RAISE EXCEPTION 'you are not authorized to update this player display name'
      USING ERRCODE = '42501';
  END IF;

  -- If admin override explicitly requested, ensure caller is admin
  IF p_admin_override AND NOT v_is_admin THEN
    RAISE EXCEPTION 'only an admin or owner can use admin override'
      USING ERRCODE = '42501';
  END IF;

  -- Perform the update
  UPDATE public.players
  SET
    display_name = v_cleaned_name,
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
    'update_player_display_name',
    'player',
    p_player_id,
    CASE WHEN v_is_linked THEN 'self_update' ELSE 'admin_update' END,
    pg_catalog.jsonb_build_object(
      'display_name', v_player.display_name
    ),
    pg_catalog.jsonb_build_object(
      'display_name', v_cleaned_name
    ),
    pg_catalog.jsonb_build_object(
      'is_linked_caller', v_is_linked,
      'is_admin_caller', v_is_admin,
      'admin_override', p_admin_override
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'player_id', p_player_id,
    'display_name', v_cleaned_name,
    'updated_at', v_now
  );
END;
$$;

ALTER FUNCTION public.update_player_display_name(uuid, uuid, text, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_player_display_name(uuid, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_player_display_name(uuid, uuid, text, boolean) TO authenticated;
