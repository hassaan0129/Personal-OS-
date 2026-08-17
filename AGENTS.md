# Personal OS Agent Operating Contract

## Mission and current state

Personal OS is a private, single-user web/mobile planning and execution system.
It grows from explicit Life Days and daily tasks toward goals, reflection,
reminders, progress tracking, and opt-in AI insight.

The committed baseline is Phase 1C. The current working tree intentionally
contains uncommitted Phase 1D mobile SQLite/outbox work through Phase 1D-C5:
offline task creation, editing, ordering, completion, reopening, cancellation,
and rescheduling. It has focused automated coverage but not physical-device
end-to-end proof. Read `docs/antigravity/START_HERE.md` before acting; it is the
current handoff entry point.

## Mandatory first pass

Before editing, read:

1. `docs/antigravity/START_HERE.md`
2. `README.md`
3. `docs/ARCHITECTURE.md`, `docs/CURRENT_STATUS.md`, and `docs/MOBILE_SYNC.md`
4. the relevant API/database/validation code and tests
5. `git status --short` and the applicable diff

Treat the repository and tests as authoritative over prior conversation
history. Preserve the existing dirty working tree. Never reset, clean, checkout
over, delete, or overwrite work merely to obtain a clean baseline.

## Architecture boundaries

- `apps/*` may import `packages/*`; packages must never import application code.
- `packages/domain`, `validation`, `database-contracts`, `sync-contracts`, and
  `utils` stay framework-free: no React, Expo, Next.js, or Supabase SDK imports.
- Supabase PostgreSQL is authoritative. Mobile SQLite is only a user-scoped
  local projection and durable command outbox; it is not a second source of
  truth.
- Invariant-bearing writes use typed, transactional command RPCs with an
  operation ID and expected revision. Do not add direct client writes to Life
  Days, tasks, events, or command records.
- RLS, authenticated ownership checks, idempotency, revision conflicts, redacted
  audit events, and sync hints are security boundaries. Never weaken them to
  make a client or test pass.
- Web creates one browser Supabase client. Mobile has its independent
  SecureStore-backed client. Neither uses a service-role key.

## Product invariants

- One open Life Day per user; wake and sleep are explicit; midnight and naps do
  not change it; missed sleep requires explicit repair.
- No automatic task rollover. Unfinished work requires explicit overdue,
  reschedule, or cancellation handling.
- A Life Day has at most three active Top 3 tasks, enforced in the command
  layer.
- Offline commands retain their operation ID, expected revision, dependency
  order, and user scope. Never silently rebase stale revisions or overwrite a
  newer server version.
- Journal text is private and must not appear in generic audit/change payloads.

## Safety rules

Never run without explicit user approval:

- `git reset --hard`, `git clean`, destructive checkout commands, or recursive
  deletion outside an approved temporary directory;
- `supabase db reset --linked`, destructive remote SQL, production deployments,
  store submissions, commits, pushes, dependency upgrades, or lockfile
  regeneration.

Never read, print, copy, package, or commit `.env`, `.env.local`, access tokens,
database passwords, service-role/secret keys, signing keys, certificates, or
private keys. `.env.example` files contain names/placeholders only and may be
included in handoffs. Do not access a hosted project or remote service unless
the user explicitly authorizes that exact operation.

## Scope and change discipline

Make the smallest correct change. Add tests for behavior changes and update
documentation in the same slice. Do not introduce goals, journals, reminders,
notifications, recurrence, realtime, cursor pull, AI, web offline support, or
deployment while working on the narrow Phase 1D mobile path without explicit
approval.

The next recommended task after C5 is offline Top 3 selection, but only after
the existing mobile C5 runtime matrix is exercised on a physical device or
emulator. Do not infer that physical-device testing occurred from an Expo export.

## Verification expectations

Run focused tests first, then direct mobile TypeScript/lint checks for mobile
changes. Run `python scripts/verify.py` before handoff when the environment
permits it, and report every blocked or failing stage honestly. Docker/local
Supabase migration and pgTAP validation are required after database changes;
do not run destructive remote equivalents. Do not claim device testing unless
it was actually performed.

Useful commands:

```text
pnpm --filter @personal-os/mobile test
pnpm --filter @personal-os/mobile typecheck
pnpm --filter @personal-os/mobile lint
pnpm test
pnpm supabase:reset       # local Docker only, after approved local schema work
pnpm supabase:test        # local Docker only
python scripts/verify.py
git diff --check
```

On restricted Windows PowerShell, use `pnpm.cmd`.

## Antigravity delegation map

Use `.agents/agents/personal-os-orchestrator/agent.md` for planning and
integration. Delegate bounded work only:

- `architecture-reviewer`: read-only contract, package-boundary, and design review.
- `mobile-offline-sync`: Expo SQLite, outbox, IDs, ordering, retries, conflicts,
  merge, lifecycle recovery, and account isolation.
- `supabase-database`: migrations, RLS, command RPCs, revisions, idempotency,
  pgTAP, and hosted-development migration review.
- `web-nextjs`: Next.js UI, typed adapters, browser singleton, accessibility,
  web tests/builds.
- `qa-verification`: read-only test planning/execution and precise evidence.
- `security-auditor`: read-only secret, RLS, authorization, and bundle audit.
- `documentation-maintainer`: implementation/status documentation only.
- `release-readiness`: planning/audit for future EAS, stores, hosted Supabase,
  web release, and privacy readiness; never deploy.

The orchestrator must inspect the worktree first, plan before edits, preserve
uncommitted work, require completion evidence, and never auto-approve a
destructive action.
