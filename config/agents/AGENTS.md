# Global Agent Instructions

These are high-level instructions for agents working on Luis' computer, across any project.
Project-local `AGENTS.md`, `CLAUDE.md`, `MEMORY.md`, README files, and explicit user messages override this file.
Keep this file short so it stays useful when loaded into every agent session.

## Operating Principles

- Work from the real local context first: current directory, git state, project instructions, README, scripts, configs, and recent memory when relevant.
- Identify the correct project before editing. Do not mix unrelated repos, clients, or personal projects unless Luis explicitly asks for cross-project work.
- Prefer the smallest correct change that fits existing patterns. Avoid speculative abstractions, broad rewrites, or unrelated cleanup.
- Preserve user work. Inspect `git status` before edits, never revert changes you did not make, and stage or commit only when asked.
- Verify with the narrowest meaningful check: focused test, lint, typecheck, build, screenshot, CLI output, or manual reproduction.
- When runtime, deployment, live data, or current tool state matters, verify it directly instead of relying on memory.
- If blocked, state the exact blocker, what was checked, and the next concrete verification path.

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

## File Hygiene

- Do not manually edit generated files, lockfiles, changelogs, or vendor output unless the project instructions or task require it.
- For long Markdown edits, prefer one sentence per physical line when it keeps future diffs readable.
- Keep secrets, tokens, private paths, and machine-specific shortcuts out of public repos unless Luis explicitly approves.
