# Agent harness pilot

## Current active pilot

The current pilot is passive Codex/Claude tracking in GitKraken, supporting-skill recommendations, and user-selected workflow stages.
Follow [Passive agent workflow tracking](agent-workflow-tracking.md) for the recorder, reports, native Claude insights, and operational commands.
The older orchestration comparisons below remain separate experiments, not prerequisites for this pilot.

For the next ten eligible started API-backed/analytics behavior tasks, pilot the existing workflow’s compact evidence record, test-boundary trace, applicable chart/query checks, finding closure and boundary-separated validation. Reuse private experiment records under the tracking runbook; record applicable trace coverage, distinct counterexamples exercised, closure evidence, unsupported validation claims, comparable substantive first-review corrections and observed overhead. Include blocked/abandoned tasks and unknown outcomes; review missing evidence after five tasks and usefulness after ten. This cohort does not change model/routing defaults or establish causal improvement.

## Jev prompt routing and historical categories

The direct Matt-skills workflow uses `TYPESAFE_API_KEY` from the environment or the private `~/.config/jev/.env`.
It does not require Firstmate or Pi.
`jev-workflow route --prompt-file <file> --mode direct` previews the routing request locally.
Add `--jev` to send the task summary to TypeSafe and receive a category, next-skill recommendation, confidence, and probabilities.
Select `--mode firstmate` for coordinated sessions; that mode excludes skills that establish competing crew coordination.
The shared agent instructions point to this skill for new substantive tasks without an explicit skill choice.
Explicit skill choices and project workflows remain authoritative; unavailable routing falls back to the established workflow.
User-invoked workflows remain recommendations until selected or explicitly delegated by Luis.

`jev-workflow scan --days 7 --limit 30` previews excerpts of the newest observed user turns from local Codex and Claude logs.
Add `--jev` to send those excerpts for categories and receive category counts alongside skill-loading evidence.
The default bound is 30 turns, the maximum is 200, and each excerpt is truncated.
Limited credential-pattern redaction does not guarantee removal of all sensitive data; inspect the preview before historical submission.
Counts describe user turns rather than completed tasks or time spent.
Firstmate coordinator provenance is inferred from its known home; workers and other sessions may remain unknown.
The scanner does not cover Pi or automatically write to Notion.
Keep verified outcomes and human effort in the daily record before comparing workflow impact.

Use the current shared engineering skills, Firstmate for coordination, and Jev for bounded dispatch decisions.
The aim is more accepted work with less human effort and no increase in defects.
Measure the current workflow before introducing Firstmate, then evaluate Jev separately.

## Installed foundation

The shared skill installer links all 38 Matt Pocock skill names and the official `typesafe-ai` skill into Codex and Claude.
Six Matt skill adaptations are preserved; 32 other skills are pinned upstream imports, including seven upstream in-progress skills.
Each upstream skill has pinned provenance and a license in its canonical directory under `config/skills/`.
The retrospective is requested explicitly and recommends experiments without changing configuration.
The TypeSafe skill supplies API guidance; it does not enable routing.

Firstmate is a separate checkout under the local development directory.
Its private `config/backend` selects Herdr, `config/crew-harness` selects Codex, and `config/crew-dispatch.json` selects `gpt-6.1-sol` at medium effort by default.
The dispatch configuration defines three routes: low effort for exact mechanical work, medium effort for contained implementation, and high effort for ambiguous investigations or difficult diagnosis.
All three use the same Codex model, with medium effort as the default; they do not automatically select xhigh or max.
Live Jev routing requires a TypeSafe API key and a successful resolver check.
These private files and credentials belong in Firstmate's gitignored operational home, not this public dotfiles repository.

## Activation choices

Run Firstmate's `bin/fm-bootstrap.sh` from its checkout to check dependencies and authentication.
Check GitHub authentication outside a restricted sandbox when keychain access makes a sandbox preflight report `NEEDS_GH_AUTH`.
Lavish is optional for this text-only pilot.

The inspected Firstmate Codex worker template launches with `--dangerously-bypass-approvals-and-sandbox` and disables worker hooks on its normal launch path.
Choose and approve the worker permission posture before launching a worker.
Approval to prepare the checkout is not approval to disable protections or publish project changes.
Use one explicitly selected project and task for the first pilot, with merges requiring Luis's approval.
No project is registered by this setup.

Firstmate already provides Jev routing through `bin/fm-dispatch-resolve.sh`.
Read its header and the current `docs/configuration.md` section on typed dispatch before activation.
It uses task-brief content as input to the TypeSafe service.
Review the configured dispatch rules, then provide `TYPESAFE_API_KEY` through the process environment or the Firstmate home's gitignored `.env`.
Keep the key out of chat, this repository, command arguments, and logs.
The resolver reports latency and token usage; its answer does not establish successful task delivery.

## Measure requested outcomes

For each real task, record one outcome spanning all agent turns and workers:

- Task ID, repository, task type, complexity, and workflow configuration or revision.
- Request time, verified-delivery time, and Luis's acceptance time separately.
- Active human minutes spent steering, reviewing, and correcting.
- Corrections, rework after delivery, and defects found later.
- Verification command or evidence, and whether the result was accepted.
- Coordinator and worker usage, with cached and uncached input distinguished; cost remains unknown unless supported by billing or a labeled estimate.

Keep private outcome records with Firstmate's task state or the existing private metrics location.
Do not infer zero corrections or successful acceptance from an unannotated transcript.
Report blocked and abandoned tasks alongside accepted work.

The existing summary command can collect best-effort transcript usage for a selected repository:

```sh
node config/agents/scripts/workflow-metrics.mjs summary --root "$PWD" --days 14 --format json
```

Run it from the dotfiles checkout, replacing the root with the repository being measured when needed.
The copied task-tracking code expects `workflows/registry.json` under its selected root.
That registry is absent from dotfiles; summary output works, but full task tracking needs its ownership and registry integration resolved before it becomes a portable outcome recorder.
Until then, explicitly record outcome timestamps and human effort with each task instead of presenting turn latency as delivery velocity.

## Compare changes

Start with a small baseline of comparable real tasks, then a Firstmate pilot using the same model and engineering skills.
Compare accepted outcomes per week, delivery time, active human minutes per accepted outcome, rework, and total usage by task type and complexity.
Report individual results and the sample size; a small pilot identifies promising directions rather than proving causality.
Alternate comparable tasks between configurations where practical instead of comparing easy new tasks with difficult historical ones.

Once Firstmate's benefit and overhead are visible, test Jev routing against recorded dispatch decisions without launching the selected action.
Keep a routing change only when it improves end-to-end time or cost while preserving route correctness and task quality.
Evaluate Pi later with the same tasks and skills if runtime customization remains a measured bottleneck.

Request `retro` after a pilot batch to identify the strongest evidenced bottleneck and the next single change to test.

## Review the full skill collection

Use `grill-me` directly or `ask-matt` to choose an upstream workflow.
Keep all imported skills available while observing real work; invoke project setup only when adopting the upstream engineering flow for that project.

Run `skill-usage --days 30` to inspect the local Codex and Claude transcript evidence.
The command reconstructs counts on demand without installing a per-tool hook or adding an API call to every agent action.
Native invocations and file reads are tool-call evidence, not proof of successful application; shell/code path references are weaker and can include searches or installation commands.
This distinction matters for Firstmate's Codex workers, whose hooks are disabled by the upstream launch template.
Transcript availability and format remain a coverage limit, including skills supplied automatically in context.

With the TypeSafe key configured, run `skill-usage --days 30 --jev` to request a review list.
Only aggregate counts and coverage information are sent, not transcript text, project code, file paths, or credentials.
Jev's response includes recommendations, confidence, and request usage; no skill files or links are changed.
Review each candidate against actual task opportunities, usefulness, and overlap before deciding to disable it.
Preserve rare but useful skills and distinguish a skill that was not observed from one demonstrated to be unnecessary.
