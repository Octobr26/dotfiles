# Research and Synthesis Workflow

Use this route when a decision needs external research, repository discovery, comparison, or an evidence-backed recommendation before a change is proposed.
It is read-only unless the user separately requests an implementation.
For a scoped code investigation before implementation, apply [Investigation completion and handoff](#investigation-completion-and-handoff) before declaring readiness or passing findings to an implementer.

## Route

1. Interpreter writes the decision question, target, deadline or freshness requirement, and what outcome the research must support.
2. Researcher maps what is already known from local instructions, source code,
   configuration, prior decisions, and the current runtime. When a behavior is
   interpreted in more than one place, it identifies the code that defines the behavior,
   every consumer and runtime variant, and the inputs that would falsify a
   proposed interpretation.
3. Researcher collects only the missing evidence. Prefer primary documentation, source repositories, standards, official records, and direct runtime evidence. Use secondary commentary to discover leads, not as the sole basis for material claims.
4. Researcher records a compact evidence ledger: source, date or version, claim
   supported, relevance, limitation, and—where a semantic rule is duplicated—the
   same examples run against each implementation and the measured output differences.
5. Synthesizer produces the decision brief: confirmed facts, inferences, alternatives, tradeoffs, edge cases, unknowns, and a recommended next step.
6. Pattern Checker compares the recommendation against existing local patterns, ownership, configuration, and constraints. It identifies what can be reused and what would be an exception.
   Use [domain-modeling](../../skills/domain-modeling/SKILL.md) when a consequential term or ownership ambiguity changes the decision.
   Use [codebase-design](../../skills/codebase-design/SKILL.md) only when interface alternatives are part of the research question.
   These references do not authorize code changes or glossary writes during read-only research.
7. For a material recommendation, Skeptic independently challenges assumptions, source quality, edge cases, and local fit under `challenge.md`. Add a specialist when the decision crosses a high-risk boundary.
8. Adjudicator returns `accept`, `revise`, `ask Luis`, or `blocked by unknown`; agreement alone is not a verdict.

## Investigation completion and handoff

Use this contract when Luis asks to investigate a scoped change, diagnose a failure, or collect evidence before implementation.
Work backwards from each requested outcome: identify the decision implementation needs, then gather the evidence that settles it.
Keep the investigation read-only for the subject; an implementation recommendation does not authorize edits.

1. Preserve the original request and distinguish required behavior, observed current behavior, and proposed changes.
   Current code establishes what happens; the request, project contract, or an explicit user decision establishes what should happen.
   Keep earlier review findings visible with their source and disposition: supported, refuted with evidence, or unresolved.
2. Trace the actual entry point to the behavior owner and affected consumers under [Trace the affected behavior](README.md#trace-the-affected-behavior).
   Inspect relevant production and test patterns before recommending a new helper, shared prop, mapping, or test seam.
3. Support each consequential claim with an exact source/revision or observation, the condition it covers, and the result it establishes.
   Explain the decisive branch, query predicate, transformation, or measured output; a file list or citation without that connection is insufficient.
   State what the evidence cannot establish, including deployed behavior or a page interaction not observed.
4. Try to disprove each consequential interpretation with a discriminating example: an input or state where the plausible alternatives produce different results.
   Derive the expected result from the requirement and producer contract before inspecting whether existing assertions agree.
   Use decisive source tracing or existing executable checks within current authority; record inferred results separately from observed outputs.
   For a shared rule, apply the same example to its affected consumers; investigate conflicting results rather than choosing the implementation that already has tests.
5. Return the compact handoff below, retaining unresolved facts and proposed policy choices explicitly.
   A coordinator passes this evidence with the implementation task, preserving its limits and open findings instead of reducing it to a solution summary.
   The implementer checks the cited decisive sources and acceptance examples against the actual task revision before editing.
   Changed evidence requires a targeted recheck; unsupported material choices return to investigation or Luis under the clarification gate.

```text
Original request and scope:
Target repository/worktree; authoritative producer and affected consumer symbols/revisions:
Affected entry point and path; allowed values, units, population and filters where relevant:
Consequential claims: status, decisive source/observation, condition → result, limits:
Counterexamples: input/state → expected result, independent requirement/contract source, actual observation or inference:
Existing pattern and smallest proposed change:
Prior findings and unresolved choices: disposition, impact, next check or user decision:
Readiness by behavior slice: supported | blocked, with reason; implementation authority:
```

Readiness is supported only when every acceptance-changing decision in that slice has decisive evidence or Luis's recorded decision, its affected path is traced, and the discriminating examples have sourced expectations.
Name remaining verification limits and the check needed after implementation; source inspection may support a plan without proving runtime acceptance.
When a material unknown remains, mark that slice blocked and continue independent investigation or already-authorized work.
Finish a bounded investigation with those limits if evidence is unavailable; completeness means accounting for the gap, not declaring it resolved.
Scale the handoff to the task and reuse an existing report or task packet; a new document, agent, or approval round is not required by this contract.
Keep persistent personal investigation reports outside project repositories unless Luis requests project documentation.

### Cross-repository behavior plan

Before implementing coupled producer/consumer behavior across repositories or independent deployments, complete this contract in the existing plan or handoff.
Use it for the whole requested outcome even when Luis authorizes only an initial draft slice; it describes the destination and dependencies, not permission to edit every repository.
For each acceptance outcome, record:

- **Behavior and ownership:** the real entry point, producer and consumer at inspected revisions, intended result, and owning implementation slice.
  Cite the requirement or decision for the intended result; identify proposed contract changes separately from current behavior.
  Settle eligibility versus contextual matching, identity and self-filter semantics where they affect the outcome.
- **Interface and lifetime:** the planned request/response and each resource's owner, compared with the target repository's canonical implementations.
  Explain what depends on organization, dates or selections, how callers cache and invalidate it, and the resulting request frequency and serialized payload bound.
  Include both unrestricted and narrowed scopes when a caller turns a result list into request parameters.
- **State and verification:** concrete input → expected result examples that distinguish plausible wrong implementations, plus a valid control.
  For joined requests, settle which successful data permits initialization, either response arriving or failing first, and retry/re-entry behavior before choosing assertions.
  Name the production boundary each local test or source check can establish, and the remaining integration check.
- **Delivery:** the compatible intermediate versions, deployment order, and what each draft slice delivers or leaves to a named owner/slice.
  Every acceptance outcome needs a planned path or an explicit unresolved decision; “follow-up” alone does not account for missing required behavior.

Apply the existing risk-2-or-higher plan challenge for contract behavior under [Risk and Review Budget](README.md#risk-and-review-budget).
The existing Skeptic checks the original request, canonical project patterns and examples before dependent implementation; reuse that stage rather than adding another reviewer.
A topic such as “verify recovery” is not a settled behavior, and mapping unrelated checks to every coverage category does not establish acceptance coverage.
Record the challenged decisions and their dispositions in the same plan.

A slice is implementation-ready when its acceptance-changing choices and interfaces are settled by evidence or authorized decisions, and its examples cover its actual callers and dependencies.
Keep unresolved independent slices pending while proceeding with authorized, settled work; a draft label does not make a dependent unknown safe to implement.
An undeployed companion backend is a verification constraint, not by itself a design blocker.
Use local producer/serializer checks, consumer contract checks and permitted synthetic UI tests against the same agreed examples before deployment; label their evidence accurately and retain actual integration as pending.
Passing mocks cannot settle an unresolved producer contract.
Report slice readiness separately from whole-ticket acceptance, retaining the remaining outcomes, owners and deployment checks.

## Research Stop Conditions

Stop collecting when the decision question is answered by sufficient authoritative evidence, a source conflict requires escalation, or the remaining uncertainty cannot change the decision.
Do not gather sources merely to make the brief longer.

## Decision Brief

```text
Decision question:
Recommendation:
Confirmed facts and strongest sources:
Inferences and rationale:
Existing pattern to reuse or exact exception:
Alternatives rejected and tradeoffs:
Relevant edge cases and failure modes:
Unknowns and verification path:
Suggested next step:
```

Keep quotations short, cite the direct source for material claims, and label time-sensitive information with when it was verified.
