# Backend behavior evidence

## When to use it

Use for planning, implementing or reviewing changes to backend request, service, query, worker or migration behavior.
Mechanical edits that preserve execution and contracts keep their existing focused checks.
Frontend-only work keeps its own scenario selection; this guide applies to the backend side of a coordinated change.

## Job

1. Locate the actual caller, behavior owner, schema/writer and affected consumers at the task revisions.
   Read project instructions and shared product context; a historical review example is a lead to verify, not a current defect or a new requirement.
2. Before adding or reshaping an endpoint, name the resource its rows are and look for an existing endpoint for that resource.
   If one exists, add the missing filters to it; give the data its own route only when no endpoint for that resource exists.
   Shape the API around the data, not around what one page needs: a page-specific route for rows that already have an endpoint is too many routes, and one endpoint shared by several resources is too few.
   When a list or drilldown sits behind an aggregate or chart, find where each of them decides which rows count (statuses, classification, date and team scope), share that rule instead of copying it, and compare the list rows with the aggregate for the same filters.
   Record the existing endpoints considered and why each did or did not fit; the pull request body carries one line naming them whenever the change adds or alters an endpoint.
3. Plan before the first edit.
   Write a short plan in the task record and show it to Luis; edit code only after he accepts it.
   It names the resource and the existing endpoints considered, the owner files and reference implementation the change follows, each applicable pattern from `~/.config/agent-context/<repository>/review-patterns.md` (or states the file is absent), the cases selected below, and the verification.
   Where the notes are missing or older than the reviewer's latest comments, run `scripts/review-sync --repo OWNER/REPO --reviewer LOGIN --author LOGIN` and read what it lists first.
   A change with no pattern matches says so; it does not skip the step.
4. Select applicable cases below before choosing assertions, using the [clarification gate](README.md#clarification-gate) for unresolved behavior or ownership.
   Put the required result, authority, discriminating input/interleaving, production boundary and verification path in the existing plan/evidence record.
   With the [readiness pilot](readiness.md), map these cases to its existing applicability dimensions; UI-only scenarios can be n/a with the actual diff reason.
5. Exercise the selected cases during implementation and reassess them against the final revision during review.
   Keep accepted follow-ups, release prerequisites and unresolved product decisions distinct under the [review workflow](review.md#behavior-evidence-before-a-verdict).

## Backend cases

An invariant is a rule that must remain true, such as a per-organization invite cap.
Select cases the changed path can affect; account for other areas with a concrete scope reason rather than running an exhaustive matrix.

| Changed behavior | Evidence and discriminating cases |
| --- | --- |
| Write permissions or scope | Trace every entry point to the new side effect, including compatibility setters, internal routes and workers. Establish the actual tenant/role gate. Compare an allowed caller with a denied role or another tenant where applicable; a neighboring endpoint's gate does not protect this path. |
| Multiple writes, check-then-write or retries | Identify the operations sharing a transaction and the protection against competing requests: actual isolation, lock, constraint, compare-and-swap or idempotency key. Challenge failure after a consequential write and a concurrent/repeated request. Distinguish all-or-nothing rollback from serialization of a cap or uniqueness rule. |
| SQL, mapping or persisted-data interpretation | Derive inputs from the schema and real writers, including applicable null/zero/empty values, legacy duplicates, soft-deleted rows, mixed providers and identifier namespaces. Compare affected readers/writers on the same example. Settle whether existing bad data is repaired here, by a backfill or in an accepted follow-up. Preserve legitimate zero/empty values while checking missing-data provenance. |
| Aggregates, metric availability or period comparisons | Trace each metric's inputs through identity resolution, roster admission, provider reads, filters, normalization and fallback. Record which dependencies affect its value, cohort or comparability; independently requested current and previous windows can fail separately. Compare required-read failure, successful empty data, measured zero and configured overrides against the intended formula. An error flag alone does not establish that both periods used comparable inputs or weights. Preserve results whose actual dependencies succeeded; a blanket suppression rule needs authority. |
| Resource catalogs or contextual filter options | Establish whether each list depends on organization membership, selected filters or activity in a window. Inspect existing resource routes, access scope and queries before adding another listing. Trace the actual consumer query key, cache lifetime and invalidation: changing a contextual key can repeat an unchanged catalog read and payload, while a cached key may avoid a request. Record the work/payload bound and justify the smallest resource shape; a reviewer's proposed routes remain a design proposal until adopted. |
| Migration, backfill or independent deployment | Select applicable already-upgraded, interrupted, retried, rollback and mixed-binary states. Check versions/order against the actual integration target and runtime migration runner; a fresh database or a successful Up covers only that state. Carry a known merge/deploy prerequisite through the final check. |
| Pagination, scheduled or retrying work | Establish the resource bound and durable progress rule. Where reachable, challenge an empty page with a next token, quota response, interrupted run or missed tick. Check the cursor/watermark on restart and distinguish re-reading overlap from forward progress. A larger budget alone cannot repair repeated work with no durable progress. |
| API or cross-service contract | Compare final handler/serializer/error behavior with the real consumer, endpoint description, referenced schema and owning API documentation, including applicable empty, denied and degraded results. Name actual API parameters, required providers and lifecycle states; distinguish UI-only filters and idle resources from disabled/deleted resources. Keep durable compatibility behavior in the contract and temporary deployment ordering in release/PR coordination. Resolve contradictory expectations from their authority before adapting assertions or weakening safe behavior. Record the service owner and any independent deployment boundary. |

## Limits

Project layering, test and database rules remain authoritative.
This guide selects evidence within the authorized change; it grants no new fixtures, live database access, cross-repository edits or automatic repair of old data.
A naming nit, accepted follow-up or documented merge prerequisite is not automatically an implementation blocker.
Use the original requirement and inspected behavior to assess reviewer feedback, including advice later corrected by the reviewer.
Keep a proposed repair obligation, service owner or future release prerequisite explicitly proposed until a requirement or authorized decision establishes it.

## Checks

Apply the existing [test and author checks](review.md#test-and-author-checks) to the real backend boundary.
Trace each changing input through the production query, mapper, SDK or service to its distinguishing assertion.
A fixture field never read by the mapper, a mock returning the promised query result or a stub ignoring ordering leaves that behavior unverified.
Before a healthy test counts as evidence, identify the assertion or observed result proving its necessary dependency loaded the intended data through the tested production path.
For a seeded identity, for example, prove that the caller resolves that identity; a separate resolver unit test alone does not establish the caller's setup.
Inspect setup and diagnostic output where recoverable errors can turn an unexpected mock query into a passing fallback case.
Separate intentional failure scenarios from unexplained fallback in a purported healthy case, and confirm the selected tests actually ran.
Keep healthy-path coverage incomplete until that distinction is established; retain the concrete counterexample and smallest missing assertion in the existing evidence record.
Inspect ORM/query-builder defaults and schema constraints before requesting extra guards or moving ownership.
Use the smallest project-permitted check; distinguish rendered SQL and source inspection from executed SQL, and retain any missing runtime evidence required by the readiness pilot.

For each critical case, include a nearby valid control: a real zero beside an unknown default, a valid unchanged row beside duplicate rows, or an unrestricted scope beside an empty restricted scope.
Passing checks that omit the counterexample do not settle contradictory contract evidence.
When a review changes the expected result, retain its new authority and recheck the affected cases at the final revision.

## Result

Return the selected cases and their authority, actual check/result/revision, finding disposition and material limits in the existing task record.
Include the healthy-path proof and each affected metric's dependency/fallback interpretation when those cases apply; passing checks with unexplained setup degradation do not close them.
Keep the original requirement separate from agent-proposed policy; route unresolved product/ownership choices to Luis.
Before the final verdict, cite the authority for each new owner, repair obligation and merge/deploy condition; an accepted follow-up alone establishes neither a release gate nor who owns the decision.
The record and final verdict must agree on what was executed, what source established and what remains unknown.
