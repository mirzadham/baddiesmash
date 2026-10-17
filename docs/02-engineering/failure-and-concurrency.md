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

## Recalculation failure
- Preserve last consistent published rating version.
- Show “Results updating” during calculation and explicit failure/retry if it fails.
- Validate a new version before atomic publication.
- Do not silently discard correction; maintain correction record and retryable recalculation state.
- Avoid partial leaderboard publication.

## Session finalization
- Every incomplete match must be completed or explicitly voided.
- No auto-close, even after stale warning.
- Cancellation of empty session requires reason/audit.
- Closed season late match warns recorder and triggers approved recalculation path if eligible.

## General failure UX
- Use clear text/icons, not colour alone.
- Preserve user input where safe.
- Distinguish request accepted, server-confirmed, failed, pending and stale states.
- Notifications only after confirmed server-side event.
