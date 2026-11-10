# Model and Delegation Routing

Use this file whenever a workflow delegates work.
The coordinator selects the route before spawning an agent and passes the model and effort explicitly.
Model choice is based on complexity, consequence, evidence gap, and expected duration rather than the role name or risk score alone.

## Selection Algorithm

1. Use the direct fast path when the task is self-contained and delegation would cost more context than it saves.
2. Classify the delegated stage by the judgment it requires, the consequence of a wrong inference, the unresolved evidence gap, and whether it is a long-running task.
3. Apply the user-selected model first; otherwise use the route below. Optimize cost only within its quality requirements.
4. Pass the listed model and effort at spawn time; do not inherit either by omission.
5. Record the requested route and the observed effective model or fallback in the task packet.

## Required Spawn Mapping

| Route | Strict entry condition | Codex spawn | Claude Code subagent | Default work budget |
| --- | --- | --- | --- | --- |
| Direct | Trivial, self-contained, or cheaper to answer than hand off. | No spawn. | No spawn. | Coordinator completes it directly. |
| Bounded collection | Read-only objective answer, one evidence class, no synthesis, approval, or edit. | `gpt-6-luna`, `low` | `workflow-collector`: `haiku`, no effort override | One agent, 12 turns, 10 minutes, compact evidence no longer than 2 KB. |
| Standard | Planning, synthesis, implementation, verification interpretation, or independent review within a bounded stage. | `gpt-6.1-sol`, `high` | `workflow-maker` or `workflow-skeptic`: `sonnet`, `medium` | One writer and at most two independent read-only agents, 20 turns and 30 minutes each, handoff no longer than 4 KB. |
| High reasoning | Luis says to escalate, or difficult reasoning, material ambiguity, a failed targeted verification, or a material dispute with new evidence justifies it. | `gpt-6-astra`, `high` | `workflow-adjudicator`: `opus`, `high` | One escalation agent, 20 turns, 30 minutes, one evidence-backed verdict no longer than 4 KB. |
| Long horizon | Authorized multi-stage work expected to exceed 30 minutes, with durable state, checkpoints, a completion predicate, and an explicit spend ceiling. | `gpt-6.1-sol`, `high` | `workflow-deep-agent`: `fable`, `high` | Never automatic; use the explicit task budget and stop at each checkpoint. |

Codex uses Sol/high for substantive planning, implementation and independent review, including backend and harness work.
Terra is not an automatic substitute for those stages; use it only when Luis explicitly selects it or authorizes a bounded comparison.
Before spawning, verify the model and effort against the actual execution surface; a local catalog entry does not prove that a particular spawn tool accepts it.
If the selected model is unavailable, continue independent work that does not require the delegate and report the exact unavailable route; obtain Luis's choice before substituting a model.
For Codex, set both `model` and `reasoning_effort` on every agent spawn.
For Claude Code, invoke the named user subagent under `~/.claude/agents/`.
Claude agent definitions use portable family aliases; record the effective version because aliases vary by provider and change over time.
Do not use Claude's `best` or `inherit` values in a workflow spawn because they do not preserve a predictable cost tier.
Before a delegated stage starts, its task packet must state maximum agents, turns or tool calls, wall time, tool-result and handoff size, and the total token or spend ceiling when the runtime exposes one.
Where a cap is not technically enforceable, treat it as a stop condition and say so; do not call it a hard limit.
Before reporting the routed run as complete, populate the observed effective model or mark it `unknown` with the exact provider or runtime readback needed.

When Luis says `escalate`, `use high reasoning`, or equivalent without naming a model, preserve the task packet and route the disputed or difficult stage to `gpt-6-astra` at `high` for Codex or `workflow-adjudicator` using Opus at `high` for Claude.
Escalation raises reasoning quality; it does not authorize broader scope, extra agents, or external side effects.

## What Each Model Is For

| Provider | Model | Workflow purpose |
| --- | --- | --- |
| OpenAI | Luna | Cheap, high-volume extraction, inventories, exact lookup, and bounded evidence collection. |
| OpenAI | Terra | Explicitly selected scoped work or evaluated comparisons; not the default coding or review route. |
| OpenAI | Sol | Default substantive planning, implementation and review while establishing harness quality. |
| OpenAI | Astra | Escalation for difficult or disputed reasoning that the Standard stage cannot settle. |
| Anthropic | Haiku | Fast, efficient lookup and simple bounded collection. Haiku 4.5 does not support Claude Code effort overrides. |
| Anthropic | Sonnet | Daily coding and the default balance for synthesis, implementation, and skeptical review. |
| Anthropic | Opus | Complex reasoning and bounded adjudication when Standard evidence is insufficient. |
| Anthropic | Fable | The hardest, longest-running autonomous work; it is an explicit high-spend route, never a default worker. |

Claude's `opusplan` is a coordinator-session option, not a workflow subagent route: it uses Opus while planning and Sonnet while executing.
Use it only when the whole session needs that split; normal delegated work uses the explicit agents above.

## Reasoning Effort

Effort is a behavioral signal, not a token budget.

| Effort | Use |
| --- | --- |
| `low` | Exact extraction, classification, lookup, or another tightly scoped task with objective verification. |
| `medium` | Use only where the selected provider route or Luis explicitly specifies it; it does not override Codex Sol/high. |
| `high` | Codex Standard default; also difficult reasoning, debugging and adjudication on the High route. |
| `xhigh` | Avoid by default because its token cost has not shown enough benefit for Luis. Use only when Luis explicitly names `xhigh`. |
| `max` | Avoid by default. Use only when Luis explicitly names `max` and accepts unconstrained token spending. |

When the result is shallow below high effort, raise effort within the selected route before changing model families.
At high effort, use the escalation route when its evidence conditions are met; do not raise effort to xhigh automatically.
When the task requires stronger judgment or long-horizon capability, raise the model tier.
Do neither for an unchanged retry: escalation requires new evidence, a changed artifact, a material unresolved assumption, or a failed verification.
Never select Codex Ultra or Claude `ultracode` automatically; use either only when Luis explicitly names it.

## Risk, Accuracy, and Spend

- Risk 3 always requires the specialist validation, independent review, and readback in `high-risk.md`; a frontier model does not replace those controls.
- A simple risk-3 operation may stay on the least expensive capable implementation route while its independent review uses a stronger route.
- A difficult risk-2 architecture or debugging problem may qualify for High reasoning even without a risk-3 side effect.
- Narrow agents return evidence, not conclusions. Skeptical judgment and approval require at least Standard.
- Give each collector a distinct question, evidence source, and stop condition. Do not fan out overlapping broad searches.
- Pass compact evidence to downstream stages instead of asking them to rediscover repository or web context.
- Stop at the stage budget. Report the missing invariant instead of silently retrying, downgrading, or escalating. Reference large tool output by exact command or artifact instead of copying it into agent handoffs.
- Count agent handoff context, tool schemas and results, retries, cache behavior, and provider fees when comparing spend; token totals alone are incomplete.
- Explicit user selections override these defaults. Before an agent proposes a cheaper default, compare 10-15 representative tasks using fixed inputs and acceptance criteria; require no worse material misses or false positives and count review/rework cost.
- Model choice does not establish readiness. Use the existing plan challenge and final evidence checks; report their invocation and limits separately from model quality.

Supporting model capabilities and primary sources are recorded in `model-evidence.md`; check current provider prices when comparing cost.
