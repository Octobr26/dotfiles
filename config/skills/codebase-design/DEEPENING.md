# Consolidating a module

Start from observed change friction and the interface described in [SKILL.md](SKILL.md).
Consolidation should reduce caller knowledge while preserving behavior and ownership.

| Dependency | Design and verification considerations |
| --- | --- |
| In-process calculation | Prefer direct behavioral tests through an existing interface; merging code is optional |
| Local service or database | Reuse existing test facilities and document differences from production |
| Independently deployed owned service | Preserve transport, version, failure, authorization, and compatibility contracts |
| External vendor | Isolate vendor-specific operations where justified; retain authorized live readback for operational claims |

Introduce an adapter for an actual need such as ownership, policy, compatibility, substitution, or test isolation.
An extra adapter is not a goal or a prerequisite by itself.
Creating test substitutes or mock infrastructure follows the project's approval rules.

Inventory observable behaviors protected by existing tests before replacing coverage.
Remove tests only when the authorized refactor makes them obsolete and equivalent required coverage has been demonstrated.
If consolidation changes a contract or deployment relationship, return to the workflow's plan and specialist checks before implementation.
