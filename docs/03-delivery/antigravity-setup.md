# Antigravity setup guidance

## Important distinction
The Markdown product docs are ordinary project files. Antigravity may automatically load recognised instruction files, but it does not automatically inject every Markdown document into every task. Each prompt must explicitly identify required files.

## Rule entry points
Official documentation checked 17 Oct 2026 described:
- Workspace `AGENTS.md` / `GEMINI.md`.
- `.agents/rules/*.md` with YAML frontmatter and supported `trigger` values.
- `always_on`, `model_decision`, `glob`, and `manual` activation modes.
- Focused rule files and progressive disclosure to avoid context bloat.

Verify these conventions in current Antigravity docs and your installed version before installing/adapting this pack. Use `.agents/rules/` immediate children unless current docs explicitly support another configuration. If nested rule directories are needed, verify registration mechanism first.

## Prompt use
Use `docs/prompts/*.md` as the portable prompt library. Copy the appropriate prompt into Antigravity chat or use a supported current mechanism. Each prompt states required docs explicitly.
- Bootstrap first.
- Then plan a single phase.
- Approve plan explicitly.
- Run implementation prompt.
- Run independent verification.
- Repeat with a new approved plan.
- Release-readiness prompt assesses gates but does not itself authorise production deployment.

## Permissions
Configure Antigravity permission settings to match the governance in `AGENTS.md`. Do not assume prompt instructions override tool-level permissions. Ask before external/network commands when required, destructive operations, remote Git actions, production changes, and recurring costs.
