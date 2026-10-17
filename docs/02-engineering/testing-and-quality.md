# Testing and quality strategy

## Layers
1. Unit tests: scoring, Elo formula, standings/ties, statistics, season assignment, idempotency helpers.
2. Database/security tests: RLS, RPC permissions, group isolation, controller locking, invitation lifecycle, transactions, constraints, audit records.
3. Integration tests: match save/retry, correction/replay, dispute resolution, identity merge, session finalization, notifications.
4. End-to-end browser tests: invite/approve, create session, add attendance, record match, confirm leaderboard, correct/dispute, finalise session.
5. Visual review: mobile and desktop viewport, overflow, touch targets, theme, empty/loading/error states.
6. Release checks: build, migration review, staging smoke test, rollback/recovery readiness.

## Required edge cases
- 21–19 valid; 22–20 valid; 30–29 valid.
- 21–20 invalid; 22–21 invalid; 30–30 invalid.
- Duplicate player in teams; fewer/more than four players.
- Duplicate submit/retry; failed network/save; stale controller.
- Incomplete match finalization blocked until completed or voided.
- Correction changes later ratings deterministically.
- Voided match excluded and later ratings recalculated.
- Dispute open preserves official result; dismiss does not change it.
- Unauthorized role and cross-group access denied.
- Invitation expired/revoked/used/wrong email/rejected.
- Identity merge preview, success, rollback and audit.
- Recalculation failure preserves last published version.
- Closed season late match/correction.
- Exact rating ties and same displayed rounded rating but different internal values.
- Attendance without match participation.
- Session inactivity warning based on meaningful activity.

## Environment separation
- Separate test database and staging environment.
- Synthetic test histories only in test environment.
- Never seed test records into production.
- Private pilot uses real results only after release gates pass.

## Evidence rules
Report exact command, environment, pass/fail/skipped, and known limitations. A successful build is not equivalent to passing tests, security verification or release readiness.
