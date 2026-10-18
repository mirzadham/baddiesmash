-- ============================================================================
-- Migration: 20261018000002_phase2_sessions_matches_and_elo_replay.sql
-- Phase 2: Session Lifecycle, Controller Lease/Handover, Attendance,
--          Idempotent Match Recording, 10s Undo, Corrections/Voids,
--          Guest Merge, and Transactional PL/pgSQL Elo Replay Engine.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Publication State Inspection Helper (`DEC-016`, `RATE-04`)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_group_rating_publication_state(
  p_group_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group public.groups%ROWTYPE;
  v_published_version public.rating_versions%ROWTYPE;
  v_published_seq bigint := NULL;
  v_health text;
  v_is_current boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_approved_group_member(p_group_id) THEN
    RAISE EXCEPTION 'only an approved group member may view rating publication state'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_group
    FROM public.groups g
   WHERE g.id = p_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_group.published_rating_version_id IS NOT NULL THEN
    SELECT *
      INTO v_published_version
      FROM public.rating_versions rv
     WHERE rv.id = v_group.published_rating_version_id
       AND rv.group_id = p_group_id;

    IF FOUND THEN
      v_published_seq := v_published_version.match_state_seq;
    END IF;
  END IF;

  IF v_group.recalculation_status = 'running'::public.recalculation_status THEN
    v_health := 'recalculating';
    v_is_current := false;
  ELSIF v_group.recalculation_status = 'failed'::public.recalculation_status
        OR v_published_seq IS NULL
        OR v_published_seq < v_group.required_match_state_seq THEN
    v_health := 'stale_or_failed';
    v_is_current := false;
  ELSE
    v_health := 'current';
    v_is_current := true;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'group_id', p_group_id,
    'publication_health', v_health,
    'is_current', v_is_current,
    'recalculation_status', v_group.recalculation_status,
    'required_match_state_seq', v_group.required_match_state_seq,
    'published_rating_version_id', v_group.published_rating_version_id,
    'published_match_state_seq', v_published_seq,
    'last_recalculation_error', v_group.last_recalculation_error
  );
END;
$$;

ALTER FUNCTION public.get_group_rating_publication_state(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_group_rating_publication_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_group_rating_publication_state(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. Internal Deterministic Elo Replay Engine (`DEC-009`, `DEC-015`, `DEC-017`)
-- ----------------------------------------------------------------------------
-- Replays all eligible completed matches in canonical order:
--   (sessions.session_started_at ASC, sessions.created_at ASC, sessions.id ASC, matches.sequence_number ASC)
-- Uses exact NUMERIC(10,4) fixed-point arithmetic and half-away-from-zero rounding
-- at the 4th decimal place (`floor(abs(raw_delta) * 10000 + 0.5 + 1e-12) / 10000`),
-- matching TypeScript `src/domain/elo.ts`.
CREATE OR REPLACE FUNCTION public.execute_group_rating_replay_internal(
  p_group_id uuid,
  p_trigger_reason text,
  p_actor_user_id uuid,
  p_season_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group public.groups%ROWTYPE;
  v_new_version_id uuid;
  v_inject_stage text;
  v_match_rec record;
  v_p_a1 uuid;
  v_p_a2 uuid;
  v_p_b1 uuid;
  v_p_b2 uuid;
  v_r_a1 numeric(10,4);
  v_r_a2 numeric(10,4);
  v_r_b1 numeric(10,4);
  v_r_b2 numeric(10,4);
  v_diff_points double precision;
  v_expected_a double precision;
  v_actual_a double precision;
  v_raw_delta_a double precision;
  v_scaled_abs numeric(10,0);
  v_delta_a numeric(10,4);
  v_delta_b numeric(10,4);
  v_after_a1 numeric(10,4);
  v_after_a2 numeric(10,4);
  v_after_b1 numeric(10,4);
  v_after_b2 numeric(10,4);
  v_replayed_count integer := 0;
BEGIN
  SELECT *
    INTO v_group
    FROM public.groups g
   WHERE g.id = p_group_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group not found during rating replay'
      USING ERRCODE = 'P0002';
  END IF;

  v_inject_stage := NULLIF(
    pg_catalog.btrim(COALESCE(pg_catalog.current_setting('app.test_inject_replay_failure_stage', true), '')),
    ''
  );

  -- 1. Create candidate rating_versions row
  INSERT INTO public.rating_versions (
    group_id,
    season_id,
    match_state_seq,
    rules_version,
    k_factor,
    baseline_rating,
    trigger_reason,
    triggered_by_user_id
  )
  VALUES (
    p_group_id,
    p_season_id,
    v_group.required_match_state_seq,
    v_group.current_rules_version,
    v_group.default_k_factor,
    1000.0000,
    pg_catalog.btrim(p_trigger_reason),
    p_actor_user_id
  )
  RETURNING id INTO v_new_version_id;

  IF v_inject_stage = 'after_version_insert' THEN
    RAISE EXCEPTION 'injected_replay_failure: failed at stage after_version_insert'
      USING ERRCODE = 'XX000';
  END IF;

  -- 2. Initialize candidate snapshots at 1000.0000 for all non-merged players in the group
  INSERT INTO public.player_rating_snapshots (
    rating_version_id,
    group_id,
    player_id,
    rating,
    matches_played,
    wins,
    losses,
    is_provisional
  )
  SELECT
    v_new_version_id,
    p_group_id,
    p.id,
    1000.0000,
    0,
    0,
    0,
    true
  FROM public.players p
  WHERE p.group_id = p_group_id
    AND p.merged_into_player_id IS NULL;

  -- 3. Replay eligible completed matches in strict canonical chronological order (`DEC-015`)
  FOR v_match_rec IN
    SELECT
      m.id AS match_id,
      m.team_a_score,
      m.team_b_score
    FROM public.matches m
    JOIN public.sessions s
      ON s.id = m.session_id
     AND s.group_id = m.group_id
    WHERE m.group_id = p_group_id
      AND m.status = 'completed'::public.match_status
      AND (p_season_id IS NULL OR s.season_id = p_season_id)
    ORDER BY
      s.session_started_at ASC,
      s.created_at ASC,
      s.id ASC,
      m.sequence_number ASC
  LOOP
    -- Resolve the 4 participant slots (resolving any merged guest identity if present)
    SELECT COALESCE(p.merged_into_player_id, mp.player_id)
      INTO v_p_a1
      FROM public.match_participants mp
      JOIN public.players p ON p.id = mp.player_id AND p.group_id = mp.group_id
     WHERE mp.match_id = v_match_rec.match_id
       AND mp.group_id = p_group_id
       AND mp.team_side = 'A'::public.team_side
       AND mp.slot_number = 1;

    SELECT COALESCE(p.merged_into_player_id, mp.player_id)
      INTO v_p_a2
      FROM public.match_participants mp
      JOIN public.players p ON p.id = mp.player_id AND p.group_id = mp.group_id
     WHERE mp.match_id = v_match_rec.match_id
       AND mp.group_id = p_group_id
       AND mp.team_side = 'A'::public.team_side
       AND mp.slot_number = 2;

    SELECT COALESCE(p.merged_into_player_id, mp.player_id)
      INTO v_p_b1
      FROM public.match_participants mp
      JOIN public.players p ON p.id = mp.player_id AND p.group_id = mp.group_id
     WHERE mp.match_id = v_match_rec.match_id
       AND mp.group_id = p_group_id
       AND mp.team_side = 'B'::public.team_side
       AND mp.slot_number = 1;

    SELECT COALESCE(p.merged_into_player_id, mp.player_id)
      INTO v_p_b2
      FROM public.match_participants mp
      JOIN public.players p ON p.id = mp.player_id AND p.group_id = mp.group_id
     WHERE mp.match_id = v_match_rec.match_id
       AND mp.group_id = p_group_id
       AND mp.team_side = 'B'::public.team_side
       AND mp.slot_number = 2;

    IF v_p_a1 IS NULL OR v_p_a2 IS NULL OR v_p_b1 IS NULL OR v_p_b2 IS NULL THEN
      RAISE EXCEPTION 'corrupt_match_participants: match % does not have 4 valid participants', v_match_rec.match_id
        USING ERRCODE = '22023';
    END IF;

    IF v_p_a1 = v_p_a2 OR v_p_a1 = v_p_b1 OR v_p_a1 = v_p_b2
       OR v_p_a2 = v_p_b1 OR v_p_a2 = v_p_b2 OR v_p_b1 = v_p_b2 THEN
      RAISE EXCEPTION 'duplicate_match_participants: match % contains duplicate resolved player IDs', v_match_rec.match_id
        USING ERRCODE = '22023';
    END IF;

    SELECT prs.rating INTO v_r_a1
      FROM public.player_rating_snapshots prs
     WHERE prs.rating_version_id = v_new_version_id AND prs.player_id = v_p_a1;

    SELECT prs.rating INTO v_r_a2
      FROM public.player_rating_snapshots prs
     WHERE prs.rating_version_id = v_new_version_id AND prs.player_id = v_p_a2;

    SELECT prs.rating INTO v_r_b1
      FROM public.player_rating_snapshots prs
     WHERE prs.rating_version_id = v_new_version_id AND prs.player_id = v_p_b1;

    SELECT prs.rating INTO v_r_b2
      FROM public.player_rating_snapshots prs
     WHERE prs.rating_version_id = v_new_version_id AND prs.player_id = v_p_b2;

    -- Team average difference: (R_B - R_A) = ((r_b1 + r_b2) - (r_a1 + r_a2)) / 2
    v_diff_points := (((v_r_b1 + v_r_b2) - (v_r_a1 + v_r_a2))::double precision) / 2.0;
    v_expected_a := 1.0 / (1.0 + pg_catalog.power(10.0::double precision, v_diff_points / 400.0::double precision));
    v_actual_a := CASE WHEN v_match_rec.team_a_score > v_match_rec.team_b_score THEN 1.0 ELSE 0.0 END;
    v_raw_delta_a := (v_group.default_k_factor::double precision) * (v_actual_a - v_expected_a);

    -- Half-away-from-zero rounding at the 4th decimal place (`DEC-017`)
    v_scaled_abs := pg_catalog.floor(pg_catalog.abs(v_raw_delta_a) * 10000.0 + 0.5 + 1e-12)::numeric(10,0);
    v_delta_a := (CASE WHEN v_raw_delta_a < 0.0 THEN -v_scaled_abs ELSE v_scaled_abs END)::numeric(10,4) / 10000.0;
    v_delta_b := -v_delta_a;

    v_after_a1 := v_r_a1 + v_delta_a;
    v_after_a2 := v_r_a2 + v_delta_a;
    v_after_b1 := v_r_b1 + v_delta_b;
    v_after_b2 := v_r_b2 + v_delta_b;

    INSERT INTO public.match_rating_changes (
      rating_version_id,
      group_id,
      match_id,
      player_id,
      team_side,
      rating_before,
      rating_after,
      rating_delta
    )
    VALUES
      (v_new_version_id, p_group_id, v_match_rec.match_id, v_p_a1, 'A'::public.team_side, v_r_a1, v_after_a1, v_delta_a),
      (v_new_version_id, p_group_id, v_match_rec.match_id, v_p_a2, 'A'::public.team_side, v_r_a2, v_after_a2, v_delta_a),
      (v_new_version_id, p_group_id, v_match_rec.match_id, v_p_b1, 'B'::public.team_side, v_r_b1, v_after_b1, v_delta_b),
      (v_new_version_id, p_group_id, v_match_rec.match_id, v_p_b2, 'B'::public.team_side, v_r_b2, v_after_b2, v_delta_b);

    UPDATE public.player_rating_snapshots
       SET rating = v_after_a1,
           matches_played = matches_played + 1,
           wins = wins + CASE WHEN v_actual_a = 1.0 THEN 1 ELSE 0 END,
           losses = losses + CASE WHEN v_actual_a = 0.0 THEN 1 ELSE 0 END,
           is_provisional = ((matches_played + 1) < 3)
     WHERE rating_version_id = v_new_version_id AND player_id = v_p_a1;

    UPDATE public.player_rating_snapshots
       SET rating = v_after_a2,
           matches_played = matches_played + 1,
           wins = wins + CASE WHEN v_actual_a = 1.0 THEN 1 ELSE 0 END,
           losses = losses + CASE WHEN v_actual_a = 0.0 THEN 1 ELSE 0 END,
           is_provisional = ((matches_played + 1) < 3)
     WHERE rating_version_id = v_new_version_id AND player_id = v_p_a2;

    UPDATE public.player_rating_snapshots
       SET rating = v_after_b1,
           matches_played = matches_played + 1,
           wins = wins + CASE WHEN v_actual_a = 0.0 THEN 1 ELSE 0 END,
           losses = losses + CASE WHEN v_actual_a = 1.0 THEN 1 ELSE 0 END,
           is_provisional = ((matches_played + 1) < 3)
     WHERE rating_version_id = v_new_version_id AND player_id = v_p_b1;

    UPDATE public.player_rating_snapshots
       SET rating = v_after_b2,
           matches_played = matches_played + 1,
           wins = wins + CASE WHEN v_actual_a = 0.0 THEN 1 ELSE 0 END,
           losses = losses + CASE WHEN v_actual_a = 1.0 THEN 1 ELSE 0 END,
           is_provisional = ((matches_played + 1) < 3)
     WHERE rating_version_id = v_new_version_id AND player_id = v_p_b2;

    v_replayed_count := v_replayed_count + 1;

    IF v_inject_stage = 'mid_match_loop' AND v_replayed_count >= 1 THEN
      RAISE EXCEPTION 'injected_replay_failure: failed at stage mid_match_loop after match %', v_match_rec.match_id
        USING ERRCODE = 'XX000';
    END IF;
  END LOOP;

  IF v_inject_stage = 'after_snapshots_insert' THEN
    RAISE EXCEPTION 'injected_replay_failure: failed at stage after_snapshots_insert'
      USING ERRCODE = 'XX000';
  END IF;

  RETURN v_new_version_id;
END;
$$;

ALTER FUNCTION public.execute_group_rating_replay_internal(uuid, text, uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.execute_group_rating_replay_internal(uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. Savepoint-Protected Rating Publication Wrapper (`RATE-04`, `DEC-016`)
-- ----------------------------------------------------------------------------
-- Wraps `execute_group_rating_replay_internal` in a PL/pgSQL subtransaction
-- (`BEGIN ... EXCEPTION WHEN OTHERS`) so that if replay fails at any stage,
-- candidate rating rows roll back completely while the outer mutation transaction
-- preserves the previous `published_rating_version_id` and commits
-- `recalculation_status = 'failed'`, `rating_recalculation_runs`, and `audit_events`.
CREATE OR REPLACE FUNCTION public.run_group_rating_recalculation_safely(
  p_group_id uuid,
  p_trigger_reason text,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group public.groups%ROWTYPE;
  v_new_version_id uuid;
  v_run_id uuid;
  v_err_msg text;
  v_err_state text;
BEGIN
  SELECT *
    INTO v_group
    FROM public.groups g
   WHERE g.id = p_group_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- Inner subtransaction savepoint
  BEGIN
    v_new_version_id := public.execute_group_rating_replay_internal(
      p_group_id,
      p_trigger_reason,
      p_actor_user_id,
      NULL
    );

    UPDATE public.groups
       SET published_rating_version_id = v_new_version_id,
           recalculation_status = 'idle'::public.recalculation_status,
           last_recalculation_error = NULL,
           updated_at = pg_catalog.clock_timestamp()
     WHERE id = p_group_id;

    INSERT INTO public.rating_recalculation_runs (
      group_id,
      target_match_state_seq,
      status,
      error_message,
      produced_rating_version_id,
      triggered_by_user_id,
      started_at,
      completed_at
    )
    VALUES (
      p_group_id,
      v_group.required_match_state_seq,
      'idle'::public.recalculation_status,
      NULL,
      v_new_version_id,
      p_actor_user_id,
      pg_catalog.clock_timestamp(),
      pg_catalog.clock_timestamp()
    )
    RETURNING id INTO v_run_id;

    RETURN pg_catalog.jsonb_build_object(
      'recalculation_succeeded', true,
      'recalculation_status', 'idle',
      'published_rating_version_id', v_new_version_id,
      'required_match_state_seq', v_group.required_match_state_seq,
      'recalculation_run_id', v_run_id
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_err_msg = MESSAGE_TEXT,
      v_err_state = RETURNED_SQLSTATE;

    -- Candidate rows in rating_versions, player_rating_snapshots, and match_rating_changes
    -- have been rolled back by the subtransaction savepoint. Preserve previous published_rating_version_id!
    UPDATE public.groups
       SET recalculation_status = 'failed'::public.recalculation_status,
           last_recalculation_error = v_err_msg,
           updated_at = pg_catalog.clock_timestamp()
     WHERE id = p_group_id;

    INSERT INTO public.rating_recalculation_runs (
      group_id,
      target_match_state_seq,
      status,
      error_message,
      produced_rating_version_id,
      triggered_by_user_id,
      started_at,
      completed_at
    )
    VALUES (
      p_group_id,
      v_group.required_match_state_seq,
      'failed'::public.recalculation_status,
      v_err_msg,
      NULL,
      p_actor_user_id,
      pg_catalog.clock_timestamp(),
      pg_catalog.clock_timestamp()
    )
    RETURNING id INTO v_run_id;

    INSERT INTO public.audit_events (
      group_id,
      actor_user_id,
      action_type,
      entity_type,
      entity_id,
      reason,
      previous_state,
      new_state
    )
    VALUES (
      p_group_id,
      p_actor_user_id,
      'rating_recalculation_failed',
      'group',
      p_group_id,
      p_trigger_reason,
      pg_catalog.jsonb_build_object(
        'published_rating_version_id', v_group.published_rating_version_id,
        'recalculation_status', v_group.recalculation_status
      ),
      pg_catalog.jsonb_build_object(
        'preserved_published_rating_version_id', v_group.published_rating_version_id,
        'required_match_state_seq', v_group.required_match_state_seq,
        'recalculation_status', 'failed',
        'recalculation_run_id', v_run_id,
        'sqlstate', v_err_state,
        'error_message', v_err_msg
      )
    );

    RETURN pg_catalog.jsonb_build_object(
      'recalculation_succeeded', false,
      'recalculation_status', 'failed',
      'published_rating_version_id', v_group.published_rating_version_id,
      'required_match_state_seq', v_group.required_match_state_seq,
      'recalculation_run_id', v_run_id,
      'error_message', v_err_msg
    );
  END;
END;
$$;

ALTER FUNCTION public.run_group_rating_recalculation_safely(uuid, text, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.run_group_rating_recalculation_safely(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4. Admin Retry & Timeout Reporting RPCs (`RATE-04`, `DEC-016`)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.retry_group_rating_recalculation(
  p_group_id uuid,
  p_reason text DEFAULT 'Manual admin recalculation retry'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_result jsonb;
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
    RAISE EXCEPTION 'only an approved group admin or owner may retry rating recalculation'
      USING ERRCODE = '42501';
  END IF;

  v_result := public.run_group_rating_recalculation_safely(
    p_group_id,
    COALESCE(NULLIF(pg_catalog.btrim(p_reason), ''), 'Manual admin recalculation retry'),
    v_caller_id
  );

  IF (v_result->>'recalculation_succeeded')::boolean IS TRUE THEN
    INSERT INTO public.audit_events (
      group_id,
      actor_user_id,
      action_type,
      entity_type,
      entity_id,
      reason,
      new_state
    )
    VALUES (
      p_group_id,
      v_caller_id,
      'rating_recalculation_recovered',
      'group',
      p_group_id,
      pg_catalog.btrim(COALESCE(p_reason, 'Manual admin recalculation retry')),
      v_result
    );
  END IF;

  RETURN v_result;
END;
$$;

ALTER FUNCTION public.retry_group_rating_recalculation(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.retry_group_rating_recalculation(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retry_group_rating_recalculation(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_recalculation_timeout(
  p_group_id uuid,
  p_error_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_group public.groups%ROWTYPE;
  v_msg text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_group_role(
    p_group_id,
    ARRAY[
      'recorder'::public.membership_role,
      'admin'::public.membership_role,
      'owner'::public.membership_role
    ]
  ) THEN
    RAISE EXCEPTION 'only an approved recorder, admin, or owner may report a recalculation timeout'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_group
    FROM public.groups g
   WHERE g.id = p_group_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group not found'
      USING ERRCODE = 'P0002';
  END IF;

  v_msg := COALESCE(NULLIF(pg_catalog.btrim(p_error_message), ''), 'Statement timeout during rating recalculation');

  UPDATE public.groups
     SET recalculation_status = 'failed'::public.recalculation_status,
         last_recalculation_error = v_msg,
         updated_at = pg_catalog.clock_timestamp()
   WHERE id = p_group_id;

  INSERT INTO public.rating_recalculation_runs (
    group_id,
    target_match_state_seq,
    status,
    error_message,
    produced_rating_version_id,
    triggered_by_user_id,
    started_at,
    completed_at
  )
  VALUES (
    p_group_id,
    v_group.required_match_state_seq,
    'failed'::public.recalculation_status,
    v_msg,
    NULL,
    v_caller_id,
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp()
  );

  INSERT INTO public.audit_events (
    group_id,
    actor_user_id,
    action_type,
    entity_type,
    entity_id,
    reason,
    new_state
  )
  VALUES (
    p_group_id,
    v_caller_id,
    'rating_recalculation_timeout_reported',
    'group',
    p_group_id,
    v_msg,
    pg_catalog.jsonb_build_object(
      'required_match_state_seq', v_group.required_match_state_seq,
      'published_rating_version_id', v_group.published_rating_version_id,
      'recalculation_status', 'failed'
    )
  );
END;
$$;

ALTER FUNCTION public.report_recalculation_timeout(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.report_recalculation_timeout(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_recalculation_timeout(uuid, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. Session Lifecycle & Attendance RPCs (`SES-01`..`SES-04`, `ATT-01`, `3A`/`3B`/`3C`)
-- ----------------------------------------------------------------------------

-- 5.1 Start Group Session (`SES-01`, Policy `3A`)
CREATE OR REPLACE FUNCTION public.start_group_session(
  p_group_id uuid,
  p_session_started_at timestamptz DEFAULT NULL,
  p_initial_attendee_player_ids uuid[] DEFAULT ARRAY[]::uuid[],
  p_acknowledge_backdated_recalc_warning boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role public.membership_role;
  v_started_at timestamptz;
  v_is_backdated_before_rated boolean := false;
  v_active_season_id uuid := NULL;
  v_session_id uuid;
  v_pid uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  -- Lock group row to serialize session creation attempts
  PERFORM 1
    FROM public.groups g
   WHERE g.id = p_group_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT gm.role
    INTO v_caller_role
    FROM public.group_memberships gm
   WHERE gm.group_id = p_group_id
     AND gm.user_id = v_caller_id
     AND gm.status = 'approved'::public.membership_status;

  IF NOT FOUND OR v_caller_role NOT IN (
    'recorder'::public.membership_role,
    'admin'::public.membership_role,
    'owner'::public.membership_role
  ) THEN
    RAISE EXCEPTION 'only an approved recorder, admin, or owner may start a session'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sessions s
    WHERE s.group_id = p_group_id
      AND s.status IN ('active'::public.session_status, 'reopened'::public.session_status)
  ) THEN
    RAISE EXCEPTION 'group already has an active or reopened session'
      USING ERRCODE = '23505';
  END IF;

  v_started_at := COALESCE(p_session_started_at, pg_catalog.clock_timestamp());

  -- Policy 3A: Check if session_started_at precedes any existing session containing rated (completed) matches
  SELECT EXISTS (
    SELECT 1
    FROM public.sessions s
    JOIN public.matches m
      ON m.session_id = s.id
     AND m.group_id = s.group_id
    WHERE s.group_id = p_group_id
      AND m.status = 'completed'::public.match_status
      AND s.session_started_at > v_started_at
  ) INTO v_is_backdated_before_rated;

  IF v_is_backdated_before_rated THEN
    IF v_caller_role NOT IN ('admin'::public.membership_role, 'owner'::public.membership_role) THEN
      RAISE EXCEPTION 'backdated_session_unauthorized: creating a session dated before an existing rated session requires admin or owner authorization'
        USING ERRCODE = '42501';
    END IF;

    IF NOT COALESCE(p_acknowledge_backdated_recalc_warning, false) THEN
      RAISE EXCEPTION 'backdated_session_warning: session start time precedes existing rated matches and may trigger historical rating recalculation; set p_acknowledge_backdated_recalc_warning = true to confirm'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT sea.id
    INTO v_active_season_id
    FROM public.seasons sea
   WHERE sea.group_id = p_group_id
     AND sea.is_active = true
   LIMIT 1;

  INSERT INTO public.sessions (
    group_id,
    season_id,
    status,
    session_started_at,
    controller_user_id,
    controller_lease_version,
    last_meaningful_activity_at,
    created_by_user_id
  )
  VALUES (
    p_group_id,
    v_active_season_id,
    'active'::public.session_status,
    v_started_at,
    v_caller_id,
    1,
    pg_catalog.clock_timestamp(),
    v_caller_id
  )
  RETURNING id INTO v_session_id;

  IF p_initial_attendee_player_ids IS NOT NULL THEN
    FOREACH v_pid IN ARRAY p_initial_attendee_player_ids LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM public.players p
        WHERE p.id = v_pid
          AND p.group_id = p_group_id
          AND p.is_active = true
          AND p.merged_into_player_id IS NULL
      ) THEN
        RAISE EXCEPTION 'initial attendee player % is not an active non-merged player in this group', v_pid
          USING ERRCODE = '22023';
      END IF;

      INSERT INTO public.session_attendees (
        session_id,
        group_id,
        player_id,
        added_by_user_id
      )
      VALUES (
        v_session_id,
        p_group_id,
        v_pid,
        v_caller_id
      )
      ON CONFLICT (session_id, player_id) DO NOTHING;
    END LOOP;
  END IF;

  INSERT INTO public.audit_events (
    group_id,
    actor_user_id,
    action_type,
    entity_type,
    entity_id,
    new_state
  )
  VALUES (
    p_group_id,
    v_caller_id,
    'session_started',
    'session',
    v_session_id,
    pg_catalog.jsonb_build_object(
      'session_started_at', v_started_at,
      'season_id', v_active_season_id,
      'controller_user_id', v_caller_id,
      'controller_lease_version', 1,
      'is_backdated_before_rated', v_is_backdated_before_rated
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'session_id', v_session_id,
    'group_id', p_group_id,
    'controller_user_id', v_caller_id,
    'controller_lease_version', 1,
    'is_backdated_before_rated', v_is_backdated_before_rated
  );
END;
$$;

ALTER FUNCTION public.start_group_session(uuid, timestamptz, uuid[], boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.start_group_session(uuid, timestamptz, uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_group_session(uuid, timestamptz, uuid[], boolean) TO authenticated;

-- 5.2 Update Session Attendance (`ATT-01`)
CREATE OR REPLACE FUNCTION public.update_session_attendance(
  p_session_id uuid,
  p_player_id uuid,
  p_present boolean,
  p_expected_lease_version bigint DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_session public.sessions%ROWTYPE;
  v_is_admin_or_owner boolean;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_session
    FROM public.sessions s
   WHERE s.id = p_session_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_session.status = 'completed'::public.session_status THEN
    RAISE EXCEPTION 'cannot modify attendance of a completed session; reopen the session first'
      USING ERRCODE = '22023';
  END IF;

  v_is_admin_or_owner := public.has_group_role(
    v_session.group_id,
    ARRAY['admin'::public.membership_role, 'owner'::public.membership_role]
  );

  IF v_session.controller_user_id = v_caller_id THEN
    IF NOT public.has_group_role(
      v_session.group_id,
      ARRAY[
        'recorder'::public.membership_role,
        'admin'::public.membership_role,
        'owner'::public.membership_role
      ]
    ) THEN
      RAISE EXCEPTION 'caller no longer holds recorder/admin/owner permissions'
        USING ERRCODE = '42501';
    END IF;
    IF p_expected_lease_version IS NOT NULL AND v_session.controller_lease_version <> p_expected_lease_version THEN
      RAISE EXCEPTION 'stale_controller_lease: expected lease version %, actual %', p_expected_lease_version, v_session.controller_lease_version
        USING ERRCODE = '40001';
    END IF;
  ELSIF NOT v_is_admin_or_owner THEN
    RAISE EXCEPTION 'stale_controller_lease: only the active session controller or a group admin/owner may update attendance'
      USING ERRCODE = '42501';
  END IF;

  IF p_present THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.players p
      WHERE p.id = p_player_id
        AND p.group_id = v_session.group_id
        AND p.is_active = true
        AND p.merged_into_player_id IS NULL
    ) THEN
      RAISE EXCEPTION 'player does not exist in this group or is inactive/merged'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.session_attendees (
      session_id,
      group_id,
      player_id,
      added_by_user_id
    )
    VALUES (
      p_session_id,
      v_session.group_id,
      p_player_id,
      v_caller_id
    )
    ON CONFLICT (session_id, player_id) DO NOTHING;
  ELSE
    IF EXISTS (
      SELECT 1
      FROM public.matches m
      JOIN public.match_participants mp
        ON mp.match_id = m.id
       AND mp.group_id = m.group_id
      WHERE m.session_id = p_session_id
        AND m.status <> 'voided'::public.match_status
        AND mp.player_id = p_player_id
    ) THEN
      RAISE EXCEPTION 'cannot remove attendee who has participated in a non-voided match in this session'
        USING ERRCODE = '22023';
    END IF;

    DELETE FROM public.session_attendees
     WHERE session_id = p_session_id
       AND player_id = p_player_id;
  END IF;

  UPDATE public.sessions
     SET last_meaningful_activity_at = pg_catalog.clock_timestamp(),
         updated_at = pg_catalog.clock_timestamp()
   WHERE id = p_session_id;

  INSERT INTO public.audit_events (
    group_id,
    actor_user_id,
    action_type,
    entity_type,
    entity_id,
    new_state
  )
  VALUES (
    v_session.group_id,
    v_caller_id,
    'session_attendance_updated',
    'session',
    p_session_id,
    pg_catalog.jsonb_build_object(
      'player_id', p_player_id,
      'present', p_present
    )
  );
END;
$$;

ALTER FUNCTION public.update_session_attendance(uuid, uuid, boolean, bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_session_attendance(uuid, uuid, boolean, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_session_attendance(uuid, uuid, boolean, bigint) TO authenticated;

-- 5.3 Controller Handover or Takeover (`SES-02`)
CREATE OR REPLACE FUNCTION public.transfer_or_takeover_session_controller(
  p_session_id uuid,
  p_new_controller_user_id uuid,
  p_reason text,
  p_expected_lease_version bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_session public.sessions%ROWTYPE;
  v_new_lease bigint;
  v_action_type text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_session
    FROM public.sessions s
   WHERE s.id = p_session_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_session.status NOT IN ('active'::public.session_status, 'reopened'::public.session_status) THEN
    RAISE EXCEPTION 'controller handover/takeover is only valid for active or reopened sessions'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_group_role(
    v_session.group_id,
    ARRAY[
      'recorder'::public.membership_role,
      'admin'::public.membership_role,
      'owner'::public.membership_role
    ]
  ) THEN
    RAISE EXCEPTION 'only an approved recorder, admin, or owner may hand over or take over session control'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.group_memberships gm
    WHERE gm.group_id = v_session.group_id
      AND gm.user_id = p_new_controller_user_id
      AND gm.status = 'approved'::public.membership_status
      AND gm.role IN (
        'recorder'::public.membership_role,
        'admin'::public.membership_role,
        'owner'::public.membership_role
      )
  ) THEN
    RAISE EXCEPTION 'target controller must be an approved recorder, admin, or owner of this group'
      USING ERRCODE = '22023';
  END IF;

  IF p_expected_lease_version IS NOT NULL AND v_session.controller_lease_version <> p_expected_lease_version THEN
    RAISE EXCEPTION 'stale_controller_lease: expected lease version %, actual %', p_expected_lease_version, v_session.controller_lease_version
      USING ERRCODE = '40001';
  END IF;

  IF pg_catalog.char_length(pg_catalog.btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'a reason of at least 3 characters is required for controller handover or takeover'
      USING ERRCODE = '22023';
  END IF;

  v_action_type := CASE
    WHEN v_session.controller_user_id = v_caller_id THEN 'session_controller_handed_over'
    ELSE 'session_controller_taken_over'
  END;

  v_new_lease := v_session.controller_lease_version + 1;

  UPDATE public.sessions
     SET controller_user_id = p_new_controller_user_id,
         controller_lease_version = v_new_lease,
         last_meaningful_activity_at = pg_catalog.clock_timestamp(),
         updated_at = pg_catalog.clock_timestamp()
   WHERE id = p_session_id;

  INSERT INTO public.audit_events (
    group_id,
    actor_user_id,
    action_type,
    entity_type,
    entity_id,
    reason,
    previous_state,
    new_state
  )
  VALUES (
    v_session.group_id,
    v_caller_id,
    v_action_type,
    'session',
    p_session_id,
    pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'controller_user_id', v_session.controller_user_id,
      'controller_lease_version', v_session.controller_lease_version
    ),
    pg_catalog.jsonb_build_object(
      'controller_user_id', p_new_controller_user_id,
      'controller_lease_version', v_new_lease
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'session_id', p_session_id,
    'controller_user_id', p_new_controller_user_id,
    'controller_lease_version', v_new_lease,
    'action_type', v_action_type
  );
END;
$$;

ALTER FUNCTION public.transfer_or_takeover_session_controller(uuid, uuid, text, bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.transfer_or_takeover_session_controller(uuid, uuid, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_or_takeover_session_controller(uuid, uuid, text, bigint) TO authenticated;

-- 5.4 Update Session Start Time (Policy `3B` & `3A`)
CREATE OR REPLACE FUNCTION public.update_session_start_time(
  p_session_id uuid,
  p_new_started_at timestamptz,
  p_reason text,
  p_expected_lease_version bigint DEFAULT NULL,
  p_acknowledge_recalc_warning boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_session public.sessions%ROWTYPE;
  v_is_admin_or_owner boolean;
  v_has_rated_matches boolean;
  v_crosses_other_rated_session boolean;
  v_recalc_result jsonb := NULL;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF pg_catalog.char_length(pg_catalog.btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'a reason of at least 3 characters is required to edit session start time'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_session
    FROM public.sessions s
   WHERE s.id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- Lock group then session in canonical order
  PERFORM 1 FROM public.groups g WHERE g.id = v_session.group_id FOR UPDATE;
  SELECT * INTO v_session FROM public.sessions s WHERE s.id = p_session_id FOR UPDATE;

  v_is_admin_or_owner := public.has_group_role(
    v_session.group_id,
    ARRAY['admin'::public.membership_role, 'owner'::public.membership_role]
  );

  -- Policy 3B: Completed (or reopened) sessions require Admin/Owner; Active session allows current controller or Admin/Owner
  IF v_session.status <> 'active'::public.session_status THEN
    IF NOT v_is_admin_or_owner THEN
      RAISE EXCEPTION 'only an approved group admin or owner may edit a completed or reopened session start time'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF v_session.controller_user_id = v_caller_id THEN
      IF NOT public.has_group_role(
        v_session.group_id,
        ARRAY[
          'recorder'::public.membership_role,
          'admin'::public.membership_role,
          'owner'::public.membership_role
        ]
      ) THEN
        RAISE EXCEPTION 'caller no longer holds recorder/admin/owner permissions'
          USING ERRCODE = '42501';
      END IF;
      IF p_expected_lease_version IS NOT NULL AND v_session.controller_lease_version <> p_expected_lease_version THEN
        RAISE EXCEPTION 'stale_controller_lease: expected lease version %, actual %', p_expected_lease_version, v_session.controller_lease_version
          USING ERRCODE = '40001';
      END IF;
    ELSIF NOT v_is_admin_or_owner THEN
      RAISE EXCEPTION 'only the active session controller or a group admin/owner may edit an active session start time'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Check if moving start time precedes another rated session (Policy 3A)
  SELECT EXISTS (
    SELECT 1
    FROM public.sessions other_s
    JOIN public.matches m ON m.session_id = other_s.id AND m.group_id = other_s.group_id
    WHERE other_s.group_id = v_session.group_id
      AND other_s.id <> p_session_id
      AND m.status = 'completed'::public.match_status
      AND other_s.session_started_at > p_new_started_at
  ) INTO v_crosses_other_rated_session;

  IF v_crosses_other_rated_session THEN
    IF NOT v_is_admin_or_owner THEN
      RAISE EXCEPTION 'backdated_session_unauthorized: moving session start time before an existing rated session requires admin or owner authorization'
        USING ERRCODE = '42501';
    END IF;
    IF NOT COALESCE(p_acknowledge_recalc_warning, false) THEN
      RAISE EXCEPTION 'backdated_session_warning: new session start time precedes existing rated matches; set p_acknowledge_recalc_warning = true to confirm'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.matches m
    WHERE m.session_id = p_session_id
      AND m.status = 'completed'::public.match_status
  ) INTO v_has_rated_matches;

  UPDATE public.sessions
     SET session_started_at = p_new_started_at,
         last_meaningful_activity_at = pg_catalog.clock_timestamp(),
         updated_at = pg_catalog.clock_timestamp()
   WHERE id = p_session_id;

  INSERT INTO public.audit_events (
    group_id,
    actor_user_id,
    action_type,
    entity_type,
    entity_id,
    reason,
    previous_state,
    new_state
  )
  VALUES (
    v_session.group_id,
    v_caller_id,
    'session_start_time_updated',
    'session',
    p_session_id,
    pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object('session_started_at', v_session.session_started_at),
    pg_catalog.jsonb_build_object('session_started_at', p_new_started_at)
  );

  IF v_has_rated_matches THEN
    UPDATE public.groups
       SET required_match_state_seq = required_match_state_seq + 1,
           updated_at = pg_catalog.clock_timestamp()
     WHERE id = v_session.group_id;

    v_recalc_result := public.run_group_rating_recalculation_safely(
      v_session.group_id,
      'session_start_time_updated',
      v_caller_id
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'session_id', p_session_id,
    'session_started_at', p_new_started_at,
    'recalculation', v_recalc_result
  );
END;
$$;

ALTER FUNCTION public.update_session_start_time(uuid, timestamptz, text, bigint, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_session_start_time(uuid, timestamptz, text, bigint, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_session_start_time(uuid, timestamptz, text, bigint, boolean) TO authenticated;

-- 5.5 Finalize Group Session (`SES-03`, `SES-04`)
CREATE OR REPLACE FUNCTION public.finalize_group_session(
  p_session_id uuid,
  p_expected_lease_version bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_session public.sessions%ROWTYPE;
  v_is_admin_or_owner boolean;
  v_incomplete_count integer;
  v_ended_at timestamptz;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_session
    FROM public.sessions s
   WHERE s.id = p_session_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_session.status NOT IN ('active'::public.session_status, 'reopened'::public.session_status) THEN
    RAISE EXCEPTION 'session is already completed'
      USING ERRCODE = '22023';
  END IF;

  v_is_admin_or_owner := public.has_group_role(
    v_session.group_id,
    ARRAY['admin'::public.membership_role, 'owner'::public.membership_role]
  );

  IF v_session.controller_user_id = v_caller_id THEN
    IF NOT public.has_group_role(
      v_session.group_id,
      ARRAY[
        'recorder'::public.membership_role,
        'admin'::public.membership_role,
        'owner'::public.membership_role
      ]
    ) THEN
      RAISE EXCEPTION 'caller no longer holds recorder/admin/owner permissions'
        USING ERRCODE = '42501';
    END IF;
    IF p_expected_lease_version IS NOT NULL AND v_session.controller_lease_version <> p_expected_lease_version THEN
      RAISE EXCEPTION 'stale_controller_lease: expected lease version %, actual %', p_expected_lease_version, v_session.controller_lease_version
        USING ERRCODE = '40001';
    END IF;
  ELSIF NOT v_is_admin_or_owner THEN
    RAISE EXCEPTION 'only the active session controller or a group admin/owner may finalize the session'
      USING ERRCODE = '42501';
  END IF;

  -- SES-03: Block finalization if any incomplete match exists
  SELECT count(*)
    INTO v_incomplete_count
    FROM public.matches m
   WHERE m.session_id = p_session_id
     AND m.status = 'incomplete'::public.match_status;

  IF v_incomplete_count > 0 THEN
    RAISE EXCEPTION 'incomplete_matches_exist: cannot finalize session while % incomplete match(es) remain; complete or void them first', v_incomplete_count
      USING ERRCODE = '22023';
  END IF;

  v_ended_at := pg_catalog.clock_timestamp();

  UPDATE public.sessions
     SET status = 'completed'::public.session_status,
         session_ended_at = v_ended_at,
         last_meaningful_activity_at = v_ended_at,
         updated_at = v_ended_at
   WHERE id = p_session_id;

  INSERT INTO public.audit_events (
    group_id,
    actor_user_id,
    action_type,
    entity_type,
    entity_id,
    previous_state,
    new_state
  )
  VALUES (
    v_session.group_id,
    v_caller_id,
    'session_finalized',
    'session',
    p_session_id,
    pg_catalog.jsonb_build_object('status', v_session.status),
    pg_catalog.jsonb_build_object('status', 'completed', 'session_ended_at', v_ended_at)
  );

  RETURN pg_catalog.jsonb_build_object(
    'session_id', p_session_id,
    'status', 'completed',
    'session_ended_at', v_ended_at
  );
END;
$$;

ALTER FUNCTION public.finalize_group_session(uuid, bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.finalize_group_session(uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_group_session(uuid, bigint) TO authenticated;

-- 5.6 Reopen Completed Session (`SES-01`, Policy `3C`)
CREATE OR REPLACE FUNCTION public.reopen_completed_session(
  p_session_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_session public.sessions%ROWTYPE;
  v_new_lease bigint;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF pg_catalog.char_length(pg_catalog.btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'a reason of at least 3 characters is required to reopen a completed session'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_session
    FROM public.sessions s
   WHERE s.id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found'
      USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1 FROM public.groups g WHERE g.id = v_session.group_id FOR UPDATE;
  SELECT * INTO v_session FROM public.sessions s WHERE s.id = p_session_id FOR UPDATE;

  IF NOT public.has_group_role(
    v_session.group_id,
    ARRAY['admin'::public.membership_role, 'owner'::public.membership_role]
  ) THEN
    RAISE EXCEPTION 'only an approved group admin or owner may reopen a completed session'
      USING ERRCODE = '42501';
  END IF;

  IF v_session.status <> 'completed'::public.session_status THEN
    RAISE EXCEPTION 'only a completed session can be reopened (current status: %)', v_session.status
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sessions other_s
    WHERE other_s.group_id = v_session.group_id
      AND other_s.status IN ('active'::public.session_status, 'reopened'::public.session_status)
  ) THEN
    RAISE EXCEPTION 'cannot reopen session while another session is active or reopened in this group'
      USING ERRCODE = '23505';
  END IF;

  v_new_lease := v_session.controller_lease_version + 1;

  UPDATE public.sessions
     SET status = 'reopened'::public.session_status,
         controller_user_id = v_caller_id,
         controller_lease_version = v_new_lease,
         last_meaningful_activity_at = pg_catalog.clock_timestamp(),
         updated_at = pg_catalog.clock_timestamp()
   WHERE id = p_session_id;

  INSERT INTO public.audit_events (
    group_id,
    actor_user_id,
    action_type,
    entity_type,
    entity_id,
    reason,
    previous_state,
    new_state
  )
  VALUES (
    v_session.group_id,
    v_caller_id,
    'session_reopened',
    'session',
    p_session_id,
    pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object('status', 'completed', 'controller_lease_version', v_session.controller_lease_version),
    pg_catalog.jsonb_build_object('status', 'reopened', 'controller_user_id', v_caller_id, 'controller_lease_version', v_new_lease)
  );

  RETURN pg_catalog.jsonb_build_object(
    'session_id', p_session_id,
    'status', 'reopened',
    'controller_user_id', v_caller_id,
    'controller_lease_version', v_new_lease
  );
END;
$$;

ALTER FUNCTION public.reopen_completed_session(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reopen_completed_session(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_completed_session(uuid, text) TO authenticated;

-- 5.7 Stale Session Inactivity Warning Inspection (`SES-04`)
-- Evaluates 12-hour meaningful inactivity from persisted `last_meaningful_activity_at`
-- so page refreshes never reset the inactivity timer.
CREATE OR REPLACE FUNCTION public.get_session_inactivity_status(
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.sessions%ROWTYPE;
  v_inactive_seconds numeric;
  v_is_stale boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_session
    FROM public.sessions s
   WHERE s.id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_approved_group_member(v_session.group_id) THEN
    RAISE EXCEPTION 'only an approved group member may inspect session inactivity status'
      USING ERRCODE = '42501';
  END IF;

  v_inactive_seconds := EXTRACT(EPOCH FROM (pg_catalog.clock_timestamp() - v_session.last_meaningful_activity_at));
  v_is_stale := (
    v_session.status IN ('active'::public.session_status, 'reopened'::public.session_status)
    AND v_inactive_seconds >= 43200
  );

  RETURN pg_catalog.jsonb_build_object(
    'session_id', p_session_id,
    'status', v_session.status,
    'last_meaningful_activity_at', v_session.last_meaningful_activity_at,
    'inactive_seconds', v_inactive_seconds,
    'is_stale_12h_warning', v_is_stale
  );
END;
$$;

ALTER FUNCTION public.get_session_inactivity_status(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_session_inactivity_status(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_session_inactivity_status(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6. Match Entry, Incomplete Drafts, 10s Undo & Corrections (`MATCH-01`..`MATCH-06`)
-- ----------------------------------------------------------------------------

-- 6.1 Server-side Badminton Score Validator Helper
CREATE OR REPLACE FUNCTION public.is_valid_badminton_score(
  p_team_a_score integer,
  p_team_b_score integer
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_team_a_score IS NOT NULL
    AND p_team_b_score IS NOT NULL
    AND p_team_a_score >= 0
    AND p_team_b_score >= 0
    AND p_team_a_score <> p_team_b_score
    AND (
      (
        GREATEST(p_team_a_score, p_team_b_score) = 21
        AND GREATEST(p_team_a_score, p_team_b_score) - LEAST(p_team_a_score, p_team_b_score) >= 2
      )
      OR (
        GREATEST(p_team_a_score, p_team_b_score) BETWEEN 22 AND 29
        AND GREATEST(p_team_a_score, p_team_b_score) - LEAST(p_team_a_score, p_team_b_score) = 2
      )
      OR (
        GREATEST(p_team_a_score, p_team_b_score) = 30
        AND LEAST(p_team_a_score, p_team_b_score) IN (28, 29)
      )
    );
$$;

ALTER FUNCTION public.is_valid_badminton_score(integer, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_valid_badminton_score(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_valid_badminton_score(integer, integer) TO authenticated;

-- 6.2 Record Completed Match (`MATCH-01`, `MATCH-02`, `MATCH-03`, `MATCH-06`, `SES-02`, Policy `3C`)
CREATE OR REPLACE FUNCTION public.record_completed_match(
  p_session_id uuid,
  p_client_submission_id uuid,
  p_team_a_player_1 uuid,
  p_team_a_player_2 uuid,
  p_team_b_player_1 uuid,
  p_team_b_player_2 uuid,
  p_team_a_score integer,
  p_team_b_score integer,
  p_expected_lease_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_session public.sessions%ROWTYPE;
  v_existing_match public.matches%ROWTYPE;
  v_participants uuid[];
  v_pid uuid;
  v_seq integer;
  v_match_id uuid;
  v_completed_at timestamptz;
  v_recalc_result jsonb;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF p_client_submission_id IS NULL THEN
    RAISE EXCEPTION 'client_submission_id is required for idempotent match recording'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_session
    FROM public.sessions s
   WHERE s.id = p_session_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- Canonical locking order: groups FOR UPDATE -> sessions FOR UPDATE
  PERFORM 1 FROM public.groups g WHERE g.id = v_session.group_id FOR UPDATE;
  SELECT * INTO v_session FROM public.sessions s WHERE s.id = p_session_id FOR UPDATE;

  -- MATCH-03: Idempotency check FIRST before lease/sequence mutation
  SELECT *
    INTO v_existing_match
    FROM public.matches m
   WHERE m.group_id = v_session.group_id
     AND m.client_submission_id = p_client_submission_id;

  IF FOUND THEN
    IF NOT public.is_approved_group_member(v_session.group_id) THEN
      RAISE EXCEPTION 'unauthorized'
        USING ERRCODE = '42501';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'match_id', v_existing_match.id,
      'session_id', v_existing_match.session_id,
      'sequence_number', v_existing_match.sequence_number,
      'status', v_existing_match.status,
      'idempotent_retry', true
    );
  END IF;

  -- SES-02 & AUTH-03: Verify active/reopened session and current controller lease
  IF v_session.status NOT IN ('active'::public.session_status, 'reopened'::public.session_status) THEN
    RAISE EXCEPTION 'matches can only be recorded in an active or reopened session'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_group_role(
    v_session.group_id,
    ARRAY[
      'recorder'::public.membership_role,
      'admin'::public.membership_role,
      'owner'::public.membership_role
    ]
  ) THEN
    RAISE EXCEPTION 'only an approved recorder, admin, or owner may record matches'
      USING ERRCODE = '42501';
  END IF;

  IF v_session.controller_user_id <> v_caller_id THEN
    RAISE EXCEPTION 'stale_controller_lease: caller is not the active session controller'
      USING ERRCODE = '42501';
  END IF;

  IF p_expected_lease_version IS NULL OR v_session.controller_lease_version <> p_expected_lease_version THEN
    RAISE EXCEPTION 'stale_controller_lease: expected lease version %, actual %', p_expected_lease_version, v_session.controller_lease_version
      USING ERRCODE = '40001';
  END IF;

  -- MATCH-02: Validate 4 distinct participants
  IF p_team_a_player_1 IS NULL OR p_team_a_player_2 IS NULL
     OR p_team_b_player_1 IS NULL OR p_team_b_player_2 IS NULL THEN
    RAISE EXCEPTION 'exactly four player profiles are required for a doubles match'
      USING ERRCODE = '22023';
  END IF;

  IF p_team_a_player_1 = p_team_a_player_2
     OR p_team_a_player_1 = p_team_b_player_1
     OR p_team_a_player_1 = p_team_b_player_2
     OR p_team_a_player_2 = p_team_b_player_1
     OR p_team_a_player_2 = p_team_b_player_2
     OR p_team_b_player_1 = p_team_b_player_2 THEN
    RAISE EXCEPTION 'all four match participants must be distinct player profiles'
      USING ERRCODE = '22023';
  END IF;

  v_participants := ARRAY[
    p_team_a_player_1,
    p_team_a_player_2,
    p_team_b_player_1,
    p_team_b_player_2
  ];

  FOREACH v_pid IN ARRAY v_participants LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.players p
      WHERE p.id = v_pid
        AND p.group_id = v_session.group_id
        AND p.is_active = true
        AND p.merged_into_player_id IS NULL
    ) THEN
      RAISE EXCEPTION 'participant % is not an active, non-merged player in this group', v_pid
        USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.session_attendees sa
      WHERE sa.session_id = p_session_id
        AND sa.player_id = v_pid
    ) THEN
      RAISE EXCEPTION 'participant % is not marked as an attendee of this session', v_pid
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- MATCH-01: Validate badminton score rules
  IF NOT public.is_valid_badminton_score(p_team_a_score, p_team_b_score) THEN
    RAISE EXCEPTION 'invalid_badminton_score: score %-% violates badminton rules (first to 21, win by 2, cap 30)', p_team_a_score, p_team_b_score
      USING ERRCODE = '22023';
  END IF;

  -- MATCH-06 & Policy 3C: Assign immutable per-session sequence_number at MAX(sequence_number) + 1
  SELECT COALESCE(MAX(m.sequence_number), 0) + 1
    INTO v_seq
    FROM public.matches m
   WHERE m.session_id = p_session_id;

  v_completed_at := pg_catalog.clock_timestamp();

  INSERT INTO public.matches (
    group_id,
    session_id,
    sequence_number,
    status,
    team_a_score,
    team_b_score,
    is_disputed,
    client_submission_id,
    recorded_by_user_id,
    completed_at,
    created_at,
    updated_at
  )
  VALUES (
    v_session.group_id,
    p_session_id,
    v_seq,
    'completed'::public.match_status,
    p_team_a_score,
    p_team_b_score,
    false,
    p_client_submission_id,
    v_caller_id,
    v_completed_at,
    v_completed_at,
    v_completed_at
  )
  RETURNING id INTO v_match_id;

  INSERT INTO public.match_participants (
    match_id,
    group_id,
    team_side,
    slot_number,
    player_id
  )
  VALUES
    (v_match_id, v_session.group_id, 'A'::public.team_side, 1, p_team_a_player_1),
    (v_match_id, v_session.group_id, 'A'::public.team_side, 2, p_team_a_player_2),
    (v_match_id, v_session.group_id, 'B'::public.team_side, 1, p_team_b_player_1),
    (v_match_id, v_session.group_id, 'B'::public.team_side, 2, p_team_b_player_2);

  UPDATE public.sessions
     SET last_meaningful_activity_at = v_completed_at,
         updated_at = v_completed_at
   WHERE id = p_session_id;

  UPDATE public.groups
     SET required_match_state_seq = required_match_state_seq + 1,
         updated_at = v_completed_at
   WHERE id = v_session.group_id;

  INSERT INTO public.audit_events (
    group_id,
    actor_user_id,
    action_type,
    entity_type,
    entity_id,
    new_state
  )
  VALUES (
    v_session.group_id,
    v_caller_id,
    'match_recorded',
    'match',
    v_match_id,
    pg_catalog.jsonb_build_object(
      'session_id', p_session_id,
      'sequence_number', v_seq,
      'team_a', ARRAY[p_team_a_player_1, p_team_a_player_2],
      'team_b', ARRAY[p_team_b_player_1, p_team_b_player_2],
      'team_a_score', p_team_a_score,
      'team_b_score', p_team_b_score,
      'client_submission_id', p_client_submission_id
    )
  );

  v_recalc_result := public.run_group_rating_recalculation_safely(
    v_session.group_id,
    'match_recorded',
    v_caller_id
  );

  RETURN pg_catalog.jsonb_build_object(
    'match_id', v_match_id,
    'session_id', p_session_id,
    'sequence_number', v_seq,
    'status', 'completed',
    'idempotent_retry', false,
    'recalculation', v_recalc_result
  );
END;
$$;

ALTER FUNCTION public.record_completed_match(uuid, uuid, uuid, uuid, uuid, uuid, integer, integer, bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_completed_match(uuid, uuid, uuid, uuid, uuid, uuid, integer, integer, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_completed_match(uuid, uuid, uuid, uuid, uuid, uuid, integer, integer, bigint) TO authenticated;

-- 6.3 Create & Resolve Incomplete Match Draft (`SES-03`)
CREATE OR REPLACE FUNCTION public.create_incomplete_match_draft(
  p_session_id uuid,
  p_client_submission_id uuid,
  p_team_a_player_1 uuid,
  p_team_a_player_2 uuid,
  p_team_b_player_1 uuid,
  p_team_b_player_2 uuid,
  p_expected_lease_version bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_session public.sessions%ROWTYPE;
  v_match_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_session FROM public.sessions s WHERE s.id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1 FROM public.groups g WHERE g.id = v_session.group_id FOR UPDATE;
  SELECT * INTO v_session FROM public.sessions s WHERE s.id = p_session_id FOR UPDATE;

  IF v_session.status NOT IN ('active'::public.session_status, 'reopened'::public.session_status) THEN
    RAISE EXCEPTION 'drafts can only be created in an active or reopened session' USING ERRCODE = '22023';
  END IF;

  IF v_session.controller_user_id <> v_caller_id
     OR v_session.controller_lease_version <> p_expected_lease_version THEN
    RAISE EXCEPTION 'stale_controller_lease: caller does not hold the current session controller lease'
      USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.matches (
    group_id,
    session_id,
    sequence_number,
    status,
    client_submission_id,
    recorded_by_user_id
  )
  VALUES (
    v_session.group_id,
    p_session_id,
    NULL,
    'incomplete'::public.match_status,
    p_client_submission_id,
    v_caller_id
  )
  RETURNING id INTO v_match_id;

  INSERT INTO public.match_participants (
    match_id,
    group_id,
    team_side,
    slot_number,
    player_id
  )
  VALUES
    (v_match_id, v_session.group_id, 'A'::public.team_side, 1, p_team_a_player_1),
    (v_match_id, v_session.group_id, 'A'::public.team_side, 2, p_team_a_player_2),
    (v_match_id, v_session.group_id, 'B'::public.team_side, 1, p_team_b_player_1),
    (v_match_id, v_session.group_id, 'B'::public.team_side, 2, p_team_b_player_2);

  RETURN pg_catalog.jsonb_build_object(
    'match_id', v_match_id,
    'status', 'incomplete'
  );
END;
$$;

ALTER FUNCTION public.create_incomplete_match_draft(uuid, uuid, uuid, uuid, uuid, uuid, bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_incomplete_match_draft(uuid, uuid, uuid, uuid, uuid, uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_incomplete_match_draft(uuid, uuid, uuid, uuid, uuid, uuid, bigint) TO authenticated;

-- 6.4 Immediate 10-Second Undo by Original Recorder (`MATCH-05`)
CREATE OR REPLACE FUNCTION public.undo_match_within_window(
  p_match_id uuid,
  p_expected_lease_version bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_match public.matches%ROWTYPE;
  v_session public.sessions%ROWTYPE;
  v_now timestamptz;
  v_recalc_result jsonb;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_match
    FROM public.matches m
   WHERE m.id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- Canonical locking order: groups -> sessions -> matches
  PERFORM 1 FROM public.groups g WHERE g.id = v_match.group_id FOR UPDATE;
  SELECT * INTO v_session FROM public.sessions s WHERE s.id = v_match.session_id FOR UPDATE;
  SELECT * INTO v_match FROM public.matches m WHERE m.id = p_match_id FOR UPDATE;

  IF NOT public.has_group_role(
    v_match.group_id,
    ARRAY[
      'recorder'::public.membership_role,
      'admin'::public.membership_role,
      'owner'::public.membership_role
    ]
  ) THEN
    RAISE EXCEPTION 'caller lacks recorder/admin/owner permissions'
      USING ERRCODE = '42501';
  END IF;

  IF v_match.recorded_by_user_id <> v_caller_id THEN
    RAISE EXCEPTION 'undo_unauthorized: immediate 10-second undo is available only to the original recorder'
      USING ERRCODE = '42501';
  END IF;

  IF p_expected_lease_version IS NOT NULL AND v_session.controller_lease_version <> p_expected_lease_version THEN
    RAISE EXCEPTION 'stale_controller_lease: expected lease version %, actual %', p_expected_lease_version, v_session.controller_lease_version
      USING ERRCODE = '40001';
  END IF;

  IF v_match.status <> 'completed'::public.match_status THEN
    RAISE EXCEPTION 'only a completed match can be undone (current status: %)', v_match.status
      USING ERRCODE = '22023';
  END IF;

  v_now := pg_catalog.clock_timestamp();
  IF v_match.completed_at IS NULL OR v_now > v_match.completed_at + interval '10 seconds' THEN
    RAISE EXCEPTION 'undo_window_expired: the 10-second immediate undo window has expired; use authorized match correction/void with a reason'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.matches
     SET status = 'voided'::public.match_status,
         voided_at = v_now,
         void_reason = 'Immediate 10-second undo by original recorder',
         updated_at = v_now
   WHERE id = p_match_id;

  UPDATE public.sessions
     SET last_meaningful_activity_at = v_now,
         updated_at = v_now
   WHERE id = v_match.session_id;

  UPDATE public.groups
     SET required_match_state_seq = required_match_state_seq + 1,
         updated_at = v_now
   WHERE id = v_match.group_id;

  INSERT INTO public.audit_events (
    group_id,
    actor_user_id,
    action_type,
    entity_type,
    entity_id,
    reason,
    previous_state,
    new_state
  )
  VALUES (
    v_match.group_id,
    v_caller_id,
    'match_undone',
    'match',
    p_match_id,
    'Immediate 10-second undo by original recorder',
    pg_catalog.jsonb_build_object(
      'status', 'completed',
      'sequence_number', v_match.sequence_number,
      'team_a_score', v_match.team_a_score,
      'team_b_score', v_match.team_b_score
    ),
    pg_catalog.jsonb_build_object(
      'status', 'voided',
      'sequence_number', v_match.sequence_number,
      'voided_at', v_now
    )
  );

  v_recalc_result := public.run_group_rating_recalculation_safely(
    v_match.group_id,
    'match_undone',
    v_caller_id
  );

  RETURN pg_catalog.jsonb_build_object(
    'match_id', p_match_id,
    'sequence_number', v_match.sequence_number,
    'status', 'voided',
    'recalculation', v_recalc_result
  );
END;
$$;

ALTER FUNCTION public.undo_match_within_window(uuid, bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.undo_match_within_window(uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_match_within_window(uuid, bigint) TO authenticated;

-- 6.5 Authorized Match Correction or Void (`MATCH-05`, `MATCH-06`, `RATE-03`)
CREATE OR REPLACE FUNCTION public.correct_or_void_match(
  p_match_id uuid,
  p_action text,
  p_reason text,
  p_team_a_score integer DEFAULT NULL,
  p_team_b_score integer DEFAULT NULL,
  p_team_a_player_1 uuid DEFAULT NULL,
  p_team_a_player_2 uuid DEFAULT NULL,
  p_team_b_player_1 uuid DEFAULT NULL,
  p_team_b_player_2 uuid DEFAULT NULL,
  p_expected_lease_version bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_match public.matches%ROWTYPE;
  v_session public.sessions%ROWTYPE;
  v_is_admin_or_owner boolean;
  v_old_participants jsonb;
  v_new_a1 uuid;
  v_new_a2 uuid;
  v_new_b1 uuid;
  v_new_b2 uuid;
  v_pid uuid;
  v_was_rated boolean;
  v_now timestamptz;
  v_recalc_result jsonb := NULL;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('correct', 'void') THEN
    RAISE EXCEPTION 'action must be correct or void'
      USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.char_length(pg_catalog.btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'a reason of at least 3 characters is required to correct or void a match'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_match
    FROM public.matches m
   WHERE m.id = p_match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- Canonical locking order: groups -> sessions -> matches
  PERFORM 1 FROM public.groups g WHERE g.id = v_match.group_id FOR UPDATE;
  SELECT * INTO v_session FROM public.sessions s WHERE s.id = v_match.session_id FOR UPDATE;
  SELECT * INTO v_match FROM public.matches m WHERE m.id = p_match_id FOR UPDATE;

  v_is_admin_or_owner := public.has_group_role(
    v_match.group_id,
    ARRAY['admin'::public.membership_role, 'owner'::public.membership_role]
  );

  IF v_session.status = 'completed'::public.session_status THEN
    IF NOT v_is_admin_or_owner THEN
      RAISE EXCEPTION 'only an approved group admin or owner may correct or void a match in a completed session'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF v_session.controller_user_id = v_caller_id THEN
      IF NOT public.has_group_role(
        v_match.group_id,
        ARRAY[
          'recorder'::public.membership_role,
          'admin'::public.membership_role,
          'owner'::public.membership_role
        ]
      ) THEN
        RAISE EXCEPTION 'caller lacks recorder/admin/owner permissions'
          USING ERRCODE = '42501';
      END IF;
      IF p_expected_lease_version IS NOT NULL AND v_session.controller_lease_version <> p_expected_lease_version THEN
        RAISE EXCEPTION 'stale_controller_lease: expected lease version %, actual %', p_expected_lease_version, v_session.controller_lease_version
          USING ERRCODE = '40001';
      END IF;
    ELSIF NOT v_is_admin_or_owner THEN
      RAISE EXCEPTION 'stale_controller_lease: only the active session controller or a group admin/owner may correct or void a match'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'team_side', mp.team_side,
      'slot_number', mp.slot_number,
      'player_id', mp.player_id
    )
    ORDER BY mp.team_side ASC, mp.slot_number ASC
  )
  INTO v_old_participants
  FROM public.match_participants mp
  WHERE mp.match_id = p_match_id;

  v_was_rated := (v_match.status = 'completed'::public.match_status);
  v_now := pg_catalog.clock_timestamp();

  IF p_action = 'void' THEN
    IF v_match.status = 'voided'::public.match_status THEN
      RAISE EXCEPTION 'match is already voided'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.matches
       SET status = 'voided'::public.match_status,
           voided_at = v_now,
           void_reason = pg_catalog.btrim(p_reason),
           updated_at = v_now
     WHERE id = p_match_id;

    INSERT INTO public.audit_events (
      group_id,
      actor_user_id,
      action_type,
      entity_type,
      entity_id,
      reason,
      previous_state,
      new_state
    )
    VALUES (
      v_match.group_id,
      v_caller_id,
      'match_voided',
      'match',
      p_match_id,
      pg_catalog.btrim(p_reason),
      pg_catalog.jsonb_build_object(
        'status', v_match.status,
        'sequence_number', v_match.sequence_number,
        'team_a_score', v_match.team_a_score,
        'team_b_score', v_match.team_b_score,
        'participants', v_old_participants
      ),
      pg_catalog.jsonb_build_object(
        'status', 'voided',
        'sequence_number', v_match.sequence_number,
        'voided_at', v_now
      )
    );

    IF v_was_rated THEN
      UPDATE public.groups
         SET required_match_state_seq = required_match_state_seq + 1,
             updated_at = v_now
       WHERE id = v_match.group_id;

      v_recalc_result := public.run_group_rating_recalculation_safely(
        v_match.group_id,
        'match_voided',
        v_caller_id
      );
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'match_id', p_match_id,
      'sequence_number', v_match.sequence_number,
      'status', 'voided',
      'recalculation', v_recalc_result
    );
  END IF;

  -- Action = 'correct'
  IF v_match.status <> 'completed'::public.match_status THEN
    RAISE EXCEPTION 'only a completed match can be score/player corrected'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_valid_badminton_score(p_team_a_score, p_team_b_score) THEN
    RAISE EXCEPTION 'invalid_badminton_score: corrected score %-% violates badminton rules', p_team_a_score, p_team_b_score
      USING ERRCODE = '22023';
  END IF;

  SELECT mp.player_id INTO v_new_a1 FROM public.match_participants mp WHERE mp.match_id = p_match_id AND mp.team_side = 'A' AND mp.slot_number = 1;
  SELECT mp.player_id INTO v_new_a2 FROM public.match_participants mp WHERE mp.match_id = p_match_id AND mp.team_side = 'A' AND mp.slot_number = 2;
  SELECT mp.player_id INTO v_new_b1 FROM public.match_participants mp WHERE mp.match_id = p_match_id AND mp.team_side = 'B' AND mp.slot_number = 1;
  SELECT mp.player_id INTO v_new_b2 FROM public.match_participants mp WHERE mp.match_id = p_match_id AND mp.team_side = 'B' AND mp.slot_number = 2;

  v_new_a1 := COALESCE(p_team_a_player_1, v_new_a1);
  v_new_a2 := COALESCE(p_team_a_player_2, v_new_a2);
  v_new_b1 := COALESCE(p_team_b_player_1, v_new_b1);
  v_new_b2 := COALESCE(p_team_b_player_2, v_new_b2);

  IF v_new_a1 = v_new_a2 OR v_new_a1 = v_new_b1 OR v_new_a1 = v_new_b2
     OR v_new_a2 = v_new_b1 OR v_new_a2 = v_new_b2 OR v_new_b1 = v_new_b2 THEN
    RAISE EXCEPTION 'all four corrected match participants must be distinct player profiles'
      USING ERRCODE = '22023';
  END IF;

  FOREACH v_pid IN ARRAY ARRAY[v_new_a1, v_new_a2, v_new_b1, v_new_b2] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.players p
      WHERE p.id = v_pid
        AND p.group_id = v_match.group_id
        AND p.merged_into_player_id IS NULL
    ) THEN
      RAISE EXCEPTION 'corrected participant % does not exist in this group or is merged', v_pid
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Update participants atomically (delete + re-insert within transaction to avoid transient unique slot collision)
  DELETE FROM public.match_participants WHERE match_id = p_match_id;
  INSERT INTO public.match_participants (
    match_id,
    group_id,
    team_side,
    slot_number,
    player_id
  )
  VALUES
    (p_match_id, v_match.group_id, 'A'::public.team_side, 1, v_new_a1),
    (p_match_id, v_match.group_id, 'A'::public.team_side, 2, v_new_a2),
    (p_match_id, v_match.group_id, 'B'::public.team_side, 1, v_new_b1),
    (p_match_id, v_match.group_id, 'B'::public.team_side, 2, v_new_b2);

  -- MATCH-06: Preserve sequence_number unchanged
  UPDATE public.matches
     SET team_a_score = p_team_a_score,
         team_b_score = p_team_b_score,
         updated_at = v_now
   WHERE id = p_match_id;

  UPDATE public.groups
     SET required_match_state_seq = required_match_state_seq + 1,
         updated_at = v_now
   WHERE id = v_match.group_id;

  INSERT INTO public.audit_events (
    group_id,
    actor_user_id,
    action_type,
    entity_type,
    entity_id,
    reason,
    previous_state,
    new_state
  )
  VALUES (
    v_match.group_id,
    v_caller_id,
    'match_corrected',
    'match',
    p_match_id,
    pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'sequence_number', v_match.sequence_number,
      'team_a_score', v_match.team_a_score,
      'team_b_score', v_match.team_b_score,
      'participants', v_old_participants
    ),
    pg_catalog.jsonb_build_object(
      'sequence_number', v_match.sequence_number,
      'team_a_score', p_team_a_score,
      'team_b_score', p_team_b_score,
      'team_a', ARRAY[v_new_a1, v_new_a2],
      'team_b', ARRAY[v_new_b1, v_new_b2]
    )
  );

  v_recalc_result := public.run_group_rating_recalculation_safely(
    v_match.group_id,
    'match_corrected',
    v_caller_id
  );

  RETURN pg_catalog.jsonb_build_object(
    'match_id', p_match_id,
    'sequence_number', v_match.sequence_number,
    'status', 'completed',
    'recalculation', v_recalc_result
  );
END;
$$;

ALTER FUNCTION public.correct_or_void_match(uuid, text, text, integer, integer, uuid, uuid, uuid, uuid, bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.correct_or_void_match(uuid, text, text, integer, integer, uuid, uuid, uuid, uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_or_void_match(uuid, text, text, integer, integer, uuid, uuid, uuid, uuid, bigint) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. Guest-to-Player Merge Preview & Atomic Execution (`ID-02`, Condition 3)
-- ----------------------------------------------------------------------------

-- 7.1 Preview Guest Merge Impact
CREATE OR REPLACE FUNCTION public.preview_guest_into_player_merge(
  p_group_id uuid,
  p_source_guest_player_id uuid,
  p_target_permanent_player_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source public.players%ROWTYPE;
  v_target public.players%ROWTYPE;
  v_conflicting_match_ids uuid[];
  v_affected_match_count integer;
  v_guest_attendance_count integer;
  v_overlapping_attendance_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_group_role(
    p_group_id,
    ARRAY['admin'::public.membership_role, 'owner'::public.membership_role]
  ) THEN
    RAISE EXCEPTION 'only an approved group admin or owner may preview a guest merge'
      USING ERRCODE = '42501';
  END IF;

  IF p_source_guest_player_id IS NULL OR p_target_permanent_player_id IS NULL
     OR p_source_guest_player_id = p_target_permanent_player_id THEN
    RAISE EXCEPTION 'distinct source guest UUID and target permanent player UUID are required'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_source
    FROM public.players p
   WHERE p.id = p_source_guest_player_id AND p.group_id = p_group_id;

  IF NOT FOUND OR v_source.is_guest IS DISTINCT FROM true OR v_source.merged_into_player_id IS NOT NULL THEN
    RAISE EXCEPTION 'source player must be an unmerged temporary guest in this group'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_target
    FROM public.players p
   WHERE p.id = p_target_permanent_player_id AND p.group_id = p_group_id;

  IF NOT FOUND OR v_target.is_guest IS DISTINCT FROM false OR v_target.merged_into_player_id IS NOT NULL THEN
    RAISE EXCEPTION 'target player must be an unmerged permanent player profile in this group'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(pg_catalog.array_agg(mp1.match_id), ARRAY[]::uuid[])
    INTO v_conflicting_match_ids
    FROM public.match_participants mp1
    JOIN public.match_participants mp2
      ON mp2.match_id = mp1.match_id
     AND mp2.group_id = mp1.group_id
   WHERE mp1.group_id = p_group_id
     AND mp1.player_id = p_source_guest_player_id
     AND mp2.player_id = p_target_permanent_player_id;

  SELECT count(*)
    INTO v_affected_match_count
    FROM public.match_participants mp
   WHERE mp.group_id = p_group_id
     AND mp.player_id = p_source_guest_player_id;

  SELECT count(*)
    INTO v_guest_attendance_count
    FROM public.session_attendees sa
   WHERE sa.group_id = p_group_id
     AND sa.player_id = p_source_guest_player_id;

  SELECT count(*)
    INTO v_overlapping_attendance_count
    FROM public.session_attendees sa1
    JOIN public.session_attendees sa2
      ON sa2.session_id = sa1.session_id
     AND sa2.group_id = sa1.group_id
   WHERE sa1.group_id = p_group_id
     AND sa1.player_id = p_source_guest_player_id
     AND sa2.player_id = p_target_permanent_player_id;

  RETURN pg_catalog.jsonb_build_object(
    'group_id', p_group_id,
    'source_guest_player_id', p_source_guest_player_id,
    'source_guest_display_name', v_source.display_name,
    'target_permanent_player_id', p_target_permanent_player_id,
    'target_permanent_display_name', v_target.display_name,
    'can_merge', (COALESCE(pg_catalog.array_length(v_conflicting_match_ids, 1), 0) = 0),
    'conflicting_match_ids', v_conflicting_match_ids,
    'affected_match_count', v_affected_match_count,
    'affected_session_attendance_count', v_guest_attendance_count,
    'overlapping_attendance_session_count', v_overlapping_attendance_count
  );
END;
$$;

ALTER FUNCTION public.preview_guest_into_player_merge(uuid, uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.preview_guest_into_player_merge(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_guest_into_player_merge(uuid, uuid, uuid) TO authenticated;

-- 7.2 Atomic Guest-to-Player Merge Execution (`ID-02`, Condition 3)
-- Strictly atomic: if any validation, history update, or rating replay step fails,
-- the entire transaction rolls back so no partial identity or history changes remain.
CREATE OR REPLACE FUNCTION public.merge_guest_into_player(
  p_group_id uuid,
  p_source_guest_player_id uuid,
  p_target_permanent_player_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_source public.players%ROWTYPE;
  v_target public.players%ROWTYPE;
  v_conflicting_match_ids uuid[];
  v_dedup_session_ids uuid[];
  v_reattributed_session_ids uuid[];
  v_reattributed_match_slots jsonb;
  v_new_version_id uuid;
  v_target_seq bigint;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF pg_catalog.char_length(pg_catalog.btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'a reason of at least 3 characters is required to merge a guest profile'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_group_role(
    p_group_id,
    ARRAY['admin'::public.membership_role, 'owner'::public.membership_role]
  ) THEN
    RAISE EXCEPTION 'only an approved group admin or owner may merge a guest into a permanent player'
      USING ERRCODE = '42501';
  END IF;

  IF p_source_guest_player_id IS NULL OR p_target_permanent_player_id IS NULL
     OR p_source_guest_player_id = p_target_permanent_player_id THEN
    RAISE EXCEPTION 'distinct source guest UUID and target permanent player UUID are required'
      USING ERRCODE = '22023';
  END IF;

  -- Lock group and both player rows in deterministic UUID order
  PERFORM 1 FROM public.groups g WHERE g.id = p_group_id FOR UPDATE;
  PERFORM 1
    FROM public.players p
   WHERE p.group_id = p_group_id
     AND p.id IN (p_source_guest_player_id, p_target_permanent_player_id)
   ORDER BY p.id ASC
   FOR UPDATE;

  SELECT * INTO v_source
    FROM public.players p
   WHERE p.id = p_source_guest_player_id AND p.group_id = p_group_id;

  IF NOT FOUND OR v_source.is_guest IS DISTINCT FROM true OR v_source.merged_into_player_id IS NOT NULL THEN
    RAISE EXCEPTION 'source player must be an unmerged temporary guest in this group'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_target
    FROM public.players p
   WHERE p.id = p_target_permanent_player_id AND p.group_id = p_group_id;

  IF NOT FOUND OR v_target.is_guest IS DISTINCT FROM false OR v_target.merged_into_player_id IS NOT NULL THEN
    RAISE EXCEPTION 'target player must be an unmerged permanent player profile in this group'
      USING ERRCODE = '22023';
  END IF;

  -- Reject merge if both identities participated in the same match
  SELECT COALESCE(pg_catalog.array_agg(mp1.match_id), ARRAY[]::uuid[])
    INTO v_conflicting_match_ids
    FROM public.match_participants mp1
    JOIN public.match_participants mp2
      ON mp2.match_id = mp1.match_id
     AND mp2.group_id = mp1.group_id
   WHERE mp1.group_id = p_group_id
     AND mp1.player_id = p_source_guest_player_id
     AND mp2.player_id = p_target_permanent_player_id;

  IF COALESCE(pg_catalog.array_length(v_conflicting_match_ids, 1), 0) > 0 THEN
    RAISE EXCEPTION 'guest_merge_conflict: cannot merge guest % into player % because both participated in match(es): %',
      p_source_guest_player_id, p_target_permanent_player_id, v_conflicting_match_ids
      USING ERRCODE = '22023';
  END IF;

  -- Capture audit evidence before re-attributing records
  SELECT COALESCE(pg_catalog.array_agg(sa1.session_id), ARRAY[]::uuid[])
    INTO v_dedup_session_ids
    FROM public.session_attendees sa1
    JOIN public.session_attendees sa2
      ON sa2.session_id = sa1.session_id
     AND sa2.group_id = sa1.group_id
   WHERE sa1.group_id = p_group_id
     AND sa1.player_id = p_source_guest_player_id
     AND sa2.player_id = p_target_permanent_player_id;

  SELECT COALESCE(pg_catalog.array_agg(sa1.session_id), ARRAY[]::uuid[])
    INTO v_reattributed_session_ids
    FROM public.session_attendees sa1
   WHERE sa1.group_id = p_group_id
     AND sa1.player_id = p_source_guest_player_id
     AND NOT (sa1.session_id = ANY(v_dedup_session_ids));

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'match_id', mp.match_id,
        'team_side', mp.team_side,
        'slot_number', mp.slot_number
      )
      ORDER BY mp.match_id ASC
    ),
    '[]'::jsonb
  )
  INTO v_reattributed_match_slots
  FROM public.match_participants mp
  WHERE mp.group_id = p_group_id
    AND mp.player_id = p_source_guest_player_id;

  -- 1. Deduplicate overlapping session attendance where both attended the same session
  IF COALESCE(pg_catalog.array_length(v_dedup_session_ids, 1), 0) > 0 THEN
    DELETE FROM public.session_attendees
     WHERE group_id = p_group_id
       AND player_id = p_source_guest_player_id
       AND session_id = ANY(v_dedup_session_ids);
  END IF;

  -- 2. Re-attribute remaining session attendance to target permanent player
  UPDATE public.session_attendees
     SET player_id = p_target_permanent_player_id
   WHERE group_id = p_group_id
     AND player_id = p_source_guest_player_id;

  -- 3. Re-attribute historical match participations to target permanent player
  UPDATE public.match_participants
     SET player_id = p_target_permanent_player_id
   WHERE group_id = p_group_id
     AND player_id = p_source_guest_player_id;

  -- 4. Mark source guest profile as merged and inactive
  UPDATE public.players
     SET merged_into_player_id = p_target_permanent_player_id,
         is_active = false,
         updated_at = pg_catalog.clock_timestamp()
   WHERE id = p_source_guest_player_id
     AND group_id = p_group_id;

  -- 5. Increment required_match_state_seq and run atomic rating replay
  UPDATE public.groups
     SET required_match_state_seq = required_match_state_seq + 1,
         updated_at = pg_catalog.clock_timestamp()
   WHERE id = p_group_id
   RETURNING required_match_state_seq INTO v_target_seq;

  v_new_version_id := public.execute_group_rating_replay_internal(
    p_group_id,
    'guest_merged_into_player',
    v_caller_id,
    NULL
  );

  UPDATE public.groups
     SET published_rating_version_id = v_new_version_id,
         recalculation_status = 'idle'::public.recalculation_status,
         last_recalculation_error = NULL,
         updated_at = pg_catalog.clock_timestamp()
   WHERE id = p_group_id;

  INSERT INTO public.rating_recalculation_runs (
    group_id,
    target_match_state_seq,
    status,
    error_message,
    produced_rating_version_id,
    triggered_by_user_id,
    started_at,
    completed_at
  )
  VALUES (
    p_group_id,
    v_target_seq,
    'idle'::public.recalculation_status,
    NULL,
    v_new_version_id,
    v_caller_id,
    pg_catalog.clock_timestamp(),
    pg_catalog.clock_timestamp()
  );

  INSERT INTO public.audit_events (
    group_id,
    actor_user_id,
    action_type,
    entity_type,
    entity_id,
    reason,
    previous_state,
    new_state
  )
  VALUES (
    p_group_id,
    v_caller_id,
    'guest_merged_into_player',
    'player',
    p_source_guest_player_id,
    pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'source_guest_player_id', p_source_guest_player_id,
      'source_display_name', v_source.display_name,
      'is_active', true,
      'merged_into_player_id', NULL
    ),
    pg_catalog.jsonb_build_object(
      'source_guest_player_id', p_source_guest_player_id,
      'target_permanent_player_id', p_target_permanent_player_id,
      'target_display_name', v_target.display_name,
      'is_active', false,
      'deduplicated_attendance_session_ids', v_dedup_session_ids,
      'reattributed_attendance_session_ids', v_reattributed_session_ids,
      'reattributed_match_slots', v_reattributed_match_slots,
      'published_rating_version_id', v_new_version_id
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'source_guest_player_id', p_source_guest_player_id,
    'target_permanent_player_id', p_target_permanent_player_id,
    'deduplicated_attendance_count', COALESCE(pg_catalog.array_length(v_dedup_session_ids, 1), 0),
    'reattributed_attendance_count', COALESCE(pg_catalog.array_length(v_reattributed_session_ids, 1), 0),
    'reattributed_match_count', pg_catalog.jsonb_array_length(v_reattributed_match_slots),
    'published_rating_version_id', v_new_version_id
  );
END;
$$;

ALTER FUNCTION public.merge_guest_into_player(uuid, uuid, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.merge_guest_into_player(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_guest_into_player(uuid, uuid, uuid, text) TO authenticated;

COMMIT;
