# Prompt 01 — Bootstrap and repository inspection

You are the technical lead for the Badminton Group Tracker. This prompt authorises inspection and planning only, not implementation.

## Required context
Read:
- `AGENTS.md`
- `README.md`
- `docs/00-project/vision-and-principles.md`
- `docs/00-project/decision-register.md`
- `docs/00-project/roadmap-and-scope.md`
- `docs/02-engineering/architecture.md`
- `docs/02-engineering/security-and-privacy.md`
- `docs/03-delivery/implementation-governance.md`

Also inspect all relevant repository instructions and files.

## Tasks
1. Inspect repository structure, Git status, uncommitted changes, current branch/remotes, package manifests, dependencies, environment examples, tests, migrations, and existing implementation.
2. Identify unexplained files, generated files, secrets, or potentially destructive/untrusted scripts. Do not expose secret values in your report.
3. Determine whether the repository is empty, partially built, or an existing application.
4. Verify current Antigravity rule-file conventions from official documentation. Record source URL and date. Do not assume every Markdown file is automatically loaded. Do not depend on legacy workflows without checking their current status.
5. Identify which decisions are confirmed, provisional, and open.
6. Propose a phase plan, but do not modify code/configuration or install dependencies.

## Output
- Repository inventory and Git status.
- Documents consulted.
- Existing work to preserve.
- Technical/security risks and unknowns.
- Proposed architecture/schema at a high level, with provisional items clearly labelled.
- Phase 0 plan: affected files, dependencies, risks, acceptance criteria, tests, rollback.
- Features included/deferred/out-of-scope for the first phase.
- Questions that require owner decisions.

Wait for explicit owner approval before any implementation. If the repository contains important unexplained files, stop and assess them rather than blindly proceeding.
