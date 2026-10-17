# Prompt 04 — Verify a phase independently

Review the approved phase implementation against its acceptance criteria. Treat this as verification, not an opportunity for unapproved feature work.

## Read
- `AGENTS.md`
- Approved phase plan and its canonical requirements.
- `docs/03-delivery/acceptance-and-traceability.md`
- `docs/02-engineering/testing-and-quality.md`
- Relevant security, data, rating, UI and operations documents.

## Tasks
1. Map each acceptance criterion to test/evidence.
2. Run relevant available tests/builds and report exact commands and outcomes.
3. Inspect authorization paths, RLS, trusted function checks, error handling, idempotency, audit and concurrency if relevant.
4. Inspect changed code for requirement mismatches, edge cases, secrets, unsafe defaults, and unnecessary complexity.
5. Browser-test critical flows and responsive UI when capability exists; if unavailable, disclose it and provide manual steps.
6. Identify tests not run and why.
7. Verify docs and decision register are consistent.
8. Do not alter production or perform destructive operations. Fixes outside approved scope require a proposal.

## Output
- Acceptance criterion matrix: pass/fail/not verified with evidence.
- Test commands and outcomes.
- Security/data-integrity findings by severity.
- Visual/browser findings.
- Documentation/traceability gaps.
- Blockers and recommended fixes.
- Whether phase is verified, partially verified, or not verified.

Do not call it release-ready unless all required release gates are met.
