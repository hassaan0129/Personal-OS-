# Roadmap

Last updated: 2026-07-17
Status: Phase 0 is complete. Phase 1A backend foundation is implemented pending local Supabase migration/RLS validation; subsequent user-facing work remains planned.

## Delivery principles

- Each phase ends with a usable, testable slice and an explicit decision to continue.
- Build database/RLS, command history, and sync foundations before screens that depend on them.
- Do not promise full offline support until the sync spike and conflict/recovery tests pass.
- Never add AI, sharing, recurrence, or broad integrations to compensate for an incomplete core flow.

## Phase 1A: Life Day and Today backend foundation

**Outcome:** The backend has a narrow, auditable command boundary before any product surface is built.

- [x] Add Life Day, task, task-event, command-operation, audit-event, and sync-change migrations/RLS/command functions.
- [x] Add explicit wake, sleep, repair, task create/update/complete/reschedule/cancel commands with idempotency and revision checks.
- [x] Add framework-free domain, validation, database, and sync contracts plus unit tests.
- [x] Add a local pgTAP RLS suite and reproducible Supabase CLI commands.
- [ ] Run local `supabase db reset` and `supabase test db` once Docker Desktop is available.

**Exit criteria:** local migrations and pgTAP RLS tests pass; all command invariants are exercised against Postgres; no hosted connection is introduced.

## Phase 0 — Planning and foundation

**Outcome:** A runnable monorepo and a proven security/sync foundation, with no production deployment.

- [ ] Confirm the open product decisions in `PRODUCT.md` and record accepted answers in `DECISIONS.md`.
- [ ] Initialize `pnpm` workspace/Turborepo, Node version policy, `apps/web`, `apps/mobile`, and framework-free shared packages.
- [ ] Establish formatting, linting, type checking, unit/integration tests, secret scanning, and a truthful `python scripts/verify.py`.
- [ ] Create local/dev Supabase project configuration, migration workflow, private schemas, Auth configuration, and RLS test harness; do not use production data.
- [ ] Implement profile/device registration and authenticated command envelope with correlation/idempotency.
- [ ] Build an offline-sync spike: Expo SQLite replica/outbox, push/pull cursor, duplicate retry, stale revision, tombstone, snapshot reset, and device sign-out tests.
- [ ] Decide PWA scope and notification provider abstraction; prove one non-sensitive local mobile notification and one server-triggered development push.

**Exit criteria:** web and mobile compile in the monorepo; owner/non-owner RLS tests pass; an offline task-like fixture survives reconnect exactly once; verification command covers the real checks; no external service is deployed to production.

## Phase 1 — Today / Life Days

**Outcome:** A user can sign in, wake, see Today, manage a small daily task list, and sleep from either client.

- [ ] Implement profiles/time-zone onboarding and device lifecycle.
- [ ] Add Life Day, daily plan, task, task-event, and change-event migrations/RLS/command functions.
- [ ] Build `life_day.wake`, `life_day.sleep`, task create/edit/complete/defer/reschedule, and Today read model.
- [ ] Implement mobile local replica/outbox for this narrow surface and web online-first experience with clear stale/offline states.
- [ ] Add user-visible history for wake/sleep and task changes.
- [ ] Add focused tests for duplicate wake/sleep, time-zone/DST, task completion retry, day closing with unfinished tasks, permission denial, and recovery after a failed sync.

**Exit criteria:** a private user can complete the wake → task → sleep journey without duplicate mutations or silent data loss; history and cross-device refresh work; supported offline states are visible and tested.

## Phase 2 — Goals and Planner Mode

**Outcome:** The user can connect long-term direction to the current month, week, and daily plan.

- [ ] Add goals, projects, periods, period goals, task-plan items, ordering, and audit/sync migrations.
- [ ] Implement month/week planning reads and domain commands with revision conflicts for concurrent edits/reorder.
- [ ] Build Planner Mode for web and mobile with linking, prioritization, placement, explicit carry-forward/defer choices, and empty/loading/error/conflict states.
- [ ] Add planning-period generation policy and tests for boundaries/time zones.
- [ ] Document and test no-goal/no-project capture flow so fast task capture remains frictionless.

**Exit criteria:** selected weekly/monthly priorities appear in daily planning; stale planning edits cannot silently overwrite another device; order is deterministic and recoverable.

## Phase 3 — Execution Mode and progress tracking

**Outcome:** The user can focus, record work, and see trustworthy progress from accepted data.

- [ ] Add execution sessions, progress metric/measurement model, and derived read views.
- [ ] Implement start/pause/resume/end execution and task transition commands.
- [ ] Build progress screens for daily/weekly/monthly, projects, and goals; clearly distinguish derived and manual values.
- [ ] Decide/freeze rollup formulas and historical recalculation policy.
- [ ] Test idempotent completion, concurrent execution state, measurement units, empty metrics, and rollup correctness.

**Exit criteria:** progress totals are calculated server-side from documented inputs, remain consistent across clients, and are traceable back to tasks/events/measurements.

## Phase 4 — Reminders, journal, and complete edit history

**Outcome:** The user can schedule reliable-enough reminders, reflect privately, and inspect/restore changes.

- [ ] Add reminders/delivery/receipt schema, Edge Functions, cron jobs, and device schedule reconciliation.
- [ ] Implement mobile permissions, local scheduling horizon, remote push delivery, invalid-token cleanup, quiet hours, and notification privacy defaults.
- [ ] Add private journal revisions, attachment authorization/storage, history UI, restore flows, retention/export/deletion policy.
- [ ] Add in-app web reminders; implement Web Push only if approved as a requirement.
- [ ] Test provider failures, notification permission denial, DST, duplicate job retries, lost-device local data, journal revision conflict, and attachment authorization.

**Exit criteria:** reminders have measurable delivery outcomes, journal bodies are protected from generic logs/history, and restore creates a new auditable revision.

## Phase 5 — PWA/offline expansion, hardening, and beta

**Outcome:** The core system is ready for a private beta with documented recovery and operations.

- [ ] If approved, add browser IndexedDB outbox/cache and service worker with explicit shared-device privacy controls.
- [ ] Load-test user-scoped sync/history/reminder workloads; refine indexes/retention/partitions based on evidence.
- [ ] Add observability, backup/restore drill, data export/delete workflows, accessibility audit, and device-loss/sign-out verification.
- [ ] Establish preview/staging environments, release channels, app-store/privacy materials, incident runbook, and support diagnostics without personal content.

**Exit criteria:** security/RLS review, sync chaos tests, restore drill, privacy review, accessibility checks, and full verification pass in a non-production environment.

## Phase 6 — Opt-in AI analysis (later)

**Outcome:** Optional, explainable insights that never replace the user’s source-of-truth data.

- [ ] Define consent, allowed sources, retention, provider terms, cost controls, and delete/export behavior.
- [ ] Expose a least-privilege redacted analysis view; do not grant AI jobs direct write access to planning tables.
- [ ] Store generated insights as separable artifacts with model/version/input provenance and user feedback.
- [ ] Evaluate accuracy, privacy leakage, prompt injection from journal content, and harmful recommendations before beta use.

**Exit criteria:** explicit user opt-in, safe failure mode, auditability, and independent security/privacy review.

## Not planned until a new product decision

- Collaboration, sharing, families/teams, delegation, and permissions beyond the owner.
- Full recurrence/habit engine and calendar sync.
- End-to-end encryption, multi-region residency, regulated compliance, or guaranteed-delivery alerting.
- Import from third-party task/journal systems.

## Phase-wide verification

Every implementation phase must add relevant unit, API/RLS, migration, sync, and user-flow tests; run the final project command `python scripts/verify.py` before handoff. Manual checks must cover loading, empty, offline, permission-denied, conflict, retry, and sign-out/device-loss states for any changed flow.
