# Database

## Technology and ownership

[Database engine, version, hosting, and ownership model.]

## Entity overview

| Entity | Purpose | Owner/tenant |
|---|---|---|
| [entity] | [purpose] | [owner] |

## Relationships

[Describe cardinality and lifecycle.]

## Tables

### `[table_name]`

| Column | Type | Null | Constraints | Meaning |
|---|---|---:|---|---|
| `id` | [type] | no | primary key | [meaning] |

## Invariants and constraints

- [invariant]

## Indexes and query patterns

| Query pattern | Index | Reason |
|---|---|---|
| [pattern] | [index] | [reason] |

## Migration policy

- Use expand → backfill → verify → switch → contract.
- Migrations must be reviewed, reversible or roll-forward capable, and tested on non-production data.
- Production migration execution requires explicit approval.

## Backup, retention, and recovery

[Policy and RPO/RTO.]

## Security

[Tenant isolation, row-level security, encryption, and privileged access.]
