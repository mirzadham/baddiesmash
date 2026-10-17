---
trigger: model_decision
description: Apply when writing tests, reviewing test results, claiming completion, or preparing releases.
---
# Verification and evidence

- Use layered tests: unit tests, database/security tests, and end-to-end tests for critical user flows.
- Elo and score rules require deterministic unit tests and edge cases.
- Security tests must cover unauthorized roles, cross-group access, invalid state transitions, replay/idempotency, and privileged function access.
- Use synthetic histories and a separate test database; never seed synthetic test records into production.
- Report exact commands and actual pass/fail/skipped outcomes.
- Do not claim a test ran unless it actually ran; do not claim full coverage based on a build alone.
- A phase is not complete merely because code exists. Meet its acceptance criteria, run relevant checks, update docs, and disclose gaps.
