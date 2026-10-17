# Prompt 05 — Review and debug a reported problem

Diagnose the reported issue before editing. Do not guess or immediately rewrite large parts of the application.

## Required approach
- Reproduce the issue or clearly state if it cannot be reproduced.
- Inspect logs and relevant code without exposing secrets or personal data.
- Form a root-cause hypothesis and gather evidence.
- Check whether the bug reveals a contradiction or gap in canonical requirements.
- Propose a minimal fix and regression tests.
- If the fix changes product behaviour, architecture, security, data integrity, scope, or schema materially, ask for approval first.
- Preserve uncommitted work and avoid destructive debugging.
- Do not use production data or run destructive operations for reproduction without explicit approval.

## Output before a consequential fix
- Reproduction steps and environment.
- Expected vs actual behaviour.
- Evidence and root cause (or uncertainty).
- Impact and affected requirements.
- Proposed minimal fix, tests, risks and rollback.
- Ask for approval if required.

After approved fix, run regression tests, report actual results, update docs/traceability, and identify any remaining uncertainty.
