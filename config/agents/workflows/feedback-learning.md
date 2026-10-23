# Learn from review feedback

Use when Luis asks to improve the harness from review comments, escaped defects or repeated corrections.
For a categorization-only request, return the analysis and proposed change; implement harness changes when authorized.
Keep product review read-only and preserve unrelated harness edits.

## Trace feedback to a decision

Collect the exact feedback, reviewed revision, original request, prior candidate dispositions and actual verification records.
Separate later changes, newly supplied requirements, confirmed misses, knowingly deferred work and unsupported reviewer claims.
Use Jev for bounded semantic categorization when requested; inspect its current TypeSafe guidance and preview the minimal payload locally before sending.
Keep source code, credentials and unrelated transcript content out of the classification payload.
Preserve comment URLs, category probabilities and uncertain classifications; split compound feedback where distinct remedies matter.

For each consequential item, connect:

```text
Feedback and evidence:
Concrete consequence and whether it existed at the original review revision:
Earlier check or dismissal; missing evidence or wrong inference:
Harness owner and the decision it must change:
Counterexample and expected action; authority for that expectation:
Disposition and validation result:
```

Jev labels the supplied evidence; the agent verifies claims and explains causes.
Comments in one category can have different causes, and one cause can explain several comments.
Counts and model confidence do not establish defects, root causes or improvement.

## Change and check the harness

Prefer repairing a completion criterion, suppression rule or broken pointer over adding another generic instruction to be thorough.
Locate the controlling workflow and invoking skill, preserve project overrides, and keep each rule with one owner.
Use [instruction writing](instruction-writing.md) for authorized edits and combined-instruction checks.

Replay a discriminating case from the feedback and a nearby case that should remain acceptable, using the revised path's actual entry point.
For review changes, include a case with passing checks but unresolved contradictory evidence; for implementation, check that the expected behavior is settled before assertions are chosen.
Keep expected outcomes separate from evaluator input where independent evaluation is available and authorized.
Record whether validation was a manual walkthrough, a fresh agent run or an actual later task; those are different strengths of evidence.

Keep private case evidence and experiment records outside product and public configuration repositories, under the [tracking runbook's experiments directory](../../../docs/agent-workflow-tracking.md#daily-use).
Record the before/after harness revisions or exact snapshots, source-linked failure, changed decision, replay result, escaped substantive feedback and observed overhead on subsequent comparable work.
Use actual review feedback as the outcome measure, account for legitimate deferrals and false positives, and keep unknown outcomes unknown.
An instruction edit or a green replay is a candidate improvement; report real effectiveness only after comparable subsequent outcomes are observed.
