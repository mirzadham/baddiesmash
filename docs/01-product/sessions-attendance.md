# Sessions and attendance

## Session creation
- One active session per group.
- Start flow selects attendees and creates session in one streamlined operation.
- Date/time defaults to current Malaysia local date/time and is editable before creation.
- Use `Asia/Kuala_Lumpur`; store timestamps consistently in UTC where appropriate.
- Assign the active season at creation. Assignment remains fixed. If no active season exists, session contributes to all-time only.
- If a session has no matches, recorder may cancel with reason and audit record.
- Opening the app with an active session surfaces it with Resume and status review.

## Attendance
- Select attendees before first match.
- Late arrivals may be added any time.
- Attendance record is distinct from match participation.
- Adding an attendee does not count as a match played or alter ratings.
- Attendance edits may happen any time by authorised recorder; audit each change.
- Attendee who never plays remains in attendance, but has no match participation/rating change.
- Temporary guest may be added by recorder for the session.

## Active session and controller
- Only one designated controller at a time; other authorised recorders are read-only until control is acquired.
- Handover records outgoing/incoming recorder, timestamp, and actor.
- Another authorised recorder may take over an unresponsive controller after warning and confirmation. Log takeover and reject stale writes.
- Server enforces controller ownership/session versions; disabling buttons alone is insufficient.
- If recorder closes app, session remains active. No automatic closure.
- Any authorised recorder can resume or take over under the controlled process.

## Stale sessions
- Warn authorised recorders/admins after 12 hours since last meaningful activity.
- Meaningful activity: recording/correcting match, updating attendance, completed handover.
- Page visits and refreshes do not reset timer.
- Never auto-close a session.

## Match and finalization
- Save completed matches centrally immediately after server validation.
- Incomplete match can be saved/resumed/voided; excluded from official stats and Elo.
- Before finalization, show a review and require every unfinished match to be completed or explicitly voided.
- Completed sessions are locked by default. Reopening requires authorised action, reason, and audit record.
- Season closure does not reassign sessions. Late finalized matches remain tied to the session's original season; warn if that season is closed.
- Closed season may be recalculated after eligible late matches/corrections with audit.
