# High-Risk Pipeline

Use this route for authentication, authorization, secrets, personal/customer data, financial actions, production or deployment state, destructive operations, and untrusted external input.

1. Interpreter identifies the precise trust boundary, target, authority, rollback path, and runtime evidence required.
2. Analyst proposes the smallest safe plan and calls out irreversible effects.
3. The relevant security, data, runtime, or account specialist validates the plan before implementation.
4. Skeptic independently challenges the target, authority, trust boundary, failure modes, rollback, and verification plan. Adjudicator resolves findings before execution.
5. Implementer makes the approved change with the narrowest permissions and scope.
6. Verifier confirms the intended target and outcome without exposing secrets or sensitive data.
7. A fresh Reviewer independently checks the final state, trust boundary, raw verification, and rollback evidence.
8. Adjudicator closes any material final finding under `challenge.md`.

Stop and request direction when target identity, authority, impact, or rollback is materially unclear.
