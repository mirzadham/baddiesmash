# Match entry and scoring

## Match format
- Doubles only; exactly four distinct player profiles.
- One court and one match at a time.
- One game to 21, win by two after 20–20, maximum score 30.
- Valid examples: 21–19, 22–20, 30–29.
- Invalid examples: 21–20, 22–21, 30–30.
- No point-by-point tracking in V1.
- Score margin does not affect Elo; a 21–19 win and 21–8 win are both outcome wins.

## Entry flow
1. Select four distinct players from attendees.
2. Assign them to visible Team A / Team B slots.
3. Start with empty team slots for every new match; never carry prior match assignments over.
4. Support one-tap player/team swaps with clear feedback and distinct-player validation.
5. Enter two scores, numeric keypad on mobile.
6. Validate immediately; show reason beside invalid field and disable save until valid.
7. Server/database independently validates score and eligibility.
8. On confirmed save, show clear success and 10-second Undo banner. No extra confirmation for ordinary save.

## Reliability
- Disable Save while submission is in flight.
- Use server-side idempotency. One submission ID creates at most one match.
- Retry after failure using same stable submission ID for that logical attempt.
- A new legitimate match always gets a new ID, even if teams and score match a previous match.
- If save fails, retain entry on screen and show unconfirmed state; safe retry.
- Do not show official success before server confirmation.
- Incomplete drafts have stable IDs, can be resumed/voided, and do not affect official stats/rating.
- Match history stores stable per-session sequence number assigned when match is finalized.
- Preserve participants, score, actor, timestamps, submission ID, status and correction history.

## Undo and correction
- Immediate Undo lasts 10 seconds and is available only to original recorder.
- Undo is a server-confirmed audited reversal/void, not hard delete; recalculate derived stats/ratings.
- If Undo fails, match remains in last confirmed state.
- Later corrections require authorised recorder for sessions they manage or admin for any session; require reason and audit old/new score, actor, timestamp.
- Voiding requires reason; retain record and exclude from official stats/rating.
- Any approved member may dispute a match; see disputes requirements.
