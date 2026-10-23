---
name: retro
description: Review a completed agent session or workflow experiment when Luis requests a retrospective, using delivery time, interventions, verification, and rework to recommend improvements.
disable-model-invocation: true
---

# Session retrospective

Review the requested session; default to the current one.
Use the actual transcript, tool results, changed files, and available task metrics.
When Luis requests Jev analysis, use [jev-workflow's selected-session scan](../jev-workflow/SKILL.md#categorize-usage) on the evidence-linked transcripts, then reconcile its categories with actual review and delivery evidence.
Keep the retrospective read-only unless Luis authorizes changes.

Identify where time or human effort went: finding context, execution, waiting, supervision, verification, and correcting delivered work.
Distinguish an agent turn from a complete requested outcome.
Report missing acceptance, cost, or intervention data as unknown rather than treating missing records as zero.
Separate cached token usage from uncached input and output; usage is not a billing record.

Look for demonstrated improvements to navigation, existing automated checks, instruction clarity, tool economy, and information access.
Trace failures to their owning layer before proposing another tool or instruction.
For instruction changes, follow the shared [instruction-writing guide](../../agents/workflows/instruction-writing.md).
Respect project instructions and established authority for tests, commits, external writes, and delegation.

Present the strongest bottleneck with evidence, then recommend the smallest experiment that could improve it.
State the metric, comparison, quality check, and condition for keeping or reversing the change.
When Luis authorizes a workflow change, save that baseline and experiment under `~/.local/state/agent-workflow/experiments/`, with source evidence and unverified outcomes marked unknown.
Reconcile the record with actual subsequent PR feedback and checks when reviewing the experiment; use Jev categories as supporting evidence, not outcome labels.
Compare similar task types and complexity; changing the model and workflow together prevents attributing the result to either one.
Do not use a model's confidence or lack of user follow-up as proof of successful delivery.
