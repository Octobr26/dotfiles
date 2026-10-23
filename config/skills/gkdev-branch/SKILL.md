---
name: gkdev-branch
description: Create a correctly named git branch in the gitkraken.dev repo from a ticket ID and task summary. Use when Luis asks to start, create, or name a branch for gitkraken.dev work. Skip for other repos.
---

# gitkraken.dev branch naming

Format: `NG-<number>-<short-description>`, for example `NG-1765-fix-output-score-drilldown`.

Basis: observed from remote branches in gitkraken.dev (uppercase `NG-` on most branches). No written or CI-enforced rule exists, so treat this as a team habit, not a requirement.

## Rules

- Ticket key first, uppercase (`NG-`). Keep other team keys as written (`GKDEV-`, `IN-`, `GKCS-`).
- Description: lowercase kebab-case, 3-6 words, says what the change does. Put `fix` in the description for bug fixes; no `-task-fix` suffix.
- No `kepler/` or other prefix unless Luis asks.
- If the ticket number is unknown, ask Luis for it. Do not invent one.

## Steps

1. Confirm the repo is gitkraken.dev (`git rev-parse --show-toplevel`); stop otherwise.
2. Run `git status --short`. If there are uncommitted changes, tell Luis before switching branches.
3. Build the name from the ticket ID and task summary; show it before creating.
4. `git fetch origin main` then `git switch -c <name> origin/main --no-track`, unless Luis names another base.
5. Report the branch name and base.
