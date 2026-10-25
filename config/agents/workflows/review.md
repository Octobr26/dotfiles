# Review Workflow

Reviews are read-only unless Luis separately asks to address findings.
When review accompanies an editing task, apply [scope and authority](README.md#scope-and-authority) to each correction; verification does not expand the authorized diff.
Project instructions and current code remain authoritative; these are Luis' personal review defaults.
For behavior-changing PR reviews with an existing executable test seam, use the [behavior evidence pilot](readiness.md): check the sourced plan before reviewer dispatch and final evidence before recommending approval.
The existing reviewers supply the independent assessments; an incomplete gate remains a coverage limit, not a new recursive review stage.

## Review the exact change

1. Resolve the request, scope, base/head revisions, current state, and authenticated identity when live state matters.
   Include staged, unstaged, and relevant untracked changes for working-tree reviews.
   Check the target again before reporting; recheck affected evidence if it changed.
2. Compare requirement coverage and implementation quality separately.
   Use the request and verified project requirements; do not invent a ticket prerequisite.
   Check the provenance of consequential policy choices in supplied plans, prompts, and handoffs against the originating request.
   Respect explicit user decisions; identify an unresolved tradeoff rather than silently changing the requested behavior.
   Follow [Trace the affected behavior](README.md#trace-the-affected-behavior) through the changed behavior's actual callers and consumers.
   For backend request, service, query, worker or migration behavior, select the applicable [backend cases](backend.md#backend-cases) and verify them at the reviewed revision.
   Resolve material evidence gaps under the [Clarification Gate](README.md#clarification-gate); keep dependent fixes pending rather than converting unknowns into requirements.
3. Add a specialist only for a real contract, data, security, runtime, or design boundary.
   Use the smallest route that preserves the independent check required by the selected risk level.
4. Complete the behavior evidence below, verify candidates under the finding gate, then report actionable findings and material limits.

## Behavior evidence before a verdict

For each consequential behavior changed, reuse the task's evidence record to connect the entry point and affected population to the expected result, its authority, a discriminating input, and the observed result or decisive source at the reviewed revision.
Choose inputs that could defeat the proposed behavior; successful checks count only for the paths and states they actually exercise.
When no spec exists, trace existing behavior and actual callers, and identify decisions needing authority; behavior review still runs.

Select the applicable checks; omit unrelated scenarios:

| Change | Evidence needed |
| --- | --- |
| Migration or redirect | Feed an actual producer-shaped link or payload into the changed consumer. Challenge assumptions about old paths or formats with valid current data. Account for saved links/data as well as newly generated values. |
| Gates, roles or layout ownership | Compare the same affected entry points for populations whose access changes, including a denied population and its intended fallback. A working index does not establish deep-link behavior. |
| Removal or retirement | Trace reverse dependencies beyond imports: prefetches, requests, flags, route constants, admin controls and operational actions. Distinguish unreachable code from live wasted work and still-required shared consumers. |
| Independent deployments | Check intermediate versions and persisted links/data. A companion release closes only the cases it actually repairs; name any remaining compatibility decision or merge prerequisite. |

Preserve contradictions between requirements, producers, tests and observed behavior as open findings until evidence or an authorized decision resolves them.
A PR description, test expectation, prior reviewer request or the label "intentional" does not by itself resolve contradictory producer or user-visible evidence; locate the requirement or authorized decision that settles it.
For each dismissed candidate, retain its concrete trigger and the evidence that refutes the consequence or authorizes deferral.
Classify useful feedback as a defect, unresolved decision, release prerequisite or non-blocking improvement; deferred work retains a specific scope and reason.

Before recommending approval, reconcile these records with the verdict.
An observed lost identity, denied reachable workflow, or unresolved compatibility contradiction cannot disappear into a generic deployment note or green check count.
Report confirmed blockers and material unknowns even when other checks pass; keep the final answer concise by summarizing evidence rather than dropping findings.

## Finding gate

Every finding needs an exact location, concrete reachable trigger, wrong result or violated requirement, supporting evidence, and smallest correction.
If the remedy depends on a legitimate unresolved decision, name that decision and the behavior that must be preserved.

- Read the owning code and actual defaults; inspect guards, normalization, middleware, and callers that could disprove the claim.
- Before calling code, a workaround, or an exclusion outdated or unneeded, check its history (`git log -S`, `git blame`) and the PR that introduced it.
- For a regression, compare the old and new behavior on the same relevant inputs.
- Trace the changed rule through affected rendering, sorting, filtering, aggregates, exports, cache identity/invalidation, and recovery; inspect only relevant consumers.
- For contract or shared-configuration changes, check the oldest supported independently deployed consumer and alternative runtime paths against the producer's handler/serializer at a recorded revision.
  Merged source does not prove deployment; verify ordering separately when it affects acceptance.
  If several implementations interpret the same rule, compare them using the same discriminating examples.
- Visual or interaction claims that depend on rendering need an actual observation and its state/viewport, with a screenshot, measurement, or clip when useful.
  A deterministic runtime defect can also be established by a reachable call path and decisive source or test evidence.
- Classify candidates as confirmed, refuted, or unknown.
  Drop refuted claims; report unavailable material evidence as a coverage limit with the exact next check.
  A missing source is not proof of a defect or proof that the code is safe.

Reviewer agreement does not establish correctness or increase severity.
Investigate a dismissal with the same care as a proposed finding.
A cast, duplicated literal, missing test, or shared helper has no automatic severity; apply the actual behavior and project rules.
Unnecessary requests, unreachable code and misleading residue are actionable non-blocking improvements unless evidence establishes broken required behavior, an unacceptable performance bound or a mandatory requirement violation.
State the demonstrated consequence and keep unresolved error propagation or policy separate; neither the presence of an `await` nor a changes-requested review makes every improvement a blocker.
For a standards violation, separate the violated rule from its remedy: compare the smallest conforming reuse with extraction or code movement before recommending a refactor.

## Request behavior and contract

When a change adds work to a request, trace its execution order, waits, cancellation, and error propagation.
Check whether optional enrichment can fail the main result, add serial latency, or turn a larger raw scan into request failure; compare with the existing path and identify the relevant bound or missing runtime measurement.
For partial or best-effort data, establish how consumers distinguish unavailable data from a successful empty result, and surface a material ambiguity as a product decision.
For changes to wire fields, serialization, request failure behavior, or consumer interpretation/fallback, record producer and consumer revisions and check actual serialized success, empty, and applicable degraded values against the real consumer parser and any fallback.
Repeat this check when review edits change wire shape, serialization, failure behavior, or consumer interpretation; earlier reviews and separately passing suites do not establish compatibility at the final revisions.
If the boundary cannot be exercised, report contract verification as incomplete with the missing check.
Check differences from related fields, deployment order, and the owning API documentation.
Report a docs dependency without changing another repository unless that work is authorized.

## Test and author checks

Before requesting a test, name the plausible incorrect behavior the current assertions accept and the input/assertion that would distinguish it.
Check whether an existing test already covers the case.
For each added test, identify the distinct incorrect behavior it rejects; consolidate overlapping coverage while preserving unique boundary cases.
For changed test groups, trace the production import and each changing input through the actual function/query/service boundary to the distinguishing assertion. Name intentionally bypassed boundaries; parameterized labels or assertion-only inputs do not establish distinct behavior.
Test and mutation-check results validate behavior against assertions, not the policy encoded in those assertions.
Carry each relevant prior finding's source, original counterexample and disposition through the final-head check: fixed with evidence, refuted with evidence, explicitly deferred, or unresolved with its next check. Re-exercise the discriminating case or cite decisive source evidence at the final revision; a changed requirement needs its recorded authority.
A test-gap finding that meets the bar above is refuted only by naming the existing assertion that fails on its counterexample; earlier manual comparison, low priority, or reluctance to repeat a list does not refute it.
Keep it open with the smallest assertion that closes it, or record Luis's explicit deferral.
When Luis asks which comments a reviewer would still leave, start from findings still open or deferred without that evidence and from PR-description claims without matching coverage, then use the reviewer's history.
Derive the expected result from the requirement and producer contract before writing assertions; a test that preserves the reported failure does not close it.
For affected time-series comparisons, cite the producer line that shows sparse versus zero-filled buckets and distinguish absent, null and measured zero. Anchor each series to its own request-range start; using the first returned point as the origin requires a cited zero-filling producer. Select discriminating leading/interior/trailing gaps, range-start versus first-event origins, request/browser/database zones, actual preset/hour boundaries and unequal calendar months only where relevant; apply shared-rule examples to affected consumers and record unavailable zone evidence.
For metric comparisons, verify both sides use the same formula, provider population, denominator, inactivity/PTO rules, and units; unrelated field presence is not a compatibility signal.
Exercise optional-request failure with usable primary data, missing versus null fields, inactive roster rows, and configured overrides when those paths affect the change.
When separate queries feed one result, record their keys and organization/filter identity, placeholder scope and consumer readiness. Distinguish same-key refetch from changed-key placeholder; challenge organization switches, either response arriving first, optional failure and relevant combinations such as placeholder primary data plus optional error. Derive expected display/export and state-preservation behavior from the established contract, without enumerating every flag combination.
For shared UI changes, inspect representative real page containers and keyboard behavior; isolated component checks do not establish scroll offsets, overflow ownership, or focus order in those pages.
For changed status/loading messages or grouped controls, inspect the rendered semantic association between the message or label and its region or control; a role/name lookup or visible-text assertion alone does not establish that relationship.
For status regions, check meaningful message text when populated and the empty-to-populated transition; preserve intentionally mounted empty regions and check their empty layout.
Record actual assistive-technology observations separately from DOM or accessibility-tree inspection.
When UI text, accessible names, or roles change, search end-to-end tests and page objects (such as `end-to-end-tests/`) for the old value alongside production and unit-test consumers, and account for every affected selector before concluding the review.
Hover- or focus-only content must not keep a library's default dialog role or be the only route to its information; base tab stops on the real need, such as truncation, not on tooltip presence.
For sticky headers, check page, bounded-card, and preview-pane scroll owners separately, including horizontal overflow at a narrow viewport; record untested hosts as incomplete rather than checking aggregate verification boxes.
For nested scrolling, enumerate elements with actual horizontal overflow and exercise the intended scrollbar to both ends; document overflow of zero and aligned columns alone do not prove a single usable scroll owner. Check browser zoom across responsive breakpoints when headings or controls change visibility.
Choose follow-up checks to challenge an untested assumption; repeated green checks or reviewer counts do not expand coverage.
For behavior changes with a suitable existing test seam, favor focused regression tests that fail on the old behavior and pass on the fix.
Do not request fixtures, mocks, snapshots, or verification helpers merely to mirror implementation; follow existing authorization rules before adding them.
A one-time comparison during a refactor does not protect later edits.
When a refactor builds an ordered definition from shared parts (spreads, shared lists, generated config) and a separately defined structure must stay aligned with it by position, such as grid track widths joined in order against column definitions kept elsewhere, an inline assertion of each variant's ids in order is behavior coverage, not a snapshot or mirror.
When one entry supplies everything rendered for its column (header, cell and width), reordering moves them together; it needs no order assertion unless the order itself is a stated requirement.
Copy, documentation, and mechanical changes use focused checks appropriate to their actual risk.

Before applying a cleanup or fix to a PR, read its existing review comments and replies; do not undo a change a reviewer requested.
Before handing back an authorized implementation, inspect the final diff for the same reachable failures and affected consumers.
Check action followed by refresh/re-entry and by its reverse action (hide then show, save then clear), loading/error/missing-data states, identity, and recovery where relevant; reading a pre-seeded stored value does not exercise the write path.
Keep code comments brief and explain only non-obvious constraints; apply the project's comment rules.
Fix confirmed problems within the authorized scope at the layer that owns them, then rerun affected checks and complete required gates.
Inspect existing validation output and its revision/scope before installing, building or creating a new check. Record actual commands/results separately for tests, backend/contract inspection, UI exercise and unavailable checks; include target/revision/state, skips, baseline failures and evidence paths. Source inspection, synthetic UI, authenticated page exercise and deployment evidence support different claims; an approved exception does not make an unrun check pass.
In a PR description, tie each test-plan step and checked verification box to the test or recorded observation that exercised it at the final head.
A step that describes a round trip (hide then restore, save then reload) needs evidence for each direction; a test that only reads a pre-seeded value covers neither the action nor its reversal.
Label steps nobody ran as manual checks for reviewers, and leave boxes for unrun checks unchecked.
Use the current project's scripts and CI requirements rather than copying a command list from another repository.

For stacked PRs, record the current remote heads and base revisions before rebasing, then record the resulting local heads.
When the project has a compiler or typecheck, run the full check on every affected head using dependencies matching its lockfile.
Focused tests, lint, formatting, and filtered checks do not replace it.
If the full check is blocked, report verification as incomplete and name the blocker before committing or handing back the stack.

## Concise review output

- Put confirmed findings first in severity order, one comment per distinct cause/remedy.
  Include location, trigger, consequence, evidence, and correction, usually in two to four sentences.
- Read existing comments and replies before reporting; omit covered or resolved findings.
  Mention an unresolved existing blocker once with its thread link instead of creating another comment.
- Omit unsupported stylistic preferences.
  Report concrete non-blocking improvements when the change leaves wasted work, misleading controls, unreachable code or a maintenance consequence; explain the consequence and whether a scoped follow-up covers it.
  Keep actual defects and mandatory project-rule violations even when their fixes are small.
- Carry still-relevant deferred findings into the review handoff and, when writing a PR description, its known limitations: source, concrete trigger and consequence, scope and reason, and recorded authority where required.
  Name an existing follow-up or state that none is assigned.
  Report repeated feedback with the existing deferral and its authority; reassess when evidence or an authorized decision changes the basis for deferral.
- Omit empty severity sections, reviewer counts, routing details, retraction counts, and repeated summaries unless requested.
  Never hide a material defect or use a finding quota to reduce comment count.
- End with the verdict and actual checks; include material limits and the next verification path when needed.
  If nothing actionable is confirmed, say so.

Request changes for confirmed defects or mandatory requirements that must be resolved before merge, regardless of tier.
Use comments for non-blocking findings or decisions; mark the review incomplete when material acceptance evidence is unavailable.
Approve only when no unresolved confirmed blocker remains and material acceptance checks were completed.
Distinguish what code proves, what was observed at runtime, and what remains unknown.
Do not post reviews, resolve threads, merge, or mutate remote state without explicit authorization.
