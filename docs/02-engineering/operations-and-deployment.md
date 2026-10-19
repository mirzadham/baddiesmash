# Operations, hosting, and deployment

## Direction
- Vercel frontend + Supabase managed backend as starting direction.
- Free-tier-first; no recurring paid services without explicit approval.
- Verified provider pricing/quotas, inactivity behaviour, backups, restore paths, auth email limits, realtime limits, and deployment restrictions using official docs (October 2026).

## Verified Provider Constraints (Gate 5 Audit)

### 1. Supabase (Free Plan — $0/month)
- **Database Storage:** 500 MB PostgreSQL database (shared CPU, 500 MB RAM). Well in excess of the storage required for 5,000+ doubles badminton matches and audit rows (~15–20 MB).
- **Authentication & Email Quotas:**
  - Built-in SMTP service enforces a hard limit of **2 emails per hour per project**.
  - **Pilot Recommendation:** Use **Google OAuth** for initial V1 member onboarding (verifies email directly without consuming built-in SMTP quota), or connect a verified custom SMTP provider (e.g., Resend or SendGrid) if onboarding email/password accounts in bulk.
  - Sign-in/sign-up rate limit: 30 requests per 5 minutes per IP.
- **Inactivity Pausing:**
  - Free projects pause automatically after **7 days (1 week)** of zero meaningful database query activity.
  - An email notification is sent to the project owner ~7 days before pause, and an alert is sent when paused.
  - Paused projects can be restored directly via the Supabase Dashboard within a **1-year window** without data loss.
  - **Operational Guard:** If a session is scheduled after a 7-day hiatus, the group owner/admin must verify project status 24 hours in advance, or maintain a light weekly ping.
- **Backups & Point-in-Time Recovery (PITR):**
  - Automated backups and PITR are **not included** on the Free Plan (PITR requires Pro at $25/mo + compute add-on).
  - Disaster recovery relies on **manual/scripted logical backups** via the Supabase CLI (`npx supabase db dump`).

### 2. Vercel (Hobby Plan — $0/month)
- **Bandwidth & Requests:** 100 GB Fast Data Transfer/month, 1,000,000 CDN requests/month, 10 GB Fast Origin Transfer. Exceeding limits pauses deployments rather than incurring unexpected bills.
- **Repository Constraints:** Hobby accounts connect to **personal GitHub repositories only** (`github.com/mirzadham/badmintonsystem`), not GitHub Organizations.
- **Build Limits:** 100 deployments/day, 1 concurrent build, 45-minute build timeout limit.

---

## Environments

| Environment | Purpose | Supabase Project | Frontend URL | Database State |
|:---|:---|:---|:---|:---|
| **Local Dev** | Feature development & automated testing | Local Docker / in-memory PGlite | `http://localhost:5174/` | Empty seed (`supabase/seed.sql`) |
| **Staging** | Pre-release validation & smoke tests | `badminton-tracker-staging` | `https://badminton-tracker-staging.vercel.app` | Isolated test group |
| **Production** | Trusted private group pilot | `badminton-tracker-prod` | `https://badminton-tracker.vercel.app` | Real group data only |

- Keep secrets strictly separated by environment.
- Never place `service_role` secrets, database passwords, or raw invitation tokens into client code, public logs, or Git.

---

## Deployment Gates & Procedures

### Pre-Deployment Verification Checklist
1. All automated tests pass: `npx vitest run` (10 test files, 67 tests passing).
2. TypeScript static typecheck passes: `npm run typecheck` (`tsc --noEmit`, 0 errors).
3. Production build succeeds: `npm run build` (`dist/` generated cleanly).
4. Local seed cleanliness confirmed: `supabase/seed.sql` verified to have 0 synthetic rows.
5. Migration order verified:
   - `20261018000001_phase1_foundation_schema_and_rls.sql`
   - `20261018000002_phase2_sessions_matches_and_elo_replay.sql`
6. Explicit owner approval obtained prior to applying migrations to staging or production.

---

## Backups & Disaster Recovery Runbook

Provider backups on the Free tier are unavailable. Logical SQL backups must be taken before applying migrations and following significant group sessions.

### 1. Manual Backup via Supabase CLI
```bash
# Full logical dump (schema and data)
npx supabase db dump --db-url "$DATABASE_CONNECTION_STRING" -f "supabase/backups/backup_$(date +%Y%m%d_%H%M%S).sql"

# Data-only dump (table records, match ledger and audit events)
npx supabase db dump --db-url "$DATABASE_CONNECTION_STRING" --data-only -f "supabase/backups/data_$(date +%Y%m%d_%H%M%S).sql"
```

### 2. Recovery / Restore Procedure
In the event of accidental data corruption or failed manual maintenance:
```bash
# 1. Connect to PostgreSQL using psql or Supabase SQL Editor
# 2. Restore from the most recent known consistent logical dump:
psql "$DATABASE_CONNECTION_STRING" -f "supabase/backups/backup_YYYYMMDD_HHMMSS.sql"

# 3. Trigger full deterministic recalculation to verify publication status:
SELECT public.retry_failed_recalculation('GROUP_UUID_HERE', 'Post-restore verification replay');
```

---

## Owner Lockout Recovery

- Owner lockout recovery relies strictly on verified Supabase project dashboard access (`app.supabase.com`).
- There are no hard-coded backdoors or automatic ownership transfers.
- At least one trusted group member should be promoted to the `admin` role following initial pilot setup to maintain administrative continuity if the owner is unreachable.
