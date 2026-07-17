# Current Status

Last updated: 2026-07-18

## Repository state

Phase 0, Phase 1A, Phase 1B, and Phase 1C are implemented in this local-only repository. The workspace has a pnpm/Turborepo layout, strict TypeScript, local Supabase migrations and RLS/RPC tests, typed Supabase client adapters, and authenticated Next.js/Expo Today and daily Planner Mode surfaces. No hosted Supabase project, production credential, deployment, or source-control push has been made.

Phase 1C adds `tasks.is_top_three`, safe planner commands for ordering, Top 3, reopening, and unfinished-task resolution, plus simple web/mobile Planner Mode controls. Web uses its single browser Supabase client for every adapter; mobile keeps a separate SecureStore-backed client. Both remain online-only and write exclusively through command RPCs.

## Verified capabilities

- `supabase db reset --local` applies the profile, Phase 1A, and Phase 1B migrations.
- `supabase test db --local` passes 58 pgTAP assertions across four files, including RLS, owner-scoped reads, planner commands, Top 3 limits, revision conflicts, and Life Day closure resolution.
- The web surface exposes execution-mode Today groups (Top 3, scheduled, flexible, overdue, completed), a dedicated Planner route, task create/edit/order/Top 3/resolution controls, and command-conflict feedback.
- The mobile surface exposes sign-in/sign-up, session restoration, wake/sleep, task execution, and compact online-only Planner Mode task controls through the same typed adapters.
- pnpm 11 uses an explicit per-dependency `allowBuilds` policy. `sharp` remains denied until an image-optimization capability requires a reviewed decision.

## Known limitations and risks

- Mobile has no SQLite replica or durable outbox yet, so it is online-only despite the V1 offline requirement. Web offline support is still intentionally deferred.
- Mobile persists the Auth session in Expo SecureStore, but Phase 1B has not been tested on a physical device or emulator. Its Android static export is the only mobile runtime validation in this phase.
- There are no realtime subscriptions, notifications, recurrence, goals, projects, journals, progress analytics, AI, account recovery, social login, offline product-data storage, or deployment workflows.
- The local Auth configuration disables email confirmation only for development. Production email, redirect, and password-reset policy require a separate decision.
- End-user UI conflict and repair states are minimal. The command boundary returns safe `repair_required` and `revision_conflict` contracts, but richer recovery UX belongs in a later phase.

## Required local workflow

1. Start Docker Desktop, then run `pnpm supabase:start`.
2. Run `pnpm supabase:reset` and `pnpm supabase:test` after migration changes.
3. Put only the local API URL and publishable/anon key in the ignored web/mobile environment files. Never add a service-role key.
4. Run `python scripts/verify.py` before handoff.

## Next recommended scope

Phase 1D should add a narrow, tested mobile SQLite Today replica and durable command outbox for the already-shipped Life Day and task commands: authenticated local hydration, queued writes, idempotent retry, owner-bound sign-out clearing, sync cursor pull, and explicit stale/revision-conflict recovery. It must not add goals, notifications, journals, or realtime subscriptions before that offline slice is proven.
