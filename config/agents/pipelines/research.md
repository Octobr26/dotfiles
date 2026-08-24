# Research and Synthesis Pipeline

Use this route when a decision needs external research, repository discovery, comparison, or an evidence-backed recommendation before a change is proposed.
It is read-only unless the user separately requests an implementation.

## Route

1. Interpreter writes the decision question, target, deadline or freshness requirement, and what outcome the research must support.
2. Researcher maps what is already known from local instructions, source code,
   configuration, prior decisions, and the current runtime. When a behavior is
   interpreted in more than one place, it identifies the executable authority,
   every consumer and runtime variant, and the inputs that would falsify a
   proposed interpretation.
3. Researcher collects only the missing evidence. Prefer primary documentation, source repositories, standards, official records, and direct runtime evidence. Use secondary commentary to discover leads, not as the sole basis for material claims.
4. Researcher records a compact evidence ledger: source, date or version, claim
   supported, relevance, limitation, and—where a semantic rule is duplicated—the
   parity corpus and quantified output differences.
5. Synthesizer produces the decision brief: confirmed facts, inferences, alternatives, tradeoffs, edge cases, unknowns, and a recommended next step.
6. Pattern Checker compares the recommendation against existing local patterns, ownership, configuration, and constraints. It identifies what can be reused and what would be an exception.
7. For a material recommendation, Skeptic independently challenges assumptions, source quality, edge cases, and local fit under `challenge.md`. Add a specialist when the decision crosses a high-risk boundary.
8. Adjudicator returns `accept`, `revise`, `ask Luis`, or `blocked by unknown`; agreement alone is not a verdict.

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
