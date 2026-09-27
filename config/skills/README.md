# Shared agent skills

The five adapted engineering skills and the local output skill are maintained here and linked into Codex and Claude by `install.sh`.
The universal workflows coordinate work; a skill adds a targeted method without replacing scope, permissions, review, or verification.

| Skill | Invocation | Workflow use |
| --- | --- | --- |
| [tdd](tdd/SKILL.md) | Relevant authorized test-first work | Change and bugfix |
| [diagnosing-bugs](diagnosing-bugs/SKILL.md) | Difficult, uncertain, intermittent, or disputed defects | Bugfix |
| [handoff](handoff/SKILL.md) | User explicitly requests a handoff | Optional continuation document |
| [domain-modeling](domain-modeling/SKILL.md) | Material domain ambiguity or authorized documentation | Change, bugfix, audit, research |
| [codebase-design](codebase-design/SKILL.md) | In-scope interface and architecture decisions | Change, audit, research |
| [render-output](render-output/SKILL.md) | Every final user-facing response | Shared plain-language output and workflow receipts |

## Installation and ownership

Each provider link points to the same canonical skill directory here.
The skill-link function reports and preserves existing foreign files, directories, or links and returns a nonzero status when a name conflicts.
The full installer reports that partial skill installation as a warning and continues unrelated setup.
It also reports shared Codex skill names under `~/.agents/skills/` to avoid duplicate discovery.
Existing canonical links are unchanged on subsequent installs.
Resolve a reported name conflict deliberately before rerunning; installation does not overwrite personal skills.

To link only these skills without package updates or unrelated setup:

```bash
bash -c 'source ./install.sh; link_workflow_skills'
```

Run this from the dotfiles checkout.
Codex discovers installed skills on a subsequent turn; an already-running provider that has not refreshed its catalog may need a new session.
Explicit handoff metadata is retained for both providers.

## Upstream and local policy

The five engineering skills were imported from [mattpocock/skills at 3cca18b](https://github.com/mattpocock/skills/tree/3cca18b368ae95cdbdebbff572ccafa662551015).
Each of those directories has `SOURCE.md` with its original path and adaptation summary, and the upstream MIT `LICENSE`.
`render-output` is Luis's local formatting skill; it is not an upstream import.
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
