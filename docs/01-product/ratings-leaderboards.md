# Ratings and leaderboards

## Leaderboard views
- One leaderboard screen with tabs/filters: All-time (default), Season, Current Session.
- Always default to All-time; do not remember last tab.
- If no active season, retain all-time and previous seasons and explain seasonal ratings are paused.
- All-time Elo is primary overall champion metric. Wins, win rate, completed matches and attendance are context, not tie-breakers for Elo rank.
- Sort by full internal rating precision; display rounded whole number.
- Exact internal rating ties share competition rank: 1, 1, 3. Two identical displayed rounded values may not be an exact tie.
- Show provisional status and match sample size.

## Elo candidate
- Every player starts at 1000 for all-time and each new season baseline.
- For each team, use average of the two players' ratings to estimate expected outcome.
- Candidate expected result for Team A:
  `E_A = 1 / (1 + 10^((R_B - R_A) / 400))`
- Candidate adjustment:
  `delta = K * (S_A - E_A)` where `S_A` is 1 for Team A win, 0 for loss; Team B gets complementary outcome.
- Both teammates on a team receive the same adjustment; opponents receive the opposite adjustment. Team-level change should be zero-sum subject to precision policy.
- Outcome-only: score margin does not affect rating.
- All-time and seasonal ratings are independently calculated from eligible histories.
- Preserve decimal precision internally; display rounded whole-number ratings; don't round intermediate calculations after every match.
- K=16, 24, 32 must be compared in synthetic simulations. K=32 is only a candidate. Owner must approve production configuration after reviewing evidence.
- Three completed matches is the provisional label threshold, not a claim that rating is statistically reliable.
- Show rating before/after/change per player on match detail; profile shows progression.
- Explain in plain language that Elo estimates relative strength and is not objective proof of skill.

## Deterministic history
- Match history is authoritative. Rebuild ratings in deterministic chronological order.
- Within session, stable sequence number governs order; timestamps are supporting audit information.
- Across sessions, use a documented deterministic ordering that handles ties; propose and obtain approval if it affects results.
- Corrected match triggers recalculation from that point forward for all affected all-time/season rating histories.
- Store rating changes and published rating versions with match-data state and calculation-rules version.
- During recalculation show last consistent leaderboard with “Results updating”.
- Build/validate new rating version, then atomically switch visible results where feasible.
- On failure preserve last valid leaderboard, flag failure, allow safe retry. Never publish partial results.
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
