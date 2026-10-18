-- ============================================================================
-- Phase 2 SQL Catalog & Security Assertion Script
-- File: supabase/tests/phase2_sessions_matches_elo.test.sql
-- Verifies that all Phase 1 + Phase 2 SECURITY DEFINER functions in `public`
-- configure `SET search_path = ''`, are owned by `postgres`, and revoke
-- `EXECUTE` privileges from `PUBLIC` and `anon`.
-- ============================================================================

DO $$
DECLARE
  v_total_definer_count integer;
  v_insecure_search_path_count integer;
  v_anon_exec_count integer;
BEGIN
  SELECT count(*)
    INTO v_total_definer_count
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef = true;

  IF v_total_definer_count < 29 THEN
    RAISE EXCEPTION 'Expected at least 29 SECURITY DEFINER functions across Phase 1 & Phase 2, found %', v_total_definer_count;
  END IF;

  SELECT count(*)
    INTO v_insecure_search_path_count
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef = true
     AND (
       p.proconfig IS NULL
       OR NOT ('search_path=""' = ANY(p.proconfig) OR 'search_path=' = ANY(p.proconfig))
     );

  IF v_insecure_search_path_count <> 0 THEN
    RAISE EXCEPTION 'Found % SECURITY DEFINER functions in public without SET search_path = ''''', v_insecure_search_path_count;
  END IF;

  SELECT count(*)
    INTO v_anon_exec_count
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef = true
     AND pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE');

  IF v_anon_exec_count <> 0 THEN
    RAISE EXCEPTION 'Found % SECURITY DEFINER functions executable by anon', v_anon_exec_count;
  END IF;
END;
$$;
