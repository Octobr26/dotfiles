# Universal Agent Workflows

Use these workflows for non-trivial work outside a project that already provides a more specific workflow.
They work across local checkouts, remote runners, and cloud environments.
The execution location does not change the required evidence, ownership, or verification.

## Start

1. Identify the target system: repository, document set, account, service, or runtime.
2. Read its nearest instructions and inspect current state before proposing or editing.
3. State the objective, acceptance criteria, out-of-scope boundary, and risk.
4. Select the smallest route below.

| Work | Route | Default risk |
| --- | --- | --- |
| Docs, copy, one-file mechanical/config change | direct implementation plus focused verification | 0 |
| Research, discovery, comparison, or decision brief with no proposed change yet | `research.md` | 0-2 |
| Contained defect or failed workflow | `bugfix.md` | 1 |
| Feature, multi-file behavior, refactor, or operational change | `change.md` | 2 |
| Read-only investigation or architecture/code audit | `audit.md` | 1-3 |
| Pull-request, diff, or proposed-change review | `review.md` | 1-3 |
| Auth, permissions, secrets, money, personal/customer data, production, deployment, destructive action, or external side effect | `high-risk.md` | 3 |

Raise risk when the discovered boundary requires it; never lower it merely because the diff is small.
When multiple routes apply, use the higher-risk route.

## Focused skills

Load only the skill whose condition applies, through the available skill mechanism or its linked `SKILL.md`.
Project instructions, current task authority, and the selected workflow continue to govern execution.
If a linked skill is unavailable, use the workflow's existing method and disclose the missing enhancement rather than silently claiming it ran.

| Condition | Reference |
| --- | --- |
| Authorized behavior change with a suitable existing test boundary | [tdd](../../skills/tdd/SKILL.md) |
| Difficult, intermittent, performance, or disputed defect | [diagnosing-bugs](../../skills/diagnosing-bugs/SKILL.md) |
| Material domain ambiguity or authorized glossary/decision work | [domain-modeling](../../skills/domain-modeling/SKILL.md) |
| Interface, ownership, coupling, or architecture decision in scope | [codebase-design](../../skills/codebase-design/SKILL.md) |
| User explicitly requests a continuation document | [handoff](../../skills/handoff/SKILL.md) |
| Editing workflows, skills, or agent instructions | [instruction-writing.md](instruction-writing.md) |

Handoff is a user-invoked option, not an automatic completion stage.
Installation, attribution, and update ownership live in [the skill catalog](../../skills/README.md).

## Shared Rules

- `roles.md` defines stage boundaries. A named role does not itself authorize a sub-agent.
- `challenge.md` defines the bounded skeptical check for material plans, results, or recommendations.
- Use `model-routing.md` for every delegated stage. It selects the provider model and reasoning effort and links to the current first-party evidence snapshot in `model-evidence.md`.
- Keep one writer per repository, worktree, document, or external record at a time.
- Parallelize only independent read-only work that can be checked separately.
- For behavior changes with a suitable existing test seam, prefer a focused test-first loop: state the observable behavior and edge cases, add a failing focused test, make it pass with the smallest change, then refactor. Do not add fixtures, mocks, snapshots, or verification helpers unless the user requests them or their necessity is explained and approved.
- Consensus is not proof. Completion requires satisfied acceptance criteria, meaningful verification, and an evidence-backed disposition for every material finding.
- Use one challenge-response round by default. A second round is allowed only when the first produces new material evidence or a changed artifact; otherwise adjudicate or stop.
- Stop after the same material finding survives two correction rounds. Report the evidence and blocker instead of repeating the same attempt.
- Before an external write, send, deploy, merge, delete, payment, or production operation, verify the exact target and authority.
- For a change based on research, complete the relevant parts of `research.md` before planning implementation. Do not turn unverified research into a requirement.

## Risk and Review Budget

| Risk | Boundary | Required check |
| --- | --- | --- |
| 0 | Docs, copy, presentation, or objective mechanical work | Direct work plus focused verification. |
| 1 | Contained behavior in one owning path | Focused verification plus an independent result review when judgment is involved. |
| 2 | Feature, refactor, contract behavior, cross-module work, or a material recommendation | One skeptical plan or recommendation pass, focused verification, and final result review. |
| 3 | Security, data, financial, production, deployment, destructive, or irreversible boundary | Specialist validation and skeptical plan review before execution, then independent final review/readback. |

Raise the review budget when a material assumption remains unresolved or verification fails.

## Clarification Gate

Investigate local instructions, code, configuration, current state, and authoritative sources before asking Luis.
Ask only when the missing answer can materially change acceptance criteria, user-visible behavior, scope, risk, authority, external effects, irreversibility, or cost, and no clearly superior safe reversible default exists.

Treat an unresolved choice as material when it changes the user experience, interaction mode, permissions, side effects, or recovery path, even if the implementation itself is small. Ask before acting when plausible choices are not clearly interchangeable. Do not use live user state to discover requirements by iteration.

Otherwise choose in this order: correctness and safety, explicit acceptance criteria, established local pattern, smallest reversible scope, then speed and token cost.
State the assumption and meaningful tradeoff briefly.

When a question is necessary, consolidate it and include the recommended default, its strongest benefit, its material tradeoff, and the exact missing decision.

## Task Packet

For a separate non-trivial stage, use the core and every conditional block that applies.
Keep source references short; do not paste long histories or sensitive content.

### Core: every stage

```text
Goal and original user request or authoritative requirement:
Target, execution location, and exact paths, records, or commands:
Task type, risk, selected workflow, and governing instructions:
Authority, assigned access, and out-of-scope boundary:
Acceptance criteria and expected result:
Authoritative evidence; material assumptions and their status:
Unknowns, verification paths, impact if assumptions fail, and user decision or safe default:
Current state and dirty-work warning:
Verification owned by this stage and completion signal:
```

### Delegation: before any spawn

```text
Selected route, explicit requested model and effort:
Observed effective model or fallback: observed value | unknown with readback path:
Stream, owner, dependencies, assigned access, and coordinator combining results:
Budget: max agents including descendants, turns/tool calls, wall time, tool-result size, handoff size:
Total token or spend ceiling when supported; unenforceable limits and exact stop condition:
```

Apply `model-routing.md` for delegated model selection.
Project-local model rules remain authoritative, including a project's active-model inheritance policy.

### Additional conditions

| Condition | Required detail |
| --- | --- |
| Any implementation stage | Scope of editing and test decision: existing checks only, or already authorized test behaviors and edge cases; requested TDD and first focused behavior when applicable |
| Work crosses systems or consumers | Shared interface, owners, dependencies, independently deployed consumers, and compatibility checks |
| External write or publication | Exact target/account/ref, existing authorization, relevant runbook, and required before/after verification |
| Material terminology ambiguity | Established meaning, unresolved choice, and evidence or decision needed |
| Project requires stage recording | Its task/stage IDs, reservations, bindings, criteria, and exact report contract |

Conditional blocks carry applicable controls; they do not grant permission to edit, add test artifacts, delegate, publish, or send messages.
Keep permission already granted by the user and apply the clarification gate only to a material unresolved decision.
