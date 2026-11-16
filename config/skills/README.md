# Shared agent skills

Shared adaptations and pinned upstream skills are maintained here and linked into Codex and Claude by `install.sh`.
The universal workflows coordinate work; a skill adds a targeted method without replacing scope, permissions, review, or verification.

## Matt Pocock collection

All 38 skill names from the upstream inventory at `4588b32ecab9ecc9fc8cc6b6c5e7d675b6004b0d` are available in both providers.
The six existing adaptations remain active; the other 32 are pinned imports.
The [manifest](matt-pocock-manifest.json) records paths, revisions, adaptations, and upstream experimental status.
Seven imports are from upstream's `in-progress` directory.
Installing a skill makes it available; it does not invoke its setup steps, publish tracker issues, or authorize commits.

Use `grill-me` for an interview, `ask-matt` to choose a skill, and `retro` to review results.
In Codex, use `$grill-me` or ask to use the skill by name; in Claude, use `/grill-me`.
The upstream engineering flow uses `setup-matt-pocock-skills` for per-project tracker and domain-document choices.
Run it when choosing that flow for a project, rather than automatically applying those choices to every repository.

`skill-usage --days 30` reports local transcript evidence for this collection.
Use `skill-usage --installed --days 30` to include standalone personal skills outside the collection.
Add `--json` for provider installation paths and resolved source directories.
Installed, enabled, and observed use are separate facts; the report measures local installations and best-effort transcript observations, not provider enablement or successful application.

## Personal skills

`conventional-commits` follows repository conventions, including the ticket-first override for `gitkraken.dev`.
`write-today` drafts and updates work logs; its private destinations and machine context stay in `~/.config/agent-context/write-today/`.
Its tracked references explain how to locate that context and proceed when it is unavailable.
These skills are maintained locally rather than included in the upstream provenance manifest.

[jev-workflow](jev-workflow/SKILL.md) recommends a next skill for a new task and categorizes observed historical user turns.
Its script previews inputs locally by default; `--jev` sends prompt excerpts to TypeSafe.
This is separate from aggregate-only `skill-usage --jev` and Firstmate worker-effort dispatch.
`skill-usage --days 30 --jev` sends only aggregate counts and coverage information to Jev for a suggested human review list, using `TYPESAFE_API_KEY` from the environment or the private `~/.config/jev/.env`.
The report distinguishes native invocations, explicit file reads, and weaker shell/code path references.
Missing observations are not proof that a skill is unused; unsupported and auto-loaded paths may leave no event.
No skills are disabled or removed by either command.

## Provider integration

When an upstream step asks for a Skill tool and the provider has no such tool, read the named skill's `SKILL.md` from its sibling directory, then follow it.
For example, `grill-me` loads `../grilling/SKILL.md`.
Global and project instructions continue to govern change authority, tests, commits, publication, and model routing.
Each new import has a pointer to this guidance; the workflow text is otherwise preserved.

| Skill | Invocation | Workflow use |
| --- | --- | --- |
| [tdd](tdd/SKILL.md) | Relevant authorized test-first work | Change and bugfix |
| [diagnosing-bugs](diagnosing-bugs/SKILL.md) | Difficult, uncertain, intermittent, or disputed defects | Bugfix |
| [handoff](handoff/SKILL.md) | User explicitly requests a handoff | Optional continuation document |
| [domain-modeling](domain-modeling/SKILL.md) | Material domain ambiguity or authorized documentation | Change, bugfix, audit, research |
| [codebase-design](codebase-design/SKILL.md) | In-scope interface and architecture decisions | Change, audit, research |
| [render-output](render-output/SKILL.md) | Every final user-facing response | Shared plain-language output and workflow receipts |
| [retro](retro/SKILL.md) | Requested session or workflow retrospective | Evidence-based experiments for velocity and human effort |
| [typesafe-ai](typesafe-ai/SKILL.md) | Building software with Jev | Official TypeSafe API guidance; dispatch activation is separate |

## Installation and ownership

Codex links under `~/.agents/skills/` and Claude links under `~/.claude/skills/` point to the same canonical skill directory here.
The installer discovers every child directory containing `SKILL.md`; this directory tree is the maintained installation inventory.
These match the documented [Codex personal skill location](https://learn.chatgpt.com/docs/build-skills) and [Claude personal skill location](https://code.claude.com/docs/en/skills#choose-where-skills-load).
The skill-link function reports and preserves existing foreign files, directories, or links and returns a nonzero status when a name conflicts.
The full installer reports that partial skill installation as a warning and continues unrelated setup.
It reports foreign legacy Codex skill names under `~/.codex/skills/` to avoid duplicate discovery.
After successfully installing the new Codex link, it moves only a matching dotfiles-owned legacy link to the install backup directory.
Bundled skills, CLI-managed installations, and unrelated personal skills keep their existing owners.
Existing canonical links are unchanged on subsequent installs.
Resolve a reported name conflict deliberately before rerunning; installation does not overwrite personal skills.

To link only these skills without package updates or unrelated setup:

```bash
bash -c 'source ./install.sh; link_workflow_skills'
```

Run this from the dotfiles checkout.
Run `skill-usage --check-installation` afterward to verify both providers against the current checkout.
It accepts matching copy installations when symlinks are unavailable, reports managed drift and legacy duplicates, and leaves externally installed skills separate.
Use `--check-installation --json` to compare the maintained `source_digest` across machines after pulling the same revision.
This mode scans no transcripts, changes no files and makes no provider calls.
Codex discovers installed skills on a subsequent turn; an already-running provider that has not refreshed its catalog may need a new session.
Explicit handoff metadata is retained for both providers.

## Upstream and local policy

The five engineering skills were imported from [mattpocock/skills at 3cca18b](https://github.com/mattpocock/skills/tree/3cca18b368ae95cdbdebbff572ccafa662551015).
Each of those directories has `SOURCE.md` with its original path and adaptation summary, and the upstream MIT `LICENSE`.
`render-output` is Luis's local formatting skill; it is not an upstream import.
`retro` adapts Matt Pocock's session retrospective for delivery velocity and measurement; its [source record](retro/SOURCE.md) pins the imported revision.
`typesafe-ai` imports Jev's official skill; its [source record](typesafe-ai/SOURCE.md) pins the revision and update ownership.
The shared [MIT notice](LICENSE) also covers the selectively adapted workflow ideas below.

- [to-tickets](https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/to-tickets/SKILL.md): independently verifiable implementation slices in `../agents/workflows/change.md`.
- [code-review](https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/code-review/SKILL.md): separate requirement and quality checks in `../agents/workflows/review.md`.
- [writing-for-agents](https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/productivity/writing-for-agents/SKILL.md): conditional pointers and clear completion criteria in `../agents/workflows/instruction-writing.md`.

Local adaptations preserve existing approvals, meaningful test scope, source-only diagnosis when runtime is unavailable, read-only audits, and explicit authority for external operations.
They remove forced commits, fixed delegation counts, automatic test deletion, and a required upstream tracker/glossary framework.

## Updates

Compare an upstream candidate revision with the revision in each `SOURCE.md`.
Review changes to behavior, references, scripts, dependencies, and invocation metadata before applying them.
Retain the local authority rules and license notices, update provenance, and rerun validation.
Do not automatically replace these adaptations with an upstream branch or managed plugin bundle.

The implementation plan and validation record are in [docs/agent-skills-plan.md](../../docs/agent-skills-plan.md).
The Firstmate pilot and measurement sequence are in [docs/agent-harness-pilot.md](../../docs/agent-harness-pilot.md).
