# Global Agent Instructions

These are high-level instructions for agents working on Luis' computer, across any project.
Explicit user instructions and project-local `AGENTS.md` or `CLAUDE.md` override these defaults.
Use README files and memory for project context; verify facts that may have changed against current code, configuration, or runtime evidence.
Do not treat a historical note as a new rule or permission.
Keep this file short so it stays useful when loaded into every agent session.

## Operating Principles

- Work from the real local context first: current directory, git state, project instructions, README, scripts, configs, and recent memory when relevant.
- Identify the correct project before editing. Do not mix unrelated repos, clients, or personal projects unless Luis explicitly asks for cross-project work.
- Prefer the smallest correct change that fits existing patterns. Avoid speculative abstractions, broad rewrites, or unrelated cleanup.
- Extract recurring or domain-significant literals into clearly named constants or enums; keep self-explanatory one-off values inline.
- Prefer straightforward control flow, clear domain names, and brief comments for non-obvious constraints or decisions. Defer formatting and language-specific conventions to the target project.
- Minimize token spend without weakening correctness: use the least expensive capable model for delegated work, keep task packets compact, and do not fan out overlapping agents.
- Preserve user work. Inspect `git status` before edits, never revert changes you did not make, and stage or commit only when asked.
- Keep verification separate from edit authority under [scope and authority](workflows/README.md#scope-and-authority); report corrections outside the requested task and obtain authorization before applying them.
- For work on an existing branch or PR, make edits and commits on its actual branch with the correct upstream.
  Reuse a suitable worktree for that branch, or create a separate worktree checking out that same branch.
  A dirty unrelated checkout calls for a separate worktree, not a substitute branch.
- If the task branch is already checked out, use its existing worktree when safe.
  If another writer owns it or its changes prevent safe work, preserve that state and report the exact conflict before choosing an alternative; do not bypass Git's branch checkout protection.
  Detached worktrees are suitable for read-only reviews and baseline verification.
- Create new local worktrees for every repository under `~/dev/gitkraken/worktrees/<repository>/<branch>`, using the repository's main checkout folder name and the exact local branch name.
  Preserve `/` in branch names as nested directories; add no task labels, suffixes, timestamps, or agent IDs to the worktree path or branch name.
  Reuse an existing suitable worktree for that branch; if the canonical path is occupied or a harness cannot honor this layout, report the constraint rather than inventing another name or location.
  Preserve existing worktree locations unless Luis requests migration.
- Create an extra implementation or backup branch only when Luis explicitly requests one or a concrete recovery need requires it.
  Explain the reason and intended task branch before creating it; ordinary PR fixes, merges, and rebases should stay on the task branch.
- Verify with the narrowest meaningful check: focused test, lint, typecheck, build, screenshot, CLI output, or manual reproduction.
- For behavior changes with a suitable existing test seam, prefer a focused test-first loop: name the observable behavior and edge cases, make a focused test fail, make it pass with the smallest change, then refactor. Tests must cover meaningful behavior, not implementation detail. Do not add fixtures, mock data, snapshots, or verification-only helpers unless Luis requests them or the agent explains why they are necessary and receives approval.
- When runtime, deployment, live data, or current tool state matters, verify it directly instead of relying on memory.
- Classify material claims as `confirmed`, `inferred`, or `unknown`. Before dependent implementation, resolve material unknowns through evidence or Luis's decision under [the clarification gate](workflows/README.md#clarification-gate), and [trace the full affected path](workflows/README.md#trace-the-affected-behavior).
- If blocked, state the exact blocker, what was checked, and the next concrete verification path.
- Use the `render-output` skill for final user-facing responses when it is available; choose the smallest suitable pattern for the answer.

## Universal Workflows

- For a new substantive task without an explicit skill choice, consult [jev-workflow](../skills/jev-workflow/SKILL.md) to recommend a skill before execution. Preserve project workflow ownership; if Jev is unavailable, continue with the established workflow and disclose that routing was unavailable.
- Luis delegates routine skill selection within the authorized task. Explain the next skill and why it fits, then apply it; follow [jev-workflow's guided selection](../skills/jev-workflow/SKILL.md#guided-selection) for phase changes and feedback. Explicit choices, material product decisions, larger workflows, and model changes remain Luis's.
- For browser verification, use Astra when available; report an unavailable model and the verification coverage. Luis chooses larger workflows and other model/effort changes. Propose useful stages once at task start and apply supporting skills within existing authority.
- Answer trivial, self-contained requests directly. Do not load a workflow for a one-command request, standard shortcut, simple path/config lookup, rewrite, or short explanation.
- For non-trivial work, read `~/dev/dotfiles/config/agents/workflows/README.md` after identifying the target project. It supplies portable task routing for code, operational, research, and cross-project work.
- For backend behavior planning, implementation or review, read `~/dev/dotfiles/config/agents/workflows/backend.md` before choosing the plan or checks.
- Before adding or changing an API endpoint, name the resource its rows are and check for an existing endpoint; add filters to it rather than a new route. A PR body for such a change names the existing endpoints considered and why they did not fit.
- For scoped investigations before implementation, read [the investigation completion and handoff contract](workflows/research.md#investigation-completion-and-handoff); apply it when collecting evidence, passing findings to another agent, and consuming those findings before edits.
- Project-local instructions, current code/configuration, and verified runtime state remain authoritative. The universal workflow is a coordination layer, not a replacement for them.
- For substantive GitKraken product work, including repository-root sessions, external worktrees, and delegated workers, read `~/dev/gitkraken/ai-context/README.md` before dependent work. It owns shared business/technical context and routes contract verification; read the target repository's instructions separately.
- For gitkraken.dev, read personal context in `~/.config/agent-context/gitkraken.dev/`: `issue-tracker.md` before ticket operations, `triage-labels.md` before applying triage labels, and `domain.md` before domain exploration. Use these files when a skill asks for corresponding `docs/agents/` files.
- For gitkraken.dev previews, check out the task's actual branch in a suitable worktree and serve it on `http://localhost:8080`. Verify the preview server's worktree and revision before browser checks; if port 8080 is occupied, identify its server and switch the preview to the task worktree while preserving unrelated work.
- For code reviews and final checks of behavior changes, read `~/dev/dotfiles/config/agents/workflows/review.md` even when using a project workflow. Apply its evidence and concise-feedback guidance alongside the project requirements.
- For behavior-changing PR reviews and implementations with an existing executable test seam, use `~/dev/dotfiles/config/agents/workflows/readiness.md`; check the sourced plan before implementation/final-review dispatch and final evidence before readiness claims.
- Use the smallest route that preserves an independent check. When a workflow spawns an agent, select from complexity, consequence, evidence gap, and duration, then apply the explicit provider model and effort mapping in `model-routing.md`; never inherit the delegated model or effort by omission.
- Treat an unqualified request to escalate as the High-reasoning route. Do not select `xhigh`, `max`, Ultra, or Claude `ultracode` unless Luis explicitly names it.
- Ask Luis to settle unresolved product or policy choices; use the clarification gate for factual investigation and authorized read-only investigative subagents.
- Treat local, remote, and cloud runners as execution locations, not task types. Record the exact repository, branch/worktree, and runner whenever they affect the result.

## Luis' Preferences

- Give direct paths, commands, config keys, error strings, routes, symbols, or file seams first.
- Keep answers concise and practical. Remove filler, hype, and generic process talk.
- Use familiar words and complete sentences. Explain technical terms when they help the reader; keep commands, identifiers, and error messages exact.
- For copy and UI text, avoid corny, negative, or over-explanatory wording.
- For technical decisions, prioritize quality, simplicity, robustness, maintainability, and clear ownership.
- For bugs, reproduce or inspect the real failure path before changing code when feasible.
- For UI work, verify the actual rendered result when possible and fix obvious layout issues you introduce.

## Identity, Voice, and Personal Context

- Refer to the human user as Luis.
- Do not use another person's name as the owner of these preferences.
- Do not add agent names as commit co-authors unless Luis explicitly asks.
- If writing as Luis or posting on his behalf, ask for or inspect the relevant voice/context first; do not invent personal opinions.

## Notion Connection

- Use the single `notion` MCP connection for Notion tasks.
- Before any Notion write, fetch its `self` identity and verify that the target page belongs to the intended workspace.

## File Hygiene

- Keep Luis's personal skills, workflow setup, receipts, and agent context in personal configuration outside project repositories. Apply this boundary even when a skill defaults to creating project files; edit project agent instructions or add skill-generated project documentation only when Luis explicitly requests it.
- Do not manually edit generated files, lockfiles, changelogs, or vendor output unless the project instructions or task require it.
- For long Markdown edits, prefer one sentence per physical line when it keeps future diffs readable.
- Keep secrets, tokens, private paths, and machine-specific shortcuts out of public repos unless Luis explicitly approves.

<!-- CODEGRAPH_START -->
## CodeGraph

For code exploration in a checkout with `.codegraph/codegraph.db`, use `codegraph_explore` through MCP or `codegraph explore "<question or symbol>" --path <checkout>`.
Use that checkout's own index; verify stale results against current source and preserve project-specific lookup rules.
The MCP server watches edits and catches up when a session connects, including changes pulled from `main`.
For a new GitKraken checkout, run `codegraph-refresh` to initialize its local index and Git exclusion.
CodeGraph is personal tooling: keep its data and configuration out of project commits.
Use `codegraph-update` for CLI upgrades; it preserves the shared instruction symlinks.
<!-- CODEGRAPH_END -->
