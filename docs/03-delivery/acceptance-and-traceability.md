# Acceptance and traceability matrix

Use stable IDs. Expand into issue/test identifiers during planning. Do not mark verified without evidence.

| ID | Stage Scope | Requirement | Minimum acceptance evidence | Phase 0 Status & Evidence |
|---|---|---|---|---|
| AUTH-01 | Stage 1 | Only approved members access group data | RLS tests for unauthenticated, pending, rejected, departed and approved accounts | Pending Phase 1 (DB/RLS) |
| AUTH-02 | Stage 1 | Invitation is email-bound, single-use, revocable, 7-day expiry | Tests for wrong email, expired, revoked, used and rejected invitations | Pending Phase 1 (DB/RLS) |
| AUTH-03 | Stage 1 | Role/recorder permissions enforced server-side | Unauthorized RPC/write attempts denied | Pending Phase 1 (DB/RLS) |
| ID-01 | Stage 1 | Player identity separate from account | Viewer without player profile can access permitted views but cannot play | Pending Phase 1 (DB/RLS) |
| ID-02 | Stage 1 | No name-only merge | Merge requires explicit profile IDs, preview, permission, audit and rollback; guest replay verified in `elo.test.ts` | Domain replay tested (`src/domain/__tests__/elo.test.ts`); DB RPC pending Phase 2 |
| SES-01 | Stage 1 | One active session per group | Concurrent create attempts cannot create two active sessions | Pending Phase 2 (DB partial unique index + RPC) |
| SES-02 | Stage 1 | Controller lock/handover enforced | Stale controller write rejected; handover/takeover audited | Pending Phase 2 (DB RPC) |
| SES-03 | Stage 1 | Finalization handles incomplete matches | Finalize blocked until each incomplete match completed or voided | Pending Phase 2 (DB RPC) |
| SES-04 | Stage 1 | Stale warning after 12h meaningful inactivity | Tests prove page refresh doesn't reset timer | Pending Phase 2/4 (DB + UI) |
| ATT-01 | Stage 1 | Attendance distinct from play | Attending without playing changes attendance only | Domain tested (`src/domain/__tests__/standings.test.ts`); DB/UI pending Phase 2/4 |
| MATCH-01 | Stage 1 | Valid scoring rules | Unit + server tests for all boundary examples (`21–19`, `22–20`, `29–27`, `30–28`, `30–29`; rejects `20–18`, `21–20`, `25–21`, `30–27`, `30–30`, `31–29`) | **Unit Tested (Phase 0)**: `src/domain/__tests__/scoring.test.ts` (9 tests pass); DB constraint pending Phase 2 |
| MATCH-02 | Stage 1 | Four distinct players and two teams | Duplicate/missing participant rejected | **Unit Tested (Phase 0)**: `src/domain/__tests__/scoring.test.ts`; DB constraint pending Phase 2 |
| MATCH-03 | Stage 1 | Save retry idempotent | Same submission ID never creates duplicate | Pending Phase 2 (DB `client_submission_id` unique key + RPC) |
| MATCH-04 | Stage 1 | Failed save remains unconfirmed | UI retains values; no false success; safe retry | Pending Phase 4 (UI + RPC error handling) |
| MATCH-05 | Stage 1 | Undo/correction audited | Actor/reason/old-new values captured; no hard deletion | Pending Phase 2 (DB audit log + RPC) |
| MATCH-06 | Stage 1 | Stable ordering | Sequence number preserved through corrections; canonical tuple `(session_started_at, created_at, session.id, sequence_number)` (`DEC-015`) | **Unit Tested (Phase 0)**: `src/domain/__tests__/elo.test.ts`; DB trigger/RPC pending Phase 2 |
| RATE-01 | Stage 1 | Candidate Elo formula correct | Deterministic unit tests and independent reference cases at `NUMERIC(10,4)` scale (`DEC-017`) | **Unit Tested (Phase 0)**: `src/domain/__tests__/elo.test.ts` (independent hand-calculated reference vectors pass) |
| RATE-02 | Stage 1 | Production K-factor approved | K=16/24/32 simulation report and explicit owner approval | **Simulation Completed (Phase 0)**: `docs/02-engineering/elo-simulation-report.md` (`npm run simulate:elo`); awaiting owner approval of `K = 24` |
| RATE-03 | Stage 1 | Correction replays later ratings | Same corrected history yields deterministic outputs | **Unit Tested (Phase 0)**: `src/domain/__tests__/elo.test.ts` & `src/domain/simulation.ts`; DB RPC pending Phase 2 |
| RATE-04 | Stage 1 | No partial rating publication | Inject failure; previous version remains visible; UI surfaces `Current` / `Recalculating` / `Stale/Failed` (`DEC-016`) | **Publication State Helper Tested (Phase 0)**: `src/domain/__tests__/elo.test.ts`; DB savepoint RPC pending Phase 2 |
| RATE-05 | Stage 1 (Domain Hook) / Stage 2 (UI) | Season/all-time independent | Separate `1000.0000` baseline and correct eligibility tests (`DEC-014`) | **Unit Tested (Phase 0)**: `src/domain/__tests__/elo.test.ts` & `src/domain/simulation.ts`; Stage 2 UI deferred |
| RATE-06 | Stage 1 | Provisional label, Guest label, and tie ranks | Tests for `<8` matches Provisional label, unmerged `Guest` label (`DEC-010`), competition ties (`1, 2, 2, 4`) on full internal precision (`DEC-009`), and disputed match inclusion | **Unit Tested (Phase 0)**: `src/domain/__tests__/standings.test.ts` & `src/domain/__tests__/elo.test.ts` |
| DIS-01 | Stage 1 (Data Invariant) / Stage 2 (UI) | Dispute doesn't silently change result | `is_disputed = true` preserves result in replay; Stage 2 adds open/dismiss/resolve workflows (`DEC-014`) | **Domain Invariant Tested (Phase 0)**: `src/domain/__tests__/elo.test.ts`; Stage 2 UI deferred |
| NOTIF-01 | Stage 2 | Notification after confirmed event only | Failed transaction produces no success notification (`DEC-014`) | Deferred to Stage 2 (Gate 6) |
| PRIV-01 | Stage 1 | Email private | Member-level access tests | Pending Phase 1 (DB RLS / projection tests) |
| PRIV-02 | Stage 1 | Deletion/anonymisation explained | UX and data lifecycle reviewed against applicable requirements | Pending Phase 5 (Settings & Privacy UX) |
| UI-01 | Stage 1 | Mobile-first match entry | Browser verification at mobile and desktop sizes | Pending Phase 3/4 |
| UI-02 | Stage 1 | Accessible statuses and targets | Contrast, text/icon status, touch targets, reduced motion review | Pending Phase 3/4/5 |
| OPS-01 | Stage 1 | Environment separation | Test records absent from production; deployment config reviewed | Pending Phase 1/6 |
| OPS-02 | Stage 1 | Production approval gates | Deployment/migration cannot proceed without owner approval | Enforced continuously (`AGENTS.md`, `DEC-013`) |
| DOC-01 | Stage 1 | Docs and tests trace requirements | Each in-scope requirement mapped to implementation/test or explicitly deferred | **Updated (Phase 0)**: `decision-register.md`, `release-gates.md`, `acceptance-and-traceability.md` |
