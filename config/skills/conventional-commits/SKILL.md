---
name: conventional-commits
description: Write or review Git commit messages, or commit authorized changes, following the repository's conventions. Apply when a user asks for a commit or commit-message help. Use ticket-first messages in gitkraken.dev and Conventional Commits as the fallback elsewhere.
---

# Conventional Commits

Use the repository's commit convention first. Before choosing a message, inspect project instructions and recent history with `git log -30 --format='%h %an: %s'`, sampling multiple authors. Explicit user instructions take precedence over both history and this skill. Use the [Conventional Commits 1.0.0 specification](https://www.conventionalcommits.org/en/v1.0.0/) when no repository convention is established.

## gitkraken.dev

Use a ticket-first subject:

```text
NG-<number>: <short description>
```

Take the actual ticket from the authorized task or branch; preserve another ticket prefix when that is the task's identifier. Describe the concrete change in plain language. A type prefix such as `fix(insights):` does not replace the ticket-first format in this repository. Add a brief body only when needed to explain behavior or a constraint.

Use `[n/m]` only for an actual numbered series. GitHub's appended `(#PR)` suffix is merge metadata, not part of a new local commit subject. If the task has no known ticket, do not invent one; follow the repo's unticketed examples or ask when a ticket is required.

## Conventional Commits fallback

Use this shape:

```text
<type>[optional scope][!]: <short description>

[optional body]

[optional footer(s)]
```

- Start with a type and `: `. Use `feat` for a new feature and `fix` for a bug fix. Other types such as `refactor`, `docs`, `test`, `build`, `ci`, and `chore` are allowed when they accurately describe the change. The spec does not assign those other types a version bump unless the commit is breaking.
- Use an optional scope only when a noun naming the affected code area adds useful context, such as `fix(auth): ...`. Keep issue keys out of the type and scope.
- Describe the actual change briefly after `: `. Add a body, separated by one blank line, when the reason or behavior is not clear from the subject.
- Mark a breaking change with `!` immediately before `:` or a `BREAKING CHANGE: <description>` footer. Explain the migration or impact in the body or footer when useful.
- Put project-required issue references in a footer, such as `Refs: NG-1907`, unless the project's explicit instructions prescribe another compatible location. Do not prepend a ticket key to the Conventional Commits header.

## When committing

Inspect the diff and repository instructions before choosing the subject. Stage only the intended files, then check the staged diff and message before committing. A request for a message or skill update alone does not authorize a commit. Do not amend or rewrite an existing commit unless the user asks.

If a change spans independent concerns, prefer separate commits when the user authorized that scope and the changes can be cleanly separated. Otherwise describe the commit's main effect using the repository's format.
