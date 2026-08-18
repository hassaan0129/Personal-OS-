# Lessons, Known Issues, and Limitations

This document tracks durable engineering lessons, current project blockers, known technical limitations, and specific worktree constraints.

## Current Blockers

1. **Physical-device runtime validation is absent.** The C5 local command path
   has unit tests and Android export evidence, but no recorded device/emulator
   proof for cache restoration, offline submission, restart, reconnect,
   temporary-ID reconciliation, or account switching.
2. **Local database validation is deferred.** The latest C5 continuation did
   not run Docker/local Supabase reset or pgTAP. Existing 58-assertion evidence
   is historical rather than a fresh C5 result.
3. **Repository-wide formatting remains non-green.** The latest verifier failed
   only at Prettier for existing unrelated `apps/mobile/expo-env.d.ts`,
   `docs/NEXT_STEPS.md`, `docs/PROJECT_HANDOFF.md`, and `docs/REPO_MAP.md`
   (the three documentation files have since been deleted during cleanup).
   Do not reformat unrelated handoff content merely to hide this distinction.

## Known Limitations

- SQLite is not encrypted at rest. It must contain no journal body, service-role
  credential, token, or other secret.
- No cursor pull, realtime, automatic revision rebase, conflict-resolution UI,
  or multi-device merge exists.
- The offline path is deliberately narrow. It does not include wake/sleep/repair,
  Top 3, unfinished resolution, task scheduling changes beyond reschedule,
  notifications, or broad Planner support.
- Web remains online-only.
- No hosted Supabase project configuration is committed. Local/hosted developer
  environment files are ignored and must never be inspected or bundled.
- Main web/mobile screen components are large, limiting focused UI testing.
- Existing planning documents include future architecture. Treat the current
  source, tests, `PROJECT_STATE.md`, and `IMPLEMENTATION_MATRIX.md` as the
  implementation truth.

## Worktree Caution

The root is intentionally dirty and includes untracked mobile offline source,
tests, handoff documentation, and unrelated local artifacts. The APK and ZIP
artifacts are excluded from the Antigravity bundle. Do not delete them or any
other uncommitted work without explicit approval.

## Lessons Template

Only record durable engineering lessons. Never store secrets or sensitive personal/customer data.

### YYYY-MM-DD — [short title]

- **Symptom:** [what happened]
- **Evidence:** [test/log/file reference without secrets]
- **Impact:** [what broke or slowed work]
- **Root cause:** [why]
- **Correction:** [what fixed it]
- **Durable control:** [test, rule, hook, skill, AGENTS.md, or documentation]
- **Follow-up:** [owner/date]
