# Glossary

- **Account:** Authentication identity, such as verified email/password or Google login.
- **Membership:** Approved access of an account to the group.
- **Player profile:** Stable sporting identity used in match history and ratings; separate from account.
- **Account-player link:** Admin-confirmed relationship between an account and a player profile.
- **Recorder:** Approved member allowed to record/manage sessions; only one controller active at a time.
- **Controller:** The recorder currently holding write control of an active session.
- **Guest:** Temporary player profile usable in matches before promotion/linking.
- **Completed match:** Validated score and four distinct participants; eligible for official statistics and ratings unless later voided.
- **Incomplete match:** Saved draft, resumable, excluded from official stats/ratings.
- **Voided match:** Preserved in history with reason/audit, excluded from official stats/ratings.
- **Disputed match:** Match with an open dispute; current result remains official until resolved.
- **Session:** A manually created and finalized badminton gathering; one active session per group.
- **Season:** Owner-defined date range; session is assigned at creation and retains that assignment.
- **Elo:** Relative rating estimate based on expected outcome versus actual outcome, not objective proof of skill.
- **Provisional rating:** Rating label shown until player has three eligible completed matches.
- **Rating version:** Published, internally consistent calculation built from a specific match-data state and rules version.
- **Idempotency key/submission ID:** Stable identifier that makes retrying one logical submission safe from duplicate creation.
- **Meaningful session activity:** Match record/correction, attendance update, or completed handover; page views/refreshes do not reset stale timer.
