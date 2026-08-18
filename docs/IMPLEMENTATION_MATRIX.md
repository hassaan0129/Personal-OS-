# Implementation Matrix

Date: 2026-08-18

## How to read this document

- **Proven fact** means it is evidenced by checked-in/uncommitted source, migrations, tests, configuration, or a command result recorded below.
- **Not re-verified today** means documentation or historical test files provide evidence, but the command could not complete in the current environment.
- **Assumption** is labelled explicitly and should be verified before relying on it.

Status is based on current source, migrations, tests, and latest recorded C5 verification. “Offline” means the mobile UI path, not merely a local helper.

## Capability Matrix

| Capability                  | Status                               | Web                    | Mobile                                  | Offline                   | Evidence                                  | Remaining work                                     |
| --------------------------- | ------------------------------------ | ---------------------- | --------------------------------------- | ------------------------- | ----------------------------------------- | -------------------------------------------------- |
| Authentication              | Implemented                          | Sign-up/in/out/session | Sign-up/in/out/session                  | No                        | API auth adapter; web/mobile clients      | Hosted production policy, recovery, social login   |
| Profiles                    | Implemented                          | Loaded in Today        | Loaded in Today                         | Cached as snapshot data   | Profile migration/trigger/RLS             | Revision-aware profile mutation policy             |
| Life Days                   | Implemented                          | Wake/sleep/repair UI   | Wake/sleep/repair UI                    | No                        | Base migration/RPCs, adapters             | Runtime/device validation                          |
| Today                       | Implemented                          | Authenticated Today    | Cached Today after auth                 | Read cache only           | Today read RPCs, screen/controller        | Cursor pull/full hydrate protocol                  |
| Planner Mode                | Implemented                          | Dedicated route        | In-place toggle                         | Narrow actions only       | Planner migration and screens             | Split components, richer UX                        |
| Task creation               | Implemented                          | RPC                    | Local-first/RPC fallback                | Yes                       | C5 engine/controller/tests                | Device/server reconciliation proof                 |
| Task editing                | Implemented                          | RPC                    | Local-first/RPC fallback                | Yes                       | C1 engine/controller/tests                | Device/server reconciliation proof                 |
| Completion                  | Implemented                          | RPC                    | Local-first/RPC fallback                | Yes                       | Base RPC and mobile tests                 | Device/server reconciliation proof                 |
| Reopening                   | Implemented                          | RPC                    | Local-first/RPC fallback                | Yes                       | Planner RPC and C2 tests                  | Device/server reconciliation proof                 |
| Cancellation                | Implemented                          | RPC                    | Local-first/RPC fallback                | Yes, active tasks         | Existing structured contract and C3 tests | Device/server reconciliation proof                 |
| Rescheduling                | Implemented                          | RPC                    | Local-first/RPC fallback                | Yes, planned/overdue only | Existing contract and C4 tests            | Device/server reconciliation proof                 |
| Ordering                    | Implemented                          | RPC/up-down            | Local-first Move Up/Down                | Yes, active tasks         | Planner RPC and C5 task-order tests       | Device/server reconciliation proof                 |
| Top 3                       | Implemented server/web/mobile online | RPC                    | Online control                          | No                        | Planner migration advisory-lock rule      | Offline Top 3 slice                                |
| Unfinished resolution       | Implemented server/web/mobile online | RPC                    | Online control                          | No                        | Planner resolution RPC/tests              | Offline policy only if approved                    |
| Offline storage             | Partially implemented                | None                   | SQLite projection                       | Yes, narrow Today         | `local-store.ts`                          | Native migration/device proof; encryption decision |
| Durable outbox              | Partially implemented                | None                   | SQLite outbox                           | Yes, C1–C5 commands       | Engine/processor tests                    | Broader command coverage only by approval          |
| Retries                     | Partially implemented                | N/A                    | Bounded retry state                     | Yes                       | Outbox processor tests                    | Live network validation/telemetry                  |
| Temporary-ID reconciliation | Partially implemented                | N/A                    | Create acknowledgement rewrite          | Yes                       | Rewrite/processor tests                   | Live server proof                                  |
| Foreground reconciliation   | Partially implemented                | N/A                    | Bounded recovery/drain                  | Connection-dependent      | Lifecycle tests                           | Device lifecycle proof                             |
| Refresh merging             | Partially implemented                | Direct remote read     | Preserve pending local projection       | Yes for cache merge       | `mergeAuthoritativeTodaySnapshot` tests   | Cursor-based incremental pull                      |
| Safe issue display          | Partially implemented                | Basic errors           | Safe pending/conflict/rejection details | Yes                       | Mobile controller/screen                  | User-directed conflict resolution                  |
| Account isolation           | Implemented in local design/tests    | Owner RLS              | User-scoped SQLite clearing             | Yes                       | RLS and mobile tests                      | Device/account-switch proof                        |
| Cursor pull                 | Not implemented                      | No                     | No                                      | No                        | `sync_changes` is only a hint table       | Design and authenticated API                       |
| Realtime                    | Not implemented                      | No                     | No                                      | No                        | No subscriptions                          | Add only after cursor pull                         |
| Conflict resolution         | Not implemented                      | Basic message          | Read-only issue state                   | No                        | No resolution action                      | Explicit review/discard/retry UX                   |
| Goals/projects              | Not implemented                      | No                     | No                                      | No                        | Planning docs only                        | New bounded schema/command phase                   |
| Monthly/weekly planning     | Not implemented                      | No                     | No                                      | No                        | Planning docs only                        | Product/database design                            |
| Journal                     | Not implemented                      | No                     | No                                      | No                        | Privacy ADR only                          | Private revision model                             |
| Reminders/notifications     | Not implemented                      | No                     | No                                      | No                        | Architecture/ADR only                     | Canonical schedule/provider phase                  |
| Progress tracking           | Not implemented                      | No                     | No                                      | No                        | Product plan only                         | Metric/rollup phase                                |
| Web application             | Implemented                          | Next.js App Router     | N/A                                     | No                        | Today/Planner/auth/health                 | Accessibility/UI tests, hosted release             |
| Mobile application          | Implemented, partially offline       | N/A                    | Expo Router                             | Narrow C1–C5 path         | `app/index.tsx` and tests                 | Physical-device validation                         |
| Deployment                  | Not implemented                      | No                     | No                                      | No                        | No deployment configuration               | Separate release approval                          |
| Export/delete               | Not implemented                      | No                     | No                                      | No                        | No feature/migration                      | Privacy/retention phase                            |
| AI integration              | Intentionally deferred               | No                     | No                                      | No                        | ADR-0011                                  | Consent/redaction/approval design                  |

## Test evidence

- Latest mobile focused suite: 7 files, 109 passing tests.
- Latest workspace test run: 7 successful Turbo tasks, 135 passing tests.
- Historical database evidence: four pgTAP files, 58 assertions, but not rerun for the latest C5 continuation.
- See `VERIFICATION_STATUS.md` for command outcomes and known formatting drift.

## Verification history

| Phase | Mobile Tests | TypeScript | Lint | Prettier | Web Build | Android Export | Database | Notes |
|---|---|---|---|---|---|---|---|---|
| **1D-C5** | 109 tests (7 files) | Passed | Passed | Passed | Passed | Passed | Not run | Workspace TS tests passed (135 tests). `verify.py` failed only on Prettier for handoff docs. |
| **1D-C4** | 87 tests (5 files) | Passed | Passed | Passed | Passed | Passed | Not run | `verify.py` failed only on Prettier for handoff docs. |
| **1D-C3** | 75 tests (5 files) | Passed | Passed | Passed | Passed | Passed | Not run | `verify.py` failed only on Prettier for handoff docs. |
| **1D-C2** | 63 tests (5 files) | Passed | Passed | Passed | Passed | Passed | Not run | `verify.py` failed only on Prettier for handoff docs. |
| **1D-C1** | 53 tests (5 files) | Passed | Passed | Passed | Passed | Passed | Not run | `verify.py` failed only on Prettier for handoff docs. |
| **1D-B4** | 45 tests (5 files) | Passed | Passed | Passed | Blocked | Blocked | Not run | Android runtime validation blocked (no emulator/PATH). `verify.py` blocked by pnpm dependency-status failure. |
| **1D-B3** | 45 tests (5 files) | Passed | Passed | Passed | Blocked | Blocked | Not run | `verify.py` blocked by pnpm dependency-status failure. |
| **1D-B2** | 33 tests (4 files) | Passed | Passed | N/A | Blocked | EPERM | Not run | Workspace tasks blocked by pnpm. Direct Expo export gave Hermes EPERM. |
| **1D-B** | 25 tests (3 files) | Passed | Passed | Failed | Blocked | EPERM | Not run | Prettier failed on handoff docs. Workspace tasks blocked by pnpm. Direct Expo export gave Hermes EPERM. |

## Broken or failing in the inspected environment

These are pre-existing-worktree failures. They do **not** indicate a Phase 1D-C4/C5 application TypeScript, lint, test, web-build, or Android-export failure.

| Command                        | Result                                            | Evidence                                                                                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm.cmd run format:check`    | Failed on pre-existing/unrelated files            | Phase 1D-C1 changed-file Prettier check passed. Repository-wide check reported only `apps/mobile/expo-env.d.ts` and untracked handoff documents: `docs/NEXT_STEPS.md`, `docs/PROJECT_HANDOFF.md`, and `docs/REPO_MAP.md` (the three docs have since been deleted during documentation cleanup). |
| `python scripts/verify.py`     | Failed overall only on repository-wide formatting | An unrestricted retry passed lint, TypeScript, tests, web build, and mobile export. Its sole failing stage was Prettier on the unrelated files identified above; summary remained `RESULT: FAIL`.                         |

No compiler diagnostic, ESLint diagnostic, test failure, migration failure, production-build failure, or Android-export failure was obtained in this continuation. The repository-wide verifier remains blocked only by pre-existing formatting drift.

## Unclear and requiring manual verification

- A clean repository-wide Prettier check after the owner decides whether to format the unrelated generated/handoff files. The other `python scripts/verify.py` stages passed when run outside the restricted process sandbox.
- Local Docker/Supabase startup, migration reset, and the pgTAP suite.
- Web local authentication, session restoration, repair flow, Planner controls, and browser singleton warning regression.
- Physical-device/emulator behavior. Android export passed, but no physical-device testing is evidenced.
- The uncommitted SQLite migration path from an empty database and from an existing schema version.
- Offline create/edit/completion and their dependency/retry/conflict behavior have focused injected-repository tests. Native Expo SQLite migration, reconnect acknowledgement, and account-switch behavior still require runtime validation on a device or emulator.
- Whether `personal-os-context.zip` contains material intended for version control; it was not inspected as application source.

## Profile revision semantics

The profile table has owner `UPDATE` permission and RLS in the first migration, but that update path does not increment `revision`. Do not assume profile edits participate in the command/revision protocol.
