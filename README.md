# Personal OS

Personal OS is a private web and mobile workspace for turning long-term goals into daily execution and reflection. This repository contains the Phase 0 technical foundation plus the Phase 1A Life Day/Today backend: local SQL migrations, RLS, command RPCs, and shared contracts. It still has no authentication UI, product screens, mobile offline storage, goals, journals, reminders, sync engine, or hosted Supabase project.

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

2. Copy the safe environment templates only if you need to change public local settings. Supabase values are intentionally blank in Phase 0:

   ```bash
   cp .env.example .env
   cp apps/web/.env.example apps/web/.env.local
   cp apps/mobile/.env.example apps/mobile/.env
   ```

   PowerShell equivalent:

   ```powershell
   Copy-Item .env.example .env
   Copy-Item apps/web/.env.example apps/web/.env.local
   Copy-Item apps/mobile/.env.example apps/mobile/.env
   ```

3. Start the web foundation at [http://localhost:3000](http://localhost:3000):

   ```bash
   pnpm --filter @personal-os/web dev
   ```

   Health route: [http://localhost:3000/api/health](http://localhost:3000/api/health)

4. Start the Expo development server:

   ```bash
   pnpm --filter @personal-os/mobile start
   ```

   Use the Expo terminal controls to launch an emulator/device. This initial screen only confirms the app starts; it does not contain product functionality.

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

At the current handoff, the CLI is installed but Docker Desktop's Linux engine is not running, so local migrations and pgTAP tests could not be executed. Start Docker Desktop, then run the three commands above before relying on database behavior.

## Dependency build-script policy

pnpm 11 uses the explicit `allowBuilds` policy in `pnpm-workspace.yaml`. Phase 0 explicitly denies the optional native `sharp` build requested transitively by Next.js because the foundation does not use `next/image`, standalone hosting, or self-hosted image optimization. Revisit and deliberately allow or deny `sharp` before introducing any of those capabilities; do not globally suppress dependency build-script decisions.

## Repository layout

```text
apps/web/                         Next.js health/foundation surface
apps/mobile/                      Expo Router launch/foundation surface
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
