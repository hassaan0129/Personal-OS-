# Repository Instructions

This file extends the global Codex rules. Customize bracketed sections when installing the project.

## Project identity

- **Product:** [describe the product and primary users]
- **Current objective:** [current milestone]
- **Primary stack:** [languages, frameworks, database, hosting]
- **Package manager:** [pnpm/npm/yarn/bun/pip/uv/poetry]
- **Supported runtimes:** [versions]

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
Install: [command]
Development: [command]
Database/migrations: [command]
Targeted tests: [command]
Full verification: python scripts/verify.py
```

## Architecture boundaries

- [list modules and ownership boundaries]
- [list forbidden dependency directions]
- [list generated files that must not be edited]
- [list external services and test doubles]

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
