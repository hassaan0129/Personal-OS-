# Product

Last updated: 2026-07-17
Status: technical plan; no product implementation exists yet.

## Problem

A personal operating system should turn long-term intent into an achievable day without losing context. Existing task lists, calendars, journals, and trackers fragment goals, plans, execution, reflection, and history. This product joins them in one private, cross-device system while remaining useful when the mobile device has no network connection.

## Primary user and operating model

The first release is for one authenticated person and one private workspace. Sharing, delegation, teams, coaching, and household views are explicitly out of scope until the data model and authorization model are expanded.

The user works at these horizons:

1. Long-term goals give a direction and measurable outcome.
2. Projects organize the finite work that advances a goal.
3. Monthly and weekly goals select the current priorities.
4. A daily plan selects tasks for an operational day.
5. A Life Day begins when the user wakes and ends when they sleep; it is the container for execution, check-ins, and journal entries.

## Product outcome

The user can plan, execute, reflect on, and review their life from web or mobile with a consistent, attributable history. The core outcome is a reliable answer to: “What matters now, what did I do, and how is it moving my goals forward?”

## Scope

### In scope for the planned foundation

- Authentication and a single private workspace per user.
- Long-term goals, projects, monthly goals, weekly goals, daily plans, and tasks.
- Planner Mode for selecting and ordering work; Execution Mode for focusing and recording progress on the current work.
- Wake and sleep actions that create and close Life Days.
- Task completion, deferral, rescheduling, and optional time/progress notes.
- Reminders stored centrally, delivered to mobile where permission and operating-system conditions allow.
- Journal entries, optional private attachments, revisions, and recoverable edit history.
- Progress views derived from tasks, milestones, measurable goal metrics, and check-ins.
- Web and mobile synchronization with offline-capable mobile writes and visible recovery/conflict states.
- A future-safe foundation for opt-in AI analysis; no AI-generated decisions or external model integration in the initial releases.

### Explicitly out of scope for the first releases

- Multi-user collaboration, sharing, delegation, public links, and social features.
- Calendar-provider import/export or two-way calendar sync.
- Full task recurrence, habits, budgeting, health-device imports, email/SMS reminders, or automatic life logging.
- End-to-end encryption, although sensitive data will have provider encryption at rest and access controls.
- Guaranteed-to-the-minute alerts; mobile notifications are best-effort platform delivery.
- AI analysis, automated planning, training on user data, or sending journal content to an AI provider.

## Core journeys and acceptance criteria

### Planning

The user creates or edits a long-term goal and project, chooses monthly and weekly priorities, and turns them into a sequenced daily plan.

- A planning period is anchored to the user’s configured time zone and has immutable start and end dates.
- A task can be linked to a project, goal, planning period, daily plan, or none; links are optional so capture is fast.
- Planning changes are attributed to a user and device and are visible on the other client after synchronization.
- If the mobile app is offline, supported planning changes are saved locally, marked pending, and synchronized later without duplicate records.

### Today / Life Day

The user wakes up, sees Today, works through tasks, then sleeps.

- Wake creates at most one open Life Day per user. Its operational date is the local date at wake time in the selected home time zone.
- Sleep closes the open Life Day, records the supplied occurrence time, and does not silently delete incomplete tasks.
- A closed day remains editable through explicit corrections; corrections produce history records.
- The product handles empty, loading, permission-denied, offline, duplicate-wake, and missed-sleep states clearly.

### Execution

The user enters Execution Mode, selects one task, optionally records focused work or progress, completes/defer/reschedules it, and returns to Today.

- The execution state is a focused interaction mode, not a separate task lifecycle.
- Completing a task is idempotent; retrying a queued completion cannot create duplicate progress.
- Task state changes update relevant daily, weekly, project, and goal rollups after the server accepts the change.

### Reminders

The user creates a reminder with a local wall-clock intent, time zone, and delivery preference.

- The server holds the canonical schedule and next occurrence; a device may schedule a local near-term copy for resilience.
- Delivery is recorded as attempted, accepted by the provider, failed, or acknowledged—not assumed from sending alone.
- Mobile push permission, quiet hours, disabled devices, invalid tokens, daylight-saving transitions, and missed reminders have defined outcomes.

### Reflection and history

The user writes a journal entry and later inspects or restores a previous revision.

- Journal content is private to its owner, is versioned on every saved revision, and is never placed in notification bodies by default.
- Every meaningful domain edit has an append-only metadata history. Journal text is stored in journal revisions, not duplicated in generic audit payloads.
- Restore is implemented as a new revision/event; prior history is never overwritten.

## Non-functional requirements

| Area          | Target for the planned first release                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Privacy       | Private-by-default rows; least-privilege database access; no journal content in logs, notifications, or analytics by default.                               |
| Reliability   | Idempotent commands, transactional server mutations, durable device outbox, cursor-based recovery, and audit trails.                                        |
| Offline       | Mobile can read its local replica and queue supported writes. Web offline persistence is a later PWA scope, not an implicit promise.                        |
| Performance   | Typical Today and Planner reads should use indexed, user-scoped queries and return cached/local content immediately where available.                        |
| Accessibility | Web keyboard support, semantic controls, focus handling, reduced motion, readable contrast; mobile supports platform accessibility labels and dynamic type. |
| Time          | Store instants in UTC, preserve the user’s chosen IANA time zone and local date/wall-clock intent, and test DST/travel rules.                               |
| History       | Preserve source action, actor, device, server time, and entity revision. Retention and redaction policy require a product decision before release.          |

## Success measures

Measures are proposed; baseline and targets must be chosen after an instrumented beta.

- A user can complete the wake → plan → execute → sleep journey on either platform without data loss.
- At least 99% of accepted client commands reconcile without manual recovery in a defined beta period.
- Pending offline operations become clearly synced, conflicted, or failed after reconnect; none remain silently ambiguous.
- Reminder delivery and acknowledgement rates are measurable by channel without collecting journal/task text.
- Users can review a complete change history and export/delete their data through a later privacy phase.

## Finalized V1 operating decisions

- A Life Day begins only through the explicit wake action and ends only through the explicit sleep action. The command's IANA zone is stored with its UTC instant; naps do not close a day; missed sleep requires explicit repair.
- Mobile supports offline Today, task, wake/sleep, journal, and completion access in V1. Web offline support is deferred.
- Unfinished tasks never roll over automatically. At sleep, users must reschedule, keep overdue, or cancel with a reason.
- Recurring tasks create independent occurrences, but recurrence is not part of Phase 1A.
- Mobile notifications are in V1; web push is deferred. Journals remain private; E2EE is deferred.
- Progress includes milestone, weekly execution, consistency, planned-versus-actual time, and category metrics.
- Task and goal history is permanent. Notification delivery records are retained for 90 days and deleted records use a 30-day trash period.
- Future AI may create insights and recommendations, but it cannot change source-of-truth records without user approval.

## Historical planning questions (resolved)

The following questions were the original planning prompts. Their V1 answers are recorded above and in `DECISIONS.md`.

1. Is the Life Day anchored to the user’s home time zone, the device’s current time zone, or an explicitly selected zone when travelling? How should naps, missed sleep, and manual corrections work?
2. Is the offline promise limited to Today, or must full Planner and journal editing work offline on both mobile and web from day one?
3. What is the task rollover rule at sleep: leave incomplete tasks on the old day, offer carry-forward, or automatically create a new daily-plan item?
4. Are reminders best-effort only, or is a paid/regulated “must alert” expectation intended? Which channels, quiet hours, and missed-reminder behavior are required?
5. Is provider encryption at rest acceptable for journals and attachments, or is client-held end-to-end encryption required? What are retention, export, delete, and legal-hold expectations?
6. Which progress calculations are authoritative: task completion count, weighted milestones, manual measures, time invested, or a combination? Are past period scores frozen or recalculated after edits?
7. Should edit history be retained forever, redacted on request, and visibly restorable by the user?
