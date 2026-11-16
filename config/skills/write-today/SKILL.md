---
name: write-today
description: Draft or update Luis's GitKraken daily work log in Notion from his pull requests, reviews, substantive PR comments, local code context, and daily notes; examine reviewer feedback for linked follow-ups and learning; prepare daily scrum summaries and retrieve logged context for 1:1s.
---

# Write Today — GitKraken

Use for daily GitKraken work logs, scrum preparation, quick notes, dated backfills, or summaries of existing logs for 1:1s.
Do not activate for ordinary GitKraken coding work or automatically log every coding session.
Read [GitKraken context](references/gitkraken-context.md) for the local repositories and intended Notion destination.

## Choose the task and date

- **Daily log:** gather evidence for the requested date, draft the entry, then save when authorized.
- **Nightly draft:** run the daily log unattended, return a reviewable draft without writing to Notion; read [nightly task](references/nightly-task.md) for scheduling and the saved prompt.
- **Quick note:** add the supplied question, blocker, decision, or work note to that day's entry; skip a full activity scan unless context is needed.
- **Scrum:** read the requested day's log and relevant PR activity; return a short spoken summary of that day's progress and blockers/questions. Put any supplied next focus separately. Do not save a new entry unless requested.
- **1:1 preparation:** summarize existing logs for the requested range into outcomes, recurring blockers, open questions, and discussion points, with links to source days. Ask for the range if absent. Do not invent opinions or feedback.

Resolve “today” using the runtime date in `America/Los_Angeles`, unless Luis specifies another timezone.
Use the half-open interval from local midnight to the next local midnight, including the correct daylight-saving offset.
Use the requested calendar date, including weekend work. For a morning standup covering the previous workday, identify that progress date explicitly rather than silently changing the log date.
Separate observed progress from the proposed next focus. Ask for missing plans rather than inventing them.

## Read daily notes first

Fetch the intended Notion database and live schema, locate the exact date's entry, and read its full content before scanning GitHub.
Treat Luis's handwritten notes, questions, and checklists anywhere in the page as context, including text outside Details.
Read a few recent entries only for linked unresolved questions, follow-ups, or relevant review lessons.
Preserve his original notes and checklist states; a summary supplements them.
Compare intended work with verified activity: a still-open checklist means pending, while missing GitHub activity alone means unconfirmed rather than “not done.”
If Notion is unavailable, continue with a GitHub draft and state that daily-note context could not be checked.

## Gather evidence

1. Center the activity scan on Luis's PRs, submitted reviews, and substantive PR comments across GitKraken repositories. Start with `gitkraken.dev`, but discover other GitKraken repositories from his PR activity rather than limiting the scan to the local checkout list. Honor any narrower scope Luis specifies.
2. Confirm authenticated GitHub identity rather than relying on the cached login in the reference. Use the installed `gh-axi` skill and current CLI help for read-only GitHub requests. Resolve git author identities separately; Notion, GitHub, and commit identities are not interchangeable.
3. Gather dated activity on authored PRs and on teammates' PRs Luis reviewed or commented on. Use repository/organization-scoped search to find candidates, then inspect actual review, comment, commit/push, and lifecycle events and their authors. A PR's `updated_at` is only a candidate signal: another person's action can update it. Likewise, merged status now does not prove it merged on the logged day or that Luis merged it. Distinguish his implementation work from his review work.
4. Use local repositories as context for identified PRs or work Luis explicitly mentions. Read their instructions and current git state. Discover linked worktrees with `git worktree list --porcelain`; inspect relevant existing worktrees read-only, including detached heads, and touched code selectively to explain behavior and purpose. A dirty file or reviewed worktree alone does not prove Luis changed or reviewed it on that date. Do not switch branches, fetch, stage, commit, or alter code for logging. Do not run a general commit/issue/history sweep as the default activity source.
5. Treat author dates, committer dates, rebases, cherry-picks, merge commits, and stacked PRs carefully. Deduplicate the same work across worktrees and rewritten commits; do not count a recommitted old change as a new accomplishment without evidence.
6. Include Luis's supplied meetings, investigations, decisions, questions, blockers, and non-code work. Targeted agent-session or shell-history inspection is optional when it resolves a specific gap; do not sweep a year of reports or unrelated private history. Running a command does not prove it passed.
7. Report unavailable sources and incomplete pagination as coverage limits. An empty query is not proof of no work. Do not claim comprehensive GitHub coverage without checking the relevant activity sources and date bounds.

For authored PRs active that day, read review bodies, inline threads, conversation comments, replies, and available resolved/outdated state.
Check relevant code or diffs to distinguish outstanding feedback, addressed feedback, suggestions, and open questions.
A resolved thread or approval alone does not prove the requested change was implemented.
Use reviewer requests as attributed feedback until evidence supports a defect; retain disagreements or uncertain intent as questions.
Turn actionable feedback into a brief follow-up or a practical check for the next PR, each linked to its specific comment/thread.
For recurring lessons, compare relevant prior daily lessons and, if needed, a bounded sample of recent authored PRs (start with up to five from the last 30 days).
Call something recurring only with at least two independent examples, preferably distinct PRs; repeated replies in one thread count as one example.
Report that sample's coverage rather than claiming a complete history, and record improvements or addressed feedback when supported.
Keep lessons factual and useful, such as “check empty-state behavior before requesting review,” rather than judging Luis's ability or intentions.

Group the draft by meaningful work or outcome, with PR/ticket links as evidence, rather than by commands or commit count.
Use local code to clarify what changed, not to infer when it was done or whether it shipped.
Keep confirmed facts, inferred interpretations, and unknowns distinct while drafting; resolve material unknowns with a short question or leave them explicitly unconfirmed.
Never invent tests, approvals, deployments, merges, ownership, or impact.

## Write for Luis

Use everyday language in the scrum summary, follow-ups, explanations, and lessons.
Lead with what changed or needs attention and why it matters; keep file names, symbols, and implementation terms in Details when useful for finding the code.
Explain an unfamiliar technical term briefly on first use, without adding definitions for familiar terms such as PR or Jira.
For a tricky issue, use a short breakdown inside Details: **What happened**, **Why it matters**, and **What to check next**.
Include a concrete example when it makes the issue easier to understand, and distinguish an illustrative example from observed data.
Keep the visible summary brief; add enough explanation in Details for Luis to understand the work later without rereading the code.
For example, replace “Tighten categorical AI summary interpretation rules” with “Make sure the AI explains chart numbers correctly.”
Then explain: “The AI added the middle values for separate stages and called that the total. Adding those values does not tell us the middle value for the whole process.”
Preserve Luis's handwritten wording; add a plain-language explanation alongside technical notes rather than silently rewriting them.

## Draft the entry

Use the daily entry already read as context and one page per date.
Use the agreed minimal layout:

- **Scrum summary (visible):** roughly three short first-person bullets about that day's outcomes, review work, and material blockers. Keep future plans separate.
- **Follow-ups (visible):** short, independent checkboxes for pending work, unanswered questions, or reviewer requests. Include a relevant source link beside each item; put implementation plans in Details. Carry unresolved items by their original-day link and preserve completion states.
- **Details (one native toggle):** supporting PR work, preserved handwritten notes, questions, implementation plans, and review lessons. Use short plain subheadings only when content exists; put 1:1 discussion points here when Luis supplies or confirms them.

Omit empty generated sections and avoid decorative icons, nested empty toggles, or paragraphs in the visible summary.
Templates can retain a blank note area within Details so Luis can jot notes during the day.
Add clickable evidence beside the item it supports: PR links for work, exact comment/thread permalinks for feedback, native Notion mentions for carried notes, and commit-pinned GitHub file links when verified code references help.
Use concise labels such as “PR #4444” or “Review comment”; avoid a detached wall of URLs and never invent ticket URLs, comment anchors, branches, or file revisions.
Preserve existing links and native objects. Local paths are supplementary context, not reliable clickable references inside Notion; prefer verified GitHub links for later retrieval.

When saving toggles, read `notion://docs/enhanced-markdown-spec` through Notion fetch and use the connector's supported native toggle representation. Do not assume ordinary Markdown headings or chat HTML create Notion toggles. If native toggle creation is unsupported, show the limitation and proposed fallback before saving.
In an interactive run, ask one targeted question when material context is missing. In an unattended run, list the unknown in the draft and finish without waiting for a reply.
Use short, natural first-person notes grounded in Luis's writing; do not fabricate personal views.
Preserve native Notion objects. If new links can only be ordinary Markdown, say so in the preview without replacing existing rich content.
For each substantive work item, collect its GitHub PR URL and matching Jira ticket URL from the PR body, notes, or verified Jira issue.
Put short linked labels beside the summary or follow-up, such as “PR #4444 · NG-1487,” using the verified URLs.
When only a ticket key is present, use the connected Atlassian resource and retrieve that issue to confirm the site and match before linking.
Use Jira to clarify the intended outcome or acceptance criteria of identified work, rather than sweeping unrelated tickets or treating today's status as historical completion evidence.
Before finishing, check that substantive GitHub work has a PR link, verified Jira references are clickable, and reviewer lessons link to their source threads.
If a matching ticket or source URL cannot be verified, say which reference is missing instead of silently omitting it or guessing a link.
Link only clearly matching existing work items; do not substitute former-company Notion tasks.

## Save and verify

Use the single connected `notion` MCP connection. Before any write, fetch `self` and verify that the exact target belongs to the intended workspace; identity alone is insufficient.
If the page is inaccessible or its schema is unknown, return the draft and the exact access blocker. Do not create a replacement database or redirect the entry elsewhere.

Luis chose draft for review, then save. Show the concrete proposed entry or changed sections, date, destination, and new links before asking him to approve the save.
Honor authorization already given in the session without asking again. A draft-only request never permits a write.
Skill adaptation itself does not authorize restructuring the Notion table.

After authorization:

1. Recheck the day's entry to account for edits since the preview. If no entry exists, create one under the verified data source using its actual properties. If multiple entries match, resolve the ambiguity before editing.
2. Apply the smallest edit. Repeated runs update the same daily entry; add new evidence or correct changed status without duplicating bullets or deleting Luis's notes. Mention unresolved questions and open follow-ups from earlier days with source links instead of copying them as new work. Preserve checklist completion states; change them only with evidence or Luis's direction.
3. On an uncertain save response, fetch/query the target before retrying to prevent duplicate entries or content.
4. Fetch the saved page and verify the date, destination, approved content present once, and retained prior notes. Return its link and any remaining coverage limits. A save response alone is not proof of success.

Table properties, views, relations, or templates may be suggested, but change them only when Luis requests the concrete restructuring.
Do not push code, modify GitHub, post comments, or message teammates as part of logging.
