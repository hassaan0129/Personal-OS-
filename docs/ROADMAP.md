# Roadmap

Last updated: 2026-07-18
Status: Phase 0, Phase 1A, Phase 1B, and the narrow Phase 1C daily Planner Mode flow are implemented. Later product work remains planned.

## Delivery principles

- Each phase ends with a usable, testable slice and an explicit decision to continue.
- Keep invariant-bearing writes behind tested commands and do not weaken RLS to simplify a client.
- Do not promise offline support until a replica, outbox, recovery flow, and conflict tests exist.
- Do not add goals, journals, notifications, recurrence, sharing, or AI to an incomplete Today foundation.

## Completed foundation

- [x] Phase 0: pnpm/Turborepo, Next.js, Expo Router, framework-free shared contracts, strict checks, CI, and local Supabase project structure.
- [x] Phase 1A: Life Day/task schema, command RPCs, idempotency, revision conflicts, audit/change records, RLS, and local pgTAP coverage.
- [x] Phase 1B: local email/password auth, session restoration, profile/current-Life-Day/Today read RPCs, typed client adapters, and minimal web/mobile Today actions.
- [x] Phase 1C: daily Planner Mode, task editing/order/scheduling/Top 3, unfinished-task resolution, and web/mobile online-only controls.
- [x] Local migration reset and pgTAP validation (58 tests on 2026-07-18).

## Phase 1D - Offline Today synchronization

**Outcome:** Mobile can safely use the narrow Today workflow while offline and reconcile exactly once when it reconnects.

- [ ] Add a user-bound mobile SQLite Today replica and encrypted/cleared-on-sign-out local lifecycle.
- [ ] Add a durable command outbox for supported wake, sleep, create-task, and complete-task commands.
- [ ] Pull cursor-based changes and hydrate a snapshot on cursor expiry; do not add realtime subscriptions yet.
- [ ] Surface pending, retried, rejected, and revision-conflict states with deterministic recovery.
- [ ] Test offline retry/idempotency, sign-out clearing, stale revision, duplicate completion, and lost-network recovery.

**Exit criteria:** supported Today commands survive reconnect without duplicate writes or silent data loss, and the app clearly presents unresolved conflicts.

## Phase 2 - Goals and period planning

**Outcome:** The user can connect long-term goals and projects to selected month/week priorities and daily work.

- [ ] Add goals, projects, planning periods, period-goal links, ordering, history, and owner-scoped commands.
- [ ] Build month/week planning reads and edits for web and mobile; daily Planner Mode remains a separate implemented slice.
- [ ] Define and test period boundaries, travel/time-zone behavior, and planning conflicts.

## Phase 3 - Execution and Progress Tracking

**Outcome:** Focused work and accepted task events produce traceable progress.

- [ ] Add execution sessions, metrics/measurements, documented rollup rules, and derived read models.
- [ ] Implement execution commands and progress views with auditability.

## Phase 4 - Reminders, Journals, and History

**Outcome:** Private reflection, recoverable edits, and best-effort mobile reminders.

- [ ] Add private journal revisions/attachments and redacted generic audit history.
- [ ] Add reminder schedules, delivery records, mobile permissions, and provider-safe delivery handling.
- [ ] Add user-visible history, trash/restore, and retention behavior.

## Phase 5 - Hardening and beta readiness

- [ ] Evaluate PWA/web offline scope separately.
- [ ] Add observability, export/delete workflows, restore drills, accessibility review, and load/security tests.
- [ ] Establish preview/staging/release workflows without exposing production credentials.

## Phase 6 - Opt-in AI analysis

- [ ] Define consent, redacted inputs, retention, provenance, and approval-gated recommendation flow.
- [ ] Store insights separately; AI never applies source-of-truth changes without user approval.
