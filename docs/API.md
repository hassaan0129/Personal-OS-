# API

Last updated: 2026-07-18
Status: Phase 1B adds local email/password clients and narrow authenticated Today read RPCs to the Phase 1A command functions. No Edge Function or hosted service has been created.

## Phase 1B implemented Today read RPCs

`get_current_life_day`, `get_today_tasks`, and `get_today_snapshot` are authenticated-only RPCs with a fixed search path and an explicit `auth.uid()` check. They return only the caller's profile, active Life Day, and ordered non-archived tasks attached to that active Life Day. They grant no table write capability and expose neither `command_operations` nor generic cross-user rows.

The shared `@personal-os/api-client` validates every RPC response against shared Zod contracts before it reaches either UI. Its auth adapter normalizes local Supabase email/password sessions without accepting a client-supplied user id. Authentication, reads, and writes use the local API URL and publishable key only.

## Phase 1A implemented command RPCs

The following authenticated local RPC functions are the only write boundary for this phase: `command_start_life_day`, `command_close_life_day`, `command_repair_previous_life_day`, `command_create_task`, `command_update_task`, `command_complete_task`, `command_reschedule_task`, and `command_cancel_task`.

Each receives the command operation id, device id, expected revision, client occurrence time, client IANA zone, and command-specific data. Results use `accepted`, `duplicate_accepted`, `conflict`, or `rejected`, with a safe code such as `repair_required`, `revision_conflict`, `invalid_transition`, `not_found`, or `validation_failed`. Accepted writes include the changed entity and the new `syncCursor` hint.

Task update is intentionally a full mutable-task replacement guarded by the expected revision; status transitions to `completed` and `cancelled` have dedicated commands. Reschedule and cancel require a structured reason code, and `other` requires a note.

Close and repair reject with `unresolved_tasks` when their Life Day still owns planned or in-progress tasks. The caller must explicitly reschedule, mark overdue, or cancel each task first; no task is rolled over automatically.

## API principles

Supabase Auth establishes the caller identity. RLS-protected read views may be queried through the Supabase Data API, but all mutations with lifecycle rules, history, reminders, progress effects, or synchronization must enter through a transactional command boundary. The initial implementation may use Postgres RPC functions for transactional commands and Edge Functions for provider-facing/privileged workflows; the public contract must not depend on which internal transport is selected.

- Base URL: Supabase project URL; clients use a typed API client rather than hand-written fetch calls.
- Authentication: Bearer access token issued by Supabase Auth. Do not accept a client-supplied `user_id` as authority.
- Content type: `application/json`; attachments use authorized signed upload flows, not JSON bodies.
- API version: command envelope `schema_version`; breaking changes require a new command/adapter and a supported-client window.
- Time: UTC ISO-8601 instants plus explicit IANA time-zone/local wall-clock fields where user intent matters.
- Errors: stable error code, safe message, correlation id, canonical entity/revision where relevant. No sensitive field values in errors.
- Pagination: opaque cursor/page size with a hard maximum. Never use offset pagination for sync feeds.
- Idempotency: required `operation_id` UUID for every state-changing command. Server deduplicates for the documented retry window.

## Shared envelopes

### Command request

```json
{
  "operation_id": "0c1b8d5f-8a5d-4cb5-92fc-b7ea1db9db5c",
  "device_id": "e77fce0d-dcd7-4f7d-8af1-639df04bbc13",
  "schema_version": 1,
  "type": "task.complete",
  "base_revision": 8,
  "client_occurred_at": "2026-07-17T09:30:00+05:00",
  "client_timezone": "Asia/Karachi",
  "payload": {
    "task_id": "a33a3a24-7062-42fd-893a-8f1eef3ee4b6",
    "life_day_id": "a261a0fc-2936-4b15-a204-971a3e07bbbe"
  }
}
```

`base_revision` applies to the aggregate being changed. Creation commands use `null`; commands operating only on append-only logs may use the related aggregate revision or an explicit expected state. The server rejects a reused `operation_id` whose type/payload fingerprint differs from the original request.

### Command result

```json
{
  "operation_id": "0c1b8d5f-8a5d-4cb5-92fc-b7ea1db9db5c",
  "status": "accepted",
  "server_recorded_at": "2026-07-17T04:30:02Z",
  "correlation_id": "req_01J...",
  "entities": [
    {
      "type": "task",
      "id": "a33a3a24-7062-42fd-893a-8f1eef3ee4b6",
      "revision": 9,
      "data": { "status": "completed", "completed_at": "2026-07-17T04:30:00Z" }
    }
  ],
  "sync_cursor": 481
}
```

Possible statuses are `accepted`, `duplicate_accepted`, `rejected`, and `conflict`. An accepted response means the canonical database transaction committed; it does not mean a push provider delivered a notification.

### Error result

```json
{
  "code": "revision_conflict",
  "message": "This item changed on another device. Refresh before retrying.",
  "correlation_id": "req_01J...",
  "entity": {
    "type": "task",
    "id": "a33a3a24-7062-42fd-893a-8f1eef3ee4b6",
    "revision": 10,
    "data": { "status": "planned" }
  }
}
```

| HTTP status | Code                                                                 | Meaning / client action                                           |
| ----------: | -------------------------------------------------------------------- | ----------------------------------------------------------------- |
|         400 | `validation_failed`                                                  | Do not retry until input is corrected.                            |
|         401 | `unauthenticated`                                                    | Refresh/sign in; clear local protected state if identity changed. |
|         403 | `forbidden`                                                          | Do not expose whether another user’s resource exists.             |
|         404 | `not_found`                                                          | Entity unavailable to the caller or deleted.                      |
|         409 | `revision_conflict`, `invalid_transition`, `duplicate_open_life_day` | Pull canonical state, show recovery/conflict UI.                  |
|         410 | `cursor_expired`, `client_unsupported`                               | Start a snapshot reset or update client.                          |
|         422 | `business_rule_failed`                                               | Display safe rule explanation; do not blind retry.                |
|         429 | `rate_limited`                                                       | Back off with server guidance.                                    |
|     500/503 | `transient_failure`                                                  | Keep operation in outbox; retry with bounded exponential backoff. |

## Read models

Read endpoints/RPCs return only RLS-authorized, user-scoped fields. Read responses carry `revision`, `updated_at`, and a hydration version. Initial shapes:

| Read                                      | Purpose                                                              | Required behavior                                                                       |
| ----------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `GET /v1/today?date=YYYY-MM-DD`           | Life Day, daily plan, ordered tasks, active execution, due reminders | Time zone is resolved server-side from profile/payload. Handles no-open-day/empty plan. |
| `GET /v1/planner?from=&to=`               | Month/week periods, selected goals/projects, plan summaries          | Paginate nested tasks separately if needed.                                             |
| `GET /v1/goals` / `GET /v1/projects`      | Goal/project lists and current progress summaries                    | Filter status/date; no unbounded history joins.                                         |
| `GET /v1/tasks`                           | Tasks with status/project/date filters                               | Cursor pagination, stable sort.                                                         |
| `GET /v1/journal`                         | Journal entry headers                                                | Body/revision fetched only for one authorized entry.                                    |
| `GET /v1/history?entity_type=&entity_id=` | User-visible edit history                                            | Redacted summaries only.                                                                |
| `GET /v1/progress`                        | Derived metrics and chart points                                     | Definition/version included with each metric.                                           |

These paths describe the client contract, not a requirement to deploy a separate HTTP server. They can be backed by Supabase RPC/read views through the typed client.

## Domain command catalog

### Planning and goals

| Command type                                                              | Required payload                | Rules/effects                                          |
| ------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------ |
| `goal.create`, `goal.update`, `goal.archive`, `goal.restore`              | goal fields / expected revision | Validate title/status/dates; history and sync change.  |
| `project.create`, `project.update`, `project.complete`, `project.archive` | project, optional goal link     | Verify linked goal ownership; update revision/history. |
| `period.open`, `period.update`, `period.close`                            | kind, dates, time zone          | Enforce canonical month/week uniqueness.               |
| `period_goal.upsert`, `period_goal.reorder`, `period_goal.remove`         | period/goal/project/position    | Validate same-owner relations and optimistic revision. |
| `daily_plan.create`, `daily_plan.activate`, `daily_plan.close`            | operational date, time zone     | No automatic duplicate plan; explicit lifecycle.       |
| `daily_plan.place_task`, `daily_plan.reorder`, `daily_plan.remove_task`   | plan/task/position              | Transactional ordering and revision conflict response. |

### Life Day and execution

| Command type                                                              | Required payload                                  | Rules/effects                                                                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `life_day.wake`                                                           | `woke_at`, IANA zone, source                      | Idempotently creates/returns one open day, derives operational date, emits history.              |
| `life_day.correct_wake`                                                   | day id, original revision, corrected instant/zone | Explicit correction; cannot silently rewrite history.                                            |
| `life_day.sleep`                                                          | day id, revision, `slept_at`, optional summary    | Validates open day/time ordering; closes once; no automatic rollover.                            |
| `life_day.reopen`                                                         | closed day and reason                             | Product-policy gated; creates audit event and requires conflict handling if a newer day is open. |
| `task.create`, `task.update`, `task.cancel`, `task.reopen`                | task fields / revision                            | Valid lifecycle transitions and owner links.                                                     |
| `task.start`, `task.complete`, `task.defer`, `task.reschedule`            | task id, revision, occurrence/day details         | Writes task event, canonical state, history, sync and derived progress invalidation atomically.  |
| `execution.start`, `execution.pause`, `execution.resume`, `execution.end` | task/day/session state                            | Append session state with server-validated timestamps.                                           |
| `progress.record`                                                         | metric id/value/time/source note                  | Validate metric ownership, units and allowed precision.                                          |

### Reminder, journal, history

| Command type                                                                                               | Required payload                | Rules/effects                                                         |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------- |
| `reminder.create`, `reminder.update`, `reminder.pause`, `reminder.cancel`                                  | local date/time, zone, channel  | Server calculates next occurrence and device reconciliation signal.   |
| `reminder.acknowledge`                                                                                     | delivery/reminder id and action | Writes acknowledgement; does not infer task completion.               |
| `journal.create`, `journal.save_revision`, `journal.restore_revision`, `journal.delete`, `journal.restore` | entry/revision/content          | Creates immutable revisions; body never enters generic audit payload. |
| `attachment.begin_upload`, `attachment.complete_upload`, `attachment.delete`                               | metadata / signed-upload proof  | Validate ownership/type/size/path and write history.                  |
| `history.restore_field`                                                                                    | entity/revision/allowed fields  | Creates a new current revision; never updates old history.            |

## Sync API

### `POST /v1/sync/push`

Accepts a bounded array of command envelopes from one authenticated device. It returns a result for each input in request order and the highest server cursor observed. Requests are authenticated to the device owner; the server verifies `device_id` is active for that user.

```json
{
  "device_id": "e77fce0d-dcd7-4f7d-8af1-639df04bbc13",
  "commands": [
    { "operation_id": "...", "type": "task.complete", "schema_version": 1, "payload": {} }
  ]
}
```

Server requirements: transaction per command or clearly documented atomic-batch behavior; bounded payload size/count; idempotent retries; per-user/device rate limiting; correlation id; no partial silent loss. Initial recommendation is independent command transactions, so one invalid offline operation does not block later valid operations.

### `GET /v1/sync/pull?cursor=&limit=`

Returns ordered changes after a user-scoped cursor and `next_cursor`. A successful accepted push must be followed by pull, because one command can change related projections.

```json
{
  "changes": [
    {
      "cursor": 481,
      "change_type": "upsert",
      "entity_type": "task",
      "entity_id": "...",
      "revision": 9,
      "data": {}
    },
    {
      "cursor": 482,
      "change_type": "tombstone",
      "entity_type": "task_plan_item",
      "entity_id": "...",
      "revision": 3
    }
  ],
  "next_cursor": 482,
  "has_more": false
}
```

The client stores the cursor only after the local transaction applies the complete page. On `cursor_expired`, call snapshot rather than guessing missing changes.

### `GET /v1/sync/snapshot`

Returns a paginated, schema-versioned user-owned snapshot. The client builds a replacement replica transactionally, replays pending local operations through push, then adopts the returned cursor. Do not use it as normal refresh traffic.

### Realtime contract

Realtime broadcasts only `{ user_id, latest_cursor, reason }` to an authorized private channel. It may be duplicated, delayed, or absent. A client always pulls and deduplicates by cursor; it never trusts the payload as a record patch.

## Reminder job and provider interfaces

Internal-only functions are not callable by clients:

| Function                        | Trigger                        | Contract                                                                                     |
| ------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------- |
| `claim_due_reminders`           | scheduled job                  | Locks/claims due records and creates unique delivery attempts.                               |
| `dispatch_notification`         | job queue/Edge Function        | Uses device/provider token, suppresses sensitive content, returns provider message id/error. |
| `process_notification_receipts` | scheduled job                  | Updates delivery outcomes and deactivates invalid tokens.                                    |
| `reconcile_device_schedule`     | device foreground/registration | Returns desired near-term local notification schedule.                                       |

The scheduler and dispatcher must have explicit retry limits, dead-letter/failed status, audit/correlation ids, and metrics. Stored secrets live in Supabase Vault/Edge Function environment only.

## Attachment flow

1. Client sends `attachment.begin_upload` with content type, byte count, checksum, and journal entry reference.
2. Server validates owner, policy, quota, and filename; returns a short-lived signed upload URL/key.
3. Client uploads directly to the private bucket, then sends `attachment.complete_upload` with proof/checksum.
4. Server verifies uploaded object metadata before marking it available. Download uses a new authorized short-lived signed URL.

Do not let client input choose an arbitrary storage path, publish bucket, or content-disposition header.

## Compatibility, deprecation, and testing

- Mobile clients can be offline for extended periods. Keep command adapters and read/snapshot versions backward compatible for the minimum supported app version plus an outbox-retention window.
- Add fields additively; do not rename/remove response fields until telemetry confirms old clients are retired.
- Contract-test commands for authentication, cross-tenant denial, idempotency, stale revision, clock/time-zone/DST boundaries, duplicate wake/sleep, push failure, and snapshot recovery.
- Test RLS in a real Postgres/Supabase-compatible environment, not only mocked API clients.
