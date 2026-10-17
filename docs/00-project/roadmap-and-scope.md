# Roadmap and scope

## Stage 1 — Reliable foundation / private pilot
- Repository/tooling setup after approved plan.
- Secure bootstrap and group setup.
- Authentication, invitation redemption, email verification, membership approval, roles.
- Player profiles, roster, guest handling, attendance.
- Session lifecycle, controller/handover, stale warnings.
- Match entry, score rules, incomplete match handling, idempotency, failure recovery, immediate Undo, corrections.
- Match history and essential player profiles.
- All-time and current-session leaderboards.
- Candidate Elo implementation only behind tested configuration; production rating settings require approval after simulation.
- Audit trail, essential in-app status/error states.
- RLS/trusted functions and security tests.
- Staging, browser verification, release gate and controlled private pilot.

Stage 1 does not mean “prototype without safeguards.” Authentication boundaries, score validation, data integrity, deterministic ratings, recovery, and evidence-based release criteria are mandatory.

## Stage 2 — Complete experience
- Custom seasons and seasonal ratings.
- Disputes and resolution workflows.
- In-app notification centre.
- Partnership analytics, attendance statistics, rating progression.
- Session summary sharing.
- Historical CSV import with full-batch validation and atomic commit.
- Rating methodology page and extended profile/history filters.
- Basic PWA installation guidance and polish.

## Stage 3 — Optional enhancements
- AI-generated recap based strictly on verified data.
- Additional analytics driven by real usage.
- Other capabilities only after a demonstrated need and owner approval.

## Scope control
Every feature in the implementation plan must be marked:
- Included in current phase
- Deferred to a named later stage
- Out of scope
- Blocked pending decision

Do not silently omit requirements. A phase may not pull in deferred work without approval. Update this roadmap and the decision register when scope changes.
