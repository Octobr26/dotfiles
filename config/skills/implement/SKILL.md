---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

When a step calls the Skill tool and this provider has none, use the [provider integration guidance](../README.md#provider-integration).


Implement the work described by the user in the spec or tickets.

Follow the personal [change workflow](../../agents/workflows/change.md), including its distinction between requirements and proposed decisions and its pre-implementation challenge when applicable.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, use /code-review to review the work.

Commit only when Luis asks, using the authorized task branch.
