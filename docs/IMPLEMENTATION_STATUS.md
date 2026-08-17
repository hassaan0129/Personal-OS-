# Implementation Status

Last inspected: 2026-08-02

## How to read this document

- **Proven fact** means it is evidenced by checked-in/uncommitted source, migrations, tests, configuration, or a command result recorded below.
- **Not re-verified today** means documentation or historical test files provide evidence, but the command could not complete in the current environment.
- **Assumption** is labelled explicitly and should be verified before relying on it.

## Fully implemented (source and test/migration evidence)

| Capability                          | Evidence                                                                                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| pnpm/Turbo TypeScript monorepo      | Root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, all package manifests and TypeScript configs                                                                       |
| Local Supabase profile provisioning | `20260717000000_create_profiles.sql` creates `profiles`, RLS policies, and the Auth-user trigger                                                                             |
| Local email/password auth adapters  | `packages/api-client/src/index.ts`; web/mobile call `createAuthAdapter`; local Auth config enables sign-up                                                                   |
| Browser singleton Supabase client   | `apps/web/lib/supabase.ts` plus `apps/web/lib/supabase.test.ts`                                                                                                              |
| SecureStore-backed mobile session   | `apps/mobile/lib/supabase.ts`                                                                                                                                                |
| Life Day command boundary           | Base migration exposes start/close/repair RPCs; `phase_1a_commands.test.sql` covers lifecycle, repair, timezone, and idempotency cases                                       |
| Task command boundary               | Base and planner migrations expose create/update/complete/reschedule/cancel/reorder/Top 3/reopen/resolve RPCs; typed adapters map them in `packages/api-client/src/index.ts` |
| RLS/direct-write protection         | Base migration enables RLS; `phase_1a_rls.test.sql` asserts owner reads, SQLSTATE `42501` direct task-write denial, and inaccessible `command_operations`                    |
| Owner-scoped Today reads            | `20260718010000_add_today_read_rpcs.sql`; `phase_1b_today_reads.test.sql` tests owner and unauthenticated cases                                                              |
| Planner invariants                  | `20260718020000_add_planner_mode_task_commands.sql`; `phase_1c_planner.test.sql` covers edit/order/Top 3/revisions/unresolved closure/cross-user denial                      |
| Web Today/Planner UI                | `apps/web/app/today-client.tsx`, `/planner` page and Health route                                                                                                            |
| Mobile online Today/Planner UI      | `apps/mobile/app/index.tsx`; it uses typed adapters, not direct table writes                                                                                                 |

The existing `docs/CURRENT_STATUS.md` reports a prior local pgTAP result of 58 assertions across four files. That is historical documentation evidence, not a command result from this handoff.

## Partially implemented

| Capability                        | Evidence and gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1D-A mobile local storage   | Uncommitted `apps/mobile/lib/local-store.ts` defines schema versioning, WAL/foreign keys, user-scoped snapshots/outbox/conflicts/sync state, temporary task mappings, and UI-safe pending/issue presentation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Transactional optimistic commands | Uncommitted `local-command-engine.ts` uses an injected repository transaction to update a local Today projection and outbox. Persistence failures now escape that transaction so the repository can roll back rather than committing a partial optimistic projection. No current end-to-end mobile execution proves it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Narrow mobile offline task flow   | `today-sync-controller.ts` and `app/index.tsx` initialize/cache Today after authentication; task create/edit/reorder/complete/reopen/cancel/reschedule are optimistic and show pending state. Local ordering uses fractional numeric positions, permits planned/in-progress/overdue tasks, advances the predicted revision once, and follows earlier task operations. Other local mutations also predict the next revision and depend on earlier task mutations; cancellation is restricted locally to planned/in-progress tasks, while rescheduling mirrors the existing planned/overdue `task.reschedule` lifecycle with an instant/timezone pair and structured reason. Online draining reconciles in sequence; sign-out clears the current user's local data. Other task and Life Day commands remain online-only. |
| Outbox processing                 | Uncommitted `outbox-processor.ts` atomically claims dependency-eligible user-scoped operations, dispatches through typed RPC adapters, and transactionally reconciles accepted/duplicate-accepted task creation through temporary-ID mapping, snapshot revision replacement, dependent-payload rewrite, and cursor storage. Foreground/network/manual draining is coordinated by `today-foreground-lifecycle.ts` and `today-sync-controller.ts`; it has no cursor pull or conflict-resolution UI.                                                                                                                                                                                                                                                                                                                      |
| Sync contract                     | `sync_changes` table and `sync-contracts` exist, but no exposed cursor-pull adapter or client reconciliation loop was found.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Repair/conflict UI                | Both web/mobile map basic safe RPC errors, but no complete user-facing repair editor or explicit conflict-resolution workflow was found.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Documentation governance          | README, architecture, current status, mobile-sync documentation, and this status file describe the narrow Phase 1D-C5 create/edit/reorder/complete/reopen/cancel/reschedule scope. Older roadmap/product target language still describes broader future work and is not implementation evidence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Profile revision semantics        | The profile table has owner `UPDATE` permission and RLS in the first migration, but that update path does not increment `revision`. Do not assume profile edits participate in the command/revision protocol.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## Planned but not implemented

Evidence comes from `docs/PRODUCT.md`, `docs/ROADMAP.md`, and ADRs; no corresponding migrations/routes/adapters were found.

- Goals, projects, milestones, monthly/weekly planning, progress tracking, and weekly review.
- Task recurrence and independent recurring occurrences.
- Tomorrow planning and a dedicated carry-over workflow beyond explicit reschedule/overdue/cancel resolution.
- Journals, attachments, private revision UI, mood/energy, and photos.
- Reminders, mobile push, web push, delivery receipts, and quiet hours.
- Realtime subscriptions, server cursor pull, full offline reconciliation, multi-device merge, and web offline support.
- Account recovery/password reset, social login, production Auth policy, hosted Supabase, deployment, data export/import, deletion/trash UI, or admin mode.
- AI integrations, analysis artifacts, or automated changes.

## Broken or failing in the inspected environment

These are pre-existing-worktree failures. They do **not** indicate a Phase 1D-C4 application TypeScript, lint, test, web-build, or Android-export failure.

| Command                        | Result                                            | Evidence                                                                                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm.cmd run format:check`    | Failed on pre-existing/unrelated files            | Phase 1D-C1 changed-file Prettier check passed. Repository-wide check reported only `apps/mobile/expo-env.d.ts` and untracked handoff documents: `docs/NEXT_STEPS.md`, `docs/PROJECT_HANDOFF.md`, and `docs/REPO_MAP.md`. |
| `pnpm.cmd run lint`            | Passed                                            | Turbo reported 9 successful lint tasks.                                                                                                                                                                                   |
| `pnpm.cmd run typecheck`       | Passed                                            | Turbo reported 9 successful strict TypeScript tasks.                                                                                                                                                                      |
| `pnpm.cmd run test`            | Passed                                            | The prior C1 run reported 7 successful test tasks and 53 mobile tests; C2 final verification is recorded below.                                                                                                           |
| `pnpm.cmd run build:web`       | Passed                                            | An unrestricted retry completed the Next.js production build, including TypeScript and static-page generation.                                                                                                            |
| `pnpm.cmd run validate:mobile` | Passed                                            | An unrestricted retry completed Expo Android export and wrote ignored `apps/mobile/dist` output.                                                                                                                          |
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

## Feature matrix

| Feature               | Status                            | Evidence / limitation                                                                                          |
| --------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Authentication        | Implemented locally               | Typed email/password adapters and local Auth config; production policy absent                                  |
| User profiles         | Implemented                       | Profile migration/trigger/RLS and Today snapshot contract                                                      |
| Life days             | Implemented                       | Lifecycle RPCs, RLS, command tests, web/mobile controls                                                        |
| Today view            | Implemented                       | Web/mobile surfaces and owner-scoped snapshot RPC                                                              |
| Tasks                 | Implemented                       | Task table, validation, command adapters, UI controls                                                          |
| Priorities            | Implemented                       | Three domain/database values and UI selection                                                                  |
| Task completion       | Implemented                       | Command RPC, idempotency/revision test coverage, UI action                                                     |
| Recurring tasks       | Not implemented                   | No recurrence migration or adapter                                                                             |
| Tomorrow planning     | Not implemented                   | Only explicit date rescheduling exists                                                                         |
| Carry-over            | Partially implemented             | No automatic rollover; explicit reschedule/overdue/cancel resolution exists                                    |
| Journal               | Not implemented                   | Planned only                                                                                                   |
| Reminders             | Not implemented                   | Planned only                                                                                                   |
| Weekly review         | Not implemented                   | Planned only                                                                                                   |
| Admin mode            | Not implemented                   | No roles/admin routes found                                                                                    |
| Normal-user mode      | Implemented                       | Single authenticated owner scope and owner RLS                                                                 |
| Web application       | Implemented                       | Next App Router Today/Planner/auth/health surface                                                              |
| Mobile application    | Partially offline                 | Expo Today/Planner/auth; task create/edit/reorder/complete/reopen/cancel/reschedule use local outbox           |
| Offline support       | Partially implemented/uncommitted | Cached Today plus offline task create/edit/reorder/complete/reopen/cancel/reschedule; no broad Planner support |
| Synchronization       | Partially implemented             | Command idempotency/revisions/change hints; no completed pull/reconcile loop                                   |
| Notifications         | Not implemented                   | No notification code/configuration                                                                             |
| Audit events          | Implemented server-side           | `task_events` and redacted `change_events` written by command functions                                        |
| Export/import         | Not implemented                   | No routes/jobs or migration evidence                                                                           |
| AI-ready integrations | Planned only                      | ADR boundary exists; no code/integration                                                                       |

## Commands executed for this handoff

### Phase 1D-C5 offline-ordering continuation

1. Direct mobile test binary — passed: 7 files and 109 tests.
2. Direct mobile TypeScript and targeted ESLint checks — passed for the Phase 1D-C5 mobile files.
3. Targeted Prettier and `git diff --check` — passed for the Phase 1D-C5 source, tests, and documentation.
4. Direct Android Expo export — passed and produced ignored `apps/mobile/dist` output.
5. Workspace TypeScript tests — passed: 7 successful Turbo test tasks and 135 tests across the workspace.
6. `python scripts/verify.py` — lint, workspace TypeScript, workspace tests, web production build, and Android export passed. Its repository-wide Prettier stage reported only the pre-existing unrelated `apps/mobile/expo-env.d.ts`, `docs/NEXT_STEPS.md`, `docs/PROJECT_HANDOFF.md`, and `docs/REPO_MAP.md`, so the verifier reported `RESULT: FAIL`.

Docker-dependent Supabase reset and pgTAP checks were not run — Docker/local Supabase intentionally deferred by the project owner.

### Phase 1D-C4 offline-reschedule continuation

1. Direct mobile test binary — passed: 5 files and 87 tests.
2. Direct mobile TypeScript and targeted ESLint checks — passed for the Phase 1D-C4 mobile files.
3. Targeted Prettier — passed for the Phase 1D-C4 mobile and documentation files.
4. `python scripts/verify.py` — lint, workspace TypeScript, workspace tests, web build, and Android export passed. Its repository-wide Prettier stage reported only the pre-existing unrelated handoff documents `docs/NEXT_STEPS.md`, `docs/PROJECT_HANDOFF.md`, and `docs/REPO_MAP.md`, so the verifier reported `RESULT: FAIL`.
5. `git diff --check` — passed in the final C4 review.

Docker-dependent Supabase reset and pgTAP checks were not run — Docker/local Supabase intentionally deferred by the project owner.

### Phase 1D-C3 offline-cancellation continuation

1. Direct mobile test binary — passed: 5 files and 75 tests.
2. Direct mobile TypeScript and targeted ESLint checks — passed for the Phase 1D-C3 mobile files.
3. Targeted Prettier — passed for the Phase 1D-C3 mobile and documentation files.
4. `python scripts/verify.py` — lint, workspace TypeScript, workspace tests, web build, and Android export passed. Its repository-wide Prettier stage reported only the pre-existing unrelated handoff documents `docs/NEXT_STEPS.md`, `docs/PROJECT_HANDOFF.md`, and `docs/REPO_MAP.md`, so the verifier reported `RESULT: FAIL`.
5. `git diff --check` — passed in the final C3 review.

Docker-dependent Supabase reset and pgTAP checks were not run — Docker/local Supabase intentionally deferred by the project owner.

### Phase 1D-C2 offline-reopen continuation

1. Direct mobile test binary — passed: 5 files and 63 tests.
2. Direct mobile TypeScript check — passed: `tsc --project apps/mobile/tsconfig.json --noEmit`.
3. Targeted ESLint and Prettier checks — passed for the Phase 1D-C2 mobile and documentation files.
4. `python scripts/verify.py` — lint, workspace TypeScript, workspace tests, web build, and Android export passed. Its repository-wide Prettier stage initially included this status entry and three unrelated handoff documents; after formatting this entry, a direct repository-wide Prettier check reports only the unrelated handoff documents. The verifier therefore reported `RESULT: FAIL`.
5. `git diff --check` — passed in the final C2 review.

Docker-dependent Supabase reset and pgTAP checks were not run — Docker/local Supabase intentionally deferred by the project owner.

### Phase 1D-C1 offline-edit continuation

1. Direct mobile test binary — passed: 5 files and 53 tests.
2. Direct mobile TypeScript check — passed: `tsc --project apps/mobile/tsconfig.json --noEmit`.
3. Targeted ESLint check — passed for the Phase 1D-C1 mobile files.
4. Targeted Prettier check — passed for the Phase 1D-C1 mobile and documentation files.
5. `python scripts/verify.py` — an unrestricted retry passed lint, workspace TypeScript, workspace tests, the web production build, and Expo Android export. Repository-wide formatting still failed only on the unrelated files identified above; the verifier therefore reported `RESULT: FAIL`.
6. `git diff --check` — passed in the final C1 review.

Docker-dependent Supabase reset and pgTAP checks were not run — Docker/local Supabase intentionally deferred by the project owner.

### Phase 1D-B4 runtime-validation attempt

1. Android runtime validation — blocked before launch: `adb` and `emulator` are not on `PATH`; standard local Android SDK locations are absent; no Android device or emulator process is present.
2. Direct mobile test binary — passed: 5 files and 45 tests.
3. Direct mobile TypeScript, targeted ESLint, targeted Prettier, and `git diff --check` — passed.
4. `python scripts/verify.py` — failed all six pnpm-backed stages before their underlying tools ran because pnpm attempted a dependency-status install, could not fetch registry metadata, and aborted the non-interactive modules-directory purge.

Docker-dependent Supabase reset and pgTAP checks were not run — Docker/local Supabase intentionally deferred by the project owner.

### Phase 1D-B3 continuation

1. Direct mobile test binary — passed: 5 files and 45 tests.
2. Direct mobile TypeScript check — passed: `tsc --project apps/mobile/tsconfig.json --noEmit`.
3. Targeted ESLint check — passed for the mobile screen and changed local-sync files.
4. Targeted Prettier check — passed for the changed mobile and documentation files.
5. `python scripts/verify.py` — failed all six pnpm-backed stages before their underlying tools ran because pnpm attempted a dependency-status install, could not fetch registry metadata, and aborted the non-interactive modules-directory purge.

Docker-dependent Supabase reset and pgTAP checks were not run — Docker/local Supabase intentionally deferred by the project owner.

### Phase 1D-B2 continuation

1. Direct mobile test binary â€” passed: 4 files and 33 tests.
2. Direct mobile TypeScript check â€” passed: `tsc --project apps/mobile/tsconfig.json --noEmit`.
3. Targeted ESLint check â€” passed for the mobile screen and changed local-sync files.
4. `pnpm.cmd --filter @personal-os/mobile test`, `pnpm.cmd --filter @personal-os/mobile typecheck`, `pnpm.cmd --filter @personal-os/mobile validate`, and `python scripts/verify.py` â€” did not start their underlying workspace tasks because pnpm attempted dependency-status installation, failed registry metadata access, and aborted a non-interactive modules-directory purge.
5. Direct Expo Android export â€” Metro started but Android bundling reported `Failed to generate Hermes bytecode` with `spawn EPERM`. Its zero exit code is not treated as a successful validation.

Docker-dependent Supabase reset and pgTAP checks were not run â€” Docker/local Supabase intentionally deferred by the project owner.

### Phase 1D-B continuation

1. Direct mobile test binary â€” passed: 3 files and 25 tests.
2. Direct mobile TypeScript check â€” passed: `tsc --project apps/mobile/tsconfig.json --noEmit`.
3. Targeted ESLint check â€” passed for changed mobile library and test files.
4. `pnpm.cmd --filter @personal-os/mobile test`, `pnpm.cmd --filter @personal-os/mobile typecheck`, `pnpm.cmd --filter @personal-os/mobile validate`, `turbo run lint`, and `python scripts/verify.py` â€” could not start their underlying workspace tasks because pnpm attempted dependency-status installation, failed registry metadata access, and aborted a non-interactive modules-directory purge. This is a tooling/environment failure, not a source-test result.
5. Direct Expo Android export â€” Metro started but Android bundling reported `Failed to generate Hermes bytecode` with `spawn EPERM`. The command returned exit code zero despite that error, so mobile export is not verified.
6. Direct `prettier --check .` â€” failed only on pre-existing uncommitted handoff documents: `docs/IMPLEMENTATION_STATUS.md`, `docs/NEXT_STEPS.md`, `docs/PROJECT_HANDOFF.md`, and `docs/REPO_MAP.md`. The Phase 1D-B files were not listed.

Docker-dependent Supabase reset and pgTAP checks were not run â€” Docker/local Supabase intentionally deferred by the project owner.

1. Read-only repository inspection: status, recent commits, manifests, configs, docs, source, migrations, tests, hooks, CI, TODO/FIXME scan, and `.env.example` files only.
2. `pnpm.cmd typecheck` — blocked before TypeScript execution as described above.
3. `pnpm.cmd lint` — blocked before ESLint execution as described above.
4. `python scripts/verify.py` — six attempted stages all blocked by the same pnpm dependency-status failure.
5. `git diff --check` — passed.
6. `git status --short` — working tree was already dirty before the four handoff documents were added; see `PROJECT_HANDOFF.md` and `REPO_MAP.md`.
