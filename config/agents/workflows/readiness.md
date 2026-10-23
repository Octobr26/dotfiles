# Behavior evidence pilot

Use for behavior-changing implementations and PR reviews with an existing executable test seam.
Copy, mechanical edits and investigations that do not make a readiness claim keep their existing focused checks.
This pilot adds a local evidence gate; it does not authorize changes, commits, publication, extra agents or new fixtures.

## Job

Run `agent-readiness` from any directory, using the actual repository/worktree in `--repo`.
The executable lives at `../../../scripts/agent-readiness` relative to this file if the scripts directory is absent from PATH.
Keep its records outside repositories, in the default private agent-workflow state directory.
Reuse the existing investigation record's content; the JSON representation replaces a duplicate checklist.

1. Initialize a record with `init --repo <worktree> --base <base-ref> --mode implementation|review --task <request> --actor <coordinator-session>`.
   The command prints its private record path; optionally choose a private `--record` path.
   `--base` is required: use the actual PR base/ref for committed changes; `HEAD` selects only uncommitted work and does not review the branch's commits.
2. Fill `cases` and `applicability` in that record.
   Every applicable scenario names its concrete cases; every n/a entry cites the diff fact that rules it out.
   Derive expectations from the requirement and actual producer/caller, then capture that source evidence and run `check --record <record> --phase plan` before implementation or reviewer dispatch.
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

`init` creates the versioned record and the six applicability entries.
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
Only non-blocking findings may remain open or deferred; accepted material risk is reported explicitly rather than converted to a complete gate result.

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

The reviewer returns JSON, with reasons grounded in inspected sources and observed results:

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
Capture this JSON using `--kind review --reviewer <identity>` and add the capture ID to the record's `reviews` list.
For an agent response saved privately, the explicit capture command can be `cat <response.json>`; this records the supplied response without pretending to authenticate its author.
Keep older captures; select fresh final review IDs after code changes.

## Limits and result

The checked plan binds the implementation/review mode as well as the case expectations; changing the mode requires a new plan.
The CLI checks record completeness, content hashes, target state, captured exits and recorded reviewer coverage.
It fingerprints HEAD, staged changes, tracked working files and non-ignored untracked files, including file modes; ignored dependencies, deployments and undeclared environment changes remain outside that fingerprint.
Hashes detect corruption and accidental edits, not deliberate rewriting of evidence and hashes together.
Reviewer identity is a distinct recorded claim, not authenticated independence.
Neither field completion nor command success proves that the selected cases are sufficient, that observations are true, or that the application is correct.
Provider invocation remains instruction-driven; no hook forces an agent to call this command.

Report `EVIDENCE COMPLETE` or `EVIDENCE INCOMPLETE`, with actual runtime versus source coverage and remaining decisions.
For harness effectiveness, retain real-source misses, false positives and implementation rework in the existing private experiment records; passing this gate is not an effectiveness score.
