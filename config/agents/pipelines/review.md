# Review Pipeline

Reviews are read-only unless the user separately asks to address selected findings.

1. Interpreter resolves the exact diff or pull-request base, target, requested scope, and authenticated identity when live state matters.
2. Reviewer inspects the change, requirements, local rules, and sufficient
   surrounding behavior to establish impact. For a semantic rule, locate the
   executable path that already defines it; configuration clues and a few
   fixtures are not a substitute.
3. Add a specialist only where the change crosses a contract, data, security, runtime, or design boundary.
4. Report findings first, ordered by severity.

Every material finding includes an exact location, problem, impact, evidence, and smallest correction.
For a contract or shared configuration rule, review the oldest independently
deployed consumer, alternate runtime paths, and synthetic callers before
accepting a change. Require counterexamples and a quantified parity result when
the rule is interpreted in more than one place. Distinguish code-verified,
deployment-pending, and live-verified claims.
Do not post reviews, resolve threads, merge, or mutate remote state without explicit authorization.
