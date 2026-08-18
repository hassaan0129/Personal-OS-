# Roadmap

Last updated: 2026-08-18
Status: Phase 0 through Phase 1D (offline outbox) are implemented. Phase 2 (Core loop tightening + Journal) is next.

## Delivery principles

- Each phase ends with a usable, testable slice and an explicit decision to continue.
- Keep invariant-bearing writes behind tested commands and do not weaken RLS to simplify a client.
- Do not promise offline support until a replica, outbox, recovery flow, and conflict tests exist.
- Do not add goals, notifications, recurrence, sharing, or AI to an incomplete Today foundation.

## Completed foundation

- [x] Phase 0: pnpm/Turborepo, Next.js, Expo Router, framework-free shared contracts, strict checks, CI, and local Supabase project structure.
- [x] Phase 1A: Life Day/task schema, command RPCs, idempotency, revision conflicts, audit/change records, RLS, and local pgTAP coverage.
- [x] Phase 1B: local email/password auth, session restoration, profile/current-Life-Day/Today read RPCs, typed client adapters, and minimal web/mobile Today actions.
- [x] Phase 1C: daily Planner Mode, task editing/order/scheduling/Top 3, unfinished-task resolution, and web/mobile online-only controls.
- [x] Local migration reset and pgTAP validation (58 tests on 2026-07-18).
- [x] Phase 1D: Offline Today synchronization — user-bound mobile SQLite replica, durable command outbox (wake, sleep, create, complete, edit, reopen, cancel, reschedule, reorder), pending/retry/conflict states, sign-out clearing. 109 focused mobile tests + 135 workspace tests. Physical-device/emulator validation remains pending.

## Phase 2 — Core loop tightening + Journal

**Outcome:** Waking surfaces sleep duration and prompts a journal entry before Today. Journal entries (morning/night/ad-hoc) are captured, revisioned, and never hard-deleted.

Full specification: [`PHASE2_SPEC.md`](PHASE2_SPEC.md).

## Phase 3 — Reminders

**Outcome:** Sticky and recurring reminders, including 5× daily prayer with manual times.

- [ ] Reminder schedules, delivery records, mobile permissions, and provider-safe delivery handling.
- [ ] Sticky (one-shot) and recurring reminder types with user-configurable times.
- [ ] Prayer reminder preset (5× daily, manually set times per user).

## Phase 4 — Goals

**Outcome:** Yearly → monthly → weekly goal hierarchy with Life Area links.

- [ ] Goal schema with period hierarchy (year → month → week), Life Area associations, and owner-scoped commands.
- [ ] Planning reads and edits for web and mobile; daily Planner Mode remains a separate implemented slice.
- [ ] Period boundaries, travel/time-zone behavior, and planning conflict rules.

## Phase 5 — Finance

**Outcome:** Income/expense/savings tracking with auto-categorization hook and emergency fund as a goal.

- [ ] Income, expense, and savings schema with category taxonomy.
- [ ] Auto-categorization hook (rule-based first; AI-assisted categorization deferred to Phase 9).
- [ ] Emergency fund modeled as a Goal (Phase 4 dependency).

## Phase 6 — Notes

**Outcome:** Freeform notes, tagged and/or foldered, independent of the daily loop.

- [ ] Note schema with tagging and folder organization.
- [ ] Notes are not tied to Life Days — they exist independently.
- [ ] Trash/restore following the established pattern.

## Phase 7 — Universal trash/permanence pass

**Outcome:** Apply the never-hard-delete pattern to Journal, Notes, Goals, Finance, and Reminders. Tasks already have it.

- [ ] Audit all domain tables for consistent `trashed_at` / restore behavior.
- [ ] Unified trash view across all domains.
- [ ] Permanent delete only from inside trash, explicitly, with confirmation.

## Phase 8 — Hardening and beta readiness

- [ ] Evaluate PWA/web offline scope separately.
- [ ] Add observability, export/delete workflows, restore drills, accessibility review, and load/security tests.
- [ ] Establish preview/staging/release workflows without exposing production credentials.

## Phase 9 — Opt-in AI analysis

- [ ] Define consent, redacted inputs, retention, provenance, and approval-gated recommendation flow.
- [ ] Store insights separately; AI never applies source-of-truth changes without user approval.
- [ ] Weekly journal/sleep report to Gmail lives here.
