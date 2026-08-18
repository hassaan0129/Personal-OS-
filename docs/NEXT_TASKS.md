# Next Tasks

## Recommended immediate next slice

Before expanding offline behavior, run and record the B4/C5 physical-device or
emulator matrix: fresh sign-in, cache restoration, online and offline create,
offline dependent completion, app restart with pending work, reconnect ordering,
temporary-to-server ID mapping, duplicate-accepted recovery, foreground
reconciliation, manual refresh/retry, sign-out clearing, and second-account
isolation. Fix only reproduced defects.

If that matrix passes, the next smallest feature slice is **offline Top 3
selection** using the existing `task.set_top_three` contract. It must retain
the current operation/revision/dependency rules and database-enforced maximum
of three active Top 3 tasks.

## Priority tasks

| Priority | Task                                   | Depends on                                         | Acceptance criteria                                                                                                 | Likely files                                   | Verification                              |
| -------- | -------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------- |
| 1        | Record C5 native runtime matrix        | Existing C5 code and reachable development backend | Each scenario is marked pass/fail with device evidence; no speculative fixes                                        | Status docs; tests only for reproduced defects | Mobile test/typecheck/lint, device record |
| 2        | Resolve a reproduced C5 defect, if any | Priority 1                                         | Minimal fix preserves RPC-only/RLS/operation/revision rules                                                         | Relevant mobile library/screen/test            | Focused tests plus device retest          |
| 3        | Offline Top 3 plan/review              | Priorities 1–2                                     | Existing RPC/schema/lifecycle/top-three constraint inspected; no backend change assumed                             | Docs, source/tests after approval              | Review + focused test plan                |
| 4        | Offline Top 3 implementation           | Approved plan                                      | Optimistic local projection, one durable command, dependencies, revision/conflict safety, fourth-selection behavior | Local engine/store/controller/screen/tests     | Mobile suite; device matrix               |
| 5        | Fresh local database validation        | Docker available                                   | Migrations reset locally and pgTAP passes without RLS weakening                                                     | Normally none                                  | `supabase:reset`, `supabase:test`         |
| 6        | Cursor-pull design                     | Stable offline command proof                       | Bounded API and snapshot-fallback contract documented/approved before code                                          | Architecture/API/database/decision docs        | Contract review                           |
| 7        | Cursor-pull implementation             | Approved design                                    | Authenticated user-scoped incremental pull/full fallback preserves pending intents                                  | API/mobile sync/tests, maybe backend           | Focused + local database + device tests   |
| 8        | Conflict-resolution UX design          | Cursor/refresh evidence                            | Explicit discard/review/retry semantics without automatic rebase                                                    | Product/architecture/UI tests                  | Review                                    |
| 9        | Component decomposition                | Stable behavior                                    | Web/mobile screens split without behavior regression                                                                | App components/tests                           | Workspace tests/build/export              |
| 10       | Next product domain plan               | Offline Today is proven                            | One bounded domain, commands/RLS/history/sync impact and acceptance criteria approved                               | Planning docs                                  | Architecture/database review              |

Do not begin goals, journals, reminders, notifications, AI, realtime, web
offline, or deployment until the prerequisite evidence and an approved plan
exist.

## Manual checks for the next developer

- Verify the web client remains a singleton after a hard refresh and auth works locally.
- Run the full wake → plan → resolve unfinished → sleep flow against local Supabase.
- Run offline task create/edit/complete on an emulator only after the mobile screen is wired; reconnect and confirm one authoritative task/event per operation.
- Sign out with cached local state and confirm another account cannot access it.
- Inspect Supabase Studio only for local test data to verify owner IDs, revisions, task events, change events, and command records.
