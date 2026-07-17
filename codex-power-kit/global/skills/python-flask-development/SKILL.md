---
name: python-flask-development
description: Build or modify Python and Flask systems; use for app factories, blueprints, services, validation, SQLAlchemy, APIs, authentication, tests, and deployment readiness.
---

# Python and Flask workflow

- Inspect Python version, dependency manager, app entry point, configuration loading, blueprints, extensions, database layer, and tests.
- Prefer an app factory, explicit configuration, dependency injection where useful, and small service functions.
- Validate request data, return consistent errors, enforce authentication and authorization, and avoid leaking stack traces or secrets.
- Use transactions for multi-step writes and migrations for schema changes.
- Add type hints to public or changed code where the project supports them.
- Add pytest regression coverage for success, validation, authorization, and failure paths.
- Run formatter, linter, type checker, tests, and production/import checks.
