# Current Status

Last updated: 2026-07-17

## Repository state

This repository contains a Phase 0 technical foundation plus the Phase 1A Life Day and Today backend foundation. It has a pnpm/Turborepo workspace, minimal Next.js and Expo Router applications, strict shared contracts, local-only SQL migrations/RLS/RPCs, unit tests, and pull-request verification CI. It has no hosted Supabase project, authentication UI, product screens, mobile local replica/outbox, notifications, goals, journals, analytics, AI, deployment, or production credentials.

The bundled `codex-power-kit/` is a reusable setup kit, not product source. Its templates, scripts, rules, hooks, and skills were inspected and intentionally left unchanged.

## Completed in this planning phase

- Product scope, architecture, data model, API/sync plan, and phased roadmap documented.
- pnpm/Turborepo workspace created with `apps/web`, `apps/mobile`, and six shared TypeScript packages.
- Strict TypeScript, Prettier, ESLint, Vitest, full verification script, and GitHub Actions pull-request workflow configured.
- Local Supabase structure and an Auth-linked, RLS-protected `profiles` migration added without connecting to Supabase Cloud.
- Minimal web health route and mobile launch surface added; neither implements a product feature.
- Phase 1A adds Life Day, task, task-event, idempotency, audit, and sync-change schema; authenticated command RPCs; shared command contracts; and a local pgTAP RLS suite.

## Important planning conclusions

- The planned stack is retained: `pnpm` + Turborepo, Next.js web, Expo mobile, shared TypeScript packages, and Supabase/Postgres.
- V1 decisions are now finalized: explicit wake/sleep Life Days, UTC plus IANA zones, mobile offline support for Today/tasks/wake-sleep/journals/completion, no automatic rollover, recurring task occurrences, mobile-only notifications, private journals, permanent task/goal history, 90-day delivery records, 30-day trash, and approval-gated AI changes.
- Phase 0 deliberately has no Supabase client, SQLite, notification, or sync implementation. Realtime remains an invalidation signal—not a sync engine—when those capabilities are introduced.

## Known gaps and risks

- The Supabase CLI is installed locally, but Docker Desktop's `dockerDesktopLinuxEngine` pipe is unavailable. `pnpm supabase:start` therefore cannot start the stack; migrations and pgTAP RLS tests have not run and must not be treated as validated.
- Expo SDK/package compatibility and the local Android static export have been verified. No mobile emulator or physical device has been started yet.
- pnpm 11 explicitly denies the optional transitive `sharp` build in `pnpm-workspace.yaml`. This is valid only while the application does not use `next/image`, standalone hosting, or self-hosted image optimization; revisit it before any of those capabilities are added.
- The V1 sync engine, local SQLite replica/outbox, notifications, recurring-occurrence engine, trash jobs, progress formulas, and AI approval flow remain future work.
- Current repository hooks provide command policy, changed-file secret scanning, and automatic verification attempts. Native Git hooks are only stock sample hooks.

## Current verification state

- Product/documentation planning: complete; V1 decisions supplied for implementation are recorded above.
- Application format/lint/typecheck/tests/web build/mobile validation: passed through `python scripts/verify.py` after the Phase 1A changes on 2026-07-17.
- Local database migration and RLS validation: blocked by unavailable Docker runtime; no hosted connection was attempted.
- External services, deploys, hosted connections, and pushes: intentionally not performed.

## Next safest step

Start Docker Desktop, run `pnpm supabase:start`, `pnpm supabase:reset`, and `pnpm supabase:test`, then record the result. After that, Phase 1B can add authenticated Today reads and command adapters without introducing full screens, mobile SQLite, or sync.
