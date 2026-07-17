---
name: deployment
description: Prepare and review deployments; use for Vercel, containers, environment variables, migrations, previews, release checks, and rollback planning.
---

# Deployment workflow

1. Identify target environment, current deployment method, build command, runtime, environment variables, database changes, and health checks.
2. Validate locally with the same production build path.
3. Use a preview or staging environment before production.
4. Verify secrets are server-side, documented in `.env.example`, and never logged or committed.
5. Separate backward-compatible database expansion from destructive contraction.
6. Define smoke tests, monitoring, rollback/roll-forward, and ownership.
7. Never deploy, promote, change DNS, modify production data, or run production migrations without explicit user permission for that action.
