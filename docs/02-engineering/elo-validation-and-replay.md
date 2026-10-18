# Elo validation, rating versions, and replay

## Candidate formula
For Team A average rating `R_A` and Team B average rating `R_B`:
`E_A = 1 / (1 + 10^((R_B - R_A) / 400))`
`delta_A = K * (S_A - E_A)`, with `S_A = 1` for win and `0` for loss.
Team B gets complementary expected/outcome adjustment.
Each player on a team receives the same team adjustment; opposing team players receive the opposite adjustment. Test zero-sum team-level changes within precision policy.

## Candidate parameters
- Initial all-time rating: `1000.0000` (`NUMERIC(10,4)`).
- New season baseline: `1000.0000` (`NUMERIC(10,4)`), independent from all-time.
- K candidates compared in Phase 0: 16, 24, 32 (`docs/02-engineering/elo-simulation-report.md`).
- **Initial pilot default (`DEC-009`)**: `K = 24` is approved as the initial pilot default (not permanently validated production behaviour). Keep `k_factor` configurable per group (`groups.default_k_factor`) and record both `k_factor` and `rules_version` on every `rating_versions` row. Extend simulation across multiple random seeds and varied scenarios before wider production rollout.
- Display rounding: `before` and `after` ratings rounded to whole numbers (`ROUND(rating, 0)`); `change` (`delta`) rounded to one decimal place (`ROUND(delta, 1)`). Display values are rounded independently from internal decimals and must be documented as such in UI copy.
- Provisional label until 3 eligible completed matches, explicitly described as a simple threshold.
- Outcome-only; score margin does not affect rating.

## Numeric precision and TypeScript / PostgreSQL parity (`NUMERIC(10,4)`)
JavaScript IEEE-754 floating-point arithmetic (`Number`) is **not** automatically equivalent to PostgreSQL `NUMERIC(10,4)` decimal arithmetic (for example, `1000.1 + 15.2` produces binary float drift, and `Math.round(-0.5)` rounds toward $+\infty$ whereas PostgreSQL `ROUND(numeric, s)` rounds **half away from zero**). To guarantee exact parity between TypeScript domain logic and PostgreSQL database functions:
1. **Scaled Integer Representation (`10^4` micro-units):** Represent all stored ratings and deltas in TypeScript as exact integers scaled by `10,000` (e.g., `1000.0000` = `10_000_000n` or exact integer micro-units), matching PostgreSQL `NUMERIC(10,4)` storage.
2. **Team Averages:** Compute team average difference `R_B - R_A = ((R_b1 + R_b2) - (R_a1 + R_a2)) / 2` from the exact scaled ratings before evaluating the exponent.
3. **Transcendental Step & Half-Away-From-Zero Rounding:** Evaluate the exponent step `E_A = 1 / (1 + 10^((R_B - R_A) / 400))` in IEEE-754 double precision (`double precision` / `float8` in PostgreSQL and `number` in TypeScript), compute raw `delta_A = K * (S_A - E_A)`, and round `delta_A` to 4 decimal places using explicit **half-away-from-zero** decimal rounding (`sign(x) * floor(abs(x) * 10000 + 0.5)` with epsilon guard against binary float boundary representation).
4. **Strict Zero-Sum Complement:** Define `delta_B = -delta_A` directly from the rounded 4-decimal `delta_A` so that `delta_A + delta_B = 0.0000` is strictly invariant.
5. **Exact Accumulation & Independent Display Rounding:** Compute `after = before + delta` using exact 4-decimal integer addition. Compute displayed whole-number ratings (`scale = 0`) and 1-decimal deltas (`scale = 1`) from the exact 4-decimal integer values using deterministic half-away-from-zero integer division (`±5000` threshold for whole numbers, `±500` threshold for 1 decimal place).
6. **Single Authoritative Writer:** In production, PostgreSQL is the sole writer of official ratings; TypeScript runs the identical algorithm for unit testing, synthetic simulation, and merge previews.

## Simulation plan
Create deterministic synthetic histories with:
- Unequal player/team strengths.
- Random and repeated partnerships.
- Players with uneven attendance and sparse matches.
- New/provisional players and established players.
- Upsets and long sequences.
- Corrected/voided historical matches.
- Multiple seasons, closed seasons and late-finalized eligible matches.
Compare K values for responsiveness, volatility, convergence, team-strength sensitivity and stability. Document assumptions and limitations in [`elo-simulation-report.md`](elo-simulation-report.md). Simulation cannot prove perfect measurement of real-world skill.

## Replay rules
- Source of truth is eligible match history, not mutable rating fields.
- Completed non-void matches are eligible; incomplete and voided excluded. Disputed result (`is_disputed = true`) remains eligible in current form until resolution changes it.
- Canonical global replay order within a group:
  `(sessions.session_started_at ASC, sessions.created_at ASC, sessions.id ASC, matches.sequence_number ASC)`.
- Corrections, voids, backdated sessions, audited session start-time changes, and guest merges replay affected histories from the earliest affected match forward in that deterministic order.
- All-time and seasonal ratings replay independently from their eligible histories.
- Session assigned season at creation; no later reassignment. Late match warns when season closed; if eligible, recalculate that season with audit.
- Store published `rating_version`, `match_state_seq`, `rules_version` / config JSON, per-player snapshots, and per-match rating changes.
- Track `groups.required_match_state_seq` (incremented on every authoritative match/identity mutation) alongside `groups.published_rating_version_id` and `groups.recalculation_status` (`idle`, `running`, `failed`) so UI views always distinguish **Current**, **Recalculating**, and **Stale/Failed** states and never present stale ratings as current.
- Include tests for deterministic replay: same data + same rules = same results.
