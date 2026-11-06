# Private agent workflow tracking

`agent-workflow` captures local Codex and Claude metadata for the configured workspace.
The macOS LaunchAgent runs `collect` every five minutes while logged in and awake, including after login.
Native collection works locally without an AI provider, Resume, task IDs, or a closing message.
Optional Jev enrichment sends bounded conversation excerpts to TypeSafe when enabled for the configured workspace.
The existing transcript parser supplies turn usage; durable storage excludes prompt text, source, commands and response text.

## Daily use

Continue using Codex and Claude in project folders as usual, including clearing conversations and starting fresh ones.
Run `/insights` inside Claude Code for its native friction report when useful.
Review `agent-workflow report --days 7` with either agent after a few days, or open the local report with Neovim:

```sh
agent-workflow status
agent-workflow report --days 7
nvim ~/.local/state/agent-workflow/reports/latest.md
```

Record your own verdict on a delivered turn when you have one; nothing else sets it:

```sh
agent-workflow outcome <provider>:<session>:<turn> --kind acceptance
agent-workflow outcome <provider>:<session>:<turn> --kind correction --note "missed the empty state"
```

Copy the key from the report's "Explicit outcomes" section, which lists the latest unrated completed turns and shows explicit-outcome coverage over completed turns.
Keys must match a turn the collector already captured; unknown keys are rejected rather than assigned to the newest turn.
Outcomes are append-only: a later acceptance after a correction becomes the current state, and an identical repeat is ignored.
Hooks, commits, passing tests, Jev labels and silence never set an outcome; unrated turns stay unknown.
The retired CVO logical-task commands in `workflow-metrics.mjs` are not used for outcomes; that script remains the collector's transcript parser.

Replay deterministic private experiments on request with `agent-workflow-replay` (default directory `~/.local/state/agent-workflow/experiments/`).
It runs top-level unittest files and `replay.json` manifests (`{"cases": [{"id", "argv", "expected_exit"}]}`), prints passed, failed and non-automated sections, exits nonzero on a failed expectation and writes no files.

Ask either agent: "Review my agent-workflow report, reconcile related GitKraken sessions using ticket/PR/commit evidence, and suggest one change to reduce waiting."
The generated daily report lists observed usage, models/effort, skill-loading evidence, Git activity, and the longest sessions to investigate.
Reconciliation by an agent is an on-demand review; the scheduled recorder does not infer semantic task completion or query GitHub/Notion.
Authorized workflow experiments live under `~/.local/state/agent-workflow/experiments/`; review their baseline and actual PR evidence alongside this report.
Those private experiment records are written and reconciled by an agent on request, not automatically ingested or adjudicated by the collector.
Jev remains an advisory skill router and can also classify follow-ups and suggest an improvement experiment.
Route decisions append metadata to `decisions.jsonl` separately from observed skill-loading records.
An unavailable session environment variable leaves that decision's session binding unknown rather than guessing from a nearby conversation.

## Jev enrichment

Enable or stop automatic enrichment for the existing configured workspace:

```sh
agent-workflow enable-jev --backfill-days 7
agent-workflow enrich --limit 8
agent-workflow disable-jev
```

The recorder pins `jev-1.13.0` for this experiment.
Each classification includes the previous request, latest textual response and user follow-up, bounded to 1,200/1,800/1,200 characters respectively.
Common credential patterns are redacted; this is limited redaction, not a guarantee that arbitrary private text is removed.
Jev classifies correction, clarification, approval, acceptance, continuation, new work or unknown, plus the work category and friction source.
Confidence below 0.8 becomes unknown rather than a confirmed label; confidence itself is not measured accuracy.
If most labels remain uncertain, compare the retained judgments against a reviewed sample before changing the threshold or claiming useful classification.
This follows [TypeSafe's confidence guidance](https://docs.typesafe.ai/confidence); the threshold is an initial conservative choice, not a calibrated accuracy guarantee.
Only IDs, context hashes, labels, typed judgments and call metadata persist locally.
Initial requests, tool results, context blocks, child conversations and conversations outside the configured workspace are excluded from this follow-up classifier.
The seven-day backfill is a partial sample selected newest first.

Default limits are eight follow-ups per scheduled collection, 80 labels and 12 automatic call attempts per UTC day, including failed calls and triage.
Native capture commits before enrichment, so a TypeSafe failure preserves the captured usage.
Failed calls wait 30 minutes before retrying.
Stable provider/session/turn IDs prevent paying to label the same follow-up again; a changed classifier version permits deliberate relabeling.
Enrichment is advisory and does not change project or workflow configuration.

Weekly triage uses code-computed counts from a rolling seven-day label window and sends aggregates rather than transcript excerpts.
It requires at least two inferred correction/clarification events for a friction source and refreshes at most once daily.
The report includes a proposed experiment, its metric and evidence turn IDs, or asks for more evidence.
Compare similar work before and after an experiment; fewer corrections with no worse verification is a useful signal, while causal benefit remains unconfirmed.
Acceptance mentions do not establish accepted delivery, and silence does not establish satisfaction.
Human active minutes, rework time, PR/CI outcomes and cross-session task identity still require independent evidence.

All calls made through `jev-workflow`, `skill-usage --jev` and automatic enrichment log purpose, model, latency, tokens, status and a state hash to private `jev-calls.jsonl`.
Provider usage for failed calls may be unavailable.
Jev dollar cost remains unknown and is separate from the native API-equivalent subtotal.
Older route receipts have no shared call telemetry and are not retroactively assigned latency or outcomes.
After a routed request, agents use `jev-workflow record-use` to save applied/overridden and the actual skill names in `jev-use.jsonl`.
These are session-bound agent declarations, kept separate from recommendations, native loading evidence and human acceptance.
Optional routing `--recheck` adds one call to reread the top three candidates; normal routing remains a single call.
For an evidence-linked retrospective, preview only its known transcripts with `jev-workflow scan --days 7 --limit 30 --session-file <path>`; repeat `--session-file` for each related conversation.
The day window and turn limit still apply, and repeated paths are scanned once.
Inspect excerpts before adding `--jev`; classification describes requested work, not whether the work was correct or complete.
Sending requires selected `--session-file` flags, or `--all-sessions` when a broad sample is explicitly intended; known child/subagent conversations are excluded from this user-turn scan.
Reconcile related sessions using ticket, PR, commit, and transcript evidence rather than classifier labels or branch proximity.
On-demand follow-up reassessment uses [structured option distinctions](https://docs.typesafe.ai/primitives/choice) and saves best-fit predictions with per-field uncertainty in `jev-rechecks.jsonl`.
The report shows this second pass separately; automatic friction metrics continue to use the original confidence-gated labels.
Rechecks are requested runs rather than an automatic retry loop, and their provider calls appear in the shared overhead ledger.

## Private storage and coverage

- Configuration: `~/.config/agent-workflow/config.json`.
- Durable metadata: `~/.local/state/agent-workflow/history.sqlite`.
- Reports: `~/.local/state/agent-workflow/reports/latest.md` and date-named files.
- Logs: `collector.log` and `collector-error.log` in the same state directory.
- Jev call/use metadata: `jev-calls.jsonl` and `jev-use.jsonl` in the same state directory.
- Jev second-pass predictions and run summaries: `jev-rechecks.jsonl` and `jev-recheck-runs.jsonl` in the same state directory.
- LaunchAgent: `~/Library/LaunchAgents/com.luis.agent-workflow.plist`.

The initial pilot filters to the configured GitKraken umbrella directory.
Local Codex active/archived rollouts and Claude project/subagent transcripts are read; unsupported remote sessions remain outside coverage.
Thirty days of available recent history are backfilled; captured metadata remains after the provider removes its transcript.
Repeated scans upsert by provider, session and turn identity rather than adding cumulative snapshots.
If a reduced snapshot would lose already observed usage, retain high-water counters and mark them in the report; this requires explicit reconciliation when a parser correction is responsible.
Changed-file skill records are deduplicated by tool identity and kept independently.
Skill invocations/reads are evidence of loading, not proof that the instructions helped; shell path references remain weaker evidence.
Turn time includes agent and tool work and may overlap with other agents; it is not pure inference wait or human active time.
Request-level API-equivalent token estimates now appear by provider and model; native session estimates remain separate and are never added to that subtotal.
Commits are durable observations, including commits made unreachable by later history rewrites.
Acceptance, rework time, PR/CI status, and cross-session task identity need additional evidence rather than inactivity-based inference.
Polling can miss a transcript deleted before capture, and cannot recover telemetry the provider never recorded.

## Setup and recovery

The command lives in the dotfiles `scripts/` directory, which the existing interactive-shell setup adds to PATH.
Use its absolute path if the current shell has not loaded that setup.
`prepare` writes machine-specific paths to private configuration, not tracked dotfiles.
Preparing the same workspace preserves its Jev settings; preparing a different workspace leaves enrichment disabled.

```sh
agent-workflow prepare --workspace ~/dev/gitkraken
agent-workflow collect
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.luis.agent-workflow.plist
```

After moving dotfiles or changing the Node/Python installation, unload the old service, rerun `prepare`, and bootstrap it again.
Keep metadata and reports when stopping capture:

```sh
launchctl bootout gui/$(id -u)/com.luis.agent-workflow
```

Background errors are visible in the error log; `status` reports the last successful collection.
This recorder installs no provider hooks and changes no project Git configuration or commit content.

## Usage cost calculation

Rates live in `config/agents/usage-pricing.json`, verified against official provider documentation on 2026-10-06.
The recorder calculates locally; no provider key or paid API call is needed.
Historical usage is valued at those dated current reference rates for comparison, rather than asserting the price billed at the time.

For Codex, total input includes the cache partitions:

```text
uncached_input = input_tokens - cached_input_tokens - cache_write_input_tokens
USD = (uncached_input × input_rate + cached_input_tokens × read_rate
       + cache_write_input_tokens × write_rate + output_tokens × output_rate) / 1,000,000
```

For Claude, `input_tokens` already means uncached input:

```text
USD = (input_tokens × input_rate + cache_read_input_tokens × read_rate
       + write_5m_tokens × write_5m_rate + write_1h_tokens × write_1h_rate
       + output_tokens × output_rate) / 1,000,000
```

Claude's aggregate cache creation count is checked against the TTL buckets, not charged again.
Reasoning/thinking is already part of output and is not added again.
OpenAI requests exceeding 272,000 input tokens get the documented input/cache 2× and output 1.5× premium.
Codex served tier and geography are not in these logs, so its estimates use standard/global rates with an explicit assumption.
Claude uses observed speed and geography; missing geography uses a disclosed global-rate assumption.
Known Opus 5.5 fast usage doubles token rates, and supported US inference adds 10%.
Unsupported models or service modifiers, invalid token partitions, and missing positive-write TTL produce an unpriced reason rather than a zero cost.

Codex native response identities and Claude message identities deduplicate copied/streaming records.
Pricing uses the request's model and timestamp, including available child-agent records whose recorded working directory is inside the pilot workspace.
It does not price a whole multi-model turn as its root model.
Legacy Codex aggregate counters lack the request detail needed by this implementation and remain outside the priced subtotal.
The report's priced/observed ratio covers extracted request records; it does not prove that every historical request was retained.
Turn usage and request-cost coverage are separate, especially when child logs have expired.
Hosted tool charges and subscription fees are excluded.

Sources: [OpenAI pricing](https://developers.openai.com/api/docs/pricing), [OpenAI cache partitions](https://developers.openai.com/api/docs/guides/prompt-caching), [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing), [Claude cache buckets](https://platform.claude.com/docs/en/build-with-claude/prompt-caching).
