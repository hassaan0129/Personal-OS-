# Architecture and Product Decisions

Last updated: 2026-07-17
Status legend: **accepted** = recommended planning baseline; **proposed** = requires product-owner confirmation before implementation.

## ADR-0013: Explicitly deny the optional `sharp` install build in Phase 0

**Status:** accepted

`sharp` is an optional Next.js dependency that requests an install-time build
script. Phase 0 does not use `next/image`, standalone hosting, or self-hosted
image optimization, so `pnpm-workspace.yaml` explicitly sets
`allowBuilds.sharp: false`. This preserves pnpm 11's per-dependency build
policy without suppressing warnings globally.

Before adding any of those image capabilities, revisit this decision, enable
the required `sharp` build explicitly, and verify the affected deployment
environment supports its native binary requirements.

## ADR-0001: Adopt a TypeScript monorepo for web and mobile

- **Date:** 2026-07-17
- **Status:** accepted
- **Context:** The product has a Next.js web client, an Expo mobile client, shared planning rules, sync contracts, and coordinated migrations.
- **Decision:** Use `pnpm` workspaces and Turborepo, with separate `apps/web` and `apps/mobile`, and framework-free shared packages for domain rules, sync contracts, API client, and configuration.
- **Alternatives considered:** Separate repositories; a single Expo app for web and mobile; a shared UI kit from day one.
- **Consequences:** Shared contracts reduce drift but require workspace/version discipline. Share logic, not UI, in v1; platform screens remain independent.
- **Migration/rollback:** Packages are private and can be extracted later if release cadence diverges.

## ADR-0002: Use Next.js App Router for web and Expo React Native for mobile

- **Date:** 2026-07-17
- **Status:** accepted
- **Context:** Web needs desktop-quality planning, browser accessibility, and PWA potential; mobile needs native SQLite, notifications, and app-store delivery.
- **Decision:** Next.js App Router is the web client; Expo React Native is the iOS/Android client.
- **Alternatives considered:** React Native Web only; native Swift/Kotlin; Flutter.
- **Consequences:** Two UI implementations require discipline, but each platform can use appropriate navigation/accessibility. Expo development builds are required for push testing.
- **Migration/rollback:** Domain and transport contracts are platform independent.

## ADR-0003: Supabase Postgres is the authoritative backend

- **Date:** 2026-07-17
- **Status:** accepted
- **Context:** Goals, projects, planning periods, tasks, history, progress, reminders, and future analysis are relational and benefit from transactions and SQL.
- **Decision:** Use Supabase Auth, Postgres, RLS, Storage, Realtime, Edge Functions, and scheduled jobs. Manage schema in repository SQL migrations.
- **Alternatives considered:** Firebase/Firestore, custom Node/ORM/Postgres backend, hosted SQLite/sync products.
- **Consequences:** Supabase simplifies Auth/RLS/jobs but requires strong SQL/RLS review and creates managed-platform dependency. Firestore’s built-in offline persistence is attractive but its document model and last-write-wins conflict behavior fit this domain less well.
- **Migration/rollback:** Preserve portable SQL migrations and provider-independent domain contracts; add export tooling before beta.

## ADR-0004: Treat Realtime as an invalidation signal, not sync

- **Date:** 2026-07-17
- **Status:** accepted
- **Context:** WebSocket subscriptions can disconnect in background and do not provide an offline outbox, ordered catch-up, or conflict policy.
- **Decision:** Realtime messages carry only a freshness/cursor hint. Clients always use authenticated cursor-based pull after reconnect, foreground, periodic refresh, and a signal.
- **Alternatives considered:** Postgres Changes as the client database feed; polling only; Realtime as canonical patch stream.
- **Consequences:** More explicit server/client protocol work, but predictable recovery and lower fan-out dependence. Use Broadcast rather than broad row-change subscriptions where possible.
- **Migration/rollback:** The client sync interface permits later replacement of the transport.

## ADR-0005: Implement a durable outbox and optimistic revision protocol

- **Date:** 2026-07-17
- **Status:** accepted
- **Context:** Mobile must work offline and cross-device edits must not silently disappear or duplicate.
- **Decision:** Mobile uses Expo SQLite for a local replica and outbox. Each mutation has operation/device ids, base revision, idempotent server processing, ordered sync changes, tombstones, snapshot recovery, and explicit conflict results. Web offline persistence is deferred behind a PWA decision.
- **Alternatives considered:** Last-write-wins direct CRUD; CRDTs; Firebase offline sync; PowerSync/Electric from the start.
- **Consequences:** This is the largest custom subsystem and must be spiked/tested before product work. CRDTs are avoided until collaboration/text-merge needs justify their complexity.
- **Migration/rollback:** Keep `packages/sync` independent of Supabase client implementation. Consider a PowerSync/Electric evaluation only if the spike or beta metrics show unacceptable complexity/conflicts.

## ADR-0006: Route invariant-bearing mutations through commands

- **Date:** 2026-07-17
- **Status:** accepted
- **Context:** Wake/sleep, task transitions, planner ordering, reminder scheduling, journal revisions, history, and sync changes must commit together.
- **Decision:** Use transactional Postgres RPC/command functions for core mutations; use Edge Functions for privileged/provider-facing work. Limit direct client CRUD to narrow RLS-protected reads and low-risk records explicitly approved later.
- **Alternatives considered:** Direct Supabase CRUD for all writes; a standalone API server for every operation.
- **Consequences:** More SQL/function testing, but integrity, audit, and idempotency live in one transaction. A separate server can be introduced only if provider/workflow complexity requires it.
- **Migration/rollback:** Version commands and keep adapters for the minimum mobile support window.

## ADR-0007: Model Life Days from explicit wake and sleep events

- **Date:** 2026-07-17
- **Status:** accepted
- **Context:** Calendar days and lived days diverge around sleep, travel, naps, and missed check-ins.
- **Decision:** A Life Day starts only through an explicit wake command and ends only through an explicit sleep command. There is at most one open day per user. Its `operational_date` is derived from the submitted wake instant in that command's validated IANA zone; the wake and sleep zones are preserved. Midnight and naps have no lifecycle effect. A new wake while a day remains open returns `repair_required`; an explicit repair command records the missing sleep time and structured reason. No automatic task rollover occurs.
- **Alternatives considered:** Calendar-day-only model; automatic midnight rollover; free-form multiple wake/sleep intervals.
- **Consequences:** Supports travel without silently changing a historical Life Day. It requires clients to collect and preserve the relevant zone, and makes forgotten sleep a visible repair flow rather than an inferred timestamp.
- **Migration/rollback:** Start with simple boundaries; add sleep segments only if real use requires them.

## ADR-0008: Start reminders with canonical server schedule and best-effort mobile delivery

- **Date:** 2026-07-17
- **Status:** accepted for architecture; channel/product defaults proposed
- **Context:** Local schedules survive short offline periods, but server schedules are needed for multiple devices, updates, receipts, and reliability visibility.
- **Decision:** Store local wall-clock intent/time zone and calculated next fire centrally. Schedule a rolling local mobile horizon; use cron + Edge Function to claim/send remote push; store receipts and invalid tokens. Start web with in-app reminders, add Web Push/PWA separately.
- **Alternatives considered:** Device-only reminders; server push only; direct FCM/APNs; third-party engagement platform.
- **Consequences:** Delivery is best effort and must not be treated as action proof. Expo Push is behind a provider interface; advanced delivery can change later.
- **Migration/rollback:** Initial reminders are one-time only; defer recurrence until DST/missed/quiet-hour semantics are approved.

## ADR-0009: Make journal content private and revisioned without E2EE in v1

- **Date:** 2026-07-17
- **Status:** accepted
- **Context:** Journal text is highly sensitive, but full client-side encryption constrains search, recovery, sharing, and future analytics.
- **Decision:** Use private RLS rows, private Storage, provider encryption at rest/in transit, local-cache clearing on sign-out, redacted audit logs, and immutable journal revisions. AI has no access unless a later opt-in design approves it.
- **Alternatives considered:** Client-held end-to-end encryption from day one; no history; store journal text in generic audit events.
- **Consequences:** Provider operators may be within the technical trust boundary; this must be acceptable to the product owner before release. E2EE later is a distinct architecture project, not a settings toggle.
- **Migration/rollback:** Keep journal body isolated in revisions so encryption/retention can evolve without rewriting generic audit data.

## ADR-0010: Use append-only domain/audit events plus mutable projections

- **Date:** 2026-07-17
- **Status:** accepted
- **Context:** The product requires progress tracking, edit history, sync recovery, and future analysis without corrupting current views.
- **Decision:** Keep current state in normalized mutable tables and create append-only task/life-day/progress/change events for accepted actions. Generic history stores redacted summaries; journal revisions retain their own text history.
- **Alternatives considered:** Full event sourcing; mutable tables only; audit snapshots containing all user text.
- **Consequences:** Gains traceability without full event-sourcing complexity. Retention/index/partition decisions are required as volume grows.
- **Migration/rollback:** Derived views can be rebuilt from state/events subject to declared retention.

## ADR-0011: Defer AI analysis behind explicit consent and isolated artifacts

- **Date:** 2026-07-17
- **Status:** accepted
- **Context:** Future AI could analyze goals/progress/journals, but personal data sensitivity and model errors are material risks.
- **Decision:** Do not implement AI in core phases. Later, use an opt-in, least-privilege/redacted analysis view and store generated output as separate, versioned insight artifacts with no direct write access to source-of-truth tables.
- **Alternatives considered:** AI features in initial launch; unrestricted database access; embedding AI text in task history.
- **Consequences:** Slower feature delivery but clear privacy, cost, and audit boundaries.
- **Migration/rollback:** AI artifacts can be disabled/deleted without changing planning data.

## ADR-0012: Defer collaboration and recurrence

- **Date:** 2026-07-17
- **Status:** accepted
- **Context:** Both features alter tenancy, authorization, conflict, notification, and data-retention behavior substantially.
- **Decision:** First release is one private owner and one-time reminders/tasks. Do not encode premature team roles or a generic recurrence engine.
- **Alternatives considered:** Multi-user from launch; broad RRULE support from launch.
- **Consequences:** Simpler RLS/sync and faster validation of personal workflow. Future additions require dedicated ADRs and migrations.
- **Migration/rollback:** `user_id` ownership is explicit, enabling later workspace membership migration; no collaboration claim is made before then.

## ADR-0014: Start local authentication with email and password

- **Date:** 2026-07-18
- **Status:** accepted
- **Context:** Phase 1B needs one usable private-user authentication path without hosted credentials or a provider integration.
- **Decision:** Enable local Supabase email/password sign-up and sign-in, with email confirmation disabled only in the local CLI configuration. Clients use the publishable key only. Social login, password reset, hosted configuration, and service-role use remain out of scope.
- **Consequences:** The local flow is immediately testable, while production email confirmation and redirect policy require a separate deployment decision.

## ADR-0015: Enforce daily Top 3 and unfinished resolution in command functions

- **Date:** 2026-07-18
- **Status:** accepted
- **Context:** Planner Mode needs a usable Top 3 and a non-silent sleep resolution path, while multiple clients can issue commands concurrently.
- **Decision:** Store `is_top_three` on tasks and enforce no more than three active selections for a Life Day inside the transactional command layer with a per-user/day advisory lock. Keep Planner Mode as a UI mode only; every write still uses owner-scoped command RPCs. Resolve unfinished tasks explicitly by cancellation, overdue status, or a scheduled move outside the closing Life Day; a later-target Life Day is optional and must be owned/open.
- **Consequences:** The current date-only reschedule path does not create a future Life Day implicitly, preserving the rule against silent lifecycle changes. Ordering uses numeric positions and up/down controls; drag-and-drop is deferred.

## Decisions to resolve in later phases

1. Define precise progress metric/rollup formulas and historical recalculation rules before Progress Tracking.
2. Define reminder quiet hours and precise missed-delivery behavior before Reminders.
3. Define user-facing trash, restore, export, and deletion flows before destructive product commands are introduced.
