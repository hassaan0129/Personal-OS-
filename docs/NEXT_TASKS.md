# Next Tasks

Last updated: 2026-08-18. Current phase: **Phase 2 — Core loop tightening + Journal**.

Full specification: [`PHASE2_SPEC.md`](PHASE2_SPEC.md).

## Recommended immediate next slice

Implement the Phase 2 journal data model, commands, and client-side core loop
changes. Phase 1D offline work is done; the old priority table (device matrix,
offline Top 3) is superseded by the Phase 2 roadmap.

Physical-device/emulator validation of Phase 1D remains desirable but is not a
blocker for Phase 2 backend and UI work.

## Priority tasks

| Priority | Task | Depends on | Acceptance criteria | Verification |
| -------- | ---- | ---------- | ------------------- | ------------ |
| 1 | Add `journal_entries` + `journal_entry_revisions` migration | None | Tables created with correct columns, types, constraints, and FK relationships. `entry_type` check constraint (`morning`, `night`, `adhoc`). `mood` check constraint (1–5). | `supabase:reset` succeeds |
| 2 | Add journal RLS policies | Priority 1 | Owner-only read/write on both tables. No cross-user access. | pgTAP RLS tests |
| 3 | Add journal command RPCs | Priority 2 | `command_create_journal_entry`, `command_update_journal_entry`, `command_trash_journal_entry`, `command_restore_journal_entry` — following existing task command shape | pgTAP command tests |
| 4 | pgTAP test coverage | Priority 3 | RLS (owner-only read/write), revision creation on edit, trash/restore round-trip, entry_type validation, mood range validation | `supabase:test` passes |
| 5 | Mobile: sleep duration on wake screen | None (client-only) | After wake, compute and display `wake.occurred_at - previous_sleep.occurred_at`. Read-only, no schema change. | Manual device/emulator check |
| 6 | Mobile: journal prompt between wake and Today | Priority 3 (needs create RPC) | Skippable in one tap. Captures entry_type, mood (1–5), body. Does not block reaching Today. | Manual device/emulator check |
| 7 | Web: journal prompt between wake and Today | Priority 3 (needs create RPC) | Same behavior as mobile. Can lag mobile if needed. | Manual browser check |
| 8 | Full verification sequence | Priorities 1–7 | `python scripts/verify.py` passes. pgTAP results reported. No lint/typecheck/test/build regressions. | Verification report |

## Out of scope for Phase 2

Do not begin Reminders, Goals, Finance, Notes, voice journal, mood-trend
analytics, AI weekly report, realtime, web offline, or deployment until Phase 2
is complete and verified.

## Manual checks for the next developer

- Verify the web client remains a singleton after a hard refresh and auth works locally.
- Run the full wake → journal prompt (create + skip) → Today → plan → resolve unfinished → sleep flow against local Supabase.
- Confirm journal entries appear in a list view and can be edited (with revision preserved) and trashed/restored.
- Run offline task create/edit/complete on an emulator only after the mobile screen is wired; reconnect and confirm one authoritative task/event per operation.
- Sign out with cached local state and confirm another account cannot access it.
- Inspect Supabase Studio only for local test data to verify owner IDs, revisions, journal entries, journal entry revisions, and command records.
