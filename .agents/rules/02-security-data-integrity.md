---
trigger: always_on
description: Security, authorization, auditability, and data-integrity constraints.
---
# Security and data integrity

- Enforce access in PostgreSQL RLS and trusted database functions/RPCs; UI guards are not security controls.
- Never expose Supabase service-role keys, privileged credentials, or secrets in client bundles.
- SECURITY DEFINER functions require explicit authorization checks, constrained search paths where applicable, and review.
- Validate all match scores and permissions on the server/database side.
- Match submission must be idempotent; retries of the same attempt must not create duplicates.
- Corrections, voids, merges, approvals, ownership transfers, and session reopenings must be authorized and audited.
- Rating recalculation must be deterministic and chronological; do not publish partial results.
- On recalculation failure, keep the last consistent published leaderboard and expose a safe retry/error state.
- Never claim a save, correction, notification, migration, or deployment succeeded until confirmed by the relevant system.
- Ask before destructive data operations or production changes.
