# Change Workflow

1. Interpreter fixes scope, risk, current state, source of truth, and acceptance
   criteria. When a rule already exists in executable code, name that authority
   and the consumers that independently interpret it.
2. Trace the full affected path under [Trace the affected behavior](README.md#trace-the-affected-behavior).
   For behavior changes with an existing executable test seam, use the [behavior evidence pilot](readiness.md): check the sourced plan before implementation and captured results before calling the work ready.
   Resolve material unknowns under the [Clarification Gate](README.md#clarification-gate); use `research.md` for the evidence investigation before dependent implementation.
   When implementation follows an investigation, validate its [completion and handoff](research.md#investigation-completion-and-handoff) against the original request and current task revision before planning edits.
   For an existing PR, read earlier findings and reviewer requests before choosing behavior; carry each relevant unresolved finding into the implementation plan with its source and required evidence.
   Before pushing a fix for a finding, list every other consumer of the same helper, hook or rule (search result) and re-run the finding's counterexample against each.
3. Pattern Checker compares the preferred direction with the target's existing code, configuration, and ownership.
   Use [domain-modeling](../../skills/domain-modeling/SKILL.md) when terminology or ownership ambiguity changes the requirement.
   Use [codebase-design](../../skills/codebase-design/SKILL.md) only when an interface or architecture decision is part of the change.
4. Analyst writes the smallest implementation plan, its side effects, and how to check the observable behavior and edge cases.
   Separate user/project requirements, verified current behavior, and agent-proposed decisions; cite the source of each consequential choice.
   Apply this distinction to generated prompts and handoffs too: a proposed decision does not become a confirmed requirement through repetition.
   For changes on a request path, name essential versus optional results and explain failure behavior, added latency, and bounded work using the current implementation as evidence.
   Compare reuse of existing helpers with any proposed extraction before moving shared code; justify the scope needed to satisfy project rules.
   Include examples that could disprove the plan.
   Before coding, record scenario applicability in the existing evidence record; for frontend behavior, mark each check from [Test and author checks](review.md#test-and-author-checks) as applies, or n/a with the diff fact that rules it out: time-series alignment, metric semantics, query-state joins/transitions, request failure/data states, and shared UI containers and keyboard behavior.
   For backend request, service, query, worker or migration behavior, use [Backend behavior evidence](backend.md) to select cases for planning, implementation and final review.
   For migrations, gates, removals or independent deployments, also select the applicable [behavior evidence](review.md#behavior-evidence-before-a-verdict) and keep its counterexamples through final verification.
   Record each selected input and expected user-visible result from the requirement and actual producer contract, independently of the proposed implementation.
   For sticky/overflow changes, identify the horizontal and vertical scroll owners and the header offset for each distinct host (page, bounded card, preview pane); verify narrow-width behavior keeps page controls reachable.
   When several callers repeat layout selection or frame classes, inspect the shared component's existing ownership before adding caller overrides; preserve that ownership with the smallest compatible interface.
   Verify what new API fields mean and how they serialize; use an agreed contract for compatibility rather than inferring it from unrelated fields being present.
   For each new predicate over producer data (a filter flag, `some`/`every` check, or parser or regex over producer text), record the producer file and line that emits its inputs and one counter-row it must survive; without that citation, mark the predicate unverified in the PR body.
   If more than one component implements a shared rule, identify its consumers, how they are deployed, and alternative runtime paths; compare the implementations using the same examples.
   When a suitable existing test boundary exists, plan a focused failing test before implementation.
   Split multi-part work into independently verifiable behavior slices and name only dependencies that actually block them.
   For a mechanical migration that cannot land in slices, plan compatible expansion, caller migration, and removal where feasible; otherwise keep one bounded integration change with an explicit verification point.
   Planning slices does not authorize tracker publication or unrelated preparatory refactoring.
5. Add a specialist only for an actual contract, data, security, runtime, design, or external-service boundary.
6. For risk 2 or 3, Skeptic challenges material assumptions, acceptance coverage, affected ownership, edge cases, and the proposed verification before implementation. Adjudicator closes findings under `challenge.md`.
   Check consequential agent-proposed decisions against the original request, including failure propagation and completeness-versus-availability tradeoffs; tests that pin a proposal do not establish that it is the right policy.
7. Implementer makes the authorized change under [scope and authority](README.md#scope-and-authority). When test-first work was planned,
   make the focused test pass with the smallest change before refactoring.
   Follow [tdd](../../skills/tdd/SKILL.md) for each planned test-first slice and inspect its result before starting the next.
   Exercise the selected counterexamples as each slice is built, including the other affected consumers of a shared rule; keep synthetic inputs faithful to the producer's possible responses.
   If implementation reveals a wrong assumption, revisit the expected behavior and affected consumers before adapting assertions; preserve the reported failure as an open finding until evidence closes it.
   Keep each consequential behavior choice tied to the investigation's sourced expectations; resolve evidence gaps before dependent edits and identify any changed expectation with its new authority.
8. Verifier runs focused existing checks or a direct inspection appropriate to the target.
   Before handoff, Implementer applies the author checks and reconciles [behavior evidence](review.md#behavior-evidence-before-a-verdict) with the final diff, resolving confirmed problems within the authorized scope.
   For behavior changes with a suitable test seam, inspect which plausible incorrect behavior the regression test rejects; copy and documentation changes use their own focused checks.
   A refactor that rebuilds a definition another structure must match by position is not exempt as mechanical: add the order assertion described in [Test and author checks](review.md#test-and-author-checks) in the same change.
   Rerun affected checks after fixes and complete the project's required gates, recording actual results and remaining limits.
9. Reviewer checks the final result against acceptance criteria, raw verification, and surrounding impact before seeing the Implementer's defense.
   Apply the finding gate and concise output rules in [review.md](review.md); omit optional preferences unless requested and preserve material unknowns.
10. Adjudicator closes any material review finding under `challenge.md`.

For a cross-project change, freeze the shared interface or decision before independent implementation begins.
