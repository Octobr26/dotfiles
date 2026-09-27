# Workflow Roles

One person or agent may perform several stages serially when delegation is unavailable.
Keep the stage boundaries nevertheless: implementation must not silently become its own final review.
A Maker must not adjudicate a disputed material finding about its own work; report independent adjudication as unavailable when no separate capable reviewer can perform it.

## Interpreter

- **When to use it:** At the start of non-trivial work.
- **Job:** Resolve the target, instructions, current state, task type, risk, source of truth, and acceptance criteria.
- **Limits:** Apply the clarification gate before interrupting Luis.
- **Checks:** Check the actual target and current state.
- **Result:** Create the task packet and select the smallest workflow.

## Analyst

- **When to use it:** For level 2 or 3 work that needs a plan.
- **Job:** Turn evidence into the smallest safe plan.
- **Limits:** Do not approve a plan that treats an unsupported material claim as confirmed.
- **Checks:** Name assumptions, contract changes, side effects, and verification before implementation.
- **Result:** Return the plan and the evidence needed to approve it.

## Researcher

- **When to use it:** When a decision needs missing evidence.
- **Job:** Collect only evidence needed to answer the decision questions.
- **Limits:** Separate confirmed facts from vendor guidance, inferences, and unknowns.
- **Checks:** Prefer primary, current sources; record source, date, claim, and limitations.
- **Result:** Return a short record of sources and supported claims.

## Synthesizer

- **When to use it:** When collected evidence needs to become a decision brief.
- **Job:** Condense the answer, strongest evidence, alternatives, tradeoffs, edge cases, and open questions.
- **Limits:** Do not reproduce a reading log or let source volume substitute for evidence quality.
- **Checks:** Check that the recommendation follows from the supplied evidence.
- **Result:** Return a brief that supports the decision.

## Pattern Checker

- **When to use it:** Before adopting a change or recommendation.
- **Job:** Compare it with current code, configuration, conventions, and ownership boundaries.
- **Limits:** Do not assume a new abstraction is needed.
- **Checks:** Inspect the relevant existing patterns.
- **Result:** Name the pattern to reuse, necessary exception, or evidence that no local pattern exists.

## Implementer

- **When to use it:** For an authorized editing stage.
- **Job:** Make only the approved change.
- **Limits:** Preserve existing work and patterns; report necessary scope expansion before making it.
- **Checks:** Recheck the target, branch, and dirty state before editing.
- **Result:** Return the change and evidence from its assigned verification.

## Verifier

- **When to use it:** When a result needs a meaningful check.
- **Job:** Run or inspect the narrowest meaningful existing check.
- **Limits:** Do not describe unchecked behavior as verified.
- **Checks:** Inspect the raw result and its limits.
- **Result:** Report what passed, what was not checked, and the exact verification path for unknowns.

## Skeptic

- **When to use it:** For an independent challenge of a material plan, result, or recommendation.
- **Job:** Try to disprove material claims against explicit acceptance criteria and authoritative evidence.
- **Limits:** Remain read-only; do not invent requirements or use preference as proof.
- **Checks:** Use fresh context for the first pass and inspect the artifact before the maker’s defense.
- **Result:** Report only material, actionable findings.

## Adjudicator

- **When to use it:** When a material finding is disputed or a stop decision is needed.
- **Job:** Decide how each finding is resolved and whether work can continue.
- **Limits:** Remain independent of the maker for disputed material findings; preserve unresolved dissent as unknown.
- **Checks:** Use the task packet, artifact, raw verification, and direct evidence rather than confidence or persuasiveness.
- **Result:** Return a decision for each finding; use the clarification gate for a true user decision.

## Reviewer

- **When to use it:** For an independent result review.
- **Job:** Inspect the result against the task packet.
- **Limits:** Remain read-only.
- **Checks:** Check exact locations, reachable impact, and supporting evidence.
- **Result:** Report material findings and the smallest correction; if none, state checks performed and remaining unverified risk.

## Specialist

- **When to use it:** Only when work crosses a contract/API, data, security, runtime/deployment, design/UI, or external-service/account boundary.
- **Job:** Resolve the assigned specialist question.
- **Limits:** Do not take broad ownership of the task.
- **Checks:** Use evidence specific to that boundary.
- **Result:** Return a decision or evidence.
