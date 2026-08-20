# Model and Delegation Routing

Use this file whenever a pipeline delegates work.
The coordinator selects the route before spawning an agent and passes the model and effort explicitly.
Model choice is based on complexity, consequence, evidence gap, and expected duration rather than the role name or risk score alone.

## Selection Algorithm

1. Use the direct fast path when the task is self-contained and delegation would cost more context than it saves.
2. Classify the delegated stage by the judgment it requires, the consequence of a wrong inference, the unresolved evidence gap, and whether it is a long-running task.
3. Choose the least expensive route that can perform that stage reliably.
4. Pass the listed model and effort at spawn time; do not inherit either by omission.
5. Record the requested route and the observed effective model or fallback in the task packet.

## Required Spawn Mapping

| Route | Strict entry condition | Codex spawn | Claude Code subagent | Default work budget |
| --- | --- | --- | --- | --- |
| Direct | Trivial, self-contained, or cheaper to answer than hand off. | No spawn. | No spawn. | Coordinator completes it directly. |
| Bounded collection | Read-only objective answer, one evidence class, no synthesis, approval, or edit. | `gpt-5.6-luna`, `low` | `pipeline-collector`: `haiku`, no effort override | One agent, 12 turns, 10 minutes, compact evidence no longer than 2 KB. |
| Standard | Bounded synthesis, implementation, verification interpretation, or skeptical engineering judgment. | `gpt-5.6-terra`, `medium` | `pipeline-maker` or `pipeline-skeptic`: `sonnet`, `medium` | One writer and at most two independent read-only agents, 20 turns and 30 minutes each, handoff no longer than 4 KB. |
| High reasoning | Luis says to escalate, or difficult reasoning, material ambiguity, a failed targeted verification, or a material dispute with new evidence justifies it. | `gpt-5.6-sol`, `high` | `pipeline-adjudicator`: `opus`, `high` | One escalation agent, 20 turns, 30 minutes, one evidence-backed verdict no longer than 4 KB. |
| Long horizon | Authorized multi-stage work expected to exceed 30 minutes, with durable state, checkpoints, a completion predicate, and an explicit spend ceiling. | `gpt-5.6-sol`, `high` | `pipeline-deep-agent`: `fable`, `high` | Never automatic; use the explicit task budget and stop at each checkpoint. |

For Codex, set both `model` and `reasoning_effort` on every agent spawn.
For Claude Code, invoke the named user subagent under `~/.claude/agents/`.
Claude agent definitions use portable family aliases; record the effective version because aliases vary by provider and change over time.
Do not use Claude's `best` or `inherit` values in a pipeline spawn because they do not preserve a predictable cost tier.
Before a delegated stage starts, its task packet must state maximum agents, turns or tool calls, wall time, tool-result and handoff size, and the total token or spend ceiling when the runtime exposes one.
Where a cap is not technically enforceable, treat it as a stop condition and say so; do not call it a hard limit.
Before reporting the routed run as complete, populate the observed effective model or mark it `unknown` with the exact provider or runtime readback needed.

When Luis says `escalate`, `use high reasoning`, or equivalent without naming a model, preserve the task packet and route the disputed or difficult stage to `gpt-5.6-sol` at `high` for Codex or `pipeline-adjudicator` using Opus at `high` for Claude.
Escalation raises reasoning quality; it does not authorize broader scope, extra agents, or external side effects.

## What Each Model Is For

| Provider | Model | Pipeline purpose |
| --- | --- | --- |
| OpenAI | Luna | Cheap, high-volume extraction, inventories, exact lookup, and bounded evidence collection. |
| OpenAI | Terra | Default balance for synthesis, ordinary implementation, tool use, verification interpretation, and independent review. |
| OpenAI | Sol | Frontier reasoning for genuinely difficult contained work, material ambiguity, or quality-first escalation. |
| Anthropic | Haiku | Fast, efficient lookup and simple bounded collection. Haiku 4.5 does not support Claude Code effort overrides. |
| Anthropic | Sonnet | Daily coding and the default balance for synthesis, implementation, and skeptical review. |
| Anthropic | Opus | Complex reasoning and bounded adjudication when Standard evidence is insufficient. |
| Anthropic | Fable | The hardest, longest-running autonomous work; it is an explicit high-spend route, never a default worker. |

Claude's `opusplan` is a coordinator-session option, not a pipeline subagent route: it uses Opus while planning and Sonnet while executing.
Use it only when the whole session needs that split; normal delegated work uses the explicit agents above.

## Reasoning Effort

Effort is a behavioral signal, not a token budget.

| Effort | Use |
| --- | --- |
| `low` | Exact extraction, classification, lookup, or another tightly scoped task with objective verification. |
| `medium` | Default for bounded agentic coding, synthesis, tool use, and review where speed and quality both matter. |
| `high` | Difficult reasoning, debugging, or quality-sensitive adjudication after the packet identifies the material uncertainty. |
| `xhigh` | Avoid by default because its token cost has not shown enough benefit for Luis. Use only when Luis explicitly names `xhigh`. |
| `max` | Avoid by default. Use only when Luis explicitly names `max` and accepts unconstrained token spending. |

When the model has the right skills but the result is shallow, raise effort one level before changing model families.
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
- Change a default route only after 10-15 comparable tasks show no worse acceptance and escaped-defect outcomes with lower all-in cost.

Current model capabilities, list-price anchors, and primary sources are recorded in `model-evidence.md`.
