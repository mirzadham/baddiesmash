-- ============================================================================
-- Migration: 20261018000001_phase1_foundation_schema_and_rls.sql
-- Phase 1: Local-only Supabase PostgreSQL Schema, Identity, Invitations,
--          Membership Lifecycle, Ownership Transfer, and Row Level Security.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Extensions & Schemas
-- ----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Custom Enumerated Types (snake_case)
-- ----------------------------------------------------------------------------
CREATE TYPE public.membership_role AS ENUM (
  'member',
  'recorder',
  'admin',
  'owner'
);

CREATE TYPE public.membership_status AS ENUM (
  'pending_approval',
  'approved',
  'rejected',
  'suspended',
  'departed'
);

CREATE TYPE public.profile_link_status AS ENUM (
  'unlinked',
  'pending_link_approval',
  'linked'
);

CREATE TYPE public.invitation_status AS ENUM (
  'pending',
  'redeemed',
  'revoked',
  'expired',
  'rejected'
);

CREATE TYPE public.session_status AS ENUM (
  'active',
  'completed',
  'reopened'
);

CREATE TYPE public.match_status AS ENUM (
  'incomplete',
  'completed',
  'voided'
);

CREATE TYPE public.team_side AS ENUM (
  'A',
  'B'
);

CREATE TYPE public.recalculation_status AS ENUM (
  'idle',
  'running',
  'failed'
);

-- ----------------------------------------------------------------------------
-- 3. Core Tables & Integrity Constraints
-- ----------------------------------------------------------------------------

-- 3.1 Groups
CREATE TABLE public.groups (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND pg_catalog.char_length(slug) BETWEEN 2 AND 64),
  name text NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(name)) BETWEEN 2 AND 100),
  timezone text NOT NULL DEFAULT 'Asia/Kuala_Lumpur' CHECK (pg_catalog.char_length(pg_catalog.btrim(timezone)) >= 2),
  default_k_factor integer NOT NULL DEFAULT 24 CHECK (default_k_factor IN (16, 24, 32)),
  current_rules_version text NOT NULL DEFAULT 'elo-v1-num10_4' CHECK (pg_catalog.char_length(pg_catalog.btrim(current_rules_version)) >= 3),
  required_match_state_seq bigint NOT NULL DEFAULT 0 CHECK (required_match_state_seq >= 0),
  published_rating_version_id uuid NULL,
  recalculation_status public.recalculation_status NOT NULL DEFAULT 'idle',
  last_recalculation_error text NULL,
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

-- 3.2 Players (Sporting Identity — distinct from login accounts)
CREATE TABLE public.players (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(display_name)) BETWEEN 1 AND 80),
  avatar_url text NULL CHECK (avatar_url IS NULL OR pg_catalog.char_length(pg_catalog.btrim(avatar_url)) <= 512),
  is_guest boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  merged_into_player_id uuid NULL,
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT players_id_group_unique UNIQUE (id, group_id),
  CONSTRAINT players_merged_into_same_group_fk FOREIGN KEY (merged_into_player_id, group_id)
    REFERENCES public.players(id, group_id),
  CONSTRAINT players_no_self_merge CHECK (merged_into_player_id IS NULL OR merged_into_player_id <> id),
  CONSTRAINT players_merged_must_be_guest_and_inactive CHECK (
    merged_into_player_id IS NULL OR (is_guest = true AND is_active = false)
  )
);

CREATE INDEX idx_players_group_active ON public.players (group_id, is_active, is_guest);

-- 3.3 Group Memberships (Account-to-Group Authorization & Optional Player Link)
CREATE TABLE public.group_memberships (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.membership_role NOT NULL DEFAULT 'member',
  status public.membership_status NOT NULL DEFAULT 'pending_approval',
  linked_player_id uuid NULL,
  requested_player_id uuid NULL,
  requested_new_player_name text NULL CHECK (
    requested_new_player_name IS NULL OR pg_catalog.char_length(pg_catalog.btrim(requested_new_player_name)) BETWEEN 1 AND 80
  ),
  profile_link_status public.profile_link_status NOT NULL DEFAULT 'unlinked',
  approved_by_user_id uuid NULL REFERENCES auth.users(id),
  approved_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT group_memberships_group_user_unique UNIQUE (group_id, user_id),
  CONSTRAINT group_memberships_linked_player_same_group_fk FOREIGN KEY (linked_player_id, group_id)
    REFERENCES public.players(id, group_id),
  CONSTRAINT group_memberships_requested_player_same_group_fk FOREIGN KEY (requested_player_id, group_id)
    REFERENCES public.players(id, group_id),
  CONSTRAINT group_memberships_link_consistency CHECK (
    (profile_link_status = 'linked' AND linked_player_id IS NOT NULL)
    OR (profile_link_status <> 'linked' AND linked_player_id IS NULL)
  ),
  CONSTRAINT group_memberships_owner_must_be_approved CHECK (
    role <> 'owner' OR status = 'approved'
  )
);

-- Enforce exactly one active Owner per group at the database level
CREATE UNIQUE INDEX idx_group_memberships_single_owner_per_group
  ON public.group_memberships (group_id)
  WHERE status = 'approved' AND role = 'owner';

-- Prevent two active/pending/suspended accounts from linking to the same player profile
CREATE UNIQUE INDEX idx_group_memberships_unique_linked_player
  ON public.group_memberships (group_id, linked_player_id)
  WHERE linked_player_id IS NOT NULL AND status IN ('pending_approval', 'approved', 'suspended');

CREATE INDEX idx_group_memberships_user_status ON public.group_memberships (user_id, status, group_id);

-- 3.4 Invitations (Cryptographic SHA-256 token_hash only; never raw token)
CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  invited_email_normalized text NOT NULL CHECK (
    invited_email_normalized = pg_catalog.lower(pg_catalog.btrim(invited_email_normalized))
    AND pg_catalog.strpos(invited_email_normalized, '@') > 1
    AND pg_catalog.char_length(invited_email_normalized) BETWEEN 3 AND 254
  ),
  intended_role public.membership_role NOT NULL DEFAULT 'member' CHECK (
    intended_role IN ('member', 'recorder', 'admin')
  ),
  proposed_player_id uuid NULL,
  status public.invitation_status NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  redeemed_by_user_id uuid NULL REFERENCES auth.users(id),
  redeemed_at timestamptz NULL,
  revoked_by_user_id uuid NULL REFERENCES auth.users(id),
  revoked_at timestamptz NULL,
  revoke_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT invitations_proposed_player_same_group_fk FOREIGN KEY (proposed_player_id, group_id)
    REFERENCES public.players(id, group_id),
  CONSTRAINT invitations_expiry_window CHECK (
    expires_at > created_at AND expires_at <= created_at + interval '7 days 5 minutes'
  ),
  CONSTRAINT invitations_redeemed_consistency CHECK (
    (status IN ('redeemed', 'rejected') AND redeemed_by_user_id IS NOT NULL AND redeemed_at IS NOT NULL)
    OR (status NOT IN ('redeemed', 'rejected') AND redeemed_by_user_id IS NULL AND redeemed_at IS NULL)
  ),
  CONSTRAINT invitations_revoked_consistency CHECK (
    (status = 'revoked' AND revoked_by_user_id IS NOT NULL AND revoked_at IS NOT NULL AND pg_catalog.char_length(pg_catalog.btrim(COALESCE(revoke_reason, ''))) >= 3)
    OR (status <> 'revoked')
  )
);

CREATE INDEX idx_invitations_group_status ON public.invitations (group_id, status, expires_at);

-- 3.5 Seasons (Stage 1 schema hook; Stage 2 UI)
CREATE TABLE public.seasons (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(name)) BETWEEN 1 AND 80),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NULL CHECK (ends_at IS NULL OR ends_at > starts_at),
  is_active boolean NOT NULL DEFAULT false,
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT seasons_id_group_unique UNIQUE (id, group_id)
);

CREATE UNIQUE INDEX idx_seasons_one_active_per_group
  ON public.seasons (group_id)
  WHERE is_active = true;

-- 3.6 Sessions
CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  season_id uuid NULL,
  status public.session_status NOT NULL DEFAULT 'active',
  session_started_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  session_ended_at timestamptz NULL,
  controller_user_id uuid NOT NULL REFERENCES auth.users(id),
  controller_lease_version bigint NOT NULL DEFAULT 1 CHECK (controller_lease_version >= 1),
  last_meaningful_activity_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT sessions_id_group_unique UNIQUE (id, group_id),
  CONSTRAINT sessions_season_same_group_fk FOREIGN KEY (season_id, group_id)
    REFERENCES public.seasons(id, group_id),
  CONSTRAINT sessions_ended_consistency CHECK (
    (status = 'completed' AND session_ended_at IS NOT NULL)
    OR (status IN ('active', 'reopened'))
  )
);

-- SES-01: Only one active or reopened session per group at a time
CREATE UNIQUE INDEX idx_sessions_one_active_per_group
  ON public.sessions (group_id)
  WHERE status IN ('active', 'reopened');

-- Canonical chronological ordering index for sessions (`DEC-015`)
CREATE INDEX idx_sessions_chronological_order
  ON public.sessions (group_id, session_started_at ASC, created_at ASC, id ASC);

-- 3.7 Session Attendees (ATT-01: Attendance distinct from match participation)
CREATE TABLE public.session_attendees (
  session_id uuid NOT NULL,
  group_id uuid NOT NULL,
  player_id uuid NOT NULL,
  added_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (session_id, player_id),
  CONSTRAINT session_attendees_session_same_group_fk FOREIGN KEY (session_id, group_id)
    REFERENCES public.sessions(id, group_id) ON DELETE CASCADE,
  CONSTRAINT session_attendees_player_same_group_fk FOREIGN KEY (player_id, group_id)
    REFERENCES public.players(id, group_id)
);

CREATE INDEX idx_session_attendees_group_player ON public.session_attendees (group_id, player_id);

-- 3.8 Matches
CREATE TABLE public.matches (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  sequence_number integer NULL CHECK (sequence_number IS NULL OR sequence_number >= 1),
  status public.match_status NOT NULL DEFAULT 'incomplete',
  team_a_score integer NULL,
  team_b_score integer NULL,
  is_disputed boolean NOT NULL DEFAULT false,
  client_submission_id uuid NOT NULL,
  recorded_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  completed_at timestamptz NULL,
  voided_at timestamptz NULL,
  void_reason text NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT matches_id_group_unique UNIQUE (id, group_id),
  CONSTRAINT matches_idempotent_submission_unique UNIQUE (group_id, client_submission_id),
  CONSTRAINT matches_session_sequence_unique UNIQUE (session_id, sequence_number),
  CONSTRAINT matches_session_same_group_fk FOREIGN KEY (session_id, group_id)
    REFERENCES public.sessions(id, group_id) ON DELETE CASCADE,
  CONSTRAINT matches_completed_score_valid CHECK (
    status <> 'completed'
    OR (
      sequence_number IS NOT NULL
      AND completed_at IS NOT NULL
      AND team_a_score IS NOT NULL
      AND team_b_score IS NOT NULL
      AND team_a_score >= 0
      AND team_b_score >= 0
      AND team_a_score <> team_b_score
      AND (
        (
          GREATEST(team_a_score, team_b_score) = 21
          AND GREATEST(team_a_score, team_b_score) - LEAST(team_a_score, team_b_score) >= 2
        )
        OR (
          GREATEST(team_a_score, team_b_score) BETWEEN 22 AND 29
          AND GREATEST(team_a_score, team_b_score) - LEAST(team_a_score, team_b_score) = 2
        )
        OR (
          GREATEST(team_a_score, team_b_score) = 30
          AND LEAST(team_a_score, team_b_score) IN (28, 29)
        )
      )
    )
  ),
  CONSTRAINT matches_voided_consistency CHECK (
    status <> 'voided'
    OR (voided_at IS NOT NULL AND pg_catalog.char_length(pg_catalog.btrim(COALESCE(void_reason, ''))) >= 3)
  )
);

CREATE INDEX idx_matches_session_seq ON public.matches (group_id, session_id, sequence_number ASC);

-- 3.9 Match Participants (MATCH-02: 4 slots, distinct players per match)
CREATE TABLE public.match_participants (
  match_id uuid NOT NULL,
  group_id uuid NOT NULL,
  team_side public.team_side NOT NULL,
  slot_number smallint NOT NULL CHECK (slot_number IN (1, 2)),
  player_id uuid NOT NULL,
  PRIMARY KEY (match_id, team_side, slot_number),
  CONSTRAINT match_participants_distinct_player_per_match UNIQUE (match_id, player_id),
  CONSTRAINT match_participants_match_same_group_fk FOREIGN KEY (match_id, group_id)
    REFERENCES public.matches(id, group_id) ON DELETE CASCADE,
  CONSTRAINT match_participants_player_same_group_fk FOREIGN KEY (player_id, group_id)
    REFERENCES public.players(id, group_id)
);

CREATE INDEX idx_match_participants_group_player ON public.match_participants (group_id, player_id);

-- 3.10 Rating Versions (`DEC-009`, `DEC-016`, `DEC-017`)
CREATE TABLE public.rating_versions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  season_id uuid NULL,
  match_state_seq bigint NOT NULL CHECK (match_state_seq >= 0),
  rules_version text NOT NULL DEFAULT 'elo-v1-num10_4',
  k_factor integer NOT NULL CHECK (k_factor IN (16, 24, 32)),
  baseline_rating numeric(10,4) NOT NULL DEFAULT 1000.0000,
  trigger_reason text NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(trigger_reason)) >= 2),
  triggered_by_user_id uuid NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT rating_versions_id_group_unique UNIQUE (id, group_id),
  CONSTRAINT rating_versions_season_same_group_fk FOREIGN KEY (season_id, group_id)
    REFERENCES public.seasons(id, group_id)
);

ALTER TABLE public.groups
  ADD CONSTRAINT groups_published_rating_version_same_group_fk
  FOREIGN KEY (published_rating_version_id, id)
  REFERENCES public.rating_versions(id, group_id);

CREATE INDEX idx_rating_versions_group_seq ON public.rating_versions (group_id, match_state_seq DESC);

-- 3.11 Player Rating Snapshots
CREATE TABLE public.player_rating_snapshots (
  rating_version_id uuid NOT NULL,
  group_id uuid NOT NULL,
  player_id uuid NOT NULL,
  rating numeric(10,4) NOT NULL DEFAULT 1000.0000,
  matches_played integer NOT NULL DEFAULT 0 CHECK (matches_played >= 0),
  wins integer NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses integer NOT NULL DEFAULT 0 CHECK (losses >= 0),
  is_provisional boolean NOT NULL DEFAULT true,
  PRIMARY KEY (rating_version_id, player_id),
  CONSTRAINT player_rating_snapshots_version_same_group_fk FOREIGN KEY (rating_version_id, group_id)
    REFERENCES public.rating_versions(id, group_id) ON DELETE CASCADE,
  CONSTRAINT player_rating_snapshots_player_same_group_fk FOREIGN KEY (player_id, group_id)
    REFERENCES public.players(id, group_id),
  CONSTRAINT player_rating_snapshots_wl_consistency CHECK (matches_played = wins + losses),
  CONSTRAINT player_rating_snapshots_provisional_threshold CHECK (is_provisional = (matches_played < 3))
);

CREATE INDEX idx_player_rating_snapshots_leaderboard
  ON public.player_rating_snapshots (rating_version_id, rating DESC, player_id ASC);

-- 3.12 Match Rating Changes
CREATE TABLE public.match_rating_changes (
  rating_version_id uuid NOT NULL,
  group_id uuid NOT NULL,
  match_id uuid NOT NULL,
  player_id uuid NOT NULL,
  team_side public.team_side NOT NULL,
  rating_before numeric(10,4) NOT NULL,
  rating_after numeric(10,4) NOT NULL,
  rating_delta numeric(10,4) NOT NULL,
  PRIMARY KEY (rating_version_id, match_id, player_id),
  CONSTRAINT match_rating_changes_version_same_group_fk FOREIGN KEY (rating_version_id, group_id)
    REFERENCES public.rating_versions(id, group_id) ON DELETE CASCADE,
  CONSTRAINT match_rating_changes_match_same_group_fk FOREIGN KEY (match_id, group_id)
    REFERENCES public.matches(id, group_id) ON DELETE CASCADE,
  CONSTRAINT match_rating_changes_player_same_group_fk FOREIGN KEY (player_id, group_id)
    REFERENCES public.players(id, group_id),
  CONSTRAINT match_rating_changes_exact_addition CHECK (rating_after = rating_before + rating_delta)
);

-- 3.13 Rating Recalculation Runs (Durable status/failure log)
CREATE TABLE public.rating_recalculation_runs (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  target_match_state_seq bigint NOT NULL CHECK (target_match_state_seq >= 0),
  status public.recalculation_status NOT NULL,
  error_message text NULL,
  produced_rating_version_id uuid NULL,
  triggered_by_user_id uuid NULL REFERENCES auth.users(id),
  started_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  completed_at timestamptz NULL,
  CONSTRAINT rating_recalculation_runs_version_same_group_fk FOREIGN KEY (produced_rating_version_id, group_id)
    REFERENCES public.rating_versions(id, group_id)
);

-- 3.14 Audit Events (Append-only)
CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id),
  action_type text NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(action_type)) BETWEEN 2 AND 80),
  entity_type text NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(entity_type)) BETWEEN 2 AND 80),
  entity_id uuid NOT NULL,
  reason text NULL,
  previous_state jsonb NULL,
  new_state jsonb NULL,
  metadata jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

CREATE INDEX idx_audit_events_group_created ON public.audit_events (group_id, created_at DESC);

-- Prevent mutation or deletion of audit_events rows
CREATE OR REPLACE FUNCTION public.prevent_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events are append-only and cannot be modified or deleted'
    USING ERRCODE = '42501';
END;
$$;

ALTER FUNCTION public.prevent_audit_event_mutation() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prevent_audit_event_mutation() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_audit_events_immutable
  BEFORE UPDATE OR DELETE ON public.audit_events
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_event_mutation();

-- ----------------------------------------------------------------------------
-- 4. Authorization Helper Functions (`SECURITY DEFINER`, `SET search_path = ''`)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_approved_group_member(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_memberships gm
    WHERE gm.group_id = p_group_id
      AND gm.user_id = auth.uid()
      AND gm.status = 'approved'::public.membership_status
  );
$$;

ALTER FUNCTION public.is_approved_group_member(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_approved_group_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_approved_group_member(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_group_role(
  p_group_id uuid,
  p_allowed_roles public.membership_role[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_memberships gm
    WHERE gm.group_id = p_group_id
      AND gm.user_id = auth.uid()
      AND gm.status = 'approved'::public.membership_status
      AND gm.role = ANY(p_allowed_roles)
  );
$$;

ALTER FUNCTION public.has_group_role(uuid, public.membership_role[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.has_group_role(uuid, public.membership_role[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_group_role(uuid, public.membership_role[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.hash_invitation_token(p_raw_token text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trimmed text;
BEGIN
  v_trimmed := pg_catalog.btrim(COALESCE(p_raw_token, ''));
  IF pg_catalog.char_length(v_trimmed) < 32 THEN
    RAISE EXCEPTION 'invitation token does not meet minimum entropy length requirement'
      USING ERRCODE = '22023';
  END IF;
  RETURN pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_trimmed, 'UTF8'), 'sha256'),
    'hex'
  );
END;
$$;

ALTER FUNCTION public.hash_invitation_token(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.hash_invitation_token(text) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. Default-Deny Table Privileges & Row Level Security Policies
-- ----------------------------------------------------------------------------

-- Revoke all default table privileges from PUBLIC, anon, and authenticated
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- Grant SELECT only to authenticated role; RLS policies enforce group & role visibility.
-- No direct INSERT, UPDATE, or DELETE is granted to anon or authenticated on any table.
GRANT SELECT ON
  public.groups,
  public.players,
  public.group_memberships,
  public.invitations,
  public.seasons,
  public.sessions,
  public.session_attendees,
  public.matches,
  public.match_participants,
  public.rating_versions,
  public.player_rating_snapshots,
  public.match_rating_changes,
  public.rating_recalculation_runs,
  public.audit_events
TO authenticated;

-- Enable and Force RLS on every table
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups FORCE ROW LEVEL SECURITY;

ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players FORCE ROW LEVEL SECURITY;

ALTER TABLE public.group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_memberships FORCE ROW LEVEL SECURITY;

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasons FORCE ROW LEVEL SECURITY;

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.session_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_attendees FORCE ROW LEVEL SECURITY;

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches FORCE ROW LEVEL SECURITY;

ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_participants FORCE ROW LEVEL SECURITY;

ALTER TABLE public.rating_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rating_versions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.player_rating_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_rating_snapshots FORCE ROW LEVEL SECURITY;

ALTER TABLE public.match_rating_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_rating_changes FORCE ROW LEVEL SECURITY;

ALTER TABLE public.rating_recalculation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rating_recalculation_runs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events FORCE ROW LEVEL SECURITY;

-- SELECT Policies:
-- 5.1 Groups: approved members of the group only
CREATE POLICY groups_select_approved_member
  ON public.groups
  FOR SELECT
  TO authenticated
  USING (public.is_approved_group_member(id));

-- 5.2 Players: approved members of the group only
CREATE POLICY players_select_approved_member
  ON public.players
  FOR SELECT
  TO authenticated
  USING (public.is_approved_group_member(group_id));

-- 5.3 Group Memberships: own row OR approved member of the group (no email column exists on table)
CREATE POLICY group_memberships_select_own_or_approved_member
  ON public.group_memberships
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_approved_group_member(group_id)
  );

-- 5.4 Invitations: PRIV-01 — ONLY approved admin/owner of the group can read invitations (protects invited emails)
CREATE POLICY invitations_select_admin_or_owner_only
  ON public.invitations
  FOR SELECT
  TO authenticated
  USING (
    public.has_group_role(
      group_id,
      ARRAY['admin'::public.membership_role, 'owner'::public.membership_role]
    )
  );

-- 5.5 Seasons, Sessions, Attendees, Matches, Participants, Ratings: approved members of the group only
CREATE POLICY seasons_select_approved_member
  ON public.seasons
  FOR SELECT
  TO authenticated
  USING (public.is_approved_group_member(group_id));

CREATE POLICY sessions_select_approved_member
  ON public.sessions
  FOR SELECT
  TO authenticated
  USING (public.is_approved_group_member(group_id));

CREATE POLICY session_attendees_select_approved_member
  ON public.session_attendees
  FOR SELECT
  TO authenticated
  USING (public.is_approved_group_member(group_id));

CREATE POLICY matches_select_approved_member
  ON public.matches
  FOR SELECT
  TO authenticated
  USING (public.is_approved_group_member(group_id));

CREATE POLICY match_participants_select_approved_member
  ON public.match_participants
  FOR SELECT
  TO authenticated
  USING (public.is_approved_group_member(group_id));

CREATE POLICY rating_versions_select_approved_member
  ON public.rating_versions
  FOR SELECT
  TO authenticated
  USING (public.is_approved_group_member(group_id));

CREATE POLICY player_rating_snapshots_select_approved_member
  ON public.player_rating_snapshots
  FOR SELECT
  TO authenticated
  USING (public.is_approved_group_member(group_id));

CREATE POLICY match_rating_changes_select_approved_member
  ON public.match_rating_changes
  FOR SELECT
  TO authenticated
  USING (public.is_approved_group_member(group_id));

CREATE POLICY rating_recalculation_runs_select_approved_member
  ON public.rating_recalculation_runs
  FOR SELECT
  TO authenticated
  USING (public.is_approved_group_member(group_id));

-- 5.6 Audit Events: approved admin/owner of the group only
CREATE POLICY audit_events_select_admin_or_owner_only
  ON public.audit_events
  FOR SELECT
  TO authenticated
  USING (
    public.has_group_role(
      group_id,
      ARRAY['admin'::public.membership_role, 'owner'::public.membership_role]
    )
  );

-- ----------------------------------------------------------------------------
-- 6. Phase 1 Trusted RPC Functions (`SECURITY DEFINER`, `SET search_path = ''`)
-- ----------------------------------------------------------------------------

-- 6.1 One-time Initial Group Bootstrap (`DEC-012`)
CREATE OR REPLACE FUNCTION public.bootstrap_initial_group(
  p_group_name text,
  p_group_slug text,
  p_owner_display_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_email_confirmed_at timestamptz;
  v_existing_group public.groups%ROWTYPE;
  v_group_id uuid;
  v_player_id uuid := NULL;
  v_membership_id uuid;
  v_initial_rating_version_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  SELECT u.email_confirmed_at
    INTO v_email_confirmed_at
    FROM auth.users u
   WHERE u.id = v_caller_id;

  IF v_email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'verified email address required to bootstrap group'
      USING ERRCODE = '42501';
  END IF;

  -- Lock groups table to prevent concurrent duplicate bootstrap
  LOCK TABLE public.groups IN EXCLUSIVE MODE;

  SELECT *
    INTO v_existing_group
    FROM public.groups g
   ORDER BY g.created_at ASC
   LIMIT 1;

  IF FOUND THEN
    IF v_existing_group.created_by_user_id = v_caller_id
       AND v_existing_group.slug = pg_catalog.lower(pg_catalog.btrim(p_group_slug)) THEN
      -- Safe idempotent return for original owner retry
      SELECT gm.id, gm.linked_player_id
        INTO v_membership_id, v_player_id
        FROM public.group_memberships gm
       WHERE gm.group_id = v_existing_group.id
         AND gm.user_id = v_caller_id;

      RETURN pg_catalog.jsonb_build_object(
        'group_id', v_existing_group.id,
        'membership_id', v_membership_id,
        'player_id', v_player_id,
        'idempotent_retry', true
      );
    END IF;

    RAISE EXCEPTION 'initial group bootstrap has already been completed and is now disabled'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.groups (
    slug,
    name,
    default_k_factor,
    created_by_user_id
  )
  VALUES (
    pg_catalog.lower(pg_catalog.btrim(p_group_slug)),
    pg_catalog.btrim(p_group_name),
    24,
    v_caller_id
  )
  RETURNING id INTO v_group_id;

  -- Create initial empty published rating version (match_state_seq = 0)
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
    v_group_id,
    NULL,
    0,
    'elo-v1-num10_4',
    24,
    1000.0000,
    'group_bootstrap',
    v_caller_id
  )
  RETURNING id INTO v_initial_rating_version_id;

  UPDATE public.groups
     SET published_rating_version_id = v_initial_rating_version_id
   WHERE id = v_group_id;

  IF p_owner_display_name IS NOT NULL AND pg_catalog.char_length(pg_catalog.btrim(p_owner_display_name)) > 0 THEN
    INSERT INTO public.players (
      group_id,
      display_name,
      is_guest,
      is_active,
      created_by_user_id
    )
    VALUES (
      v_group_id,
      pg_catalog.btrim(p_owner_display_name),
      false,
      true,
      v_caller_id
    )
    RETURNING id INTO v_player_id;
  END IF;

  INSERT INTO public.group_memberships (
    group_id,
    user_id,
    role,
    status,
    linked_player_id,
    profile_link_status,
    approved_by_user_id,
    approved_at
  )
  VALUES (
    v_group_id,
    v_caller_id,
    'owner'::public.membership_role,
    'approved'::public.membership_status,
    v_player_id,
    CASE
      WHEN v_player_id IS NOT NULL THEN 'linked'::public.profile_link_status
      ELSE 'unlinked'::public.profile_link_status
    END,
    v_caller_id,
    pg_catalog.clock_timestamp()
  )
  RETURNING id INTO v_membership_id;

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
    v_group_id,
    v_caller_id,
    'group_bootstrapped',
    'group',
    v_group_id,
    'Initial one-time group bootstrap',
    pg_catalog.jsonb_build_object(
      'slug', pg_catalog.lower(pg_catalog.btrim(p_group_slug)),
      'owner_membership_id', v_membership_id,
      'owner_player_id', v_player_id,
      'default_k_factor', 24
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'group_id', v_group_id,
    'membership_id', v_membership_id,
    'player_id', v_player_id,
    'idempotent_retry', false
  );
END;
$$;

ALTER FUNCTION public.bootstrap_initial_group(text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.bootstrap_initial_group(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_initial_group(text, text, text) TO authenticated;

-- 6.2 Issue Group Invitation (`AUTH-02`, `PRIV-01` — stores only SHA-256 hash, returns raw token once)
CREATE OR REPLACE FUNCTION public.issue_group_invitation(
  p_group_id uuid,
  p_invited_email text,
  p_intended_role public.membership_role DEFAULT 'member',
  p_proposed_player_id uuid DEFAULT NULL,
  p_expires_in_days integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role public.membership_role;
  v_normalized_email text;
  v_raw_token text;
  v_token_hash text;
  v_expires_at timestamptz;
  v_invitation_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  SELECT gm.role
    INTO v_caller_role
    FROM public.group_memberships gm
   WHERE gm.group_id = p_group_id
     AND gm.user_id = v_caller_id
     AND gm.status = 'approved'::public.membership_status;

  IF NOT FOUND OR v_caller_role NOT IN ('admin'::public.membership_role, 'owner'::public.membership_role) THEN
    RAISE EXCEPTION 'only an approved group admin or owner may issue invitations'
      USING ERRCODE = '42501';
  END IF;

  IF p_intended_role = 'owner'::public.membership_role THEN
    RAISE EXCEPTION 'owner role cannot be granted via invitation'
      USING ERRCODE = '22023';
  END IF;

  IF p_intended_role = 'admin'::public.membership_role AND v_caller_role <> 'owner'::public.membership_role THEN
    RAISE EXCEPTION 'only the group owner may issue an admin invitation'
      USING ERRCODE = '42501';
  END IF;

  IF p_expires_in_days < 1 OR p_expires_in_days > 7 THEN
    RAISE EXCEPTION 'invitation expiry must be between 1 and 7 days'
      USING ERRCODE = '22023';
  END IF;

  v_normalized_email := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_invited_email, '')));
  IF pg_catalog.strpos(v_normalized_email, '@') <= 1 THEN
    RAISE EXCEPTION 'invalid invited email address'
      USING ERRCODE = '22023';
  END IF;

  IF p_proposed_player_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.players p
      WHERE p.id = p_proposed_player_id
        AND p.group_id = p_group_id
        AND p.merged_into_player_id IS NULL
    ) THEN
      RAISE EXCEPTION 'proposed player profile does not exist in this group or is merged'
        USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.group_memberships gm
      WHERE gm.group_id = p_group_id
        AND gm.linked_player_id = p_proposed_player_id
        AND gm.status IN ('pending_approval'::public.membership_status, 'approved'::public.membership_status, 'suspended'::public.membership_status)
    ) THEN
      RAISE EXCEPTION 'proposed player profile is already linked to another member'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  -- Generate 256-bit (32-byte) cryptographically random hex token; store ONLY its SHA-256 hash
  v_raw_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');
  v_token_hash := public.hash_invitation_token(v_raw_token);
  v_expires_at := pg_catalog.clock_timestamp() + (p_expires_in_days || ' days')::interval;

  INSERT INTO public.invitations (
    group_id,
    token_hash,
    invited_email_normalized,
    intended_role,
    proposed_player_id,
    status,
    expires_at,
    created_by_user_id
  )
  VALUES (
    p_group_id,
    v_token_hash,
    v_normalized_email,
    p_intended_role,
    p_proposed_player_id,
    'pending'::public.invitation_status,
    v_expires_at,
    v_caller_id
  )
  RETURNING id INTO v_invitation_id;

  -- Audit log records metadata without exposing raw token or personal email
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
    'invitation_issued',
    'invitation',
    v_invitation_id,
    pg_catalog.jsonb_build_object(
      'intended_role', p_intended_role,
      'proposed_player_id', p_proposed_player_id,
      'expires_at', v_expires_at
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'invitation_id', v_invitation_id,
    'raw_token', v_raw_token,
    'expires_at', v_expires_at
  );
END;
$$;

ALTER FUNCTION public.issue_group_invitation(uuid, text, public.membership_role, uuid, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.issue_group_invitation(uuid, text, public.membership_role, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_group_invitation(uuid, text, public.membership_role, uuid, integer) TO authenticated;

-- 6.3 Revoke Group Invitation (`AUTH-02`)
CREATE OR REPLACE FUNCTION public.revoke_group_invitation(
  p_invitation_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_inv public.invitations%ROWTYPE;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF pg_catalog.char_length(pg_catalog.btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'revocation reason of at least 3 characters is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_inv
    FROM public.invitations i
   WHERE i.id = p_invitation_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_group_role(
    v_inv.group_id,
    ARRAY['admin'::public.membership_role, 'owner'::public.membership_role]
  ) THEN
    RAISE EXCEPTION 'only an approved group admin or owner may revoke invitations'
      USING ERRCODE = '42501';
  END IF;

  IF v_inv.status <> 'pending'::public.invitation_status THEN
    RAISE EXCEPTION 'only pending invitations can be revoked (current status: %)', v_inv.status
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.invitations
     SET status = 'revoked'::public.invitation_status,
         revoked_by_user_id = v_caller_id,
         revoked_at = pg_catalog.clock_timestamp(),
         revoke_reason = pg_catalog.btrim(p_reason),
         updated_at = pg_catalog.clock_timestamp()
   WHERE id = p_invitation_id;

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
    v_inv.group_id,
    v_caller_id,
    'invitation_revoked',
    'invitation',
    p_invitation_id,
    pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object('status', v_inv.status),
    pg_catalog.jsonb_build_object('status', 'revoked')
  );
END;
$$;

ALTER FUNCTION public.revoke_group_invitation(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.revoke_group_invitation(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_group_invitation(uuid, text) TO authenticated;

-- 6.4 Redeem Group Invitation (`AUTH-01`, `AUTH-02`, `ID-01`, `ID-02`)
-- Enforces verified email match, single-use, 7-day expiry, revocation check, and sets membership to pending_approval.
CREATE OR REPLACE FUNCTION public.redeem_group_invitation(
  p_raw_token text,
  p_requested_player_id uuid DEFAULT NULL,
  p_requested_new_player_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_email text;
  v_email_confirmed_at timestamptz;
  v_token_hash text;
  v_inv public.invitations%ROWTYPE;
  v_existing_membership public.group_memberships%ROWTYPE;
  v_target_player_id uuid;
  v_membership_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  SELECT u.email, u.email_confirmed_at
    INTO v_caller_email, v_email_confirmed_at
    FROM auth.users u
   WHERE u.id = v_caller_id;

  IF v_caller_email IS NULL OR v_email_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'a verified account email is required to redeem an invitation'
      USING ERRCODE = '42501';
  END IF;

  v_token_hash := public.hash_invitation_token(p_raw_token);

  SELECT *
    INTO v_inv
    FROM public.invitations i
   WHERE i.token_hash = v_token_hash
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid invitation token'
      USING ERRCODE = '42501';
  END IF;

  IF v_inv.status = 'revoked'::public.invitation_status THEN
    RAISE EXCEPTION 'invitation has been revoked'
      USING ERRCODE = '42501';
  END IF;

  IF v_inv.status IN ('redeemed'::public.invitation_status, 'rejected'::public.invitation_status) THEN
    RAISE EXCEPTION 'invitation has already been used'
      USING ERRCODE = '42501';
  END IF;

  IF v_inv.status = 'expired'::public.invitation_status OR v_inv.expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'invitation has expired'
      USING ERRCODE = '42501';
  END IF;

  IF pg_catalog.lower(pg_catalog.btrim(v_caller_email)) <> v_inv.invited_email_normalized THEN
    RAISE EXCEPTION 'authenticated account email does not match the invitation email'
      USING ERRCODE = '42501';
  END IF;

  IF p_requested_player_id IS NOT NULL AND p_requested_new_player_name IS NOT NULL THEN
    RAISE EXCEPTION 'cannot simultaneously request an existing player profile and a new player profile'
      USING ERRCODE = '22023';
  END IF;

  v_target_player_id := COALESCE(p_requested_player_id, v_inv.proposed_player_id);

  IF v_target_player_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.players p
      WHERE p.id = v_target_player_id
        AND p.group_id = v_inv.group_id
        AND p.merged_into_player_id IS NULL
    ) THEN
      RAISE EXCEPTION 'requested player profile does not exist in this group'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT *
    INTO v_existing_membership
    FROM public.group_memberships gm
   WHERE gm.group_id = v_inv.group_id
     AND gm.user_id = v_caller_id
   FOR UPDATE;

  IF FOUND THEN
    IF v_existing_membership.status IN ('approved'::public.membership_status, 'pending_approval'::public.membership_status, 'suspended'::public.membership_status) THEN
      RAISE EXCEPTION 'account already has an active or pending membership in this group'
        USING ERRCODE = '23505';
    END IF;

    -- Re-invited after previous rejection or departure: transition back to pending_approval
    UPDATE public.group_memberships
       SET role = v_inv.intended_role,
           status = 'pending_approval'::public.membership_status,
           linked_player_id = NULL,
           requested_player_id = v_target_player_id,
           requested_new_player_name = CASE
             WHEN v_target_player_id IS NULL AND p_requested_new_player_name IS NOT NULL
               THEN pg_catalog.btrim(p_requested_new_player_name)
             ELSE NULL
           END,
           profile_link_status = CASE
             WHEN v_target_player_id IS NOT NULL OR p_requested_new_player_name IS NOT NULL
               THEN 'pending_link_approval'::public.profile_link_status
             ELSE 'unlinked'::public.profile_link_status
           END,
           approved_by_user_id = NULL,
           approved_at = NULL,
           updated_at = pg_catalog.clock_timestamp()
     WHERE id = v_existing_membership.id
     RETURNING id INTO v_membership_id;
  ELSE
    INSERT INTO public.group_memberships (
      group_id,
      user_id,
      role,
      status,
      linked_player_id,
      requested_player_id,
      requested_new_player_name,
      profile_link_status
    )
    VALUES (
      v_inv.group_id,
      v_caller_id,
      v_inv.intended_role,
      'pending_approval'::public.membership_status,
      NULL,
      v_target_player_id,
      CASE
        WHEN v_target_player_id IS NULL AND p_requested_new_player_name IS NOT NULL
          THEN pg_catalog.btrim(p_requested_new_player_name)
        ELSE NULL
      END,
      CASE
        WHEN v_target_player_id IS NOT NULL OR p_requested_new_player_name IS NOT NULL
          THEN 'pending_link_approval'::public.profile_link_status
        ELSE 'unlinked'::public.profile_link_status
      END
    )
    RETURNING id INTO v_membership_id;
  END IF;

  UPDATE public.invitations
     SET status = 'redeemed'::public.invitation_status,
         redeemed_by_user_id = v_caller_id,
         redeemed_at = pg_catalog.clock_timestamp(),
         updated_at = pg_catalog.clock_timestamp()
   WHERE id = v_inv.id;

  INSERT INTO public.audit_events (
    group_id,
    actor_user_id,
    action_type,
    entity_type,
    entity_id,
    new_state
  )
  VALUES (
    v_inv.group_id,
    v_caller_id,
    'invitation_redeemed',
    'membership',
    v_membership_id,
    pg_catalog.jsonb_build_object(
      'invitation_id', v_inv.id,
      'membership_status', 'pending_approval',
      'intended_role', v_inv.intended_role,
      'requested_player_id', v_target_player_id
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'membership_id', v_membership_id,
    'group_id', v_inv.group_id,
    'status', 'pending_approval'
  );
END;
$$;

ALTER FUNCTION public.redeem_group_invitation(text, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.redeem_group_invitation(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_group_invitation(text, uuid, text) TO authenticated;

-- 6.5 Approve or Reject Pending Membership (`AUTH-01`, `AUTH-03`, `ID-01`, `ID-02`)
-- Never links by display name alone: links only by explicit UUID or creates a new permanent player profile.
CREATE OR REPLACE FUNCTION public.decide_membership_request(
  p_membership_id uuid,
  p_decision text,
  p_reason text DEFAULT NULL,
  p_linked_player_id uuid DEFAULT NULL,
  p_create_new_player boolean DEFAULT false,
  p_new_player_display_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role public.membership_role;
  v_mem public.group_memberships%ROWTYPE;
  v_resolved_player_id uuid := NULL;
  v_new_player_name text;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_mem
    FROM public.group_memberships gm
   WHERE gm.id = p_membership_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership request not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT gm.role
    INTO v_caller_role
    FROM public.group_memberships gm
   WHERE gm.group_id = v_mem.group_id
     AND gm.user_id = v_caller_id
     AND gm.status = 'approved'::public.membership_status;

  IF NOT FOUND OR v_caller_role NOT IN ('admin'::public.membership_role, 'owner'::public.membership_role) THEN
    RAISE EXCEPTION 'only an approved group admin or owner may decide membership requests'
      USING ERRCODE = '42501';
  END IF;

  IF v_mem.role = 'admin'::public.membership_role AND v_caller_role <> 'owner'::public.membership_role THEN
    RAISE EXCEPTION 'only the group owner may approve or reject an admin membership'
      USING ERRCODE = '42501';
  END IF;

  IF v_mem.status <> 'pending_approval'::public.membership_status THEN
    RAISE EXCEPTION 'membership is not pending approval (current status: %)', v_mem.status
      USING ERRCODE = '22023';
  END IF;

  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'decision must be approve or reject'
      USING ERRCODE = '22023';
  END IF;

  IF p_decision = 'reject' THEN
    UPDATE public.group_memberships
       SET status = 'rejected'::public.membership_status,
           linked_player_id = NULL,
           profile_link_status = 'unlinked'::public.profile_link_status,
           updated_at = pg_catalog.clock_timestamp()
     WHERE id = p_membership_id;

    -- Mark the redeemed invitation as rejected so a fresh invitation can be issued later if desired
    UPDATE public.invitations
       SET status = 'rejected'::public.invitation_status,
           updated_at = pg_catalog.clock_timestamp()
     WHERE group_id = v_mem.group_id
       AND redeemed_by_user_id = v_mem.user_id
       AND status = 'redeemed'::public.invitation_status;

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
      v_mem.group_id,
      v_caller_id,
      'membership_rejected',
      'membership',
      p_membership_id,
      p_reason,
      pg_catalog.jsonb_build_object('status', v_mem.status),
      pg_catalog.jsonb_build_object('status', 'rejected')
    );

    RETURN pg_catalog.jsonb_build_object(
      'membership_id', p_membership_id,
      'status', 'rejected',
      'linked_player_id', NULL
    );
  END IF;

  -- Approve path:
  IF p_linked_player_id IS NOT NULL AND p_create_new_player THEN
    RAISE EXCEPTION 'cannot both link an existing player ID and create a new player profile'
      USING ERRCODE = '22023';
  END IF;

  IF p_create_new_player THEN
    v_new_player_name := pg_catalog.btrim(COALESCE(p_new_player_display_name, v_mem.requested_new_player_name, ''));
    IF pg_catalog.char_length(v_new_player_name) < 1 THEN
      RAISE EXCEPTION 'new player display name is required when creating a player profile'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.players (
      group_id,
      display_name,
      is_guest,
      is_active,
      created_by_user_id
    )
    VALUES (
      v_mem.group_id,
      v_new_player_name,
      false,
      true,
      v_caller_id
    )
    RETURNING id INTO v_resolved_player_id;
  ELSIF p_linked_player_id IS NOT NULL THEN
    -- Explicit UUID link confirmed by Admin/Owner
    IF NOT EXISTS (
      SELECT 1
      FROM public.players p
      WHERE p.id = p_linked_player_id
        AND p.group_id = v_mem.group_id
        AND p.merged_into_player_id IS NULL
    ) THEN
      RAISE EXCEPTION 'target player profile does not exist in this group or is merged'
        USING ERRCODE = '22023';
    END IF;
    v_resolved_player_id := p_linked_player_id;
  ELSE
    -- Approved as Viewer without player profile (or profile link left unconfirmed)
    v_resolved_player_id := NULL;
  END IF;

  UPDATE public.group_memberships
     SET status = 'approved'::public.membership_status,
         linked_player_id = v_resolved_player_id,
         profile_link_status = CASE
           WHEN v_resolved_player_id IS NOT NULL THEN 'linked'::public.profile_link_status
           ELSE 'unlinked'::public.profile_link_status
         END,
         approved_by_user_id = v_caller_id,
         approved_at = pg_catalog.clock_timestamp(),
         updated_at = pg_catalog.clock_timestamp()
   WHERE id = p_membership_id;

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
    v_mem.group_id,
    v_caller_id,
    'membership_approved',
    'membership',
    p_membership_id,
    p_reason,
    pg_catalog.jsonb_build_object('status', v_mem.status),
    pg_catalog.jsonb_build_object(
      'status', 'approved',
      'role', v_mem.role,
      'linked_player_id', v_resolved_player_id,
      'created_new_player', p_create_new_player
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'membership_id', p_membership_id,
    'status', 'approved',
    'linked_player_id', v_resolved_player_id
  );
END;
$$;

ALTER FUNCTION public.decide_membership_request(uuid, text, text, uuid, boolean, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.decide_membership_request(uuid, text, text, uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_membership_request(uuid, text, text, uuid, boolean, text) TO authenticated;

-- 6.6 Explicit Admin/Owner Account-to-Player Profile Linking (`ID-01`, `ID-02`)
CREATE OR REPLACE FUNCTION public.link_member_player_profile(
  p_membership_id uuid,
  p_player_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_mem public.group_memberships%ROWTYPE;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF pg_catalog.char_length(pg_catalog.btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'a reason of at least 3 characters is required to link or relink a player profile'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_mem
    FROM public.group_memberships gm
   WHERE gm.id = p_membership_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_group_role(
    v_mem.group_id,
    ARRAY['admin'::public.membership_role, 'owner'::public.membership_role]
  ) THEN
    RAISE EXCEPTION 'only an approved group admin or owner may link player profiles'
      USING ERRCODE = '42501';
  END IF;

  IF p_player_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.players p
      WHERE p.id = p_player_id
        AND p.group_id = v_mem.group_id
        AND p.merged_into_player_id IS NULL
    ) THEN
      RAISE EXCEPTION 'player profile does not exist in this group or has been merged'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.group_memberships
     SET linked_player_id = p_player_id,
         profile_link_status = CASE
           WHEN p_player_id IS NOT NULL THEN 'linked'::public.profile_link_status
           ELSE 'unlinked'::public.profile_link_status
         END,
         updated_at = pg_catalog.clock_timestamp()
   WHERE id = p_membership_id;

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
    v_mem.group_id,
    v_caller_id,
    'member_profile_linked',
    'membership',
    p_membership_id,
    pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object('linked_player_id', v_mem.linked_player_id),
    pg_catalog.jsonb_build_object('linked_player_id', p_player_id)
  );
END;
$$;

ALTER FUNCTION public.link_member_player_profile(uuid, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.link_member_player_profile(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_member_player_profile(uuid, uuid, text) TO authenticated;

-- 6.7 Update Member Role or Status (`AUTH-03`)
CREATE OR REPLACE FUNCTION public.update_membership_role_or_status(
  p_membership_id uuid,
  p_new_role public.membership_role,
  p_new_status public.membership_status,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role public.membership_role;
  v_mem public.group_memberships%ROWTYPE;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF pg_catalog.char_length(pg_catalog.btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'a reason of at least 3 characters is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_mem
    FROM public.group_memberships gm
   WHERE gm.id = p_membership_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT gm.role
    INTO v_caller_role
    FROM public.group_memberships gm
   WHERE gm.group_id = v_mem.group_id
     AND gm.user_id = v_caller_id
     AND gm.status = 'approved'::public.membership_status;

  IF NOT FOUND OR v_caller_role NOT IN ('admin'::public.membership_role, 'owner'::public.membership_role) THEN
    RAISE EXCEPTION 'only an approved group admin or owner may update memberships'
      USING ERRCODE = '42501';
  END IF;

  IF v_mem.role = 'owner'::public.membership_role OR p_new_role = 'owner'::public.membership_role THEN
    RAISE EXCEPTION 'ownership changes must use transfer_group_ownership'
      USING ERRCODE = '42501';
  END IF;

  IF (v_mem.role = 'admin'::public.membership_role OR p_new_role = 'admin'::public.membership_role)
     AND v_caller_role <> 'owner'::public.membership_role THEN
    RAISE EXCEPTION 'only the group owner may appoint, modify, or demote admins'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.group_memberships
     SET role = p_new_role,
         status = p_new_status,
         updated_at = pg_catalog.clock_timestamp()
   WHERE id = p_membership_id;

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
    v_mem.group_id,
    v_caller_id,
    'membership_role_or_status_updated',
    'membership',
    p_membership_id,
    pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object('role', v_mem.role, 'status', v_mem.status),
    pg_catalog.jsonb_build_object('role', p_new_role, 'status', p_new_status)
  );
END;
$$;

ALTER FUNCTION public.update_membership_role_or_status(uuid, public.membership_role, public.membership_status, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.update_membership_role_or_status(uuid, public.membership_role, public.membership_status, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_membership_role_or_status(uuid, public.membership_role, public.membership_status, text) TO authenticated;

-- 6.8 Atomic Ownership Transfer (`AUTH-03`)
CREATE OR REPLACE FUNCTION public.transfer_group_ownership(
  p_group_id uuid,
  p_new_owner_membership_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_current_owner_mem public.group_memberships%ROWTYPE;
  v_target_mem public.group_memberships%ROWTYPE;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF pg_catalog.char_length(pg_catalog.btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'ownership transfer requires a reason of at least 3 characters'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_current_owner_mem
    FROM public.group_memberships gm
   WHERE gm.group_id = p_group_id
     AND gm.user_id = v_caller_id
     AND gm.status = 'approved'::public.membership_status
     AND gm.role = 'owner'::public.membership_role
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'only the current approved group owner may transfer ownership'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_target_mem
    FROM public.group_memberships gm
   WHERE gm.id = p_new_owner_membership_id
     AND gm.group_id = p_group_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'target membership not found in this group'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_target_mem.id = v_current_owner_mem.id THEN
    RAISE EXCEPTION 'caller is already the group owner'
      USING ERRCODE = '22023';
  END IF;

  IF v_target_mem.status <> 'approved'::public.membership_status THEN
    RAISE EXCEPTION 'new owner must be an approved member of the group'
      USING ERRCODE = '22023';
  END IF;

  -- Step 1: Demote current owner to admin first so the partial unique index
  -- `idx_group_memberships_single_owner_per_group` is satisfied throughout the transaction
  UPDATE public.group_memberships
     SET role = 'admin'::public.membership_role,
         updated_at = pg_catalog.clock_timestamp()
   WHERE id = v_current_owner_mem.id;

  -- Step 2: Promote target membership to owner
  UPDATE public.group_memberships
     SET role = 'owner'::public.membership_role,
         updated_at = pg_catalog.clock_timestamp()
   WHERE id = v_target_mem.id;

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
    'ownership_transferred',
    'group',
    p_group_id,
    pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object(
      'previous_owner_membership_id', v_current_owner_mem.id,
      'previous_owner_user_id', v_current_owner_mem.user_id,
      'target_previous_role', v_target_mem.role
    ),
    pg_catalog.jsonb_build_object(
      'new_owner_membership_id', v_target_mem.id,
      'new_owner_user_id', v_target_mem.user_id,
      'previous_owner_new_role', 'admin'
    )
  );
END;
$$;

ALTER FUNCTION public.transfer_group_ownership(uuid, uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.transfer_group_ownership(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_group_ownership(uuid, uuid, text) TO authenticated;

-- 6.9 Create Permanent Player or Temporary Guest (`ID-01`, `ID-02`)
-- Duplicate display names are allowed and given distinct UUIDs; never auto-merges by name.
CREATE OR REPLACE FUNCTION public.create_player_profile(
  p_group_id uuid,
  p_display_name text,
  p_is_guest boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_player_id uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF p_is_guest THEN
    IF NOT public.has_group_role(
      p_group_id,
      ARRAY[
        'recorder'::public.membership_role,
        'admin'::public.membership_role,
        'owner'::public.membership_role
      ]
    ) THEN
      RAISE EXCEPTION 'only an approved recorder, admin, or owner may create a temporary guest'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.has_group_role(
      p_group_id,
      ARRAY[
        'admin'::public.membership_role,
        'owner'::public.membership_role
      ]
    ) THEN
      RAISE EXCEPTION 'only an approved admin or owner may create a permanent player profile'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.players (
    group_id,
    display_name,
    is_guest,
    is_active,
    created_by_user_id
  )
  VALUES (
    p_group_id,
    pg_catalog.btrim(p_display_name),
    p_is_guest,
    true,
    v_caller_id
  )
  RETURNING id INTO v_player_id;

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
    CASE WHEN p_is_guest THEN 'guest_player_created' ELSE 'permanent_player_created' END,
    'player',
    v_player_id,
    pg_catalog.jsonb_build_object(
      'display_name', pg_catalog.btrim(p_display_name),
      'is_guest', p_is_guest
    )
  );

  RETURN v_player_id;
END;
$$;

ALTER FUNCTION public.create_player_profile(uuid, text, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_player_profile(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_player_profile(uuid, text, boolean) TO authenticated;

-- 6.10 Set Player Active/Inactive Status (`ID-01`)
CREATE OR REPLACE FUNCTION public.set_player_active_status(
  p_player_id uuid,
  p_is_active boolean,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid;
  v_player public.players%ROWTYPE;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF pg_catalog.char_length(pg_catalog.btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'a reason of at least 3 characters is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_player
    FROM public.players p
   WHERE p.id = p_player_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'player profile not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_group_role(
    v_player.group_id,
    ARRAY['admin'::public.membership_role, 'owner'::public.membership_role]
  ) THEN
    RAISE EXCEPTION 'only an approved group admin or owner may change player active status'
      USING ERRCODE = '42501';
  END IF;

  IF v_player.merged_into_player_id IS NOT NULL AND p_is_active = true THEN
    RAISE EXCEPTION 'cannot reactivate a merged guest profile'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.players
     SET is_active = p_is_active,
         updated_at = pg_catalog.clock_timestamp()
   WHERE id = p_player_id;

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
    v_player.group_id,
    v_caller_id,
    'player_active_status_updated',
    'player',
    p_player_id,
    pg_catalog.btrim(p_reason),
    pg_catalog.jsonb_build_object('is_active', v_player.is_active),
    pg_catalog.jsonb_build_object('is_active', p_is_active)
  );
END;
$$;

ALTER FUNCTION public.set_player_active_status(uuid, boolean, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.set_player_active_status(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_player_active_status(uuid, boolean, text) TO authenticated;

-- 6.11 Admin-Only Membership Directory with Account Email (`PRIV-01`)
-- Ordinary members and recorders are strictly denied access to account emails.
CREATE OR REPLACE FUNCTION public.list_group_memberships_for_admin(
  p_group_id uuid
)
RETURNS TABLE (
  membership_id uuid,
  user_id uuid,
  account_email text,
  role public.membership_role,
  status public.membership_status,
  linked_player_id uuid,
  requested_player_id uuid,
  requested_new_player_name text,
  profile_link_status public.profile_link_status,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_group_role(
    p_group_id,
    ARRAY['admin'::public.membership_role, 'owner'::public.membership_role]
  ) THEN
    RAISE EXCEPTION 'only an approved group admin or owner may access member account emails'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    gm.id AS membership_id,
    gm.user_id,
    u.email::text AS account_email,
    gm.role,
    gm.status,
    gm.linked_player_id,
    gm.requested_player_id,
    gm.requested_new_player_name,
    gm.profile_link_status,
    gm.created_at
  FROM public.group_memberships gm
  JOIN auth.users u ON u.id = gm.user_id
  WHERE gm.group_id = p_group_id
  ORDER BY gm.created_at ASC;
END;
$$;

ALTER FUNCTION public.list_group_memberships_for_admin(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_group_memberships_for_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_group_memberships_for_admin(uuid) TO authenticated;

COMMIT;
