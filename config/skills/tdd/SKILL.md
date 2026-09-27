---
name: tdd
description: Focused test-first implementation for behavior changes with an existing test boundary. Use for requested TDD, red-green-refactor, or when the selected workflow calls for a failing behavioral test. Skip mechanical edits and checks that only mirror implementation.
---

# Focused TDD

Follow the target project's instructions and the authorized task scope.
Identify the observable behavior, meaningful edge cases, existing callable boundary, and narrow test command before editing.
Reuse a suitable existing test pattern and boundary; an explicitly requested behavior and established test seam do not require another confirmation.
Ask only when an unresolved test decision materially changes behavior, scope, cost, or authority.
New fixtures, mocks, snapshots, and verification-only helpers still require a user request or an explanation of necessity and approval.

## One verified behavior at a time

1. Write one focused test through the interface the caller actually uses.
   Derive expected results from a requirement, independently worked example, or verified reference, not the implementation's own calculation.
2. Run the narrow test and confirm it fails for the intended behavior, rather than broken setup or an unavailable dependency.
3. Make the smallest implementation change that passes it.
4. Refactor only within the authorized change while the relevant tests remain green.
5. Repeat for the next meaningful behavior, then run required project checks and review the resulting diff.

If a test cannot exercise the actual failure pattern, explain the limitation and use the workflow's strongest available verification.
Do not manufacture a shallow test merely to claim regression coverage or redesign an interface solely to produce a test.
Use `codebase-design` only when interface shape is already part of the authorized work.

## Test quality

- Assert observable results, not internal call order or private state, unless ordering is itself a specified external contract.
- Prefer expected values that can disagree with an incorrect implementation.
- Keep each test focused on one behavior, using the assertions needed to establish it.
- Build tests and implementation incrementally rather than writing a speculative test suite first.
- Preserve existing meaningful tests; replace coverage only after showing that required behavior is still covered.

Consult [tests.md](tests.md) for examples and [mocking.md](mocking.md) when external dependencies affect testing.
Operational save-and-reread checks remain necessary when the selected workflow requires them; the warning against side-channel unit tests does not replace live readback.
Report failing/passing evidence and unverified behavior.
Committing, publishing, and external writes remain governed by the user's task authority.
