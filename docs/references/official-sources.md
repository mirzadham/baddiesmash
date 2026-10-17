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

## Provider documentation verified on 17 October 2026
The following official sources were verified on **17 October 2026** during Phase 0 bootstrap:

### Supabase (Free Plan — \$0/month)
- **Pricing & Quotas:** https://supabase.com/pricing (accessed 17 Oct 2026)
  - *Verified:* Limit of **2 active Free projects** per organization; **500 MB database size** (shared CPU, 500 MB RAM); **50,000 MAUs**; **5 GB egress + 5 GB cached egress**; **1 GB file storage**.
  - *Consequence:* Supports 1 Staging + 1 Production project; local development uses Docker (`npx supabase start`).
- **Auth Rate Limits:** https://supabase.com/docs/guides/auth/rate-limits (accessed 17 Oct 2026)
  - *Verified:* Built-in Auth email provider is strictly limited to **2 emails per hour per project**. Sign-up/sign-in endpoints allow 30 requests per 5 minutes per IP (burst up to 30); OTP/signup confirmation/password reset requests enforce a 60-second cooldown per user. Custom SMTP or Send Email hooks are supported on the Free Plan to lift the 2 emails/hour cap.
  - *Consequence:* Prefer **Google Sign-In** for initial V1 onboarding (verifies email via OAuth without sending Supabase Auth emails). Document the 2 emails/hour built-in limit and configure Custom SMTP before onboarding multiple email/password users concurrently in the private pilot.
- **Inactivity Pausing:** https://supabase.com/docs/guides/platform/free-project-pausing (accessed 17 Oct 2026)
  - *Verified:* Free projects pause automatically after **7 days (1 week)** of low database query activity. Owner receives a warning email ~7 days prior and a confirmation email upon pause. Paused projects can be resumed in the Dashboard within a **1-year** restore window.
  - *Consequence:* Document resume procedure and optional periodic database health query before pilot launch.
- **Database Backups & PITR:** https://supabase.com/docs/guides/platform/backups (accessed 17 Oct 2026)
  - *Verified:* Automated daily backups (7-day retention on Pro at \$25/mo) and Point-in-Time Recovery (PITR, starting at ~\$100/mo plus Small compute add-on) are **not included on the Free Plan**. Supabase recommends Free-tier projects export logical backups regularly via `supabase db dump`.
  - *Consequence:* Operational runbook for Gate 5 must include manual/scripted `npx supabase db dump` backups before migrations and after sessions.
- **Realtime Limits:** https://supabase.com/docs/guides/realtime/limits (accessed 17 Oct 2026)
  - *Verified:* Free Plan supports **200 concurrent peak connections**, **100 messages/second**, **100 channel joins/second**, **100 channels/connection**, **256 KB broadcast payload**, and **1,024 KB Postgres change payload**.
  - *Consequence:* Well above the concurrency requirements of a single-court badminton group.
- **Row Level Security:** https://supabase.com/docs/guides/database/postgres/row-level-security

### Vercel (Hobby Plan — \$0/month)
- **Hobby Plan & Fair Use:** https://vercel.com/docs/plans/hobby and https://vercel.com/pricing (accessed 17 Oct 2026)
  - *Verified:* Free for **non-commercial, personal use only**. Includes **100 GB Fast Data Transfer/month**, **1,000,000 CDN requests/month**, **10 GB Fast Origin Transfer**. Exceeding monthly limits pauses the deployment for up to 30 days rather than incurring overage charges.
- **Platform Limits:** https://vercel.com/docs/limits (accessed 17 Oct 2026)
  - *Verified:* **100 deployments/day** (and 100 builds/hour), **1 concurrent build**, **45-minute max build duration**, **100 MB CLI static upload limit**, **1-hour runtime log retention**. Hobby projects **cannot** be connected to GitHub Organization repositories (personal GitHub accounts only — compatible with `github.com/mirzadham/badmintonsystem`).

### Frontend Stack References
- React: https://react.dev
- TypeScript: https://www.typescriptlang.org/docs/
- Vite: https://vite.dev/guide/

Do not state a current quota, backup guarantee, API capability or price without verifying the exact current plan and date.
