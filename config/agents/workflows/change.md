# Change Workflow

1. Interpreter fixes scope, risk, current state, source of truth, and acceptance
   criteria. When a rule already exists in executable code, name that authority
   and the consumers that independently interpret it.
2. When material facts, options, or external behavior are unknown, follow `research.md` before planning.
3. Pattern Checker compares the preferred direction with the target's existing code, configuration, and ownership.
   Use [domain-modeling](../../skills/domain-modeling/SKILL.md) when terminology or ownership ambiguity changes the requirement.
   Use [codebase-design](../../skills/codebase-design/SKILL.md) only when an interface or architecture decision is part of the change.
4. Analyst writes the smallest implementation plan, its side effects, and how to check the observable behavior and edge cases.
   Include examples that could disprove the plan.
   If more than one component implements a shared rule, identify its consumers, how they are deployed, and alternative runtime paths; compare the implementations using the same examples.
   When a suitable existing test boundary exists, plan a focused failing test before implementation.
   Split multi-part work into independently verifiable behavior slices and name only dependencies that actually block them.
   For a mechanical migration that cannot land in slices, plan compatible expansion, caller migration, and removal where feasible; otherwise keep one bounded integration change with an explicit verification point.
   Planning slices does not authorize tracker publication or unrelated preparatory refactoring.
5. Add a specialist only for an actual contract, data, security, runtime, design, or external-service boundary.
6. For risk 2 or 3, Skeptic challenges material assumptions, acceptance coverage, affected ownership, edge cases, and the proposed verification before implementation. Adjudicator closes findings under `challenge.md`.
7. Implementer makes the approved change. When test-first work was planned,
   make the focused test pass with the smallest change before refactoring.
   Follow [tdd](../../skills/tdd/SKILL.md) for each planned test-first slice and inspect its result before starting the next.
8. Verifier runs focused existing checks or a direct inspection appropriate to the target.
9. Reviewer checks the final result against acceptance criteria, raw verification, and surrounding impact before seeing the Implementer's defense.
10. Adjudicator closes any material review finding under `challenge.md`.

For a cross-project change, freeze the shared interface or decision before independent implementation begins.
