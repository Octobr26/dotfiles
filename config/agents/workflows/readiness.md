# Behavior evidence pilot

Use for behavior-changing implementations and PR reviews with an existing executable test seam.
Copy, mechanical edits and investigations that do not make a readiness claim keep their existing focused checks.
Requests such as "take a look at this bug and see if I introduced it" start with investigation, clarification, history inspection and existing tests; they do not require readiness enrollment or an implementation plan.
This pilot adds a local evidence gate; it does not authorize changes, commits, publication, extra agents or new fixtures.

## Job

Run `agent-readiness` from any directory, using the actual repository/worktree in `--repo`.
The executable lives at `../../../scripts/agent-readiness` relative to this file if the scripts directory is absent from PATH.
Keep its records outside repositories, in the default private agent-workflow state directory.
Reuse the existing investigation record's content; the JSON representation replaces a duplicate checklist.

1. Initialize a record with `init --repo <worktree> --base <base-ref> --mode implementation|review --task <request> --actor <coordinator-session>`.
   The command prints its private record path; optionally choose a private `--record` path.
   Use the native session ID as actor; initialization enrolls this repository and record in that session's private index for the native hooks.
   `--base` is required: use the actual PR base/ref for committed changes; `HEAD` selects only uncommitted work and does not review the branch's commits.
2. Fill `clarification`, `cases` and `applicability` in that record.
   Apply the [clarification gate](README.md#clarification-gate) before choosing expected behavior; record material questions and their source-backed resolution in this record.
   For coupled cross-repository or independently deployed behavior, first complete and challenge the [cross-repository behavior plan](research.md#cross-repository-behavior-plan).
   Bind this record to the explicitly authorized behavior slice and its local verification; retain whole-ticket coverage and pending deployment/integration checks in the same plan or handoff.
   A missing deployment need not block implementation of a settled slice, but a check required to substantiate the claimed result stays required; do not remove it or substitute a synthetic pass to complete the gate.
   Every applicable scenario names its concrete cases; every n/a entry cites the diff fact that rules it out.
   Derive expectations from the requirement and actual producer/caller, then capture that source evidence and run `check --record <record> --phase plan` to obtain the draft's `plan_sha256`.
   A draft without an independent assessment returns `EVIDENCE INCOMPLETE`; this is the input to the existing plan challenge, not permission to implement.
   Give the plan reviewer the original request, record, captured authority and draft hash before the author's defense.
   Capture its assessment as `--kind plan-review --reviewer <identity>` and select the capture ID in `plan_reviews`.
   Rerun the plan check and inspect its exit status, `phase: plan` and `EVIDENCE COMPLETE` before dependent implementation or final behavior-review dispatch.
   A failed plan check pauses that slice; `needs_user` requires a question to Luis and `needs_evidence` requires investigation, not an assumed answer.
   Inspect its `required_probes` output; registered project probes are required independently of the author's selected cases.
3. Capture the selected observations at the target state.
   For implementation, the same command, cwd, environment and case must first fail on the specified behavioral assertion and then pass after the correction.
   A captured failure exits nonzero intentionally; inspect its artifact to distinguish the expected assertion from broken setup.
   The failing baseline must match the state recorded by the plan.
   If adding an authorized regression test changes that state, refresh the source captures and rerun the plan before capturing the baseline and changing production code.
   Refresh source captures after code changes; historical artifacts stay intact while case references select current evidence.
4. Give a separate reviewer the request, sourced cases, target code and raw evidence before the author's defense.
   Use the independent review already required by the project/workflow; the code-review skill's existing axes provide this assessment without a third recursive review.
   Preserve actionable findings and their dispositions, including source-backed refutations and concrete non-blocking work.
5. Capture the review output, select the active review IDs in `reviews`, and run `check --record <record> --phase final` before recommending approval or calling implementation ready.
   An incomplete result retains the concrete missing evidence in the handoff; follow the existing clarification gate rather than manufacturing a pass.

## Record and capture

`init` creates the versioned record with an unchecked clarification assessment and the six applicability entries.
Existing records without `clarification` require an explicit assessment and a new plan check; they are not automatically cleared.
Use this assessment shape:

```json
{
  "status": "clear",
  "reason": "Explain how the cited authority settles consequential choices in this slice.",
  "questions": ["Which persisted state does this action change?"],
  "evidence": [{"source": "requirement-final", "quote": "Exact text from the captured requirement or decision"}]
}
```

`questions` lists material choices considered; use `[]` with a reason when none remain.
`status` is `unchecked`, `needs_user`, `needs_evidence` or `clear`; only `clear` permits a plan.
The CLI requires quoted text to occur in the referenced source capture; the independent reviewer checks whether it actually supports the assessment.
This does not authenticate a human decision or establish that every ambiguity was identified.

Each case has this shape; runtime implementation cases also require `baseline` and the exact expected assertion text in `failure`:

```json
{
  "id": "failed-request",
  "authority": "Requirement or producer/caller citation establishing the expected result",
  "authority_status": "confirmed",
  "authority_source": "requirement-final",
  "input": "Concrete user action, values and state transition",
  "expected": "Observable result derived independently of the implementation",
  "check": "Exact executable boundary or decisive source path that can disprove it",
  "method": "runtime",
  "source": "contract-final",
  "baseline": "regression-red",
  "failure": "Exact behavioral assertion text expected in the baseline failure",
  "result": "regression-green",
  "observed": "Actual observation, filled after verification"
}
```

The `authority_source` capture contains the actual requirement, recorded decision or producer/caller contract establishing the expectation.
Set `authority_status: confirmed` only after resolving material unknowns; the CLI checks the explicit status and capture integrity, while the reviewer evaluates whether the cited authority supports the expectation.
A copy of implementation code alone does not establish the requested behavior.

Use `method: source` for a source-established review case; it needs a source capture and observed interpretation, but no runtime result.
Source-only implementation evidence stays incomplete in this pilot.
Each finding has `id`, `kind` (`blocker`, `decision`, `nonblocking`), `status` (`open`, `fixed`, `refuted`, `deferred`), `reason`, and captured `evidence` IDs.
Decision findings block both plan and final checks while open or deferred.
A fixed or refuted decision also needs `resolution: {"kind": "user_decision", "source": "requirement-final", "quote": "Exact decision text"}`; `kind` may also be `requirement` or `verified_contract`.
Include the resolution source in the finding's `evidence`; an agent's preferred policy is not a resolution.
An ordinary code-defect blocker may remain open at plan time when the authorized task is to fix it.
At final, only non-blocking findings may remain open or deferred; accepted material risk is reported explicitly rather than converted to a complete gate result.

Capture executes argv directly with no shell; supply interpreters explicitly when required by an authorized check:

```sh
agent-readiness capture --record "$readiness_record" --id contract-final --kind source --case failed-request -- git show HEAD:path/to/owner
agent-readiness capture --record "$readiness_record" --id regression-red --kind baseline --case failed-request -- pnpm exec vitest --run path/to/existing-test
agent-readiness capture --record "$readiness_record" --id regression-green --kind check --case failed-request -- pnpm exec vitest --run path/to/existing-test
```

`--case` is repeatable for a command covering multiple cases.
Use `--cwd` for a repository-relative subdirectory and `--env NAME=value` for non-secret semantic settings such as `TZ`.
The expected assertion must appear in the failed baseline output; a reviewer still checks that it is the right failure.
A command that changes tracked, staged or untracked source invalidates its capture.
Default timeout is 300 seconds; output is streamed into a strictly bounded 2 MiB capture, and timeout/oversize captures remain incomplete.
Capture cleans up its process group, so use terminating verification commands rather than persistent servers.
`check` reads evidence and current code state; it never executes a recorded command.

## Registered project probes

The CLI discovers `~/.config/agent-context/<origin-repository-name>/readiness-probes.json` from the actual worktree's origin, and retains that policy path in the record.
An explicit `init --probe-policy <private-file>` is available when no project policy is discovered; it cannot replace a discovered policy.
Policies contain a version-1 `probes` list with `id`, changed-file `paths` globs, exact `argv`, and the contract's `expectation`.
Declare the verification program's absolute paths in `files`; their contents and the policy are bound to the plan and capture.

For each required probe, execute its argv through `capture --kind check` at the repository root and map its ID to that capture in `probe_results`, for example `"probe_results": {"semantic-case": "semantic-check"}`.
Bind the capture to the relevant case and include it in the independent review's evidence.
The final gate requires the registered command, current source/program/policy and JSON output identifying the probe with `status: pass`.
Only a policy explicitly permitting `allow_not_applicable` accepts that status; the probe must establish why its contract does not apply at the target revision.
Missing, failed, unavailable, stale or substituted probes keep the evidence incomplete, even if every author-selected case has accepted evidence.
Do not change or remove a registered contract to obtain a passing result; report an existing failure and its scope without treating the gate as authority to fix product code.

## Review output

The plan reviewer returns the JSON shape below with the draft's `plan_sha256`, sourced case assessments, and two additional assessments:
`"clarification": {"status": "verified", "reason": "How the authority settles the consequential choices"}` and
`"coverage": {"status": "verified", "reason": "Why all six applicability decisions and selected counterexamples cover the change"}`.
Use `unresolved` and a non-accept verdict for an unsupported expectation, conflicting requirement or pending user choice, even if a proposed test passes.
The gate requires this assessment; it does not determine semantic support by searching for a matching quote.

The final reviewer returns JSON, with reasons grounded in inspected sources and observed results:

```json
{
  "reviewer": "distinct-provider-session-or-agent-identity",
  "verdict": "accept",
  "evidence": ["requirement-final", "contract-final", "regression-red", "regression-green"],
  "cases": {
    "failed-request": {
      "status": "verified",
      "reason": "Explain what the evidence establishes and which plausible failure it rejects"
    }
  }
}
```

Use `changes_required` or `incomplete` when appropriate; a case may be `unresolved`.
Reviewers may divide cases, but each verified case must cite its required evidence and every selected case needs assessment.
Every referenced capture must already exist when the review is captured; the review binds its evidence manifests and output hashes.
Changing those manifests or refreshing evidence requires a fresh assessment and review capture.
Refresh clarification and decision source captures at the final code state and include them in the review's `evidence`.
New review-time decisions can be resolved against the existing expectation without replacing the original regression baseline.
Changing the planned expectation, clarification rationale or a plan-time decision requires reconciling the affected plan and baseline before claiming readiness; preserve historical evidence and use a new slice record when the old baseline no longer applies.
Capture this JSON using `--kind review --reviewer <identity>` and add the capture ID to the record's `reviews` list.
For an agent response saved privately, the explicit capture command can be `cat <response.json>`; this records the supplied response without pretending to authenticate its author.
Keep older captures; select fresh final review IDs after code changes.
Plan and final assessments are distinct captures: neither substitutes for the other.
Preserve original plan sources and its accepted review; refreshed final sources use new IDs.
`check --phase implementation` validates the accepted specification and original assessment while allowing the intended code edits; it makes no claim about final behavior.
Changing expectations or plan-time decisions requires a fresh assessment and plan check.

## Native invocation

Install personal hooks with `agent-readiness-install-hooks --require-for <workspace-root>` (repeat for additional roots), then review the exact definitions in Codex `/hooks` and start a fresh Claude session.
The personal `agent-readiness-hook` adapter consumes native session IDs and the index written by `init`; `AGENT_READINESS_STATE_DIR` selects an isolated private state directory when testing.
Its configured workspace roots require enrollment before explicit `Write`, `Edit` and `apply_patch` repository edits; outside them, only enrolled sessions are gated.
Before a covered edit it runs the implementation check; private readiness and experiment files remain writable for evidence preparation.
Clarification, discovery, coordination, shell commands and other tools retain their normal provider permissions, even when a readiness record is missing or incomplete.
The adapter does not infer shell or MCP side effects: shell-based edits are outside its automatic enforcement, and agents must still run the implementation check before behavior changes regardless of the editing tool.
At Stop, the final check supplies an advisory result for enrolled work and never forces another turn; ending an investigation or asking a question is not a readiness claim.
Run the explicit final check before claiming readiness, and report any missing evidence without manufacturing a pass.
Provider configuration and exact-definition trust must be active for hooks to run; installation alone is not runtime verification.
Native hooks are workflow guardrails, not a security sandbox: persistent shells, provider tool exceptions, delegated workers and same-user configuration changes require their own coverage assessment.

## Limits and result

The checked plan binds the implementation/review mode, case expectations, clarification assessment and plan-time decision dispositions; changing the mode requires a new plan.
The CLI checks record completeness, content hashes, target state, captured exits and recorded reviewer coverage.
It fingerprints HEAD, staged changes, tracked working files and non-ignored untracked files, including file modes; ignored dependencies, deployments and undeclared environment changes remain outside that fingerprint.
Hashes detect corruption and accidental edits, not deliberate rewriting of evidence and hashes together.
Reviewer identity is a distinct recorded claim, not authenticated independence.
Neither field completion nor command success proves that the selected cases are sufficient, that observations are true, or that the application is correct.
Native enforcement applies only on configured, trusted provider surfaces and covered tool calls; report a missing or inactive integration explicitly.
The full registered probe policy and programs are bound at planning, while required probe results are selected from the final diff, so newly applicable probes do not invalidate the original regression baseline.

Report `EVIDENCE COMPLETE` or `EVIDENCE INCOMPLETE` for the named slice, with actual runtime versus source coverage, synthetic-test boundaries, remaining acceptance outcomes and decisions, and pending integration checks.
A claim that requires an unrun integration check remains `EVIDENCE INCOMPLETE`; report `EVIDENCE COMPLETE` only for the narrower claim established by the captured checks and accepted independent assessment.
Slice evidence completeness does not establish whole-ticket acceptance or deployment readiness.
For harness effectiveness, retain real-source misses, false positives and implementation rework in the existing private experiment records; passing this gate is not an effectiveness score.
