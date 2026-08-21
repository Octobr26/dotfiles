# Global Agent Instructions

These are high-level instructions for agents working on Luis' computer, across any project.
Project-local `AGENTS.md`, `CLAUDE.md`, `MEMORY.md`, README files, and explicit user messages override this file.
Keep this file short so it stays useful when loaded into every agent session.

## Operating Principles

- Work from the real local context first: current directory, git state, project instructions, README, scripts, configs, and recent memory when relevant.
- Identify the correct project before editing. Do not mix unrelated repos, clients, or personal projects unless Luis explicitly asks for cross-project work.
- Prefer the smallest correct change that fits existing patterns. Avoid speculative abstractions, broad rewrites, or unrelated cleanup.
- Minimize token spend without weakening correctness: use the least expensive capable model for delegated work, keep task packets compact, and do not fan out overlapping agents.
- Preserve user work. Inspect `git status` before edits, never revert changes you did not make, and stage or commit only when asked.
- Verify with the narrowest meaningful check: focused test, lint, typecheck, build, screenshot, CLI output, or manual reproduction.
- Run existing tests and checks when useful, but do not create or modify tests, fixtures, mock data, snapshots, or verification-only helpers unless Luis requests them or the agent first names the proposed behavior and edge cases and receives approval.
- When runtime, deployment, live data, or current tool state matters, verify it directly instead of relying on memory.
- Classify material claims as `confirmed`, `inferred`, or `unknown`. An unknown needs a verification path and must not silently become a requirement.
- If blocked, state the exact blocker, what was checked, and the next concrete verification path.

## Universal Pipelines

- Answer trivial, self-contained requests directly. Do not load a pipeline for a one-command request, standard shortcut, simple path/config lookup, rewrite, or short explanation.
- For non-trivial work, read `~/dev/dotfiles/config/agents/pipelines/README.md` after identifying the target project. It supplies portable task routing for code, operational, research, and cross-project work.
- Project-local instructions, current code/configuration, and verified runtime state remain authoritative. The universal pipeline is a coordination layer, not a replacement for them.
- Use the smallest route that preserves an independent check. When a pipeline spawns an agent, select from complexity, consequence, evidence gap, and duration, then apply the explicit provider model and effort mapping in `model-routing.md`; never inherit the delegated model or effort by omission.
- Treat an unqualified request to escalate as the High-reasoning route. Do not select `xhigh`, `max`, Ultra, or Claude `ultracode` unless Luis explicitly names it.
- Ask Luis only when unresolved ambiguity can materially change behavior, acceptance, risk, authority, an external or irreversible action, or a meaningful tradeoff with no clearly better safe default.
- Treat local, remote, and cloud runners as execution locations, not task types. Record the exact repository, branch/worktree, and runner whenever they affect the result.

## Luis' Preferences

- Give direct paths, commands, config keys, error strings, routes, symbols, or file seams first.
- Keep answers concise and practical. Remove filler, hype, and generic process talk.
- For copy and UI text, avoid corny, negative, or over-explanatory wording.
- For technical decisions, prioritize quality, simplicity, robustness, maintainability, and clear ownership.
- For bugs, reproduce or inspect the real failure path before changing code when feasible.
- For UI work, verify the actual rendered result when possible and fix obvious layout issues you introduce.

## Identity, Voice, and Personal Context

- Refer to the human user as Luis.
- Do not use another person's name as the owner of these preferences.
- Do not add agent names as commit co-authors unless Luis explicitly asks.
- If writing as Luis or posting on his behalf, ask for or inspect the relevant voice/context first; do not invent personal opinions.

## Connector Account Routing

- For Notion, use `notion-personal` for `Luis Diaz's Notion` (`ldiazcortesf@gmail.com`) and `notion-work` for `Intellimind` (`luis.diaz@intellimind.com`).
- If Luis does not specify a Notion account and more than one profile could apply, ask which profile to use before making changes.
- Before any Notion write, fetch the selected profile's `self` identity and stop if its workspace or email does not match the expected profile.

## File Hygiene

- Do not manually edit generated files, lockfiles, changelogs, or vendor output unless the project instructions or task require it.
- For long Markdown edits, prefer one sentence per physical line when it keeps future diffs readable.
- Keep secrets, tokens, private paths, and machine-specific shortcuts out of public repos unless Luis explicitly approves.
