---
name: database-design
description: Design or review relational databases; use for entities, constraints, normalization, indexes, migrations, query plans, tenancy, and data integrity.
---

# Database design workflow

1. Model business entities, lifecycle, ownership, cardinality, and invariants before tables.
2. Choose stable keys, explicit foreign keys, nullability, uniqueness, check constraints, and deletion behavior.
3. Normalize by default; denormalize only for measured needs.
4. Design indexes from actual filters, joins, sorting, and uniqueness requirements.
5. Plan migrations as expand → backfill → verify → switch → contract.
6. Include rollback or roll-forward strategy, locking risk, batching, and compatibility.
7. Protect tenant and authorization boundaries at both application and database layers where supported.
8. Document schema and migration decisions in `docs/DATABASE.md` and `docs/DECISIONS.md`.
9. Never mutate production without explicit permission and a reviewed backup/recovery plan.
