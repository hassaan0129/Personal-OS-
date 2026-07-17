# Current Status

Last updated: 2026-07-18

## Repository state

Phase 0, Phase 1A, and Phase 1B are implemented in this local-only repository. The workspace has a pnpm/Turborepo layout, strict TypeScript, local Supabase migrations and RLS/RPC tests, a typed Supabase client adapter, and minimal Next.js/Expo authenticated Today surfaces. No hosted Supabase project, production credential, deployment, or source-control push has been made.

Phase 1B adds local email/password sign-up, sign-in, sign-out, session restoration, owner-scoped Today reads, and the narrow Life Day/task command actions already implemented in Phase 1A. Web and mobile use only the public local Supabase configuration and typed adapters; they do not write database tables directly.

## Verified capabilities

- `supabase db reset --local` applies the profile, Phase 1A, and Phase 1B migrations.
- `supabase test db --local` passes 34 pgTAP assertions across three files, including RLS and owner-scoped Today read behavior.
- The web surface exposes sign-in/sign-up, active-Life-Day status, wake/sleep/repair actions, Today task list, create/complete/cancel/reschedule actions, and command conflict feedback.
- The mobile surface exposes sign-in/sign-up, session restoration, wake/sleep, task create/complete, loading, and error states through the same typed adapters.
- pnpm 11 uses an explicit per-dependency `allowBuilds` policy. `sharp` remains denied until an image-optimization capability requires a reviewed decision.

## Known limitations and risks

- Mobile has no SQLite replica or durable outbox yet, so it is online-only despite the V1 offline requirement. Web offline support is still intentionally deferred.
- Mobile persists the Auth session in Expo SecureStore, but Phase 1B has not been tested on a physical device or emulator. Its Android static export is the only mobile runtime validation in this phase.
- There are no realtime subscriptions, notifications, recurrence, goals, projects, journals, progress analytics, AI, account recovery, social login, or deployment workflows.
- The local Auth configuration disables email confirmation only for development. Production email, redirect, and password-reset policy require a separate decision.
- End-user UI conflict and repair states are minimal. The command boundary returns safe `repair_required` and `revision_conflict` contracts, but richer recovery UX belongs in a later phase.

## Required local workflow

1. Start Docker Desktop, then run `pnpm supabase:start`.
2. Run `pnpm supabase:reset` and `pnpm supabase:test` after migration changes.
3. Put only the local API URL and publishable/anon key in the ignored web/mobile environment files. Never add a service-role key.
4. Run `python scripts/verify.py` before handoff.

## Next recommended scope

Phase 1C should add a narrow, tested mobile SQLite Today replica and durable command outbox: authenticated local hydration, queued wake/sleep/task completion writes, idempotent retry, owner-bound sign-out clearing, sync cursor pull, and explicit stale/revision-conflict recovery. It must not add goals, notifications, journals, planner mode, or realtime subscriptions before that offline slice is proven.
