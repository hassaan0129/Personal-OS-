# Project State

Last reconstructed from the working tree: 2026-08-02.

## Phase history

| Phase                              | State                                              | Evidence and boundary                                                                                                                                 |
| ---------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 — Foundation                     | Implemented                                        | pnpm/Turborepo, strict TypeScript, Next.js, Expo Router, shared contracts, formatting/linting, CI, local Supabase structure.                          |
| 1A — Life Day/Today backend        | Implemented; local database evidence is historical | `20260717010000_add_life_day_today_foundation.sql` and pgTAP command/RLS files add tables, RPCs, idempotency, revisions, events, sync hints, and RLS. |
| 1B — Auth and minimal Today        | Implemented                                        | Auth/Today migration, typed API adapters, web singleton test, and authenticated web/mobile Today surfaces.                                            |
| 1C — Planner Mode/task management  | Implemented                                        | Planner migration, command adapters, web/mobile controls, and planner pgTAP tests. This is the last committed phase.                                  |
| 1D-A — Local command foundation    | Implemented in the dirty worktree; unit-tested     | `local-store.ts`, `local-command-engine.ts`, contracts, and focused tests implement user-scoped SQLite schema and atomic projection/outbox writes.    |
| 1D-B — Transport/acknowledgement   | Implemented in the dirty worktree; unit-tested     | `outbox-processor.ts` dispatches typed commands and reconciles accepted/duplicate-accepted creation.                                                  |
| 1D-B2 — Narrow UI integration      | Implemented in the dirty worktree; unit-tested     | Mobile Today initializes cache, queues create/complete, shows pending state, drains online, and clears local data on sign-out.                        |
| 1D-B3 — Foreground/manual recovery | Implemented in the dirty worktree; unit-tested     | Lifecycle/runtime/controller files coalesce recovery, retry, refresh, and issue display.                                                              |
| 1D-B4 — Runtime validation         | Blocked/unverified                                 | Attempted on 2026-07-28. Prior host lacked usable Android tooling (no Android SDK adb, no emulator, no connected device); Android export is not native-runtime proof. |
| 1D-C1 — Offline edit               | Implemented in the dirty worktree; unit-tested     | Local task update projection, durable command, dependency/revision behavior, and UI integration.                                                      |
| 1D-C2 — Offline reopen             | Implemented in the dirty worktree; unit-tested     | Local completed-to-planned projection and ordered `task.reopen` command.                                                                              |
| 1D-C3 — Offline cancellation       | Implemented in the dirty worktree; unit-tested     | Structured cancellation reason validation, lifecycle guard, durable ordered command, and UI integration.                                              |
| 1D-C4 — Offline rescheduling       | Implemented in the dirty worktree; unit-tested     | Planned/overdue-only local reschedule with UTC instant, IANA zone, structured reason, and revision safety.                                            |
| 1D-C5 — Offline ordering           | Implemented in the dirty worktree; unit-tested     | Fractional Move Up/Down positions for planned/in-progress/overdue tasks, stable ordering, durable `task.reorder`, and pending merge preservation.     |

## Implemented and verified by source/tests

- Email/password authentication and session restoration through typed adapters.
- Auth-linked profiles, Life Days, tasks, task/change events, command
  idempotency, and owner-scoped RLS in local SQL migrations.
- Explicit wake/sleep/repair rules; task create/update/complete/reschedule/cancel
  plus planner reorder/Top 3/reopen/unfinished-resolution RPCs.
- Web Today/Planner and mobile Today/Planner online flows; no direct application
  table writes for invariant-bearing records.
- Narrow mobile cache/outbox behavior listed above, with **109 focused mobile
  tests** and **135 workspace tests** in the latest recorded C5 run.

## Implemented but not physically verified

- Native Expo SQLite migrations and persistence across a real app restart.
- Offline-to-online acknowledgement against a live Supabase instance.
- Temporary-ID replacement, dependency release, foreground recovery, account
  switch, and conflict display on a physical device/emulator.
- Web sign-in and Planner flows against a current local or hosted development
  project during this handoff.

## Partially implemented

- `sync_changes` records server hints, but no supported cursor-pull client API
  or full replication protocol exists.
- Conflict/rejection details are visible safely, but no user-directed conflict
  resolution action exists.
- The mobile offline command engine supports more local projections than are
  wired to the UI; only the C1–C5 task mutations are in scope.

## Known limitations and risks

- SQLite is not encrypted at rest.
- pnpm 11 uses an explicit per-dependency `allowBuilds` policy; `sharp` remains denied until an image-optimization capability requires a reviewed decision.
- The local Auth configuration disables email confirmation only for development. Production email, redirect, and password-reset policy require a separate decision.
- End-user UI conflict and repair states are minimal. The command boundary returns safe `repair_required` and `revision_conflict` contracts, but richer recovery UX belongs in a later phase.
- Profile revision note: the profile table has an owner UPDATE policy but doesn't increment its revision.

## Planned or intentionally deferred

Phase 2 (Core loop tightening + Journal) is the current next phase. Remaining
planned phases in order: Reminders (Phase 3), Goals (Phase 4), Finance (Phase 5),
Notes (Phase 6), Universal trash/permanence pass (Phase 7), Hardening and beta
readiness (Phase 8), Opt-in AI analysis (Phase 9). Also deferred: realtime,
cursor pull, web offline, export/delete, production deployment, account
recovery/social login, and collaboration.

## Current hosted-development boundary

No hosted Supabase project reference, URL, credential, or service-role key is
committed. `supabase/config.toml` is local-only. An ignored developer
environment file may supply a public API URL and publishable key for local or
hosted development, but this handoff neither reads nor packages it. Hosted
migration/application work needs a separately approved workflow.

## Local development workflow

1. Start Docker Desktop, then run `pnpm supabase:start`.
2. Run `pnpm supabase:reset` and `pnpm supabase:test` after migration changes.
3. Put only the local API URL and publishable/anon key in the ignored web/mobile environment files. Never add a service-role key.
4. Run `python scripts/verify.py` before handoff.
