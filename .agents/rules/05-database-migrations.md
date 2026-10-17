---
trigger: glob
globs: "*.sql, **/migrations/**, **/*schema*.*, **/*supabase*.*"
description: Apply to database schema, SQL, Supabase migrations, RLS policies, and trusted functions.
---
# Database and migration rules

- Inspect current schema and migrations before proposing changes.
- Prefer forward, reviewable migrations; never edit an already-applied migration without understanding its environment impact.
- Document constraints and indexes supporting invariants, not just ORM/application assumptions.
- RLS must be enabled and policies tested for every exposed table/view.
- Trusted functions must explicitly check membership, role, group scope, session-controller ownership, and relevant state transitions.
- Avoid relying on frontend role checks.
- Production migration requires explicit owner approval, a backup/recovery plan, and rollback or forward-fix strategy.
- Schema implementation is provisional until the owner approves the phase plan and current Supabase capabilities are verified.
