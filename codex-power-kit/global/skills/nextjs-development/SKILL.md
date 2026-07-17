---
name: nextjs-development
description: Build or modify Next.js and React applications; use for App Router, server/client boundaries, route handlers, forms, accessibility, performance, and production builds.
---

# Next.js development workflow

- Confirm the installed Next.js and React versions from the repository. Verify version-sensitive behavior with official docs.
- Understand routing, layouts, rendering strategy, data fetching, caching, authentication, and deployment target before editing.
- Keep Server Components server-side by default; add client boundaries only where interaction or browser APIs require them.
- Validate all server inputs and enforce authorization server-side.
- Handle loading, empty, error, and not-found states.
- Preserve accessibility, semantic HTML, keyboard navigation, focus behavior, responsive design, image sizing, and metadata.
- Avoid unnecessary dependencies and client-side JavaScript.
- Add focused unit/integration/browser tests for changed behavior.
- Run format check, lint, typecheck, tests, and production build.
