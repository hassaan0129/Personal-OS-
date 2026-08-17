# Repository Map

Last inspected: 2026-07-28. Generated/dependency folders are intentionally omitted.

```text
personal-os/
├── AGENTS.md                         Repository workflow and architecture boundaries
├── README.md                         Setup, commands, current feature summary
├── package.json                      Root scripts, engines, developer tools
├── pnpm-workspace.yaml               Workspace globs and pnpm build policy
├── pnpm-lock.yaml                    Locked dependency graph (currently modified)
├── turbo.json                        Task dependency/output graph
├── tsconfig.base.json                Shared strict TypeScript configuration
├── eslint.config.mjs                 ESLint rules and generated-path ignores
├── .gitignore                        Generated/local-file exclusions
├── .nvmrc                            Intended Node runtime version
├── .env.example                      Shared public environment template
├── apps/
│   ├── web/
│   │   ├── app/layout.tsx            Next.js root layout
│   │   ├── app/page.tsx              `/` route; renders Today client
│   │   ├── app/today-client.tsx      Authenticated Today and Planner interaction surface
│   │   ├── app/planner/page.tsx      `/planner` route; Planner Mode entry
│   │   ├── app/api/health/route.ts   `/api/health` route
│   │   ├── lib/supabase.ts           Browser-only singleton client
│   │   ├── lib/supabase.test.ts      Singleton regression test
│   │   ├── globals.css               Web styles
│   │   ├── next.config.ts            Shared-package transpilation
│   │   ├── package.json              Web commands/dependencies
│   │   ├── tsconfig.json             Next TypeScript configuration
│   │   └── .env.example              Public web variable template
│   └── mobile/
│       ├── app/_layout.tsx           Expo Router root Stack
│       ├── app/index.tsx             Single Today/Planner/auth screen
│       ├── lib/supabase.ts           SecureStore-backed mobile client singleton
│       ├── lib/local-store.ts        Uncommitted SQLite schema/store foundation
│       ├── lib/local-command-engine.ts Uncommitted optimistic-command engine
│       ├── lib/outbox-processor.ts   Uncommitted isolated RPC outbox processor
│       ├── lib/local-command-engine.test.ts Uncommitted engine tests
│       ├── app.json                  Expo metadata/plugins
│       ├── package.json              Expo commands/dependencies
│       ├── tsconfig.json             Mobile TypeScript configuration
│       └── .env.example              Public mobile variable template
├── packages/
│   ├── api-client/src/index.ts       Typed Supabase Auth and RPC adapters
│   ├── api-client/src/index.test.ts  Adapter tests
│   ├── config/src/                   Public environment schemas/parsers
│   ├── database-contracts/src/       Profile/Life Day/task/Today read contracts
│   ├── domain/src/                   IDs, time, revisions, Life Day/task/planner rules
│   ├── sync-contracts/src/           Command result and sync-change contracts
│   ├── utils/src/                    Generic assertions
│   └── validation/src/               Zod schemas and validation tests
├── supabase/
│   ├── config.toml                   Local Supabase/Auth configuration
│   ├── migrations/                   Ordered PostgreSQL migrations
│   └── tests/database/               pgTAP RLS/RPC test files
├── scripts/
│   ├── verify.py                     Canonical non-mutating verification runner
│   ├── verify.cmd|ps1|sh             Platform wrappers
│   └── record_lesson.py              Lesson-record helper
├── docs/                             Product, architecture, decision, status, handoff docs
├── .github/workflows/verify.yml      Pull-request verification workflow
├── .codex/                           Local Codex safety, secret-scan, and stop hooks
└── .agents/                          Not present in the inspected working tree
```

## Application entry points and routes

| Surface | Entry point | Routes/behavior |
| --- | --- | --- |
| Web | `apps/web/app/layout.tsx` | Next App Router root |
| Web Today | `apps/web/app/page.tsx` | `/` renders `TodayClient` |
| Web Planner | `apps/web/app/planner/page.tsx` | `/planner` enables Planner Mode |
| Web health | `apps/web/app/api/health/route.ts` | `/api/health` |
| Mobile | `apps/mobile` package `main: expo-router/entry` | Expo Router application |
| Mobile screen | `apps/mobile/app/index.tsx` | One Today screen with in-place Planner Mode toggle |

## Database migration order

1. `20260717000000_create_profiles.sql` — Auth-linked profiles, owner RLS, profile trigger.
2. `20260717010000_add_life_day_today_foundation.sql` — Life Days, tasks, command/idempotency records, task/change/sync events, RLS, and base command RPCs.
3. `20260718010000_add_today_read_rpcs.sql` — owner-scoped current Life Day/Today read RPCs.
4. `20260718020000_add_planner_mode_task_commands.sql` — `is_top_three`, planner command RPCs, unfinished-task resolution, and Top 3 constraint logic.

## Test locations

| Location | Coverage evidence |
| --- | --- |
| `packages/domain/src/*.test.ts` | Life Day, task transition, planner grouping rules |
| `packages/validation/src/common.test.ts` | Command/config schema validation |
| `packages/config/src/web.test.ts` | Public web configuration parsing |
| `packages/api-client/src/index.test.ts` | Auth/Today/command adapter behavior |
| `packages/utils/src/assertions.test.ts` | Utility behavior |
| `apps/web/lib/supabase.test.ts` | Web singleton client behavior |
| `apps/mobile/lib/local-command-engine.test.ts` | Uncommitted local engine tests |
| `supabase/tests/database/*.test.sql` | pgTAP RLS, Life Day/Today/planner command behavior |

## Important configuration files

- `package.json`: root task commands; Node `>=22 <25`; pnpm 11.10.
- `pnpm-workspace.yaml`: workspace packages plus explicit `sharp: false` build policy.
- `.npmrc`: hoisted node linker, strict peer dependencies, shared lockfile.
- `turbo.json`: dependency graph for lint/test/typecheck/build/validate.
- `tsconfig.base.json`: strict package baseline; apps extend platform-specific configs.
- `eslint.config.mjs`: JavaScript/TypeScript lint config.
- `supabase/config.toml`: local API/database/Auth configuration; no hosted project reference.
- `.github/workflows/verify.yml`: Linux PR workflow with frozen install then `python scripts/verify.py`.
- `.codex/hooks.json`: local command policy, changed-file secret scan, and verification-on-stop hook.

## Current-tree cautions

- The Phase 1D-A files and dependencies are uncommitted.
- `personal-os-context.zip` is untracked and outside the documented source architecture.
- Local `.env`/`.env.local`, dependency directories, build output, and Supabase temporary state are ignored and intentionally not mapped.
