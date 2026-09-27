# Review Workflow

Reviews are read-only unless the user separately asks to address selected findings.

1. Interpreter resolves the exact diff or pull-request base, target, requested scope, and authenticated identity when live state matters.
   Include staged and unstaged edits when the user requests working-tree review; a comparison ending at HEAD covers only committed changes.
2. Reviewer inspects the change, requirements, local rules, and sufficient
   surrounding behavior to establish impact. For a semantic rule, locate the
   executable path that already defines it; configuration clues and a few
   fixtures are not a substitute.
3. Add a specialist only where the change crosses a contract, data, security, runtime, or design boundary.
4. Report findings first, ordered by severity.

Check requirement coverage and implementation quality separately before forming the final disposition.
For coverage, identify missing behavior, behavior that contradicts the request, and unrequested scope.
For quality, establish reachable impact and actual project-rule violations; style heuristics alone are not material findings.
If no external spec exists, use the user's request and verified local requirements without inventing a tracker prerequisite.
Combine supported findings into one severity-ordered report with evidence and the smallest correction; separate questions do not require separate agents.

Every material finding includes an exact location, problem, impact, evidence, and smallest correction.
For a contract or shared configuration rule, review the oldest independently deployed consumer, alternative runtime paths, and synthetic callers before accepting a change.
If more than one component interprets the rule, compare them using the same examples, include examples that could disprove equivalence, and report the measured differences.
Distinguish what the code proves, what still needs deployment, and what was observed in the running system.
Do not post reviews, resolve threads, merge, or mutate remote state without explicit authorization.
