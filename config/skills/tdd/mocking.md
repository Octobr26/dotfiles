# External dependencies in tests

Prefer existing test patterns that verify observable behavior through the real callable interface.
Isolate external APIs, time, randomness, or persistence only where needed to make the intended behavior testable.
A local substitute or mock can help at those boundaries, but a new mock, fixture, snapshot, or verification helper requires the authority specified in [SKILL.md](SKILL.md).

Avoid mocking internal collaborators merely to assert how the code is implemented.
Reuse established dependency injection when it supports the actual task; do not introduce a generic adapter framework just to satisfy a test.
Keep expectations independent of the implementation and document meaningful differences between a test substitute and the real service.
Passing a mocked test is evidence about that tested behavior, not proof of vendor behavior or production state.
