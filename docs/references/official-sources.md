# Official technical sources

**Research note:** Links were checked while preparing this pack on 17 October 2026. Verify again when configuring Antigravity or deploying because product documentation and limits change.

## Google Antigravity
- Rules and activation modes: https://antigravity.google/docs/rules/
  - Describes workspace `AGENTS.md` / `GEMINI.md`, `.agents/rules/*.md`, trigger frontmatter, scopes and progressive disclosure.
- Rules and includes / size limits: https://www.antigravity.google/docs/rules/
  - Describes rule includes, per-file 24 KB limit and aggregate always-on budget. Recheck current limits before setup.
- Workflows: https://www.antigravity.google/docs/ide/workflows/
  - At time checked, documentation announced a workflow-system transition around 19 October 2026. Do not make this pack dependent on legacy workflow support; verify current state.
- Getting started / projects: https://www.antigravity.google/docs
  - Describes project folder scope and project setup.
- Permissions: https://www.antigravity.google/docs/permissions
  - Describes default command sandbox/approval and permission behaviour; verify settings in actual installation.

## Provider documentation to verify during implementation
The agent must consult current official sources before choosing final configuration. Add exact source URLs and access date to phase reports:
- Supabase: https://supabase.com/docs
- Supabase pricing: https://supabase.com/pricing
- Supabase security/RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase backups: https://supabase.com/docs/guides/platform/backups
- Vercel docs: https://vercel.com/docs
- Vercel pricing: https://vercel.com/pricing
- React: https://react.dev
- TypeScript: https://www.typescriptlang.org/docs/
- Vite: https://vite.dev/guide/

Do not state a current quota, backup guarantee, API capability or price without verifying the exact current plan and date.
