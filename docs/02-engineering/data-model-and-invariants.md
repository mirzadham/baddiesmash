# Logical data model and invariants

This is an approved logical entity baseline, not a frozen physical schema. Agent must propose actual tables, constraints, indexes, and transaction boundaries after inspecting repository and current platform capabilities.

## Logical entities
- Identity/access: Groups, Accounts (auth provider), Memberships, Player profiles, Account-player links, Invitations, Recorder permissions.
- Activity: Seasons, Sessions, Attendance, Matches, Match participants, Recorder handovers.
- Ratings: Rating versions, Player rating snapshots, Match rating changes, Recalculation jobs/state.
- Governance: Disputes, Dispute comments, Notifications, Audit events.
- Additional support entities only when justified by workflows.

## Match record baseline
Fields/concepts:
- ID, group ID, session ID, per-session sequence number.
- Team A/B scores, status (`incomplete`, `completed`, `voided`); dispute is separate state/relationship.
- Recorded-by actor, created/updated/finalized timestamps, stable submission ID.
- Exactly four distinct participant profiles linked to teams.
- Correction reason/history and audit events.

## Required invariants
- Every relevant record is group-scoped and cannot be accessed across groups.
- One active session per group.
- One active session controller at a time; reject stale controller writes.
- Exactly four distinct players in a completed doubles match.
- Score must satisfy first-to-21, lead-by-2, cap-30 rules.
- Unique idempotency/submission ID for a logical match submission.
- Stable sequence number assigned when match finalizes in a session.
- Incomplete and voided matches remain auditable but excluded from official stats/ratings.
- Attendance is separate from match participation.
- Session season assignment is fixed at session creation.
- Ratings/statistics are derived from eligible matches and rebuildable.
- Correction, merge and recalculation must not expose partial state.
- Identity merges preserve records and are auditable/reversible.
- RLS enabled and tested for all exposed tables/views.
- Audit data records actor, timestamp, affected entity, action, required reason and relevant before/after values; avoid secrets/unnecessary personal data.
- Normal operations do not silently rewrite append-only audit history.

## Ordering and transactions
- Immutable per-session `sequence_number` (assigned when a match transitions to `completed`, never reused or inserted into) orders matches within a session. Forgotten matches added to a reopened session in Stage 1 are appended at `MAX(sequence_number) + 1`.
- Cross-session and intra-session chronological replay uses the strict total-order tuple:
  `(sessions.session_started_at ASC, sessions.created_at ASC, sessions.id ASC, matches.sequence_number ASC)`.
- Every authoritative match-history mutation (match completion, 10s undo, score correction, void, session time change affecting rated matches, or guest merge) increments `groups.required_match_state_seq`.
- Each published `rating_version` records the `match_state_seq` and `rules_version` it was built from.
- Replay executes inside a subtransaction savepoint (`BEGIN ... EXCEPTION WHEN OTHERS`) so any calculation failure rolls back partial candidate rating rows while the outer transaction commits the match mutation, preserves the previous `groups.published_rating_version_id`, and records `recalculation_status = 'failed'`.
- Readers compare `published_rating_version.match_state_seq` against `groups.required_match_state_seq` and `groups.recalculation_status` to surface `Current`, `Recalculating`, or `Stale/Failed` states accurately.
