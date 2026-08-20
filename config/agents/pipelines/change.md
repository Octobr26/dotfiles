# Change Pipeline

1. Interpreter fixes scope, risk, current state, source of truth, and acceptance criteria.
2. When material facts, options, or external behavior are unknown, follow `research.md` before planning.
3. Pattern Checker compares the preferred direction with the target's existing code, configuration, and ownership.
4. Analyst writes the smallest implementation plan and identifies side effects and verification.
5. Add a specialist only for an actual contract, data, security, runtime, design, or external-service boundary.
6. For risk 2 or 3, Skeptic challenges material assumptions, acceptance coverage, affected ownership, edge cases, and the proposed verification before implementation. Adjudicator closes findings under `challenge.md`.
7. Implementer makes the approved change.
8. Verifier runs focused existing checks or a direct inspection appropriate to the target.
9. Reviewer checks the final result against acceptance criteria, raw verification, and surrounding impact before seeing the Implementer's defense.
10. Adjudicator closes any material review finding under `challenge.md`.

For a cross-project change, freeze the shared interface or decision before independent implementation begins.
