# Prompt 06 — Release readiness assessment

Assess readiness only; do not deploy production unless the owner separately approves the specific deployment.

## Read
`AGENTS.md`, `docs/03-delivery/release-gates.md`, `docs/03-delivery/acceptance-and-traceability.md`, `docs/02-engineering/operations-and-deployment.md`, security/testing/rating docs, and current phase reports.

## Tasks
- Verify each release gate with evidence.
- Check current official provider docs for pricing, quotas, inactivity, backup/restore, auth and deployment constraints; record URLs and verification date.
- Review migration history, rollback/forward-fix plan, environment separation, secrets, RLS/RPC tests, and last consistent rating publication.
- Confirm synthetic data is not in production.
- Confirm known issues and pilot limitations are documented.
- Confirm owner has reviewed milestone UI and approved production config for Elo.
- Do not treat successful build as sufficient release evidence.

## Output
Gate-by-gate pass/fail/not verified status; evidence; blockers; risks accepted or unresolved; exact deployment steps and rollback plan; separate approval request for production action. If a gate fails, recommend no-go.
