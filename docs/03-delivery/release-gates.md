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
- Formula independently tested.
- Synthetic K comparison completed and documented.
- Owner approved production rating config.
- Deterministic replay/correction/void/season tests pass.
- Failure injection proves last consistent version remains visible.
- No synthetic test data in production.

## Gate 4 — Product usability
- Main flows browser-tested at mobile and desktop where capability exists.
- Loading/error/empty/provisional/disputed/recalculating states clear.
- Navigation, contrast, touch targets and themes reviewed.
- Owner milestone review completed.

## Gate 5 — Private pilot
- Staging smoke tests pass.
- Known limitations documented.
- Recovery/rollback and support path understood.
- Owner explicitly approves production deployment.
- Pilot begins with a small set of trusted players; expand only after real usage review.

## Gate 6 — Expansion
- Stage 2 features planned separately and approved.
- New features do not bypass the same security, testing, and approval gates.
