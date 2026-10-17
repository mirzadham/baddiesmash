# Product vision and principles

## Problem
The group currently records doubles matches, teams, resting players, scores, and winners in mobile Notes, then copies the information into an AI tool to produce reports and visualisations for WhatsApp. This is fragmented and cumbersome.

## Vision
A shared, private, mobile-first web app where approved group members can view reliable rankings, match history, sessions, player statistics, and rating progression. An explicitly authorised volunteer records results from their own device during each session; the volunteer may change week to week.

## Product principles
1. **Trust results:** save confirmation must reflect server confirmation.
2. **History is the source of truth:** ratings and statistics are derived and rebuildable.
3. **Transparent ratings:** show sample sizes, provisional status, rating changes, and methodology.
4. **Private by default:** no public group browsing; approved membership is required.
5. **Small-group simplicity:** avoid unnecessary infrastructure and premature scale optimisation.
6. **Mobile-first:** match entry must be usable courtside on an ordinary phone.
7. **Auditable changes:** corrections, voids, merges, handovers, approvals, and sensitive admin actions are traceable.
8. **Human approval for risk:** the agent must ask before consequential architectural/security/scope decisions and production operations.
9. **Build in verified stages:** complete and test a foundation before expanding.
10. **No AI invention:** future AI summaries may narrate verified facts, never calculate or invent official statistics.

## Intended users
- Group owner
- Admins
- Approved members/viewers
- Explicitly authorised session recorders
- Players with confirmed player profiles
- Temporary guests represented in session data before later identity resolution

## Success criteria
- A recorder can create a session, set attendance, record a valid match quickly, and receive confirmed save feedback.
- Other approved members see the same central results and current-session stats.
- Invalid scores and duplicate retries cannot corrupt the history.
- A correction deterministically recalculates affected ratings.
- Unauthorised members cannot read or mutate group data.
- Failed saves and failed recalculations are visible and recoverable.
- A private pilot can run without mixing test data into production.

## Non-goals for V1
- Public discovery or public leaderboard access.
- Singles matches or multi-court operations.
- Point-by-point tracking.
- Offline match recording/synchronisation.
- Email or browser-push notifications.
- AI-generated recaps as a core capability.
- Multi-group UI, although data model should be group-ready.
- Large-scale distributed infrastructure.
