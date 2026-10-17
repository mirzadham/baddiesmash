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
- Stable session sequence number orders matches within session.
- Define a deterministic cross-session ordering for all-time and season replay; same-time ties cannot be left ambiguous.
- Correction triggers replay of all affected histories in that deterministic order.
- Use transaction or versioned recalculation approach based on evidence; invariant is atomic publication of a consistent result set.
- Recalculate identity merges and rating changes in a controlled transaction or versioned process.
- Build rating version tied to match-data state and calculation-rules version.
