---
name: security-review
description: Perform a defensive application security review; use for auth, authorization, secrets, injection, data exposure, dependencies, uploads, webhooks, and deployment configuration.
---

# Security review workflow

- Define assets, actors, trust boundaries, entry points, and abuse cases.
- Review authentication, authorization, tenant isolation, session/cookie settings, CSRF, CORS, input validation, output encoding, SQL/command injection, SSRF, file uploads, path traversal, redirects, webhooks, rate limits, logging, and error exposure.
- Check secret handling, `.gitignore`, `.env.example`, client bundles, CI variables, and deployment configuration without printing secret values.
- Review dependencies and unsafe defaults using locally available tools.
- Rank findings by exploitability and impact; include file, evidence, attack path, and remediation.
- Do not perform destructive exploitation or access production/customer data.
