# Phase 2 Specification — Core Loop Tightening + Journal

Written: 2026-08-18. Status: approved, ready for implementation.

## Outcome

Waking surfaces sleep duration and prompts a journal entry before Today. Journal
entries (morning/night/ad-hoc) are captured, revisioned, and never hard-deleted.

---

## Core loop changes

- `command_wake_life_day` already creates the Life Day and its `occurred_at`. No
  new command needed — on the client, after wake succeeds, compute sleep duration
  as `wake.occurred_at - previous_sleep.occurred_at` (previous Life Day's sleep
  event) and display it. Read-only, no schema change.
- Client flow: wake → show sleep duration + journal prompt (skippable) → Today.
  This is a client-side sequencing change, not a backend one.
- `command_sleep_life_day` unchanged. UI should not enable "I'm sleeping" until
  at least one task exists for tomorrow (product rule already implied; enforce
  client-side first, revisit as a server constraint only if users bypass it via
  API).

## Journal data model

### `journal_entries`

| Column       | Type                                      | Notes                                                     |
| ------------ | ----------------------------------------- | --------------------------------------------------------- |
| `id`         | `uuid` PK, default `gen_random_uuid()`    |                                                           |
| `user_id`    | `uuid` FK → `auth.users`, not null        | Owner scope                                               |
| `life_day_id`| `uuid` FK → `life_days`, nullable         | Ad-hoc entries may not belong to a specific Life Day      |
| `entry_type` | `text`, not null                          | One of: `morning`, `night`, `adhoc`                       |
| `mood`       | `smallint`, not null                      | Integer 1–5                                               |
| `body`       | `text`, not null                          |                                                           |
| `revision`   | `integer`, not null, default 1            | Incremented on every update                               |
| `created_at` | `timestamptz`, not null, default `now()`  | Date/day/time derivable from this — no separate fields    |
| `trashed_at` | `timestamptz`, nullable                   | Null = active; non-null = trashed with timestamp          |

### `journal_entry_revisions`

| Column             | Type                                      | Notes                                              |
| ------------------ | ----------------------------------------- | -------------------------------------------------- |
| `id`               | `uuid` PK, default `gen_random_uuid()`    |                                                    |
| `journal_entry_id` | `uuid` FK → `journal_entries`, not null   |                                                    |
| `body`             | `text`, not null                          | Snapshot of body at this revision                  |
| `mood`             | `smallint`, not null                      | Snapshot of mood at this revision                  |
| `revised_at`       | `timestamptz`, not null, default `now()`  |                                                    |

Every edit after creation writes a new revision row; the entry itself always
reflects the latest values.

## Commands

Follow the existing command/RPC/RLS pattern used for tasks (owner-scoped,
revision-incrementing, audited). No new architectural pattern — copy
`command_create_task` / `command_update_task`'s shape.

### `command_create_journal_entry(entry_type, mood, body, life_day_id?)`

Creates a new journal entry. If `life_day_id` is provided, validates it belongs
to the calling user. Sets `revision = 1`, `trashed_at = null`.

### `command_update_journal_entry(id, mood, body)`

Updates the entry's `mood` and `body`, increments `revision`, and writes a new
row to `journal_entry_revisions` with the **previous** values before overwriting.
Rejects if the entry is trashed.

### `command_trash_journal_entry(id)`

Sets `trashed_at = now()`. Trashed entries remain queryable from a trash view.
Rejects if already trashed.

### `command_restore_journal_entry(id)`

Clears `trashed_at` back to null. Rejects if not currently trashed.

## Acceptance criteria

1. Waking always offers a journal prompt; skipping it is one tap and does not
   block reaching Today.
2. Every entry has a non-null `created_at` (date/day/time derivable from it —
   no separate manual fields).
3. Mood is asked on every entry, morning/night/ad-hoc alike, using the same
   fixed prompt shape. Mood is an integer 1–5.
4. Editing a journal entry never overwrites the prior text — it is preserved in
   `journal_entry_revisions`.
5. Deleting a journal entry moves it to trash (queryable, timestamped); permanent
   delete only happens from inside trash, explicitly, matching the task trash
   pattern.
6. pgTAP coverage: RLS (owner-only read/write), revision creation on edit,
   trash/restore round-trip.

## Explicitly out of scope for Phase 2

- Reminders, Goals, Finance, Notes — later phases.
- Voice journal entries, mood-trend analytics, AI weekly report — Phase 9.
- Web journal UI can lag mobile by a beat if needed; mobile is the primary
  daily-use surface per the product's own stated priorities.

---

## Orchestrator handoff prompt

> Implement Phase 2 (Core loop tightening + Journal) as specified in
> `docs/PHASE2_SPEC.md`. Add the `journal_entries` and
> `journal_entry_revisions` migrations following the existing task
> command/RLS/revision pattern. Add `command_create_journal_entry`,
> `command_update_journal_entry`, `command_trash_journal_entry`,
> `command_restore_journal_entry` RPCs with pgTAP coverage matching the existing
> task command tests. On mobile and web, insert a journal prompt (skippable)
> between wake and Today, and surface computed sleep duration on the wake
> screen — no new schema for either, compute client-side from existing Life Day
> timestamps. Do not touch Reminders, Goals, Finance, or Notes — those are
> separate phases. Run the full verification sequence and report pgTAP results
> before marking this phase done.
