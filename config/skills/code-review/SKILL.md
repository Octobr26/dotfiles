---
name: code-review
description: "Review the changes since a fixed point (commit, branch, tag, or merge-base) along two axes: Standards (does the code follow this repo's documented coding standards?) and Spec (does the code match what the originating issue/spec asked for?). Runs both reviews in parallel sub-agents and reports them side by side. Use when the user wants to review a branch, a PR, work-in-progress changes, or asks to \"review since X\"."
---

When a step calls the Skill tool and this provider has none, use the [provider integration guidance](../README.md#provider-integration).


Two-axis review of the diff between `HEAD` and a fixed point the user supplies:

- **Standards**: does the code conform to this repo's documented coding standards?
- **Spec**: does the code faithfully implement the originating issue / spec?

Both axes run as **parallel sub-agents** so they don't pollute each other's context, then this skill aggregates their findings.
The Spec axis includes behavior and compatibility review even when a written spec is unavailable.

The issue tracker should have been provided to you. If `docs/agents/issue-tracker.md` is missing, tell the user to run `/setup-matt-pocock-skills`.

## Process

Apply the personal [review workflow](../../agents/workflows/review.md) to both axes: challenge consequential plan assumptions, inspect request behavior and consumer contracts, and verify the smallest remedy before reporting a finding.
Pass that workflow and the originating request to each reviewer; a generated spec is evidence to inspect, not proof that every policy choice was required.
For behavior-changing PR reviews with an existing executable test seam, apply its [behavior evidence pilot](../../agents/workflows/readiness.md); give reviewers the sourced cases and raw evidence before the author's defense, and retain their JSON assessments for the final gate.

### 1. Pin the fixed point

Whatever the user said is the fixed point (a commit SHA, branch name, tag, `main`, `HEAD~5`, etc.). If they didn't specify one, ask for it.

Capture the diff command once: `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base). Also note the list of commits via `git log <fixed-point>..HEAD --oneline`.

Before going further, confirm the fixed point resolves (`git rev-parse <fixed-point>`) and the diff is non-empty. A bad ref or empty diff should fail here, not inside two parallel sub-agents.

### 2. Identify the spec source

Look for the originating spec, in this order:

1. Issue references in the commit messages (`#123`, `Closes #45`, GitLab `!67`, etc.), fetched via the workflow in `docs/agents/issue-tracker.md`.
2. A path the user passed as an argument.
3. A spec file under `docs/`, `specs/`, or `.scratch/` matching the branch name or feature.
4. If nothing is found, continue with the originating request, established behavior and actual producer/consumer contracts. Ask only for a material unresolved product decision; report the missing written spec as a limit.

### 3. Identify the standards sources

Anything in the repo that documents how code should be written, such as `CODING_STANDARDS.md` or `CONTRIBUTING.md`.

On top of whatever the repo documents, the Standards axis always carries the **smell baseline** below: a fixed set of Fowler code smells (_Refactoring_, ch.3) that applies even when a repo documents nothing. Two rules bind it:

- **The repo overrides.** A documented repo standard always wins; where it endorses something the baseline would flag, suppress the smell.
- **Always a judgement call.** Each smell is a labelled heuristic ("possible Feature Envy"), never a hard violation. Tooling closes a candidate only when its observed result at the reviewed revision covers that candidate; passing lint does not establish that all warnings or runtime consequences are addressed.

Each smell reads *what it is* → *how to fix*; match it against the diff:

- **Mysterious Name**: a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- **Duplicated Code**: changed logic repeats a rule in the owning module or direct neighboring consumers, including helpers at the integrated base/current head outside the diff. → compare inputs, boundaries and output contracts, then prefer compatible existing ownership before proposing extraction; similar syntax alone does not justify a refactor.
- **Feature Envy**: a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps**: the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- **Primitive Obsession**: a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches**: the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery**: one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- **Divergent Change**: one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality**: abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- **Message Chains**: long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man**: a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest**: a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

### 4. Spawn both sub-agents in parallel

**Standards sub-agent prompt** should include:

- The full diff command and commit list.
- The list of standards-source files you found in step 3, **plus the smell baseline from step 3** pasted in full (the sub-agent has no other access to it).
- For each new or substantially rewritten helper, require the exact owner-search command, nearby existing helpers checked at the integrated head, and their compatibility disposition. If this evidence is missing, obtain it from the same reviewer or retain that check as incomplete.
- The brief: "Apply the personal review workflow's finding gate. Report documented-standard violations with the rule and location, and supported maintainability findings with their concrete consequence. Baseline smells are hypotheses to verify, not automatic findings or extraction requests; the repository standard overrides them. Inspect live work and dependencies left by removals. Keep evidence and uncertainty, and compress wording rather than omit supported findings."

**Spec sub-agent prompt** should include:

- The diff command and commit list.
- The originating request and the path or fetched contents of the spec, when available.
- The brief: "Apply the personal review workflow's behavior evidence and finding gate. Check requirement coverage, reachable regressions, compatibility, access populations and unresolved decisions using actual producers and consumers. Cite the authority for expected behavior; distinguish it from a proposed policy encoded in a test or PR description. Return supported findings, material unknowns and the counterexamples checked. Keep behavior review active when no written spec exists."

Both reviewers return relevant candidate dispositions and evidence needed to assess their conclusions, including consequential candidates dismissed or deferred.
The coordinator checks those dispositions against the original request before recommending approval.

### 5. Aggregate

Present the two reports under `## Standards` and `## Spec` headings, verbatim or lightly cleaned. Do **not** merge or rerank findings, because the two axes are deliberately separate (see _Why two axes_).

End with the verdict and actual verification limits under the personal review workflow.
Keep blocking findings, unresolved decisions, release prerequisites and useful non-blocking improvements distinct; an empty axis or green tooling does not override the other axis's evidence.

## Why two axes

A change can pass one axis and fail the other:

- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the issue asked but breaks the project's conventions → **Spec pass, Standards fail.**

Reporting them separately stops one axis from masking the other.
