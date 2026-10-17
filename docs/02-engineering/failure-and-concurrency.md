# Failure handling and concurrency

## Network/save failures
- Keep unsaved match data on screen.
- Show explicit unconfirmed/failed state.
- Retry safely with same submission ID for the same logical attempt.
- Never tell user save succeeded before server confirmation.
- New legitimate match receives new submission ID.

## Controller concurrency
- Server is authoritative for controller and session version.
- Only one controller writes at a time.
- Handover/takeover logged.
- Stale writes rejected and UI explains need to refresh/resume.
- Do not rely on frontend button disabling alone.

## Recalculation failure and publication states
- **State model (`Current`, `Recalculating`, `Stale/Failed`):**
  - Every authoritative match or identity mutation (completion, 10s undo, score correction, void, session time change affecting rated matches, or guest merge) increments `groups.required_match_state_seq`.
  - Each validated `rating_versions` row records the `match_state_seq` it was built from.
  - `groups.published_rating_version_id` points strictly to the latest validated `rating_versions` row.
  - Leaderboard, Player Profile, and Match Detail views derive the publication state from `groups.recalculation_status` (`idle`, `running`, `failed`) and `published_rating_version.match_state_seq` vs `groups.required_match_state_seq`:
    1. **Current:** `recalculation_status = 'idle'` AND `published_rating_version.match_state_seq = groups.required_match_state_seq`.
    2. **Recalculating:** `recalculation_status = 'running'`. Views display the last consistent published rating version accompanied by an explicit `"Results updating"` banner (text + icon).
    3. **Stale / Failed:** `recalculation_status = 'failed'` OR (`recalculation_status != 'running'` AND `published_rating_version.match_state_seq < groups.required_match_state_seq`). Views display the last consistent published rating version accompanied by an explicit `"Ratings out of date — recalculation required"` warning banner stating that displayed ratings do not yet reflect the latest match/correction, and provide a retry action for authorised admins/owners.
  - Views must **never** claim that published ratings reflect the latest authoritative match history when in `Recalculating` or `Stale/Failed` state.
- **Transaction boundaries & durable error reporting:**
  - Never assume an aborted outer PostgreSQL transaction can persist its own error status.
  - **Boundary 1 (Mutation + Savepoint Replay):** Inside the authoritative mutation RPC, the outer transaction locks the group row (`FOR UPDATE`), commits the match/correction record, writes its `audit_events` row, and increments `groups.required_match_state_seq`. The rating replay runs inside a nested PL/pgSQL `BEGIN ... EXCEPTION WHEN OTHERS THEN ... END;` block (which creates an implicit PostgreSQL `SAVEPOINT`).
    - If replay and invariant checks succeed, `groups.published_rating_version_id` is updated to the new version ID and `recalculation_status` is set to `'idle'`.
    - If replay throws any error, PostgreSQL automatically rolls back *only* the inner subtransaction (wiping all partial candidate rows in `rating_versions`, `player_rating_snapshots`, and `match_rating_changes`), while the outer transaction remains alive, sets `groups.recalculation_status = 'failed'`, records `last_recalculation_error = SQLERRM`, appends a `rating_recalculation_failed` audit event, and commits.
  - **Boundary 2 (Full Transaction Abort / Statement Timeout):**
    - If a statement timeout or connection drop kills the entire outer transaction during a match mutation, both the match write and the replay roll back cleanly; `published_rating_version_id` is unchanged and the client keeps the unsaved form in its unconfirmed retryable state (`MATCH-04`).
    - If a statement timeout kills a standalone admin `retry_rating_recalculation(group_id)` RPC, the database already holds `published_rating_version.match_state_seq < groups.required_match_state_seq` (so the UI remains in the `Stale/Failed` state), and the client invokes a lightweight fallback RPC `report_recalculation_timeout(group_id, error_message)` in a new transaction to record the timeout details in `audit_events` and set `recalculation_status = 'failed'`.

## Session finalization
- Every incomplete match must be completed or explicitly voided.
- No auto-close, even after stale warning.
- Cancellation of empty session requires reason/audit.
- Closed season late match warns recorder and triggers approved recalculation path if eligible.

## General failure UX
- Use clear text/icons, not colour alone.
- Preserve user input where safe.
- Distinguish request accepted, server-confirmed, failed, pending, recalculating, and stale/failed rating states.
- Notifications only after confirmed server-side event.
