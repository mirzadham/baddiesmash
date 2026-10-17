# Ratings and leaderboards

## Leaderboard views
- One leaderboard screen with tabs/filters: All-time (default), Season (Stage 2), Current Session.
- Always default to All-time; do not remember last tab.
- If no active season, retain all-time and previous seasons and explain seasonal ratings are paused.
- All-time Elo is primary overall champion metric. Wins, win rate, completed matches and attendance are context, not tie-breakers for Elo rank.
- Include unmerged temporary guests in the All-time leaderboard with a visible `Guest` label.
- Sort by full internal rating precision (`NUMERIC(10,4)`); display rounded whole number.
- Exact internal rating ties share competition rank: 1, 1, 3. Two identical displayed rounded values may not be an exact tie.
- Show provisional status and match sample size.
- Leaderboard and profile views must clearly distinguish and expose whether published ratings are **Current**, **Recalculating**, or **Stale/Failed**, and must never claim that published ratings reflect the latest authoritative match history when `published_rating_version.match_state_seq < groups.required_match_state_seq`.

## Elo candidate
- Every player starts at 1000 (`1000.0000`) for all-time and each new season baseline.
- For each team, use average of the two players' ratings to estimate expected outcome.
- Candidate expected result for Team A:
  `E_A = 1 / (1 + 10^((R_B - R_A) / 400))`
- Candidate adjustment:
  `delta = K * (S_A - E_A)` where `S_A` is 1 for Team A win, 0 for loss; Team B gets complementary outcome (`delta_B = -delta_A`).
- Both teammates on a team receive the same adjustment; opponents receive the opposite adjustment. Team-level change is strictly zero-sum at `NUMERIC(10,4)` precision.
- Outcome-only: score margin does not affect rating.
- All-time and seasonal ratings are independently calculated from eligible histories.
- Preserve exact 4-decimal fixed-point precision (`NUMERIC(10,4)`, rounded half-away-from-zero at the 4th decimal place) internally across match-to-match replay; never round intermediate calculations to whole integers.
- Display `before` and `after` ratings as rounded whole numbers (`ROUND(rating, 0)`) and rating `change` (`delta`) to one decimal place (`ROUND(delta, 1)`). Explain clearly in the UI that displayed `before`, `after`, and `change` values are rounded independently from internal decimal values.
- K=16, 24, 32 must be compared in synthetic simulations. K=32 is only a candidate. Owner must approve production configuration after reviewing evidence.
- Three completed matches is the provisional label threshold, not a claim that rating is statistically reliable.
- Show rating before/after/change per player on match detail; profile shows progression.
- Explain in plain language that Elo estimates relative strength and is not objective proof of skill.

## Deterministic history
- Match history is authoritative. Rebuild ratings in deterministic chronological order.
- Within session, immutable per-session `sequence_number` (assigned when a match is completed) governs order; timestamps are supporting audit information.
- Across sessions, order deterministically by `(sessions.session_started_at ASC, sessions.created_at ASC, sessions.id ASC, matches.sequence_number ASC)`.
- Corrected match, voided match, backdated session, audited session time change, or guest merge triggers recalculation from the earliest affected point forward for all affected all-time/season rating histories.
- Store rating changes and published rating versions with `match_state_seq` and calculation-rules version.
- Distinguish three publication states by comparing `groups.recalculation_status` and `published_rating_version.match_state_seq` against `groups.required_match_state_seq`:
  1. **Current:** `recalculation_status = 'idle'` and `published_rating_version.match_state_seq = groups.required_match_state_seq`.
  2. **Recalculating:** `recalculation_status = 'running'`; show last consistent published version with a prominent `"Results updating"` banner.
  3. **Stale / Failed:** `recalculation_status = 'failed'` or `published_rating_version.match_state_seq < groups.required_match_state_seq` while not running; show last consistent published version with a prominent `"Ratings out of date / Recalculation needed"` warning stating that displayed ratings do not yet include the latest match/correction, and expose a safe retry action to authorised admins/owners.
- Build/validate new rating version, then atomically switch `groups.published_rating_version_id`. Never publish partial results.
- Retain prior published versions/metadata sufficient to audit and restore last valid view.

## Session standings
- Rank by wins, then win rate, then point difference. Exact ties share rank; stable display order is presentation only.
- Win rate uses completed matches only and always shows sample size.
- Do not adjust for different match counts; make sample sizes visible.
- Do not crown session champion on win rate alone.
- Point difference per player = total points scored by that player's teams minus points conceded across completed matches.
- Current-session standings remain provisional until session finalization.

## Partnership stats
- Show highest win rate and most wins together separately.
- Minimum partnership sample threshold is one match, but label the small sample clearly and do not overstate evidence.
