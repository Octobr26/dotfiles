---
name: render-output
description: Format every final user-facing response as concise, scannable output, including direct answers, explanations, command summaries, validation reports, and workflow receipts. Use for all final responses; do not use for raw tool output, code, or intermediate commentary.
---

# Render Output

Apply this skill to every final user-facing response. Make the output understandable in under five seconds. Keep the conclusion or requested result first, and choose the smallest pattern that improves scanning. A short answer may need only a single outcome line; do not add structure for its own sake.

Use familiar words and complete sentences.
Keep the outcome, supporting evidence, and any remaining uncertainty clear.
For reviews, retain severity, the affected location, and why the finding matters.
Project templates and exact commands, identifiers, and error messages take priority over wording preferences.
Use compressed review comments only when the user asks for them; a normal review request does not select a compressed style.

## Choose one pattern

- **Single outcome:** `✅ **DONE** — Created report: 12 rows` or `⚠️ **NEEDS ATTENTION** — Browser unavailable`.
- **Counts:** `**Summary:** 12 total | **10 passed** | **1 failed** | 1 skipped` (one or two lines only).
- **Comparison/listing:** a Markdown table with at most six concise columns.
- **Multi-check validation or a workflow receipt:** a full-width report. Do not use a narrow box with vertical sides.

## Status Signals

Pair a colored indicator with a bold, uppercase status word for primary outcomes. Never rely on color or an icon alone:

- `✅ **DONE**` or `✅ **PASSED**` for completed, successful work.
- `⚠️ **NEEDS ATTENTION**` or `⚠️ **PARTIAL**` for warnings, unknowns, or incomplete verification.
- `❌ **FAILED**` or `❌ **BLOCKED**` for unsuccessful or blocked work.
- `➡️ **NEXT**` for a requested next action.

In plain-text report blocks, where Markdown bold is unavailable, keep the indicator and uppercase word together, such as `✅ PASSED`. Renderer-controlled colors may vary, so do not add raw ANSI escapes or HTML color styling. Use `•` for ordinary bullets. Avoid nested boxes, excessive blank lines, and mixing a table with a box for the same data.

## Workflow receipt (only when requested)

Include a workflow receipt only when Luis explicitly requests one.
Otherwise, end with the concise user-facing result.
Receipts are metadata, separate from the result. Put the receipt after the answer and render it as follows:

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Workflow receipt (metadata)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Workflow:     <name>
Path:         <completed stages>
Stages:       <completed>/<total>
Delegation:   <single|fan-out>
Task:         <logical task id or unrecorded>
Risk:         <0-3>
Skills:       <skills actually applied or none>
Tools:        <tools actually used or none>
Jev:          <recommendation, confidence, and applied/overridden; or not consulted/unavailable>
Verification: <✅ PASSED|⚠️ PARTIAL|❌ FAILED|• NOT RUN> (<count> checks)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

For a requested receipt, this layout is required: keep both rules, the title, and every available field on separate physical lines. Never emit a workflow receipt as an inline or pipe-separated banner, even if a downstream parser accepts that legacy form. Before delivery, inspect the final receipt and confirm that `Workflow receipt (metadata)`, `Workflow:`, and `Stages:` each begin their own line.

For a direct answer with no staged workflow, use `Workflow: direct`, `Path: answer`, and `Stages: 0/0`.
Report stages actually completed; use `Task: unrecorded` when no logical task ID exists.
List only skills applied and tools used for the current response; distinguish a Jev recommendation from the method actually followed.
Use `none`, `not consulted`, `unavailable`, or `unknown` where appropriate, and omit verification counts when no count is established.
Keep a requested receipt multiline even for short answers. Never let receipt formatting obscure findings, blockers, or a requested next action.

## Tables

Use concise headers and right-align numeric columns.
Keep paths, evidence, and important qualifications intact; shorten the wording instead of cutting off the meaning.
For fewer than five simple items, use bullets instead of a table.

## Validation reports

Use the full-width report only for three or more checks or sections:

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Validation report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Config:       ✅ VALID
Identity:     ✅ VERIFIED
Runtime:      ⚠️ NOT CHECKED
Overall:      ⚠️ NEEDS ATTENTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```
