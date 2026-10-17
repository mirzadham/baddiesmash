# Acceptance and traceability matrix

Use stable IDs. Expand into issue/test identifiers during planning. Do not mark verified without evidence.

| ID | Requirement | Minimum acceptance evidence |
|---|---|---|
| AUTH-01 | Only approved members access group data | RLS tests for unauthenticated, pending, rejected, departed and approved accounts |
| AUTH-02 | Invitation is email-bound, single-use, revocable, 7-day expiry | Tests for wrong email, expired, revoked, used and rejected invitations |
| AUTH-03 | Role/recorder permissions enforced server-side | Unauthorized RPC/write attempts denied |
| ID-01 | Player identity separate from account | Viewer without player profile can access permitted views but cannot play |
| ID-02 | No name-only merge | Merge requires explicit profile IDs, preview, permission, audit and rollback |
| SES-01 | One active session per group | Concurrent create attempts cannot create two active sessions |
| SES-02 | Controller lock/handover enforced | Stale controller write rejected; handover/takeover audited |
| SES-03 | Finalization handles incomplete matches | Finalize blocked until each incomplete match completed or voided |
| SES-04 | Stale warning after 12h meaningful inactivity | Tests prove page refresh doesn't reset timer |
| ATT-01 | Attendance distinct from play | Attending without playing changes attendance only |
| MATCH-01 | Valid scoring rules | Unit + server tests for all boundary examples |
| MATCH-02 | Four distinct players and two teams | Duplicate/missing participant rejected |
| MATCH-03 | Save retry idempotent | Same submission ID never creates duplicate |
| MATCH-04 | Failed save remains unconfirmed | UI retains values; no false success; safe retry |
| MATCH-05 | Undo/correction audited | Actor/reason/old-new values captured; no hard deletion |
| MATCH-06 | Stable ordering | Sequence number preserved through corrections |
| RATE-01 | Candidate Elo formula correct | Deterministic unit tests and independent reference cases |
| RATE-02 | Production K-factor approved | K=16/24/32 simulation report and explicit owner approval |
| RATE-03 | Correction replays later ratings | Same corrected history yields deterministic outputs |
| RATE-04 | No partial rating publication | Inject failure; previous version remains visible |
| RATE-05 | Season/all-time independent | Separate baseline and correct eligibility tests |
| RATE-06 | Provisional label and tie ranks | Tests for 3-match threshold and competition ties |
| DIS-01 | Dispute doesn't silently change result | Open/dismiss preserve result; resolved correction/void recalculates |
| NOTIF-01 | Notification after confirmed event only | Failed transaction produces no success notification |
| PRIV-01 | Email private | Member-level access tests |
| PRIV-02 | Deletion/anonymisation explained | UX and data lifecycle reviewed against applicable requirements |
| UI-01 | Mobile-first match entry | Browser verification at mobile and desktop sizes |
| UI-02 | Accessible statuses and targets | Contrast, text/icon status, touch targets, reduced motion review |
| OPS-01 | Environment separation | Test records absent from production; deployment config reviewed |
| OPS-02 | Production approval gates | Deployment/migration cannot proceed without owner approval |
| DOC-01 | Docs and tests trace requirements | Each in-scope requirement mapped to implementation/test or explicitly deferred |
