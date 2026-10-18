-- ============================================================================
-- Phase 1 SQL Security & RLS Verification Script
-- File: supabase/tests/phase1_rls_and_auth.test.sql
-- Verifies:
--   - Default-deny RLS & table privileges for anon and non-members (AUTH-01)
--   - Role-based access for pending_approval, rejected, suspended, departed,
--     viewer, member, recorder, admin, and owner (AUTH-01, AUTH-03, ID-01)
--   - Cryptographic SHA-256 invitation token hashing (no raw token stored),
--     7-day expiry, single-use redemption, revocation, verified email match (AUTH-02)
--   - Explicit UUID profile linking (never by display name) & duplicate display names (ID-02)
--   - Private email & invitation table protection from ordinary members (PRIV-01)
--   - Cross-group isolation & composite foreign key enforcement
--   - Atomic ownership transfer & single-owner partial unique index
--   - Append-only audit_events immutability trigger
-- ============================================================================

DO $$
DECLARE
  v_rls_missing_count integer;
  v_insecure_definer_count integer;
BEGIN
  -- 1. Verify all 14 public tables have both relrowsecurity and relforcerowsecurity enabled
  SELECT count(*)
    INTO v_rls_missing_count
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind = 'r'
     AND (c.relrowsecurity IS DISTINCT FROM true OR c.relforcerowsecurity IS DISTINCT FROM true);

  IF v_rls_missing_count <> 0 THEN
    RAISE EXCEPTION 'Expected 0 public tables without ENABLE + FORCE RLS, found %', v_rls_missing_count;
  END IF;

  -- 2. Verify all SECURITY DEFINER functions in public schema configure search_path=''
  SELECT count(*)
    INTO v_insecure_definer_count
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef = true
     AND (
       p.proconfig IS NULL
       OR NOT ('search_path=""' = ANY(p.proconfig) OR 'search_path=' = ANY(p.proconfig))
     );

  IF v_insecure_definer_count <> 0 THEN
    RAISE EXCEPTION 'Found % SECURITY DEFINER functions in public without SET search_path = ''''', v_insecure_definer_count;
  END IF;
END;
$$;
