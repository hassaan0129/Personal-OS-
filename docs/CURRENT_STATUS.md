# Current Status

Last updated: 2026-08-02

## Repository state

Phase 0, Phase 1A, Phase 1B, and Phase 1C are implemented in this local-only repository. The workspace has a pnpm/Turborepo layout, strict TypeScript, local Supabase migrations and RLS/RPC tests, typed Supabase client adapters, and authenticated Next.js/Expo Today and daily Planner Mode surfaces. No hosted Supabase project, production credential, deployment, or source-control push has been made.

Phase 1C adds `tasks.is_top_three`, safe planner commands for ordering, Top 3, reopening, and unfinished-task resolution, plus simple web/mobile Planner Mode controls. Web uses its single browser Supabase client for every adapter; mobile keeps a separate SecureStore-backed client. Both remain online-only and write exclusively through command RPCs.

Phase 1D-A has begun the mobile SQLite foundation: versioned user-scoped snapshot/outbox storage, temporary task-ID mappings, and a tested local command engine that atomically applies validated optimistic projections and durable command records. The Phase 1D-B transport claims dependency-eligible user-scoped operations, sends them through typed RPC adapters, and transactionally reconciles accepted task creation by mapping temporary IDs, updating the cached task revision, rewriting dependent commands, and storing the sync cursor. Phase 1D-B2 wires mobile task creation and completion through that path. Phase 1D-B3 adds per-session foreground recovery, a guarded manual retry/refresh path, conservative refresh merging, and read-only safe issue details. Phase 1D-C1 adds offline task editing for title, description, priority, estimate, and scheduled/flexible fields. Phase 1D-C2 adds offline reopening for completed tasks. Phase 1D-C3 adds offline cancellation for planned or in-progress tasks with the existing structured reason contract; `other` requires its validated explanatory note. Phase 1D-C4 adds offline rescheduling only for planned or overdue tasks because that is the existing `task.reschedule` RPC lifecycle; it requires a non-null UTC instant, IANA timezone, and structured reason, and does not move the task between Life Days. Phase 1D-C5 adds offline ordering of active tasks through the existing numeric `task.reorder` command: each Move Up/Move Down projects one position and revision update, queues behind the latest same-task operation, and remains locally ordered through pending authoritative refreshes. Each local mutation is immediately cached, carries its current expected revision, queues behind an earlier mutation for the same task, and remains an explicit conflict if its server revision is stale.

Phase 1D-B4 runtime validation was attempted on 2026-07-28. This host has no Android SDK `adb`, no emulator executable or configured AVD, no connected Android device, and no running emulator process, so no native runtime scenario could be claimed or used to justify a stabilization code change.

## Verified capabilities

- `supabase db reset --local` applies the profile, Phase 1A, and Phase 1B migrations.
- `supabase test db --local` passes 58 pgTAP assertions across four files, including RLS, owner-scoped reads, planner commands, Top 3 limits, revision conflicts, and Life Day closure resolution.
- The web surface exposes execution-mode Today groups (Top 3, scheduled, flexible, overdue, completed), a dedicated Planner route, task create/edit/order/Top 3/resolution controls, and command-conflict feedback.
- The mobile surface exposes sign-in/sign-up, session restoration, cached Today rendering, offline-capable task creation/editing/ordering/completion/reopening/cancellation/rescheduling, online-only wake/sleep, and compact Planner Mode controls through typed adapters.
- Mobile runtime UUID generation uses the Expo-supported `expo-crypto` boundary for command IDs, device IDs, and temporary task IDs; it does not rely on the browser Web Crypto global that Expo Go may not provide.
- pnpm 11 uses an explicit per-dependency `allowBuilds` policy. `sharp` remains denied until an image-optimization capability requires a reviewed decision.

## Known limitations and risks

- Mobile has the Phase 1D-C5 narrow task-create/task-edit/task-reorder/task-complete/task-reopen/task-cancel/task-reschedule path, but Top 3, unfinished-task resolution, and Life Day commands remain online-only. In-progress work cannot use offline `task.reschedule`, because the existing server lifecycle reserves it for planned or overdue tasks. There is no cursor pull, realtime subscription, automatic revision rebase, conflict-resolution action, or physical-device validation. Web offline support is intentionally deferred.
- Mobile persists the Auth session in Expo SecureStore, but the B2/B3 behavior has not been tested on a physical device or emulator. Android static export has not provided valid native-runtime evidence in this environment.
- There are no realtime subscriptions, notifications, recurrence, goals, projects, journals, progress analytics, AI, account recovery, social login, broad offline product-data support, or deployment workflows.
- The local Auth configuration disables email confirmation only for development. Production email, redirect, and password-reset policy require a separate decision.
- End-user UI conflict and repair states are minimal. The command boundary returns safe `repair_required` and `revision_conflict` contracts, but richer recovery UX belongs in a later phase.

## Required local workflow

1. Start Docker Desktop, then run `pnpm supabase:start`.
2. Run `pnpm supabase:reset` and `pnpm supabase:test` after migration changes.
3. Put only the local API URL and publishable/anon key in the ignored web/mobile environment files. Never add a service-role key.
4. Run `python scripts/verify.py` before handoff.

## Next recommended scope

The next smallest slice is offline Top 3 selection, after an Android emulator or physical device records the B4/C5 runtime matrix: fresh sign-in, offline create/edit/reorder/complete/reopen/cancel/reschedule, restart, reconnect, temporary-ID rewrite, foreground recovery, manual retry/refresh, revision-conflict display, and account switch.
