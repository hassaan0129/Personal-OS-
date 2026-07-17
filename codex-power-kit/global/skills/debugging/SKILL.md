---
name: debugging
description: Debug defects systematically; use for crashes, incorrect behavior, flaky tests, performance regressions, integration failures, and unclear root causes.
---

# Debugging workflow

1. Capture expected versus actual behavior and the smallest reproduction.
2. Collect evidence: logs, stack traces, inputs, versions, state transitions, network/database behavior, and recent changes.
3. Form ranked hypotheses and test one variable at a time.
4. Locate the first point where state diverges, not only where the error surfaces.
5. Add a failing regression test when practical.
6. Implement the smallest root-cause fix; do not silence errors or weaken checks.
7. Re-run the regression test, nearby tests, and full verification.
8. Report root cause, evidence, fix, and residual uncertainty.
