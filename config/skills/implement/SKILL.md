---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

When a step calls the Skill tool and this provider has none, use the [provider integration guidance](../README.md#provider-integration).


Implement the work described by the user in the spec or tickets.

Follow the personal [change workflow](../../agents/workflows/change.md).
Apply its [review-pattern guidance](../../agents/workflows/README.md#start) before editing, while implementing each slice, and before reviewer handoff; a supplied spec does not replace that check.
Before dependent edits, complete its [clarification gate](../../agents/workflows/README.md#clarification-gate) and, for behavior changes with an executable test seam, run the [readiness plan check](../../agents/workflows/readiness.md#job) and inspect its successful result.
For review feedback, apply the [finding gate](../../agents/workflows/review.md#finding-gate) before selecting edits; complete refuted items with their evidence and plan fixes only for remaining supported findings.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, use /code-review to review the work.

Commit only when Luis asks, using the authorized task branch.
