# Bug-Fix Pipeline

1. Interpreter resolves the exact target, failure path, evidence, and risk.
2. Implementer reproduces or inspects the real failure before editing when feasible.
3. Implementer makes the smallest correction and runs focused existing verification.
4. Reviewer independently checks the diff, affected path, raw verification, and regression risk before seeing the Implementer's defense.
5. Adjudicator closes material findings under `challenge.md`.

Escalate to `change.md` before editing when the fix changes a contract, data ownership, permissions, architecture, or more than one owning path.
If reproduction is unavailable, record why and identify the direct proxy evidence and residual unknown.
Do not use a bug fix to perform adjacent cleanup.
