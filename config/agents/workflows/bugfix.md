# Bug-Fix Workflow

1. Interpreter resolves the exact target, failure path, evidence, and risk. If
   the failure occurs in a shared rule, identify the executable authority,
   independently deployed consumers, and alternate runtime paths before editing.
2. Implementer reproduces or inspects the real failure before editing when feasible.
   Use [diagnosing-bugs](../../skills/diagnosing-bugs/SKILL.md) when the cause remains uncertain, is disputed, or needs controlled runtime/performance comparison.
   Use [domain-modeling](../../skills/domain-modeling/SKILL.md) only when a material term or state ambiguity changes expected behavior.
3. Implementer makes the smallest correction and runs focused existing verification.
   Use [tdd](../../skills/tdd/SKILL.md) when an existing test boundary can cover the actual failure pattern within authorized test scope.
4. Reviewer independently checks the diff, affected path, raw verification, and regression risk before seeing the Implementer's defense.
5. Adjudicator closes material findings under `challenge.md`.

Escalate to `change.md` before editing when the fix changes a contract, data ownership, permissions, architecture, or more than one owning path.
If reproduction is unavailable, record why and identify the direct proxy evidence and residual unknown.
Do not use a bug fix to perform adjacent cleanup.
