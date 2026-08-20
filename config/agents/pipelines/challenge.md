# Evidence-Driven Challenge Loop

Use this protocol when a pipeline calls for a Skeptic or when a material assumption, failed verification, or disputed finding could change the result.
The goal is a checkable result, not agreement between agents.
The primary research and the practical inferences behind this protocol are recorded in `evidence.md`.

## Protocol

1. Maker supplies the immutable user request or authoritative requirement, governing instructions, task packet, artifact or plan, acceptance criteria, and raw verification evidence.
2. Skeptic independently checks whether the acceptance criteria faithfully cover the original requirement, then tries to falsify each material criterion using direct code, configuration, documentation, tests, tools, or runtime evidence. On its first pass it does not receive the Maker's defense or broad conversation history.
3. Adjudicator rejects unsupported or out-of-scope criticism and gives each material finding an ID.
4. Maker responds once to each open finding with `accept and fix`, `reject with direct evidence`, or `user decision required`.
5. Verifier reruns only the checks affected by accepted fixes.
6. Skeptic performs a targeted recheck only when the artifact changed or genuinely new evidence was supplied.
7. Adjudicator returns `pass`, `changes required`, `ask Luis`, or `blocked by unknown`.

## Finding Contract

```text
ID:
Acceptance criterion or invariant challenged:
Evidence status: confirmed | inferred | unknown
Exact evidence:
Concrete impact:
Smallest correction or falsifying check:
Disposition: open | fixed | rejected-with-evidence | explicitly-accepted-risk
Risk accepted by, when applicable:
Risk acceptance scope, when applicable:
```

A no-finding result names the checks performed and residual unverified risk.
Style preference, unsupported confidence, repetition, and hypothetical impact without a reachable path are not material findings.

## Stop and Escalation

- One challenge-response round is the default.
- A second correction round is allowed only after new material evidence or a changed artifact.
- If a reasoning finding survives the first correction, improve the evidence or add the relevant specialist or stronger adjudicator; do not replay the same prompt.
- A Maker cannot adjudicate a disputed material finding about its own work. If an independent capable adjudicator is unavailable, report that limitation and do not claim independent closure.
- Stop after two correction rounds. Ask Luis only if the clarification gate is met; otherwise report the unresolved evidence and blocker.
- Closed means every must-fix finding is `fixed`, `rejected-with-evidence`, or `explicitly-accepted-risk`, and the applicable verification passes or is explicitly unavailable.
- `explicitly-accepted-risk` requires Luis or another identified human authority for the affected system. An agent cannot accept material risk on that person's behalf.

## Efficient Use

- Risk 0: skip the challenge loop.
- Risk 1: use focused verification and an independent result review when judgment is involved.
- Risk 2: challenge the plan or recommendation once, then review the verified result.
- Risk 3: challenge before execution and use a fresh independent final reviewer.
- Reuse the evidence ledger and finding IDs. Do not resend entire histories or re-review already closed findings.
