# Next Steps

Last inspected: 2026-07-28. Priority order reflects the actual current tree: Phase 1C is the committed baseline and Phase 1D-A is an uncommitted local foundation.

## Prerequisite risks to resolve before feature expansion

1. Restore a clean Node 22/pnpm 11 workspace installation and establish a passing baseline. Current tooling cannot start verification because pnpm attempts a network-dependent install and aborts in the non-interactive environment.
2. Decide whether to retain, revise, or discard the uncommitted Phase 1D-A work. It changes dependencies, mobile configuration, validation exports, documentation, and adds source files; it is not an integrated feature.
3. Reconcile documentation scope: `AGENTS.md` says Phase 1B, while current commits are Phase 1C and working-tree docs describe Phase 1D-A.
4. Keep local environment files and generated output ignored. Do not add service-role keys to clients.

## Priority tasks

| # | Task and dependencies | Acceptance criteria | Likely files | Verification |
| --- | --- | --- | --- | --- |
| 1 | Restore reproducible toolchain baseline. Depends on no code change. | Node is 22 LTS; `pnpm install --frozen-lockfile` completes; no generated files are staged. | `.nvmrc`, `package.json`, `pnpm-lock.yaml`, CI only if an actual mismatch is found | `pnpm install --frozen-lockfile`; `python scripts/verify.py` |
| 2 | Validate committed Phase 1C database baseline. Depends on task 1 and Docker. | Local stack starts; all four migrations apply; pgTAP suite passes; RLS remains command-only. | Normally none; otherwise `supabase/migrations/*`, `supabase/tests/database/*`, docs | `pnpm supabase:reset`; `pnpm supabase:test` |
| 3 | Decide and isolate Phase 1D-A. Depends on task 1. | The local SQLite/outbox attempt is either deliberately committed with accurate docs and passing tests, or removed/reworked in a separate approved change. No feature is claimed prematurely. | Current uncommitted mobile files, `apps/mobile/package.json`, `pnpm-lock.yaml`, `docs/MOBILE_SYNC.md`, status docs | `pnpm --filter @personal-os/mobile typecheck`; `pnpm --filter @personal-os/mobile test`; `git diff --check` |
| 4 | Add mobile repository integration tests with Expo-compatible SQLite execution. Depends on task 3. | Empty and upgrade migrations, user scoping, atomic projection/outbox write, rollback, and temporary task mapping are exercised against actual SQLite rather than only an in-memory repository. | `apps/mobile/lib/local-store.ts`, new mobile tests/config | Mobile test command plus Android export |
| 5 | Complete acknowledgement reconciliation and temporary-ID mapping. Depends on tasks 2–4. | Successful create response replaces temporary task ID, persists authoritative revision, rewrites dependent queued payloads, and does not submit dependencies early. | `apps/mobile/lib/local-store.ts`, `local-command-engine.ts`, `outbox-processor.ts`, adapters/tests | Mobile tests; local Supabase reset/test; targeted manual emulator test |
| 6 | Wire mobile mutations through the local command engine. Depends on tasks 4–5. | Today/Planner reads cached state; supported actions atomically update SQLite/outbox; UI shows local pending state; online behavior remains RPC-only. | `apps/mobile/app/index.tsx`, mobile libraries/tests, docs | Mobile tests; Android export; manual offline/online emulator flow |
| 7 | Add controlled connectivity/lifecycle processing. Depends on task 6. | One authenticated processor, deterministic ordering/dependencies, restart recovery, bounded retry with jitter, offline pause/resume, and sign-out stop/clear behavior are tested. | `apps/mobile/lib/outbox-processor.ts`, new lifecycle/connectivity modules/tests | Mobile tests; Android export; manual restart/reconnect flow |
| 8 | Add explicit conflict state and conservative resolution. Depends on task 7. | Revision/state/Top 3 conflicts stop retries, preserve intent, fetch an authoritative snapshot, and offer discard/refresh/retry-after-review without silent overwrite. | Mobile store/processor/screen, shared contracts only if needed, tests/docs | Mobile tests; local Supabase tests if backend contract changes |
| 9 | Strengthen UI testability and split large client screens. Depends on task 1; may proceed alongside tasks 4–8. | Web/mobile auth, loading/error, Planner entry, unresolved-close, and conflict-presentation logic are component/state tested; adapters remain injected/typed. | `apps/web/app/today-client.tsx`, `apps/mobile/app/index.tsx`, test setup/files | `pnpm test`; web build; mobile export |
| 10 | Define the next product slice only after offline proof. Depends on tasks 1–8. | ADR/product/API/database changes specify one bounded feature (recommended: goals/projects foundation), including RLS, commands, history, sync impact, and tests; no implementation starts before approval. | `docs/PRODUCT.md`, `ARCHITECTURE.md`, `DATABASE.md`, `API.md`, `ROADMAP.md`, `DECISIONS.md` | Documentation review; then full verification after implementation |

## Recommended scope boundary

The immediate recommended engineering scope is **Phase 1D-B transport and reconciliation only**: acknowledge queued commands using existing typed RPC adapters; map temporary task IDs to server IDs; preserve operation IDs and dependency ordering; reconcile the local snapshot; and add deterministic tests. Do not add goals, journals, reminders, realtime, notifications, AI, web offline support, or deployment until this is proven.

## Manual checks for the next developer

- Verify the web client remains a singleton after a hard refresh and auth works locally.
- Run the full wake → plan → resolve unfinished → sleep flow against local Supabase.
- Run offline task create/edit/complete on an emulator only after the mobile screen is wired; reconnect and confirm one authoritative task/event per operation.
- Sign out with cached local state and confirm another account cannot access it.
- Inspect Supabase Studio only for local test data to verify owner IDs, revisions, task events, change events, and command records.
