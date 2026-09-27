---
name: codebase-design
description: Evaluate interface shape, coupling, ownership, and testability when an authorized design or refactor needs those decisions. Use for architecture alternatives or repeated change friction; skip routine fixes and speculative abstraction.
---

# Codebase design

Use the project's existing domain vocabulary and architectural constraints.
An interface includes what callers must know: inputs, results, invariants, sequencing, errors, configuration, and relevant performance limits.
A useful module hides substantial complexity behind a manageable interface.
This is a design aid, not a mandate to rename services, APIs, components, or boundaries.

## Evaluate the actual change

- Identify callers, owner, dependencies, and concrete friction in the requested work.
- Ask whether the interface can become simpler while preserving required behavior.
- Apply the deletion check: if the abstraction disappears, does complexity disappear or spread into callers?
  Preserve adapters that earn their place through policy, compatibility, ownership, or test isolation even with one production implementation.
- Keep related knowledge and changes together without merging independently owned or deployed systems merely for visual simplicity.
- Prefer testable outcomes at existing public boundaries; passing dependencies can help when it fits the current design.
- Separate calculation from side effects where useful, preserving required operational writes and readbacks.

Check tradeoffs against current code and real callers rather than hypothetical future requirements.
Use [DEEPENING.md](DEEPENING.md) when dependency boundaries affect proposed consolidation.
Use [DESIGN-IT-TWICE.md](DESIGN-IT-TWICE.md) only when alternative interfaces could resolve a material design uncertainty.

Keep recommendations within task scope.
Changing ownership, contracts, or deployed boundaries requires the relevant workflow checks.
Preserve meaningful tests and public behavior; an abstraction preference does not authorize test deletion, broad refactoring, commits, or external writes.
