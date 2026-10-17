# Operations, hosting, and deployment

## Direction
- Vercel frontend + Supabase managed backend as starting direction.
- Free-tier-first; no recurring paid services without explicit approval.
- Verify current provider pricing/quotas, inactivity behaviour, backups, restore paths, auth email limits, realtime limits, and deployment restrictions using official docs at time of deployment.

## Environments
- Local development.
- Staging/test database.
- Production with real group data.
- Keep secrets and credentials environment-specific. `.env.example` includes variable names and placeholders only, never real values.

## Deployment gates
- Tests and production build pass.
- RLS/RPC permission tests pass.
- Migrations reviewed, safe order documented, and recovery/rollback or forward-fix plan approved.
- No known critical security/data-integrity failures.
- Rating replay deterministic; failure mode preserves last valid publication.
- Staging smoke test passed.
- Owner explicitly approves production deployment/migration.
- Confirm monitoring/error visibility and a recovery contact/path.

## Backups and recovery
- Provider backup is disaster recovery, not a replacement for application audit history.
- Verify what the chosen plan actually backs up, retention period, restore granularity, and whether point-in-time recovery is paid.
- Data export is not required in V1, but owner can revisit.
- Owner lockout recovery relies on provider-supported verified control; no hidden backdoor or automatic ownership transfer.
- Encourage at least one trusted backup admin, but do not block initial setup.

## Git and secrets
- Private repository during development/pilot.
- Logical commits after verified milestones; never commit secrets.
- Ask before push, force push, history rewrite or remote changes.
- Free Vercel URL initially; custom domain later only if useful and approved.
