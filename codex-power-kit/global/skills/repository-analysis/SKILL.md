---
name: repository-analysis
description: Analyze an unfamiliar repository before changes; use for codebase mapping, architecture discovery, dependency and risk assessment, and current-status summaries.
---

# Repository analysis workflow

1. Read all applicable `AGENTS.md` files and the standard project docs.
2. Inspect `git status`; never overwrite existing changes.
3. Identify languages, package managers, runtime versions, frameworks, entry points, generated code, migrations, CI, deployment configuration, and verification commands.
4. Trace the main user flow through frontend, backend, database, and external services.
5. Inspect tests and determine what behavior is actually protected.
6. Produce:
   - repository purpose and maturity
   - architecture map
   - important directories and owners
   - data and request flow
   - setup and verification commands
   - known risks, dead code, and documentation gaps
   - safest next steps
7. Stay read-only unless the user separately requests implementation.
