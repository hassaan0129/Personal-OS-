---
name: testing-qa
description: Create and review automated and manual test coverage; use for regression tests, test plans, browser QA, edge cases, and release verification.
---

# Testing and QA workflow

- Translate acceptance criteria into observable tests.
- Prefer fast unit tests for pure logic, integration tests for boundaries, and a small number of browser/end-to-end tests for critical journeys.
- Include positive, validation, authorization, empty, error, retry, concurrency, and recovery cases based on risk.
- Keep tests deterministic: control time, randomness, network, and external services.
- Avoid tests coupled to internal implementation details.
- Reproduce a bug before adding its regression test.
- Record exact commands and failures. Never mark a check as passing when skipped.
- Finish with the single project verification command and a short manual QA checklist.
