# Prompt 02 — Plan one implementation phase

Plan exactly one phase; do not implement it yet.

## Required context
Read `AGENTS.md`, `docs/00-project/decision-register.md`, `docs/00-project/roadmap-and-scope.md`, `docs/03-delivery/implementation-governance.md`, and the canonical product/engineering docs relevant to this phase. Inspect current code and migration history.

## Instructions
- Identify exact requirements and traceability IDs covered.
- List every relevant document consulted and any unresolved ambiguity.
- Describe intended behaviour and architecture without pretending provisional choices are final.
- List affected files, schema/migrations, dependencies, indexes, RLS policies and trusted functions.
- Verify current official docs for external APIs, pricing/limits, auth, backups, and security where relevant.
- Assess security, privacy, concurrency, data integrity, accessibility, migration and rollback risks.
- Define acceptance criteria and automated/manual/browser tests.
- State commands likely to run and any commands requiring approval.
- Identify included, deferred, blocked, and out-of-scope items.
- Explain alternatives for consequential decisions and recommend one.
- Do not begin implementation in this response.

## Required response format
1. Goal and scope.
2. Documents read.
3. Requirements/traceability IDs.
4. Design and data flow.
5. Files and database changes.
6. Security and failure modes.
7. Tests and acceptance criteria.
8. Migration/rollback plan.
9. Open decisions.
10. Explicit request for owner approval.

Wait for the owner’s explicit approval before proceeding.
