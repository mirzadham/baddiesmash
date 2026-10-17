# Prompt 03 — Implement an approved phase

Implement only the phase plan that the owner explicitly approved in this conversation.

## Before editing
- Re-read `AGENTS.md`, the approved plan, `docs/00-project/decision-register.md`, `docs/03-delivery/implementation-governance.md`, and every canonical document listed in the plan.
- Confirm the current Git status and preserve all existing/uncommitted work.
- If the repository or requirements have changed materially since approval, stop and re-plan.
- Do not start adjacent phases or silently expand scope.

## Implementation rules
- Follow approved architecture and product behaviour.
- Routine, reversible implementation details may be decided and documented.
- Ask before changing security model, core architecture, data-integrity guarantees, user-visible behaviour, physical schema in a consequential way, or scope.
- Never weaken RLS, bypass trusted functions, expose secrets, fake success, or skip validation to get a demo working.
- Never run destructive commands or modify production without required approval.
- Use focused changes, compatible dependencies and meaningful error states.
- Add tests with the feature; don't defer all testing to the end.
- Keep documentation and requirement/test traceability current.
- Do not commit secrets. Make logical commits only after verified milestones; ask before pushing or rewriting history.

## Completion response
Report files changed, behaviour implemented, tests and exact results, browser evidence where available, security checks, known gaps, docs updated, and proposed next step. Mark checks as passed, failed, or not run. Do not claim completion without evidence. Do not begin the next phase without approval.
