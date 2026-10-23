---
name: jev-workflow
description: Guide skill selection, categorize selected historical sessions, or use Jev to turn review feedback into evaluated harness improvements. Explicit skill choices take precedence.
---

# Jev workflow routing and usage

Use the executable `../../../scripts/jev-workflow` relative to this skill's canonical directory.

## Guided selection

Luis delegates routine skill selection within an authorized task; he does not need to memorize or invoke each supporting skill.
State the next skill, the concrete reason it fits, and what its result will establish, then load and apply it.
This delegation includes user-invoked supporting skills, but not a larger orchestration workflow, a model change, or authority beyond the task.
Respect explicit skill choices and project workflow ownership.

At a phase boundary, explain the important finding, any material decision still open, and the next check or skill.
Reuse the current route when the next step is clear; consult Jev again only when the task changes or competing routes would materially change the work.
Compare the recommendation with the task evidence; a classifier's choice is advice, not an instruction to run another stage.
When a material tradeoff needs Luis, give a recommended option, its consequence, and the exact decision needed; continue independent work.
Feedback should explain behavior and evidence rather than dump a skill menu or workflow receipt.

## Recommend a skill for a new task

Respect an explicitly selected skill or workflow; Jev is advisory rather than a second coordinator.
Resolve whether the session is direct or governed by Firstmate before routing.
Make a short task summary containing the requested outcome and relevant constraints, excluding credentials, source code, and unnecessary internal details.
Use a temporary prompt file rather than interpolating user text into a shell command.
Run `jev-workflow route --prompt-file <file> --mode direct --jev`; select `--mode firstmate` for Firstmate-managed sessions, including its workers.
This sends the task summary to TypeSafe.
If the key or service is unavailable, report the exact blocker once and choose using the installed skill descriptions or Luis's requested workflow.

Show the category, recommended skill, confidence, and one sentence of agent explanation grounded in the task and skill description.
Jev supplies a choice and probabilities, not a prose explanation; label the explanation as the agent's interpretation.
Compare plausible alternatives when the distribution is spread or project instructions contradict the recommendation.
For `none`, use the ordinary project workflow.
For a model-invoked skill, read its returned `skill_path` and apply it within the authorized task.
For a user-invoked skill, apply it under guided selection when it is a routine supporting method; otherwise recommend its exact command for Luis to select.
Selecting a skill does not authorize commits, tracker publication, merges, permission bypasses, or nested crew coordination.
At completion, distinguish the recommended skill from skills actually loaded and applied.
Record that distinction with `jev-workflow record-use --call-id <returned-call-id> --status applied|overridden --skills <actually-applied-skill-names>`.
Use `overridden` when the method followed differs from the recommendation; this records agent-declared use, not success or human acceptance.
The command requires the original route to be bound to the current session.
For an ambiguous route, optional `--recheck` rereads the three highest-ranked skill candidates and makes a second call.
It preserves invocation limits and falls back to the original ranking if the second call fails.

## Categorize usage

Run `jev-workflow scan --days 7 --limit 30` to preview the bounded payload locally.
For a PR or session retrospective, pass repeatable `--session-file <path>` flags for the evidence-linked transcripts instead of sampling unrelated recent work.
The day window and limit still apply; use enough days and a sufficient limit to cover the selected sessions, and report truncated coverage.
Historical scanning reads local Codex and Claude logs; Pi is not covered.
Add `--jev` when Luis authorizes sending the selected historical prompt excerpts to TypeSafe; sending requires `--session-file`, or `--all-sessions` for an explicitly requested broad sample.
Inspect the local preview before sending it; remove unnecessary customer or internal details from the input, or keep the scan local.
Known child/subagent conversations are excluded from user-turn categorization.
Explain that categories describe observed user turns, not completed tasks, time spent, or delivery impact.
The output separates strong loading evidence from weak shell path references.
Coordinator mode is inferred from the known Firstmate working directory; workers and other sessions remain unknown without explicit provenance.
Use `skill-usage --days 7` for collection-wide frequency counts, independently of semantic categorization.
Keep analysis output local unless Luis requests a specific external destination.

## Review automatically enriched metrics

For PR comments or repeated feedback intended to improve the harness, follow [feedback learning](../../agents/workflows/feedback-learning.md).
Classify the feedback, inspect why the earlier process missed or dismissed it, and validate the resulting harness change; a category report alone does not complete an authorized improvement task.

For recorded follow-ups, call overhead, or weekly improvement triage, read [the tracking runbook](../../../docs/agent-workflow-tracking.md#jev-enrichment).
Run `agent-workflow report --days 7` from durable local records; this command makes no provider calls.
Keep inferred corrections, clarifications and acceptance mentions separate from confirmed delivery outcomes.
Use the suggested experiment and its evidence IDs to investigate one change; a classifier confidence score does not prove Jev helped.
