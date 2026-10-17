# Synthetic Elo Simulation Report & K-Factor Study

## 1. Objective & Scope
Before deploying the PostgreSQL Elo rating engine in Phase 1, canonical requirements (`docs/02-engineering/elo-validation-and-replay.md`, `DEC-009`, `DEC-015`, `DEC-017`) require a reproducible synthetic simulation comparing candidate K-factors **`K = 16`**, **`K = 24`**, and **`K = 32`** under the exact fixed-point `NUMERIC(10,4)` arithmetic and chronological ordering rules.

### Reproducibility Command
```bash
npm run simulate:elo
```
- **Implementation**: `src/domain/simulation.ts` and `scripts/run-elo-simulation.ts`
- **Automated Tests**: `src/domain/__tests__/elo.test.ts`
- **Deterministic PRNG**: Mulberry32 (`seed = 20261017`)
- **Internal Precision**: Scaled `bigint` micro-units ($10^4$ scale matching PostgreSQL `NUMERIC(10,4)`) with half-away-from-zero rounding (`roundHalfAwayFromZeroDiv`).

---

## 2. Synthetic Cohort & Scenarios Modelled

The simulation models **40 weekly sessions** (`8` doubles matches per session = `320` total matches) across a realistic mixed-skill recreational group of **13 player identities** (true latent skills centered near `1000`, true skill spread `1240 - 790 = 450` points):

1. **Core Regulars (`p01`–`p06`, `p09`)**: True skills from `790` (beginner regular) to `1240` (elite regular), attending 80%–95% of sessions.
2. **Sparse/Casual Attendees (`p07`, `p08`)**: True skills `1130` and `870`, attending ~35% of sessions.
3. **Late-Joining Strong Newcomer (`p10`)**: True skill `1180` (2nd strongest in the group), joining at **Session 21** at the `1000.0000` baseline.
4. **Temporary Guest Merged into Rostered Player (`g01` -> `p11`)**: Plays as a guest in Sessions 1–4, then merges into rostered player `p11` (`merged_into_player_id = 'p11'`).
5. **Unmerged Temporary Guest (`g02`)**: Plays occasionally and remains on the all-time leaderboard with a visible `Guest` label (`DEC-010`).
6. **Voided Match (`match-10-08`)**: Marked `status = 'voided'` and excluded from replay.
7. **Disputed Match (`match-12-03`)**: Marked `is_disputed = true` and `status = 'completed'`; verified to remain included in official ratings until resolved (`RATE-06`).
8. **Historical Score Correction (`match-05-02`)**: Score flipped (`21–17` -> `17–21`) and replayed in forward and reversed input array orders to prove canonical ordering invariance (`DEC-015`).
9. **Season Independence (`season-1` vs `season-2`)**: Sessions 1–15 belong to `season-1`, Sessions 16–30 belong to `season-2`, and Sessions 31–40 have `season_id = NULL`. Verified that replaying `season-2` starts every player at `1000.0000` on their first match in `season-2` (`RATE-05`).
10. **Fixed-Partnership Plateau & Partner-Rotation Recovery**: Models a strong player (`1200`) and weak player (`850`) playing 12 matches exclusively as a fixed pair against two `1025` opponents (where equal-delta team Elo holds both near `1000`), followed by partner rotation to measure recovery speed to `>= 1100`.

---

## 3. Empirical Results (`seed = 20261017`)

| Metric | `K = 16` | `K = 24` (Recommended) | `K = 32` |
| :--- | :---: | :---: | :---: |
| **Spearman Rank Correlation @ 10 Sessions** | `0.830` | **`0.842`** | **`0.842`** |
| **Spearman Rank Correlation @ 20 Sessions** | `0.939` | **`0.964`** | `0.952` |
| **Spearman Rank Correlation @ 40 Sessions** | `0.882` | **`0.891`** | **`0.891`** |
| **Regulars RMSE vs True Skill @ 40 Sessions** | **`59.0`** | `64.4` | `76.9` |
| **Rating Spread (`Max - Min`) @ 40 Sessions** (True = `450.0`) | `378.4` | **`455.2`** | `503.7` |
| **Max Single-Match Delta (`\|delta\|`)** | `11.88` | `19.29` | `27.01` |
| **Max Single-Session Player Swing (~4 matches)** | `47.7` | `74.3` | `101.5` |
| **Newcomer (`p10`, True #2) Matches to Enter Top 4** | `21` matches | **`11` matches** | **`11` matches** |
| **Newcomer (`p10`) Rating @ Session 40** | `1066.7` | `1094.4` | `1119.5` |
| **Post-Fixed-Pair Recovery Matches to Reach `1100`** | `>40` (`null`) | **`29` matches** | `20` matches |
| **Net Zero-Sum Drift Across All Players (`NUMERIC(10,4)`)** | `0.0000` | `0.0000` | `0.0000` |
| **Order-Independent Deterministic Replay Verified** | `true` | `true` | `true` |
| **Season Baseline Reset (`1000.0000`) Verified** | `true` | `true` | `true` |
| **Disputed Match Included Until Resolved Verified** | `true` | `true` | `true` |

---

## 4. Analysis of Trade-offs

### Why `K = 16` is too conservative for a weekly recreational group
- **Under-dispersed ratings**: After 40 weekly sessions, the cohort spread is only `378.4` points against a true skill spread of `450.0` points.
- **Sluggish newcomer calibration**: When a strong player (`p10`, true rank #2) joins mid-year at `1000`, it takes **21 matches** (~5–6 weeks of attendance) just to reach the Top 4 on the leaderboard.
- **Persistent fixed-partnership lock-in**: If a strong player spends several sessions carrying a beginner partner, `K = 16` requires more than **40 subsequent rotating-partner matches** to climb above `1100`.

### Why `K = 32` is too volatile for social doubles
- **Excessive single-night swings**: A player having an off night or drawing weaker partners across 4 matches can swing by **`101.5` rating points** in a single session (and up to `27.01` points in one match).
- **Higher steady-state noise**: Because doubles matches mix partner skill with individual skill, `K = 32` overreacts to random partner draws, degrading Session 20 rank correlation (`0.952` vs `0.964` for `K = 24`), inflating RMSE (`76.9` vs `64.4`), and overshooting the cohort's true rating spread (`503.7` vs `450.0`).

### Why `K = 24` is the optimal production choice
- **Best rank ordering accuracy**: Achieves the highest Spearman rank correlation at Session 20 (`0.964`) and ties for highest at Session 40 (`0.891`), while keeping RMSE (`64.4`) low.
- **Calibrated cohort spread**: Produces a `455.2` point spread at Session 40, closely matching the true underlying skill spread (`450.0`).
- **Fast newcomer convergence without single-night whiplash**: Calibrates a strong newcomer into the Top 4 in **11 matches** (~2.5–3 sessions), recovers from fixed-partnership plateaus in **29 matches**, and caps maximum single-session swings at `74.3` points (`19.29` max single-match delta).

---

## 5. Recommendation for Owner Approval

- **Recommended Production Constant**: **`K = 24`** (stored on `rating_versions.k_factor = 24` and defaulted in the replay RPC).
- **Status in `docs/00-project/decision-register.md`**: `DEC-009` awaits explicit owner confirmation to move from `Provisional` (`K = 24`) to `Confirmed`.
