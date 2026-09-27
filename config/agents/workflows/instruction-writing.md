# Writing agent instructions

Use this guide when changing workflows, skills, or agent instructions.
For skill packaging and validation, follow the installed `skill-creator` guidance.

## Keep each rule in one place

- Give each rule one source. Link to it instead of copying it into other files.
- Keep background facts, instructions for doing the work, and final output rules separate.
- State when to read a linked file and what decision it helps with.
  Keep common rules in the entry file and detailed procedures in the relevant runbook.
- Keep related definitions, conditions, and exceptions together.
- Use familiar words, complete sentences, and concrete actions.
  Preserve exact commands, identifiers, and required templates.
- Define completion with evidence that can be checked.
- Look up current facts in code or configuration rather than copying them into instructions.
- Remove stale and repeated text while preserving task scope, permissions, and required checks.

## Use a consistent reading order

Write role files in this order: **When to use it → Job → Limits → Checks → Result**.
State the condition first, then the action, exception, and evidence needed to finish.
Keep exact native agent IDs, command flags, schema fields, and required output templates unchanged.
Explain specialist terms where they appear: an invariant is a rule that must remain true; an adjudicator resolves disputed findings; fan-in means the coordinator combines results.
A parity corpus is the same set of examples checked against each implementation.
Use these explanations instead of adding a new glossary dependency.
Keep short always-loaded summaries of critical boundaries while linking to the owner of the full rule.

## Check the instructions together

Before finishing an instruction change:

1. List the relevant global rules, project rules, workflow, skills, and output style.
   Distinguish files the provider loads automatically from files read only for this task.
   Check provider settings separately; reading a file does not prove that its hooks or tools are active.
2. Find rules that cover the same decision. Confirm which source owns it.
   Keep intentional project overrides clear instead of forcing every project to use the global default.
3. Check that linked skills do not add permission to write, delegate, commit, or send messages.
   They must also respect permission already granted and avoid asking for it again.
4. Try a realistic request that should use the instructions and one that should not.
   For each, state the expected action, stopping point, and evidence needed to finish.
   When the change crosses projects, include a project-specific override in this check.
5. Review final output for clear language and retained evidence, severity, and uncertainty.
   Use the task's required template when one exists.

If loading rules changed, check a fresh provider session when available.
Report what was observed, what was only checked by reading, and what remains unverified.
Do not replay live business operations just to test instructions.

Adapted ideas: [writing-for-agents](https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/productivity/writing-for-agents/SKILL.md).
Shared attribution and the MIT notice are in [the skill catalog](../../skills/README.md).
The combined-instruction check also applies [Wulfie Bain's guidance on maintaining prompts](https://x.com/wulfie_bain_/status/2098060386813566990).
