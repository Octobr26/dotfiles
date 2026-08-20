# Universal Agent Pipelines

Use these pipelines for non-trivial work outside a project that already provides a more specific workflow.
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

## Shared Rules

- `roles.md` defines stage boundaries. A named role does not itself authorize a sub-agent.
- `challenge.md` defines the bounded skeptical check for material plans, results, or recommendations.
- Use `model-routing.md` for every delegated stage. It selects the provider model and reasoning effort and links to the current first-party evidence snapshot in `model-evidence.md`.
- Keep one writer per repository, worktree, document, or external record at a time.
- Parallelize only independent read-only work that can be checked separately.
- Do not invent test artifacts, fixtures, mocks, snapshots, or verification helpers without the user's approval. Existing checks may be run.
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

Otherwise choose in this order: correctness and safety, explicit acceptance criteria, established local pattern, smallest reversible scope, then speed and token cost.
State the assumption and meaningful tradeoff briefly.

When a question is necessary, consolidate it and include the recommended default, its strongest benefit, its material tradeoff, and the exact missing decision.

## Task Packet

Use this compact packet for a separate stage or authorized agent:

```text
Goal:
Target and execution location:
Task type and risk:
Immutable user request or authoritative requirement:
Governing instructions:
Authoritative evidence:
Acceptance criteria:
Material assumptions and status:
Unknowns and verification path:
Impact if an assumption is false:
User decision required or safe default:
Out of scope:
Current state or dirty-state warning:
Exact paths, records, or commands:
Verification owned by this stage:
Selected route, model, and effort:
Observed effective model or fallback:
Delegation budget: max agents, turns/tool calls, wall time, tool-result size, and handoff size:
Total token or spend ceiling when the runtime supports one:
Unenforceable budget assumptions and stop condition:
```

Reference source files rather than pasting long histories or sensitive content.
