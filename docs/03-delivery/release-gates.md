# Release gates

## Gate 0 — Repository readiness
- Repository inspected; Git status understood; no uncommitted work lost.
- Project structure and dependencies documented.
- Current official docs and provider constraints verified.
- Initial architecture, schema proposal, security model, phase plan and acceptance criteria approved.

## Gate 1 — Foundation security
- Authentication and verified invitation flow work.
- Pending/rejected/departed members cannot access protected data.
- RLS and trusted functions tested for each role and group isolation.
- Bootstrap is one-time, safe to retry, then disabled.
- No privileged secrets in browser or Git.

## Gate 2 — Match integrity
- Score and participant rules validated client-side for UX and independently server-side.
- Idempotency, failed-save recovery, controller locking and stale writes tested.
- Incomplete match lifecycle and finalization checks pass.
- Undo, correction, void and audit flows pass.

## Gate 3 — Ratings
- Formula and `NUMERIC(10,4)` fixed-point precision/rounding parity independently tested.
- Synthetic K comparison (`K=16, 24, 32`) completed and documented, including multi-season baseline reset and closed-season replay simulations.
- Owner approved production rating config.
- Deterministic replay, score correction, void, guest merge, disputed-match eligibility (`is_disputed` remains official), and nullable `season_id` schema/replay compatibility tests pass for Stage 1 (user-facing Season management and Season leaderboard UI are deferred to Stage 2 / Gate 6).
- Failure injection proves last consistent version remains visible and UI accurately distinguishes `Current`, `Recalculating`, and `Stale/Failed` states without claiming stale ratings are current.
- No synthetic test data in production.

## Gate 4 — Product usability
- Main Stage 1 flows browser-tested at mobile and desktop where capability exists.
- Loading, error, empty, provisional, recalculating, stale/failed, and reusable disputed badge component states clear with text/icons as well as colour (interactive dispute filing/resolution workflows are deferred to Stage 2 / Gate 6).
- Navigation, contrast, touch targets and themes reviewed.
- Owner milestone review completed.

## Gate 5 — Private pilot
- Staging smoke tests pass.
- Known limitations documented (including Supabase Free Plan 2 emails/hour built-in SMTP rate limit, 7-day inactivity pause behavior, and CLI logical backup procedure).
- Recovery/rollback and support path understood.
- Owner explicitly approves production deployment.
- Pilot begins with a small set of trusted players; expand only after real usage review.

## Gate 6 — Expansion (Stage 2)
- Stage 2 features (custom seasons UI & seasonal leaderboard tab, dispute filing/review/resolution workflows, in-app notification centre, partnership analytics, WhatsApp session summary sharing, and atomic batch CSV import) planned separately and approved.
- Full end-to-end seasonal workflow and dispute workflow tests pass.
- New features do not bypass the same security, testing, and approval gates.
