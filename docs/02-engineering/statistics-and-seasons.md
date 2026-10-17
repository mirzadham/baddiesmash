# Statistics, seasons, and historical import

## Statistics
- Individual win rate = completed matches won / all completed matches involving that player. Always show sample size.
- Attendance rate = sessions attended / sessions held since player profile creation; exclude sessions before profile existed.
- Attendance and match participation are distinct.
- Session point difference = total points scored by player's teams minus points conceded across completed matches.
- Display wins, win rate, matches played, attendance and other supporting stats alongside ratings; do not conflate attendance with skill.
- Partnership stats: show both best win rate and most wins together; minimum sample can be one but show count and caution.

## Seasons
- Owner defines season start/end dates.
- One active season at a time.
- New season starts seasonal rating baseline at 1000; all-time rating continues.
- Previous seasons preserved.
- Seasons auto-close on end date.
- If no next season exists, seasonal ratings pause; sessions and all-time ratings continue.
- Session gets season assignment at creation; assignment is fixed.
- Historical imported sessions map to configured season boundaries by date; outside seasons contribute all-time only.
- Closed season may be recalculated due to authorized corrections or eligible late match; audit and warn recorder when finalizing into closed season.

## Historical import (Stage 2)
- Admin-only one-time historical import; fresh start is also valid.
- CSV template plus manual entry fallback.
- No raw Notes/WhatsApp text parser in V1.
- CSV identifies original session/date to group matches.
- Validate and preview whole batch before commit: players, scores, duplicates, chronology, season mapping and errors.
- Suggest likely player matches, but ambiguous/new identities require admin review; never merge by name alone.
- Entire batch rejected until all validation errors resolved, then imported atomically.
- Ambiguous chronology must be confirmed before imported matches affect ratings.
- Replay eligible imported matches chronologically through same approved Elo rules.
