# Architecture and technical direction

## Preferred direction (provisional until repository/platform verification)
- Frontend: React + TypeScript + Vite.
- Managed backend/data: Supabase PostgreSQL, Auth and Realtime.
- Hosting: Vercel frontend.
- Avoid custom Express backend initially.
- Deterministic match/rating logic may live in trusted PostgreSQL functions/RPCs where appropriate; privileged AI API calls, if later added, must be server-side.
- No microservices or custom infrastructure without evidence and owner approval.

## Constraints
- Free-tier-first, minimise recurring costs.
- Verify current free-tier quotas, inactivity behaviour, backup/recovery, auth/email requirements, realtime limits and deployment restrictions from official documentation before committing.
- One group in V1 UI; group-scoped data model with `group_id` on relevant records and enforced isolation.
- Small group now (typically 4–5 attend), but design for years, hundreds of sessions and thousands of matches without premature scale engineering.
- Paginate history and add evidence-based indexes.
- Benchmark realistic synthetic histories before introducing background jobs or more complex recalculation architecture.
- No offline match recording in V1.

## Required system qualities
- Security enforced in database/server, not only frontend.
- Consistent confirmed writes and idempotent retries.
- Rebuildable statistics and ratings.
- Deterministic replay and auditable history.
- Safe failure behaviour and preservation of last consistent rating publication.
- Test/staging environment separate from production.
- Secrets never in Git or browser bundles.
- Architecture decisions with material consequences require owner approval.

## Technical research
For time-sensitive details, consult current official documentation. Record source URL, access/verification date, what was verified, limitations, and the design consequence. Do not rely solely on model memory or outdated tutorials.
