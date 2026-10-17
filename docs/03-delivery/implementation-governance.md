# Implementation governance

## Autonomy
- Agent independently implements/tests within approved phase and spec.
- Owner approval required for major scope/security/architecture decisions.
- Before every phase, agent submits plan and waits.
- Routine reversible details can be decided and documented.
- Any conflict: stop-and-resolve, not silent latest-wins.

## Command and Git policy
- Routine development commands, tests, builds and DB checks allowed.
- Explain before package installation; ask before destructive commands, untrusted scripts, system-level configuration or risky changes.
- Use feature branches where useful and logical commits after verified milestones.
- Never commit secrets.
- Ask before pushing, force-pushing, rewriting history or changing remote.
- Never discard uncommitted work without approval.

## Phase proposal must include
1. Objective and scope.
2. Canonical documents consulted.
3. Requirements addressed and traceability IDs.
4. Files and schema likely to change.
5. Dependencies and current official docs to verify.
6. Security/data-integrity risks.
7. Acceptance criteria and test plan.
8. Rollback/recovery plan.
9. Deferred/out-of-scope items.
10. Questions requiring owner decision.

## Phase completion report
- Implemented changes and files.
- Actual commands and test outcomes.
- Browser/visual evidence where available.
- Security checks performed and not performed.
- Known issues, limitations, and assumptions.
- Documentation/decision register/traceability updated.
- Commit ID if created.
- Proposed next phase plan; wait for approval.

## Decision register maintenance
Update only after approved material decisions. Record date, decision, rationale, alternatives when important, owner approval, affected docs/tests, migration implications, and whether decision is confirmed/provisional/deferred.
