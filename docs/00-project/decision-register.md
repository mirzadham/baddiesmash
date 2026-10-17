# Decision register

**Status vocabulary**
- **Confirmed:** user accepted the product/operating decision.
- **Provisional:** intended direction, but requires technical validation or later approval.
- **Open:** not decided; agent must ask or propose options.
- **Deferred:** intentionally moved to a later stage.
- **Out of scope:** excluded from current roadmap.

## Confirmed product decisions
- Mobile-first responsive web app, usable on phone/tablet/desktop.
- One group shown in V1 UI; multi-group-ready data model with `group_id` isolation.
- Doubles only, one court, one match at a time.
- Score: at least 21, lead by 2, maximum 30; no point-by-point tracking.
- One authorised controller at a time; handover/takeover logged.
- Select four distinct players, assign visible Team A/B slots, enter two scores, save.
- Score validation immediate and server-side; save retries idempotent.
- 10-second immediate Undo only for original recorder; undo is audited and voids/reverses result.
- Later corrections are authorised and reasoned; corrections trigger deterministic recalculation.
- One active session per group; session is manually started and ended.
- Attendance is separate from match participation; late arrivals can be added.
- Session date/time uses `Asia/Kuala_Lumpur`; store timestamps consistently in UTC where appropriate; display `DD MMM YYYY`.
- Membership invitation-only, email-bound, single-use, expires after 7 days, revocable; invitation does not grant access until authentication/verification and admin approval.
- Individual accounts; email/password with verification and Google sign-in. Google login alone does not grant membership.
- Roles: member, authorised recorder, admin, owner; recorder permissions explicit.
- Owner/admin manage permanent roster and identity merges; recorder can add temporary guests.
- Player identity separate from account; duplicate names allowed; never merge by name alone.
- Returning member profile relinking requires admin verification.
- Member may be approved as viewer without player profile; unconfirmed profiles cannot play official matches.
- Members can dispute any match; one open dispute per match; reasoned resolution; notify recorder and admins.
- In-app notifications only in V1; no email/browser push.
- All-time leaderboard primarily by Elo; seasonal and session rankings separate.
- Session ranking: wins, then win rate, then point difference; exact ties share rank. Show sample sizes.
- Attendance rate = attended sessions / sessions held since profile creation; attendance is not match participation.
- Session point difference counts a player's team points minus conceded points across completed matches.
- Inactive status manually managed; does not change ratings.
- Completed sessions locked by default; reopening is authorised, reasoned, and audited.
- Corrections have no fixed time limit, but require authorisation and reason.
- Current session standings are provisional until finalization.
- Session finalization requires all unfinished matches completed or explicitly voided.
- Abandoned-session warning after 12 hours since meaningful activity; never auto-close.
- Match history filters by session/date, player, status; newest first.
- Copyable WhatsApp session summary after finalization and for older sessions; no shareable image in V1.
- Light/dark themes; follow device by default, manual switch; English V1.
- Optional avatar; no unnecessary personal data; emails private.
- Basic PWA install support, no offline recording or browser push.
- CSV historical import is optional admin-only, preview/validate entire batch, atomic commit; no raw Notes/WhatsApp parser in V1.
- Private GitHub repo initially; free Vercel URL; custom domain later if useful.
- Bootstrap must securely establish one owner/group and then disable itself; no reusable secret in browser.
- Provider backup initially, but verify actual limitations; export not required in V1.
- Data deletion/account anonymisation must explain historical retention and follow applicable privacy requirements.
- Guided coding workflow; phase plan approval required before each implementation phase.
- Controlled command execution; approval for destructive/system-level commands.
- Phase-based Git commits; ask before pushing, force-pushing, or rewriting history.
- Explicit approval for production deployments/migrations/data operations/secrets/policies and recurring costs.
- Maintainable docs, phase reports, verified completion criteria.
- Risk-based ambiguity handling; stop-and-resolve conflicts; decision register.
- Design-system-first, browser-verified where available, milestone UI reviews.
- Technical research from official docs for changing facts; cite verification date/source.
- Build in three stages; features must be labelled included/deferred/out-of-scope.
- Progressive context; prompts self-contained but canonical docs remain source of truth.
- Rationale recorded for critical decisions only.
- Existing repository inspection and preservation required before edits.
- Antigravity is the target harness; core documentation remains portable.

## Provisional technical decisions
- **Stack direction:** React + TypeScript + Vite; Supabase PostgreSQL/Auth/Realtime; Vercel frontend.
- **Rating method:** doubles Elo using average team ratings and outcome-only updates; score margin has no effect.
- **K-factor:** compare K=16, 24, 32 using synthetic histories. K=32 is a candidate, not production-approved.
- **Rating baseline:** 1000; internal decimals preserved; whole-number display.
- **Provisional rating label:** until 3 eligible completed matches. This is a label threshold, not proof of reliability.
- **Recalculation:** deterministic chronological replay; implementation may use transactions or versioned snapshots based on evidence.
- **Physical schema:** logical entity baseline is approved; physical schema remains a reviewed proposal.
- **Hosting limits, backups, inactivity, authentication and pricing:** must be verified from current official documentation before deployment.

## Open decisions / validation tasks
- Confirm exact production Elo configuration after simulations and owner review.
- Validate current Supabase/Vercel free-tier and backup constraints.
- Confirm current Antigravity rule/prompt conventions and migration status before harness-specific setup.
- Choose physical database schema, indexing, transaction and rating-version strategy after repository inspection.
- Decide any technical detail that affects privacy, security, data integrity, costs, or user-visible behaviour through explicit proposal/approval.
- If requirements conflict or evidence shows a requirement is unsafe/impossible, stop affected work and ask the owner.

## Change control
When a material decision changes:
1. Record old and new decision, rationale, date, approving actor, affected files and migration implications.
2. Update canonical requirements and traceability.
3. Identify tests that must change.
4. Never let a prompt silently override this register.
