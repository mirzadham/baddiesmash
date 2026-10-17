---
trigger: always_on
description: Core product invariants for the badminton group tracker.
---
# Product invariants

- This is a mobile-first shared badminton tracker for a trusted group, not a public social network.
- V1 UI serves one group, while relevant data records are group-scoped and isolated.
- Doubles only; one court; one match at a time.
- Score rules: first to at least 21, win by 2, hard cap 30. Valid examples include 21–19, 22–20, 30–29; invalid examples include 21–20, 22–21, 30–30.
- Match records are authoritative; ratings and statistics are derived/rebuildable.
- A disputed match stays in the current official results until resolved.
- Never merge player identities by name alone.
- No unapproved feature scope expansion, paid services, production changes, or destructive operations.
- Ask the owner to resolve material requirement conflicts.
