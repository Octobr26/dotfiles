---
name: handoff
description: Write a compact continuation document when the user asks to transfer work to another agent, session, tool, or repository.
argument-hint: What should the next session focus on?
disable-model-invocation: true
---

# Handoff

Write a portable handoff when requested, using the user's intended next task as the focus.
Reuse the active workflow's task packet and reference existing plans, issues, diffs, and evidence instead of duplicating them.
Use a uniquely named Markdown file in the operating system's temporary directory unless the user specified another destination.

Include the fields the next agent needs:

- Original objective, acceptance criteria, and current scope.
- Exact repository, worktree, branch, runner, and relevant revision or external target.
- Governing instructions and selected workflow.
- Decisions already made, current user authority, pending approvals, and operations that remain unauthorized.
- Dirty files and which edits belong to this task versus the user or another agent.
- Completed and unfinished work, failed attempts worth preserving, and their evidence paths.
- Verification actually performed, confirmed/inferred/unknown findings, and remaining verification paths.
- Running processes or writers and how to inspect them without starting duplicates.
- Next concrete action and suggested skills relevant to that action.

Redact credentials and sensitive payloads; keep only necessary target identifiers and access-location pointers.
Do not transfer secrets or invent permissions for the next agent.
Return the absolute file path.
Writing a handoff does not itself send it, spawn an agent, clear the session, or abandon ongoing work.
