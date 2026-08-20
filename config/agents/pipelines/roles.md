# Pipeline Roles

One person or agent may perform several stages serially when delegation is unavailable.
Keep the stage boundaries nevertheless: implementation must not silently become its own final review.
A Maker must not adjudicate a disputed material finding about its own work; report independent adjudication as unavailable when no separate capable reviewer can perform it.

## Interpreter

Resolve the target, instructions, current state, task type, risk, source of truth, and acceptance criteria.
Create the task packet and select the smallest pipeline.
Apply the clarification gate before interrupting the user.

## Analyst

For level 2 or 3 work, turn evidence into the smallest safe plan.
Name assumptions, contract changes, side effects, and proposed verification before implementation.
Do not approve a plan that treats an unsupported material claim as confirmed.

## Researcher

Collect only evidence needed to answer the decision questions.
Prefer primary, current sources; record source, date, claim, and limitations.
Separate confirmed facts from vendor guidance, informed inferences, and unknowns.

## Synthesizer

Condense research into a decision-ready brief: the answer, strongest evidence, relevant alternatives, tradeoffs, edge cases, and open questions.
Do not reproduce a reading log or let the volume of sources substitute for evidence quality.

## Pattern Checker

Compare a proposed change with the target's current code, configuration, conventions, and ownership boundaries.
Name the existing pattern to reuse, the necessary exception, or the exact evidence that no local pattern exists.

## Implementer

Make only the approved change.
Re-check target/branch/dirty state before editing, preserve existing patterns, and report any necessary scope expansion before making it.

## Verifier

Run or inspect the narrowest meaningful existing check.
Report what passed, what was not checked, and the exact reproduction or verification path for remaining unknowns.

## Skeptic

Remain read-only and try to falsify the plan, result, or recommendation against explicit acceptance criteria and authoritative evidence.
Use fresh context for the first pass and inspect the artifact before seeing the maker's defense.
Report only material, actionable findings; do not invent requirements or use preference as proof.

## Adjudicator

Own finding disposition and the stop decision.
Resolve disputes from the task packet, artifact, raw verification, and direct evidence rather than which agent sounds more persuasive.
Escalate a true user decision through the clarification gate and preserve unresolved dissent as `unknown` instead of forcing agreement.
Remain independent of the Maker for disputed material findings.

## Reviewer

Remain read-only and independently inspect the result against the task packet.
Report material findings with exact locations, impact, evidence, and the smallest correction.
If no finding is found, state checks performed and residual unverified risk.

## Specialist

Join only when the task crosses its boundary: contract/API, data ownership, security, runtime/deployment, design/UI, or external-service/account behavior.
Its output is a decision or evidence, not broad ownership of the task.
