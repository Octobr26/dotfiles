# Audit Pipeline

Audits are read-only until the user selects findings for implementation.

1. Interpreter fixes the target, comparison base, boundary, and evidence sources.
2. Auditor traces reachable behavior and records evidence-backed findings.
3. Add a specialist for material contract, data, security, runtime, or external-account claims.
4. Reviewer independently checks material findings and the inspected areas with no finding.
5. Interpreter deduplicates results and separates must-fix issues from opportunities.

Report exact locations, current behavior, concrete impact, evidence status (`confirmed`, `inferred`, or `unknown`), smallest corrective direction, verification path, and areas inspected without a finding.
