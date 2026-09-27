---
name: diagnosing-bugs
description: Diagnose difficult, intermittent, performance, or disputed defects with a precise failure signal and falsifiable hypotheses. Use when an initial inspection does not establish the cause or controlled comparison is needed. Skip straightforward fixes with a confirmed cause.
---

# Bug diagnosis

Resolve the exact checkout, failure path, observed symptom, expected behavior, and authorized scope.
Read the applicable runbook and current state before probing.
Preserve dirty files and redact secrets and personal/customer data in commands, logs, and handoffs.

## Establish the failure signal

Find the narrowest check that can detect the exact symptom: an existing test, CLI invocation, dev request, browser interaction, or comparison of captured evidence.
Inspect code as needed to construct it, and record what actually ran and whether it reproduced the reported failure.
Prefer existing local evidence and test facilities.
New fixtures, mocks, captured-data replays, or verification-only harnesses need the approval required by governing instructions.

For live systems, establish target and authority first.
Repeated or parallel probes, requests, and replays must not cause unauthorized writes, charges, messages, inventory changes, or load.
A request to diagnose an operation is not permission to repeat its side effects.

When runtime reproduction is unavailable, continue with useful code, configuration, logs, and contract analysis.
Label the resulting cause as inferred until evidence confirms it; state the missing verification without claiming runtime reproduction or a runtime fix.
Ask for access or a decision only when remaining uncertainty materially blocks the authorized next step.

## Narrow and distinguish causes

Reduce a reproducible case one relevant input or condition at a time while retaining the symptom.
For intermittent failures, characterize the observed reproduction rate; use bounded repetition only in an authorized isolated environment.
For performance problems, establish a comparable baseline before changing code.
Keep a short ranked list of plausible causes only while uncertainty remains.
For each cause, name a prediction and the smallest observation that would distinguish it from alternatives.
Test one prediction at a time and update the list from the result.
Set a practical attempt/time budget within the workflow's budget; stop repeating an unchanged failed probe and report the evidence gap.
Instrumentation must be narrow, identifiable, authorized, and removed when no longer needed.

## Fix and verify

Use `tdd` when an existing boundary can reproduce the actual pattern and a fix is authorized.
Otherwise explain the limitation and use the best available check; missing coverage is not automatic authorization for architecture work.
Make the smallest correction, rerun the original scenario when available, and inspect affected behavior.
Clean up only debugging artifacts created for this task.
Report the supported cause, before/after evidence, uncertainty, and any required deployment or live readback.
Follow the selected workflow's independent review and correction limits.
