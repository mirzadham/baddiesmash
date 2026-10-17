---
trigger: always_on
description: Guided phase workflow, autonomy boundaries, and approval gates.
---
# Workflow and approvals

- Inspect the repository before editing. Preserve uncommitted work and unexplained files.
- Before every phase, present documents consulted, plan, affected files/schema, risks, dependencies, acceptance criteria, test plan, rollback plan, and deferred scope.
- Wait for explicit owner approval before beginning each phase.
- Routine reversible details may be decided and documented; material changes to security, data integrity, core architecture, product behaviour, or database migrations require approval.
- Stop and resolve conflicting requirements with the owner; do not silently choose one.
- Do not push, force-push, rewrite Git history, deploy production, run destructive production operations, or introduce recurring costs without explicit approval.
- End each phase with actual test evidence, known limitations, documentation updates, and a proposed next plan.
