# Universal workflow skill integration

## Scope

Add the five recommended skills and the three borrowed workflow improvements from the skills audit.
Keep the universal workflows as the coordinator; skills supply focused methods and references.
The upstream source is [mattpocock/skills at 3cca18b](https://github.com/mattpocock/skills/tree/3cca18b368ae95cdbdebbff572ccafa662551015).
Existing project-specific instructions continue to take precedence.

## Implementation plan

| Addition | Canonical location | When it loads | Local adaptation |
| --- | --- | --- | --- |
| TDD | `config/skills/tdd/` | Authorized test-first behavior changes | Existing test boundaries, independent expectations, one failing test at a time, refactor after green |
| Bug diagnosis | `config/skills/diagnosing-bugs/` | Difficult, intermittent, or disputed defects | Runnable reproduction when feasible, explicit source-only fallback, bounded probes |
| Handoff | `config/skills/handoff/` | User requests transfer to another session or agent | Reuse the task packet; include dirty state, authority, evidence, and next action |
| Domain modeling | `config/skills/domain-modeling/` | Domain ambiguity or authorized terminology/decision documentation | Reuse existing docs; distinguish established facts from proposed meanings |
| Codebase design | `config/skills/codebase-design/` | A change requires interface or architecture decisions | Small interfaces, deletion check, justified dependencies; preserve vocabulary and meaningful tests |
| Implementation slicing | `config/agents/workflows/change.md` | Multi-part implementation planning | Independently verifiable slices and real dependencies; no automatic ticket publication |
| Requirement coverage | `config/agents/workflows/review.md` | Review of a proposed or existing change | Check requested behavior separately from code quality; retain severity ordering |
| Instruction writing | `config/agents/workflows/instruction-writing.md` | Editing workflows, skills, or agent instructions | Conditional pointers, one source of truth, checkable completion criteria |

1. Import only the five selected skill directories at the audited commit using the skill installer.
2. Adapt the instructions and supporting references before exposing them to either agent.
3. Keep a source/adaptation record and the upstream MIT notice with each skill.
4. Add conditional pointers from the universal routes, with a small discovery table in their README.
   Change and bugfix load TDD where an existing test boundary fits; bugfix loads diagnosis when uncertainty remains.
   Change, audit, and research load domain modeling for material terminology/ownership ambiguity and codebase design for in-scope interface questions.
   Audit and research retain read-only behavior, returning proposed documentation instead of writing it.
   Review adds the requirement/quality checks directly, including the requested working-tree scope.
5. Extend `install.sh` to link the same canonical files into `~/.codex/skills/` and `~/.claude/skills/`.
   Skip conflicting personal skill names and report them rather than replacing them.
   A per-skill guard precedes the generic linker: same canonical link is unchanged, absent target is linked, and a foreign file/directory/link is reported and preserved.
   A conflicting shared Codex skill under `~/.agents/skills/` is also reported to prevent duplicate discovery.
   The standalone skill-link function returns nonzero for conflicts; the full installer catches that result, warns, and continues unrelated setup.
   Handoff uses `disable-model-invocation: true` for Claude and `policy.allow_implicit_invocation: false` in `agents/openai.yaml` for Codex; workflow pointers describe it only as a requested action.
6. Install only these links on this machine; rerun to verify idempotence.
7. Validate skill metadata, relative references, shell syntax, link targets, and representative policy scenarios.

## Acceptance criteria

- A1: All five skills are locally adapted, attributed, and discoverable through both intended provider directories.
- A2: Change, bugfix, audit/research, and review routes reach only the methods relevant to their task.
- A3: Handoff remains explicitly invoked; existing approvals persist; skills do not authorize commits, tracker writes, test scaffolding, or live stress/replay.
- A4: Installation preserves unrelated skills and user work, reports conflicting names, and is idempotent.
- A5: Validation includes an independent read-only behavior review of a dirty checkout, an already-authorized test, unavailable runtime reproduction, a live inventory operation, and read-only domain research.

## Boundaries

No bulk upstream setup, automatic upstream updates, new issue-tracker framework, forced multi-agent design rounds, or deletion of existing project tests.
This change adds reusable instructions; it does not alter any application repository, run a live business operation, or commit/push changes.

## Verification record

Implemented locally on `main`; changes are uncommitted.

| Check | Result |
| --- | --- |
| Five adapted skills and pinned MIT provenance | Confirmed |
| Ten provider symlinks | Resolved to the canonical skill directories |
| Repeated installation | All ten links reported unchanged |
| Conflicting symlink preservation | Ten existing links retained; standalone linker returned nonzero and reported every conflict |
| Relative documentation links | 38 targets checked and resolved |
| Installer shell syntax and diff whitespace | Passed |
| Skill validation helper | Four passed; handoff requires the provider-specific check below |
| Five YAML metadata pairs | Parsed; names, descriptions, provider metadata, and explicit handoff policy checked |
| Independent instruction scenarios | Six read-only decision simulations reviewed; no remaining material finding |

The stock `quick_validate.py` rejects handoff's `argument-hint` and `disable-model-invocation` because its allowed-key list does not include these documented Claude Code fields.
They were retained and checked separately against [Claude's frontmatter reference](https://code.claude.com/docs/en/skills#frontmatter-reference).
Codex's explicit invocation policy is configured in `agents/openai.yaml` using [allow_implicit_invocation](https://learn.chatgpt.com/docs/build-skills).
This is a documented validator limitation, not a claim that the helper passed for handoff.

The independent review covered dirty user files, already-authorized focused TDD, missing runtime reproduction, side effects during live inventory diagnosis, read-only terminology research, and handoff with an active writer.
It identified an installer conflict-status propagation issue, which was corrected and rechecked independently.
These were instruction-based decision simulations, not business-operation executions or proof of long-term model behavior.
Reviewer route: Standard, requested `gpt-5.6-terra` / `medium`; effective model telemetry was not exposed and remains unknown.

Fresh-session skill discovery was not exercised in either provider.
The configured Codex CLI fails before startup because its packaged executable is missing (`ENOENT`); this unrelated installation was not modified.
Verify the new skill catalog in a fresh provider session, or after repairing the CLI, before claiming runtime discovery.
The files and provider links are installed; usefulness and trigger reliability still require observation on real tasks.
