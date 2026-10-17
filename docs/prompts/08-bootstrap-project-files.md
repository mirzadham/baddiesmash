# Prompt 08 — Install/adapt this knowledge pack in a repository

This prompt authorises a proposed documentation setup only after repository inspection. It does not authorise application implementation.

## Tasks
- Inspect repository and Git status first.
- Determine whether this pack is already at repository root or needs to be copied/adapted.
- Preserve existing instructions; do not overwrite existing `AGENTS.md`, rule files, docs, or uncommitted changes without comparing and proposing a merge.
- Verify current Antigravity official documentation for workspace rules and rule activation. Keep `AGENTS.md` concise; use `.agents/rules/*.md` with valid frontmatter for focused rules.
- Do not depend on legacy Antigravity workflows without checking current status. Use `docs/prompts/` as portable prompt library; if current supported automation is desired, propose a separate adaptation.
- Check for rules file-size limits and avoid excessive always-on context.
- Produce a file-by-file install/merge plan and wait for approval before changing files.

## Acceptance criteria
- No existing work overwritten.
- Clear root entry point.
- Rule files have valid supported frontmatter.
- Prompt library is navigable and self-contained.
- Canonical requirements have a single source of truth.
- No application code is created as part of this documentation setup.
