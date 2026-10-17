# Elo validation, rating versions, and replay

## Candidate formula
For Team A average rating `R_A` and Team B average rating `R_B`:
`E_A = 1 / (1 + 10^((R_B - R_A) / 400))`
`delta_A = K * (S_A - E_A)`, with `S_A = 1` for win and `0` for loss.
Team B gets complementary expected/outcome adjustment.
Each player on a team receives the same team adjustment; opposing team players receive the opposite adjustment. Test zero-sum team-level changes within precision policy.

## Candidate parameters
- Initial all-time rating: 1000.
- New season baseline: 1000, independent from all-time.
- K candidates: 16, 24, 32.
- K=32 is not production-approved until synthetic tests and owner review.
- Internal decimal precision; display rounded whole number.
- Provisional label until 3 eligible completed matches, explicitly described as a simple threshold.
- Outcome-only; score margin does not affect rating.

## Simulation plan
Create deterministic synthetic histories with:
- Unequal player/team strengths.
- Random and repeated partnerships.
- Players with uneven attendance and sparse matches.
- New/provisional players and established players.
- Upsets and long sequences.
- Corrected/voided historical matches.
- Multiple seasons, closed seasons and late-finalized eligible matches.
Compare K values for responsiveness, volatility, convergence, team-strength sensitivity and stability. Document assumptions and limitations. Simulation cannot prove perfect measurement of real-world skill.

## Replay rules
- Source of truth is eligible match history, not mutable rating fields.
- Completed non-void matches are eligible; incomplete and voided excluded. Disputed result remains eligible in current form until resolution changes it.
- Corrections replay affected histories from corrected match forward in deterministic order.
- All-time and seasonal ratings replay independently from their eligible histories.
- Session assigned season at creation; no later reassignment. Late match warns when season closed; if eligible, recalculate that season with audit.
- Store published rating version, data-state identifier, rules/config version and per-match rating changes.
- During recalculation keep last consistent version visible and indicate update state.
- Publish new version only after validation; failure preserves prior version and exposes retry/failure to authorised admins.
- Include tests for deterministic replay: same data + same rules = same results.
