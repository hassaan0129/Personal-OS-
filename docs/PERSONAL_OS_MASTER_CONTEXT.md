# Personal OS — Master Context and Safe Continuation Prompt

Last reconstructed: 2026-07-28

## 1. Product

Personal OS is a private, single-user web and mobile application that turns plans into daily execution.

The long-term product direction includes:

- goals and projects
- monthly and weekly planning
- daily planning
- Life Days that begin at wake and end at sleep
- task execution
- journals and history
- reminders
- progress tracking
- offline-capable mobile usage
- future opt-in AI insights

The currently implemented product is intentionally narrower and centers on the Life Day, Today, and daily Planner workflow.

## 2. Current implemented baseline

### Phase 0 — Repository foundation

Implemented:

- pnpm workspaces
- Turborepo
- strict TypeScript
- Next.js web application
- Expo Router mobile application
- framework-free shared packages
- local Supabase project
- Vitest, pgTAP, ESLint, Prettier, CI, and verification scripts

### Phase 1A — Life Day and task backend

Implemented locally:

- Auth-linked profiles
- Life Days
- tasks
- command operation/idempotency records
- task events
- redacted change events
- sync cursor hints
- Row Level Security
- revision-aware transactional command RPCs

Life Day commands:

- start Life Day
- close Life Day
- repair a forgotten previous Life Day

Task commands:

- create
- update
- complete
- reschedule
- cancel

### Phase 1B — Authentication and Today

Implemented locally:

- email/password sign-up and sign-in
- session restoration
- SecureStore-backed mobile Auth session
- browser Supabase singleton
- current Life Day read RPC
- Today task read RPC
- Today snapshot RPC
- typed API adapters
- basic web and mobile Today interactions

### Phase 1C — Daily Planner Mode

Implemented locally:

- task creation and editing
- priority selection
- scheduled and flexible tasks
- task estimates
- manual ordering
- Top 3 selection
- maximum-three Top 3 database invariant
- task reopening
- unfinished task resolution
- explicit overdue, reschedule, or cancellation before closing a Life Day
- web Planner route
- compact mobile Planner Mode

## 3. Current working-tree status

The committed baseline is Phase 1C.

There is also in-progress Phase 1D-A mobile offline work in the current tree:

- Expo SQLite local schema
- user-scoped Today snapshots
- durable outbox records
- sync/conflict state tables
- temporary task-ID mappings
- optimistic local command engine
- isolated outbox processor
- focused unit tests

This is not yet an end-to-end offline feature.

The mobile UI does not currently use the local command engine. Queued commands are not fully submitted and reconciled. Temporary task IDs are not yet replaced with authoritative server IDs throughout dependent commands. Connectivity, retries, sign-out clearing, conflict UX, and full snapshot hydration are incomplete.

## 4. Architecture

### Applications

- `apps/web`: Next.js App Router web application
- `apps/mobile`: Expo React Native mobile application

### Shared packages

- `@personal-os/domain`: business rules, IDs, revisions, Life Day and task behavior
- `@personal-os/validation`: Zod schemas
- `@personal-os/database-contracts`: typed database/read contracts
- `@personal-os/sync-contracts`: command and sync result contracts
- `@personal-os/api-client`: only shared package that imports Supabase JavaScript client
- `@personal-os/config`: public runtime configuration parsing
- `@personal-os/utils`: generic utilities

### Backend

- Supabase Auth establishes identity
- PostgreSQL is authoritative
- RLS restricts owner data
- invariant-bearing writes go through transactional `SECURITY DEFINER` command RPCs
- clients use only the public/publishable key
- no hosted Supabase project is configured
- no service-role key belongs in web or mobile code

### Sync direction

- mobile SQLite is intended to be a local projection and durable outbox
- server commands remain authoritative
- operation IDs provide idempotency
- expected revisions provide conflict detection
- Realtime, when added later, should only signal freshness
- canonical recovery should use cursor-based pull/snapshot hydration

## 5. Important product invariants

- One open Life Day per user.
- A Life Day starts only through an explicit wake command.
- A Life Day ends only through an explicit sleep command.
- Midnight and naps do not automatically alter a Life Day.
- A forgotten sleep requires an explicit repair.
- Tasks do not automatically roll over.
- Unfinished tasks must be explicitly kept overdue, rescheduled, or cancelled.
- No more than three active Top 3 tasks may exist for a Life Day.
- Task and Life Day writes use operation IDs and expected revisions.
- Direct client task writes must remain denied.
- Offline retries must not create duplicate server writes.
- User-scoped local data must not leak across account changes.

## 6. Known issues and risks

- The complete verification suite was not successfully re-run in the handoff environment because pnpm attempted a network-dependent dependency operation in a non-interactive shell. This does not prove TypeScript, lint, test, or build failures.
- The correct local baseline must be restored under Node 22 LTS and pnpm 11.10.
- Local Supabase migrations and pgTAP tests must be rerun.
- Phase 1D-A is uncommitted/incomplete and needs an explicit retain/revise/remove decision.
- `AGENTS.md` describes Phase 1B even though Phase 1C is committed and Phase 1D-A exists in progress.
- The design-system document is still mostly a template.
- Web and mobile main screens are large and should later be split for testability.
- No physical-device mobile verification is proven.
- No hosted backend, production Auth policy, deployment, recovery flow, notifications, goals, journals, recurrence, or AI exists.

## 7. Immediate recommended objective

Do not add goals, journals, reminders, notifications, AI, realtime, web offline support, or deployment yet.

First complete the mobile Phase 1D transport and reconciliation slice:

1. restore and verify the committed baseline
2. review and isolate the Phase 1D-A changes
3. test the SQLite repository against real Expo-compatible SQLite
4. submit queued commands through existing typed RPC adapters
5. reconcile successful server acknowledgements
6. replace temporary task IDs with server IDs
7. rewrite dependent queued command payloads safely
8. preserve operation IDs and command ordering
9. add bounded retry and lifecycle processing
10. expose pending and explicit conflict states only after reconciliation is reliable

## 8. Safe Codex continuation prompt

Paste the following into Codex while the repository root is open:

---

You are continuing development of the existing Personal OS repository.

Before changing anything, read:

- `README.md`
- `AGENTS.md`
- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/CURRENT_STATUS.md`
- `docs/MOBILE_SYNC.md`
- `docs/ROADMAP.md`
- `docs/DECISIONS.md`
- `docs/API.md`
- `docs/DATABASE.md`

Then inspect:

- `git status`
- `git diff`
- package scripts
- current mobile SQLite/outbox files
- existing unit and pgTAP tests

Important repository state:

- Phase 1C is the committed baseline.
- Phase 1D-A mobile SQLite/outbox work is present but incomplete and may be uncommitted.
- Do not claim that mobile is offline-capable.
- Do not add unrelated product features.
- Do not expose or print environment secrets.
- Do not add a service-role key to client code.
- Do not weaken RLS or bypass command RPCs.

First task:

Prepare a non-destructive implementation plan for Phase 1D-B transport and acknowledgement reconciliation.

The plan must cover:

1. the exact current execution path
2. files that will change
3. how queued commands use the existing typed RPC adapters
4. dependency ordering for commands targeting temporary task IDs
5. successful create acknowledgement mapping from temporary task ID to server task ID
6. rewriting dependent queued payloads after mapping
7. authoritative revision and snapshot reconciliation
8. duplicate acknowledgement/idempotent retry handling
9. rejected and conflict result classification
10. tests using an Expo-compatible SQLite repository
11. verification commands
12. rollback and data-loss risks

Do not edit code until the plan is presented.

After approval, implement only the smallest tested vertical slice:

- one offline-created task
- one queued dependent command for that task
- successful server create acknowledgement
- temporary-to-server ID replacement
- dependent payload rewrite
- exactly-once submission behavior through stable operation IDs

Acceptance criteria:

- the create command is submitted before its dependent command
- the server task ID replaces the temporary ID transactionally
- dependent queued payloads reference the server ID before submission
- retries do not create duplicate authoritative tasks or events
- user-scoped data remains isolated
- failure midway leaves a recoverable outbox state
- focused tests pass
- relevant documentation is updated
- `python scripts/verify.py` is run before completion, with failures reported honestly

Do not push, deploy, link a hosted Supabase project, or run production migrations.

---

## 9. Local verification sequence

From the repository root:

```powershell
node --version
pnpm.cmd --version
pnpm.cmd install --frozen-lockfile
python scripts/verify.py
pnpm.cmd supabase:start
pnpm.cmd supabase:reset
pnpm.cmd supabase:test
git status --short
git diff --check
```

Expected runtime:

- Node.js 22 LTS
- pnpm 11.10.x
- Docker Desktop running for Supabase checks

Never paste `.env` contents or service-role credentials into ChatGPT or Codex.
