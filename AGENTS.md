# Project Instructions — Badminton Group Tracker

## Mandatory first steps
- Before any code or configuration changes, inspect the repository, Git status, current docs, dependencies, and existing implementation.
- Read `README.md`, `docs/00-project/vision-and-principles.md`, `docs/00-project/decision-register.md`, and `docs/00-project/roadmap-and-scope.md`.
- For each task, list the relevant canonical documents you read and any unresolved requirement.
- Start with `docs/prompts/01-bootstrap-inspect.md` if this is the first interaction in the repository.
- Do not implement until the owner explicitly approves the phase plan.

## Authority and ambiguity
- Product behaviour in the canonical requirements is authoritative.
- Never silently resolve conflicting requirements. Explain the conflict, options, consequences, and preferred recommendation; wait for the owner.
- Small, reversible implementation details may be decided independently and documented.
- Stop affected work if a design is unsafe, violates data integrity, or cannot be implemented as specified. Propose a safer alternative.
- Update `docs/00-project/decision-register.md` after an approved material decision and update every affected canonical document.

## Safety and approvals
- Never expose secrets in source, logs, screenshots, test fixtures, documentation, or Git.
- Never place Supabase service-role credentials or other privileged secrets in browser code.
- Ask before destructive commands, discarding uncommitted work, resetting a repository, replacing major configuration wholesale, pushing to remote, rewriting Git history, or force-pushing.
- Explicit owner approval is required before production deployments, production database migrations, destructive data operations, production secret/policy changes, or introducing recurring costs.
- Do not make live production changes while merely verifying a feature.
- Do not claim an action succeeded until the tool or command actually confirms success.

## Engineering invariants
- Enforce authorization in PostgreSQL RLS and trusted server/database functions; frontend checks are usability only.
- Match history is the source of truth; ratings and statistics are derived and rebuildable.
- Never publish partially recalculated ratings. Preserve the last consistent published view on failure.
- A failed or unconfirmed save must never appear as confirmed.
- Use server-side score validation, idempotent submissions, stable match ordering, audit logs, and explicit error states.
- Corrections must trigger deterministic recalculation of affected ratings in original chronological order.
- Do not merge player identities based on display name alone.
- Do not invent test results, provider limits, APIs, or capabilities.

## Phase workflow
1. Inspect and plan.
2. List documents consulted, scope, files/schema likely affected, risks, dependencies, acceptance criteria, tests, rollback plan, and deferred items.
3. Wait for explicit owner approval.
4. Implement only the approved phase.
5. Run relevant checks; report actual commands and outcomes.
6. Update documentation and traceability.
7. Present a phase report and proposed next plan; wait for approval again.

## Completion and communication
- Distinguish implemented, tested, verified, and release-ready.
- Failed or skipped checks must be explicit.
- Keep changes focused; no unapproved scope expansion.
- Do not treat this knowledge pack as permission to start coding.
