# Repository Instructions

This file extends the global Codex rules.

## Project identity

- **Product:** Personal OS, a private web and mobile system for planning, execution, reflection, and progress tracking.
- **Current objective:** Phase 1A Life Day and Today backend foundation; do not build product screens, offline storage, notifications, goals, journals, analytics, AI, or deployment until their approved phases.
- **Primary stack:** pnpm/Turborepo, Next.js App Router, Expo/React Native/Expo Router, strict TypeScript, Zod, and local Supabase migration structure.
- **Package manager:** pnpm 11.10+ (`pnpm.cmd` may be required in restricted Windows PowerShell).
- **Supported runtimes:** Node.js 22 LTS (`>=22 <25`); Python 3.10+ for verification.

## Start here

Before changing code, read:

1. `README.md`
2. `docs/PRODUCT.md`
3. `docs/ARCHITECTURE.md`
4. `docs/CURRENT_STATUS.md`
5. the domain-specific docs relevant to the task
6. existing tests and CI configuration

Then inspect `git status` and summarize the execution path that will change.

## Required workflow

- For non-trivial tasks, create a plan with acceptance criteria, affected files, risks, and test commands before editing.
- Implement in small steps and keep unrelated files untouched.
- Add or update tests for behavior changes.
- Update the relevant standard documentation in the same change.
- Run during development: the narrow checks relevant to changed files.
- Run before finishing: `python scripts/verify.py`.
- Review the final diff and report changes, checks, remaining risks, migrations, and manual steps.

## Project commands

```text
Install: pnpm install
Web development: pnpm --filter @personal-os/web dev
Mobile development: pnpm --filter @personal-os/mobile start
Database/migrations: deferred; local Supabase structure exists but is not run in Phase 0
Targeted tests: pnpm --filter @personal-os/validation test
Full verification: python scripts/verify.py
```

## Architecture boundaries

- `apps/*` may depend on `packages/*`; `packages/*` may not import application code.
- `packages/domain`, `packages/validation`, `packages/database-contracts`, `packages/sync-contracts`, and `packages/utils` are framework-free. Do not import React, Expo, Next.js, or Supabase SDKs into them.
- `packages/config` validates only public app configuration in Phase 0. Server secrets belong only in future server-only modules.
- Generated directories (`node_modules`, `.next`, `.expo`, `dist`, `.turbo`, and `supabase/.temp`) must not be edited or committed.
- No hosted external service is configured. Do not add Supabase Cloud project references, credentials, or service-role keys without explicit approval.

## Security

- Never access production or real customer data.
- Never read or print `.env` values, private keys, cloud credentials, or tokens.
- Never weaken authorization or validation for convenience.
- New environment variables must be documented with placeholders in `.env.example`.
- Database and external side effects must be explicit, auditable, and tested.

## Git and delivery

- Use focused branches and commits.
- Do not push, merge, publish, deploy, or run production migrations without explicit permission.
- Preserve user changes and avoid destructive Git commands.

## Definition of done

- Acceptance criteria are satisfied.
- Relevant tests exist and pass.
- `python scripts/verify.py` passes.
- No secret or accidental generated-file changes appear in the diff.
- Documentation reflects the implemented state.
- Remaining risks and manual actions are reported.
