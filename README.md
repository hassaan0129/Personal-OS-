# Personal OS

Personal OS is a private web and mobile workspace for turning long-term goals into daily execution and reflection. This repository contains the Phase 0 foundation, Phase 1A Life Day/Today command boundary, Phase 1B local authentication, and Phase 1C daily Planner Mode/task-management slice. It still has no mobile offline replica/outbox, goals, journals, reminders, sync engine, or hosted Supabase project.

## Stack

- Monorepo: pnpm workspaces and Turborepo
- Web: Next.js App Router and TypeScript
- Mobile: Expo, React Native, TypeScript, and Expo Router
- Shared contracts: framework-free TypeScript packages and Zod validation
- Data foundation: local Supabase configuration, Auth-linked profiles, and Life Day/Today command migrations

## Prerequisites

- Node.js 22 LTS (`.nvmrc`; supported range `>=22 <25`)
- pnpm 11.10+ (Corepack-managed where available)
- Python 3.10+ for the repository verification command
- Docker Desktop (or another Docker-compatible runtime) for local Supabase migrations and RLS tests

On Windows PowerShell environments that block package-manager scripts, use `pnpm.cmd` in place of `pnpm` in the commands below.

## Local development

1. Install dependencies:

   ```bash
   corepack enable
   pnpm install
   ```

2. Start the local Supabase stack, then copy the safe public-environment templates:

   ```bash
   pnpm supabase:start
   cp apps/web/.env.example apps/web/.env.local
   cp apps/mobile/.env.example apps/mobile/.env
   ```

   PowerShell equivalent:

   ```powershell
   pnpm.cmd supabase:start
   Copy-Item apps/web/.env.example apps/web/.env.local
   Copy-Item apps/mobile/.env.example apps/mobile/.env
   ```

   In each app file, set only `*_SUPABASE_URL` and `*_SUPABASE_PUBLISHABLE_KEY` to the API URL and publishable/anon key reported by your local Supabase CLI. Do not use, copy, or commit the service-role key. Local email confirmation is disabled solely in `supabase/config.toml`, so a local email/password sign-up can be used immediately.

3. Start the web app at [http://localhost:3000](http://localhost:3000). Sign up or sign in, use Today for execution, and open [Planner Mode](http://localhost:3000/planner) to create, edit, order, schedule, prioritise, select Top 3, cancel, reschedule, and resolve unfinished tasks:

   ```bash
   pnpm --filter @personal-os/web dev
   ```

   Health route: [http://localhost:3000/api/health](http://localhost:3000/api/health)

4. Start the Expo development server. It uses the same local public configuration and supports sign-in, session restoration, Life Day wake/sleep, execution actions, and a compact online-only Planner Mode:

   ```bash
   pnpm --filter @personal-os/mobile start
   ```

   Use the Expo terminal controls to launch an emulator/device. Phase 1B does not include mobile SQLite, an offline outbox, notifications, or physical-device verification.

## Commands

| Command                    | Purpose                                                                           |
| -------------------------- | --------------------------------------------------------------------------------- |
| `pnpm format`              | Apply Prettier formatting.                                                        |
| `pnpm format:check`        | Check formatting without writing files.                                           |
| `pnpm lint`                | Lint workspace source.                                                            |
| `pnpm typecheck`           | Run strict TypeScript checks across apps and packages.                            |
| `pnpm test`                | Run framework-free Vitest unit tests.                                             |
| `pnpm build:web`           | Produce the Next.js production build.                                             |
| `pnpm validate:mobile`     | Produce a local Android Expo export; no credentials or cloud connection required. |
| `python scripts/verify.py` | Run the full required verification sequence.                                      |

## Local Supabase development

The official Supabase CLI is a pinned development dependency; it only works against the local Docker stack unless a future, explicitly approved phase adds a hosted workflow. No command below links, logs in to, or connects to Supabase Cloud.

```bash
pnpm supabase:start
pnpm supabase:reset
pnpm supabase:test
```

`supabase:reset` rebuilds the **local** database from migrations. `supabase:test` runs the pgTAP RLS suite in `supabase/tests/` against that running local database. Stop the stack with `pnpm supabase:stop` when finished.

The local migration set and pgTAP suite include Phase 1C Planner Mode coverage (`Files=4`, `Tests=58` in the latest local run). The commands remain the required validation path after every schema change.

## Dependency build-script policy

pnpm 11 uses the explicit `allowBuilds` policy in `pnpm-workspace.yaml`. Phase 0 explicitly denies the optional native `sharp` build requested transitively by Next.js because the foundation does not use `next/image`, standalone hosting, or self-hosted image optimization. Revisit and deliberately allow or deny `sharp` before introducing any of those capabilities; do not globally suppress dependency build-script decisions.

## Repository layout

```text
apps/web/                         Next.js authenticated Today and Planner Mode surfaces
apps/mobile/                      Expo Router authenticated Today and compact Planner Mode surface
packages/api-client/              Typed Supabase Auth, Today-read, and command-RPC adapters
packages/domain/                  Branded identifiers, time, revision, command metadata
packages/validation/              Zod command and environment validation schemas
packages/config/                  Typed public environment parsing
packages/database-contracts/      Database row contracts
packages/sync-contracts/          Transport-neutral command, result, and change contracts
packages/utils/                   Framework-free utilities
supabase/migrations/              Local SQL migrations
supabase/tests/                   Local pgTAP RLS tests
docs/                             Product, architecture, database, API, roadmap, decisions
```

## Documentation

- [Product](docs/PRODUCT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Database](docs/DATABASE.md)
- [API](docs/API.md)
- [Roadmap](docs/ROADMAP.md)
- [Decisions](docs/DECISIONS.md)
- [Current status](docs/CURRENT_STATUS.md)
