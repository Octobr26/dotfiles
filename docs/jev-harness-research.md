# Jev in Luis's agent workflow

Researched 2026-10-05 against primary documentation and public source repositories.
Luis's current pilot is direct Codex/Claude with Matt Pocock skills; Firstmate is a separate comparison, not a prerequisite.
Decision question: how should Jev help categorize historical work and accelerate skill decisions without obscuring which workflow actually ran?

## Confirmed examples

- [TypeSafe skill suggestion](https://docs.typesafe.ai/cookbooks/skill_suggestion) ranks a 182-skill Hermes catalog, rechecks three candidates with fuller descriptions and instruction excerpts, and can suggest no skill.
  Its published state contains the current request and an empty `recent_context`; this example does not provide persistent memory or history-based personalization.
  It provides a suggestion to the generative agent, rather than forcibly loading a workflow.
- [IndyDevDan's video repository](https://github.com/disler/ten-levels-of-jev) implements Pi hooks for tool checks and context decisions, and tools for typed file judgments.
  [report.ts](https://github.com/disler/ten-levels-of-jev/blob/main/apps/ten-levels/extensions/report.ts) records questions, answers, model, usage, and elapsed milliseconds on its event channel and attempts to append the decision to Pi's session.
  These are demonstrations; their results do not establish performance on Luis's tasks.
- [LangChain's Jev harness article](https://www.langchain.com/blog/building-a-harness-with-jev) documents model-routing middleware and pre-execution tool checks.
  [Its model-router evaluation](https://www.langchain.com/blog/how-to-build-a-model-router-in-the-harness) analyzes historical task traces and compares cost and merged-PR outcomes across 973 threads.
  That evaluation concerns model routing, not Matt skill selection.
- [imsukhe/jev](https://github.com/imsukhe/jev) separates a local usage ledger and audit skill from Jev classification and transcript compaction.
  Its instruction delivery and automatic Claude hook have different enforcement and logging coverage.
  This is an independent community project, not an installed component of Luis's setup.
- [Firstmate's resolver](https://github.com/kunchenguid/firstmate/blob/main/bin/fm-dispatch-resolve.sh) asks Jev to match a task brief to dispatch rules, then applies confidence, eligibility, approvals, and quotas in code.
  Worker dispatch is separate from skill selection and history analysis.

## Current local implementation

Confirmed by reading `scripts/skill-usage`, `scripts/jev-workflow`, and the installed `jev-workflow` skill:

- Retrospective scanning extracts bounded Codex and Claude user-turn excerpts with observed skill-loading evidence.
- Routing asks one Choice over installed Matt skills, plus a work-category Choice, from a short task summary and session mode.
- The shared instructions ask the agent to consult routing for new substantive tasks without an explicit skill choice.
  This is instruction delivery, not an enforced runtime input hook.
- Routing does not supply prior history or recheck a shortlist.
  Evaluated routing decisions now append metadata to the private passive-tracking ledger described below.
- Printed output can be captured manually; existing session logs remain the source for historical scans.
- Applied-skill coverage, Firstmate worker provenance, acceptance, interventions, and rework remain incomplete.
- A live generic debugging prompt successfully routed to `diagnosing-bugs` with `jev-1.13.0` after Luis configured the key.
  This confirms API connectivity and one routing result, not routing accuracy or workflow improvement.
  Pi coverage and automatic Notion logging are not implemented.

## Recommendation and validation

Inferred recommendation: retain the current harness for the initial measurement period.
Add a local decision-and-outcome ledger before adding more Jev-controlled behavior.
Record task/session identity, explicit workflow mode, recommended skill and probabilities, skills loaded/applied, selected Jev model, latency/usage, Luis's corrections, verification, acceptance, and rework.
Keep exact counts, elapsed time, and token arithmetic in code.
Use Jev to classify task type and observed friction, and to recommend the next skill from the installed catalog.
Use the generative agent for explanations, implementation, and interpreting a weekly report.
Notion can display daily summaries; it should not be the only raw event store.

Compare current prompt-only recommendations with a rank-and-recheck alternative on real labeled prompts.
The official recipe uses two requests; additional accuracy may cost additional latency.
Measure unnecessary skill loads, missed useful skills, routing latency, active human effort, accepted delivery time, and rework.
Separate recommendations from actual execution and user turns from completed tasks.
Do not infer that frequently used skills are effective or that unobserved skills are useless.

The video supplies useful engineering patterns, not measured savings for this installation.
Sending files to Jev can reduce the main model's context, but still reads and transmits those files through code.
According to [TypeSafe's documented model limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13), adversarial input can affect judgments and large irrelevant state reduces accuracy.
Runtime permissions and verification therefore remain independent of Jev's confidence.

## Outstanding decisions

Unknown: whether Jev routing improves end-to-end speed and acceptance on Luis's work.
Verification path: label a small set of real prompts, record a baseline, and run a bounded comparison.
Unknown: whether switching to Pi would improve this workflow enough to justify migration.
Verification path: a separate Pi pilot after the direct-harness baseline, with the same task/outcome accounting.

## Follow-up: stage routing and measurement

Luis confirmed both Codex and Claude, automatic supporting skills with user-selected larger workflows, and a GitKraken-first history pilot.
His primary friction is waiting for agents, including excessive reasoning and repeated implementation/review stages.
He wants usage, token accounting, and cost alongside active human time, rework, and accepted delivery time.
The following are research findings and design options, not implemented configuration.

### Additional public implementations

- [dirien/jev-router](https://github.com/dirien/jev-router) implements a Claude/Codex proxy with routing and completion receipts.
  [Its source](https://github.com/dirien/jev-router/blob/main/src/router.mjs) records route reason, selected model, elapsed response time, usage, calculated costs, and classifier latency summaries.
  [Its status](https://github.com/dirien/jev-router#status) lists incomplete live validation, including full Codex sessions and real Jev threshold tuning.
  Its savings estimate reprices the same observed usage on a baseline model; this does not establish what that model would actually consume or deliver.
  Jev cost is reported separately from model savings, and concurrent route records can overcount shared classifier calls.
  [Its evaluation guide](https://github.com/dirien/jev-router/blob/main/docs/evaluation.md) recommends held-out prompts, versioned rubrics, repeated trials, and execution outcomes rather than trusting its starter thresholds.
- [droid-Q/jev-skill-router](https://github.com/droid-Q/jev-skill-router) stores local daily skill-selection records and supplies a dashboard.
  [Its source](https://github.com/droid-Q/jev-skill-router/blob/main/src/router.mjs) discovers enabled skills, classifies relevance, and injects optional suggestions while retaining explicit invocation requirements.
  [Its history caveats](https://github.com/droid-Q/jev-skill-router#web-dashboard-and-history) distinguish selection from execution and identify synthetic screenshot data.
  It does not provide the full model/effort, usage/cost, skill-execution, and delivery-outcome accounting Luis requested.
- [LangChain's first-party experiment](https://www.langchain.com/blog/how-to-build-a-model-router-in-the-harness) reports 973 threads, median cost of $0.94 versus $2.61, and merged-PR rates of 29.2% versus 27.3% (`p=0.49`).
  These results support no detected regression in those proxies; they do not prove equivalent quality, shorter waiting time, or successful stage/skill routing for Luis.

### Local Insights measurement inspiration

Read-only inspection of `../gitkraken/insights-service/docs/skills-api.md`, `docs/metrics.md`, and `models/analytics_skills.go` confirmed:

- Skill timelines group requests by skill and prompt turn, with root/supporting skill relationships, model mixes, costs, cache-hit percentages, tool/API failures, and subagent detail.
- Skill-tagged spend and non-skill spend are separate; distinct runs must be deduplicated rather than summed across skills.
- Subagent cost is part of segment cost, so adding it again would double count.
- Git/session samples can link work to repository, branch, commits, and pull requests, with best-effort attribution and data-cutoff caveats.
- PR cycle time distinguishes coding, review pickup, and review elapsed time.
  Those calendar intervals are not active human minutes or agent inference latency.
- The inspected segment schema has start/end timestamps but does not establish separate reasoning, tool, human-idle, or approval-wait durations.

Inferred design direction: connect task → sessions → stages → requests, preserving recommended decisions, actual execution, and outcomes as separate events.
Record provider, model, reasoning effort, skill/version, token fields, cost source, timing, overrides, verification results, and rework where observable.
Keep missing values unknown, avoid summing concurrent durations as elapsed time, and separate API-priced estimates from subscription billing.
The proposed clarify → implement → UI verify → PR review sequence is a hypothesis to measure, not a universal requirement.

Unknown: which native Codex/Claude events reliably expose all requested timing and usage fields on this computer.
Verification path: inspect event schemas and representative field presence without exporting raw transcripts.
Unknown: whether stage-specific model changes improve waiting time enough to offset handoff, cache, and repeat-context costs.
Verification path: compare similar real tasks using recorded stage boundaries, accepted outcomes, and rework.

## Follow-up: frequent clears and passive tracking (2026-10-06)

Luis frequently clears Claude conversations, starts fresh sessions, and switches topics without marking work complete.
Resume-based continuation and mandatory per-session acceptance are unsuitable assumptions for this pilot.
Luis chose a stage proposal once at task start, stages only when useful, automatic supporting skills within existing authority, and Astra for browser verification.
General automatic model/effort routing is outside the pilot; actual model/effort can still be recorded as metadata.
Sanitized TypeSafe summaries are authorized; reliable task completion remains an unresolved design question.

### Confirmed capture and reflection patterns

- [Claude's hook reference](https://code.claude.com/docs/en/hooks#sessionend) documents `SessionEnd.reason="clear"` and `SessionStart.source="clear"`, carrying session identity and a transcript path.
  Capture can observe a clear without requiring Resume or a closing message.
  `Stop` indicates a completed response rather than a completed human objective; `TaskCompleted` depends on explicit task machinery.
  SessionEnd has a short default timeout, so expensive reconciliation should be deferred rather than slowing clears.
- [Claude's native usage documentation](https://code.claude.com/docs/en/costs#analyze-your-usage-patterns) documents `/insights` reports on recent sessions, workflow friction, and suggestions, handling up to 200 previously unseen sessions and skipping very short ones.
  The same page documents approximate daily/weekly skill and subagent attribution in `/usage`.
  Reports require invocation and analysis usage; neither feature establishes cross-session human-task acceptance.
- [Entire's capture lifecycle](https://docs.entire.io/guides/checkpoints/capture-checkpoints) links captured agent context to Git commits and permits several sessions in one checkpoint.
  This provides an existing pattern for contribution linkage across sessions, not evidence that every repeated-clear sequence is captured correctly or that the work is accepted.
  [Local-only storage](https://docs.entire.io/guides/checkpoints/keep-checkpoints-local) is supported.
  [Codex integration](https://docs.entire.io/agents/codex) has documented read-only subagent and parent-token accounting gaps.
- [Git AI](https://usegitai.com/docs/get-started) supports Claude and Codex attribution, multiple sessions contributing to one commit, and commits made by the human.
  Its local contribution evidence does not establish PR quality or full task completion.
  [The inspected local statistics implementation](https://github.com/git-ai-project/git-ai/blob/main/src/metrics/local_stats.rs) uses a four-hour subsequent-commit heuristic for shipped sessions.
  That heuristic can link unrelated work; it should not become the pilot's definition of done.
- [AI Usage Tracker](https://github.com/Danielw412/AI-usage-tracker) passively indexes Codex/Claude logs into local databases, distinguishing token usage, API-equivalent cost and prompt timing.
  [Its Claude parser](https://github.com/Danielw412/AI-usage-tracker/blob/main/server/claude/sessionLogs.ts) deduplicates usage by message ID and uses reported turn duration when available, otherwise marked estimates.
  This is a useful capture example, not verified task-outcome inference or a locally validated installation.
- [devday](https://github.com/ujjwaljainnn/devday) documents local daily recaps across Codex/Claude and other tools, grouping sessions by project with date-matched Git context.
  Its README defines capped message-processing duration and estimated prices; these should not be presented as active human time or exact task attribution.

### Local evidence and proposed direction

Read-only version checks found Claude Code `2.1.284` and Codex CLI `0.160.1`.
A metadata-only sample of 12 recent JSONL files per provider confirmed Claude usage blocks, cache fields, branch metadata and turn-duration records, plus Codex token-count and task-start/complete records.
The sample includes subagents and is not representative; field presence does not establish capture completeness or task acceptance.
No raw transcript text was output or sent to a remote service for this check.

Inferred recommendation: preserve passive session/turn records, then reconcile related work and artifact evidence daily.
Use exact ticket/PR/commit attribution where available; branch, changed-file overlap and prompt similarity can suggest links with uncertainty recorded.
A topic switch on the same branch must not automatically join two tasks.
Record changed, verified, committed, PR-opened, reviewed, CI-passed and merged as distinct facts.
Jev can categorize sanitized work summaries or propose uncertain task links; deterministic code owns token totals, identities and timestamps.
Missing acceptance does not prevent reports on usage, waiting, skill loading or observed friction.
Assess native `/insights` and passive capture before adding a comprehensive custom task lifecycle.

Unknown: reliable semantic task linkage and completion across arbitrary clears and topic switches.
Verification path: a small local pilot with two cleared sessions contributing to one later commit, a topic switch on the same branch, and a read-only review; check missed captures and false joins.
No new tracker, hook, lifecycle rule or background service was installed during that research phase.

## Authorized passive pilot implementation (2026-10-06)

After Luis approved passive capture and daily reporting, `scripts/agent-workflow` was implemented and the local macOS LaunchAgent was loaded.
It reuses the existing Codex/Claude parser, stores allowlisted turn metadata in private SQLite, captures skill-loading evidence, and records independent local Git commit observations.
The first background run succeeded with 521 Codex and 357 Claude turns from available GitKraken history and 19 scanned repositories.
Repeated collection preserved turn identity/counts, and existing parser/feedback checks passed (50 tests) with signing disabled only for the test subprocesses.
Provider transcripts, source, commands, and prompts are excluded from the persisted turn allowlist; unrelated source caches retain opaque identities and signatures only.
Reduced aggregate source coverage retains high-water usage rather than erasing previously captured child usage, with that limitation reported.
No third-party tracker, Git mutation hook, automatic model router, Notion writer, or background TypeSafe classifier was installed.
Daily reports contain reconciliation candidates; semantic cross-session linkage and acceptance still require an agent's evidence review.
Operational instructions and exact private storage locations are in [Passive agent workflow tracking](agent-workflow-tracking.md).

## Usage pricing implementation — 2026-10-06

Confirmed official current rates and cache semantics against OpenAI model/pricing/cache docs and Claude pricing/cache/fast-mode docs.
`agent-workflow` now retains allowlisted request-level numeric usage locally and reports API-equivalent token estimates by model.
The reference-rate table is versioned by its verification date; historical billed rates remain unknown.
Claude one-hour and five-minute writes are separate, and thinking is included in output.
OpenAI input partitions include reads/writes; long-context premiums apply per request rather than summed turn.
No invoice, subscription cost, hosted tool charge, or complete historical telemetry coverage is inferred.
See `docs/agent-workflow-tracking.md` for formulas, source links, and uncertainty rules.
