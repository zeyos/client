---
type: ZeyOS Entity
title: Permissions
description: Group-level permission grants.
resource: zeyos://api/permissions
tags: [platform, generated]
api_backed: true
list_operation: listPermissions
visibility_column: false
---

<!-- okf:generated:start — rewritten by scripts/generate-okf.mjs; do not edit by hand -->
# Schema

| Column | Type | Nullable | Default | Indexed | FK |
|---|---|---|---|---|---|
| `ID` | bigint | no | — | yes | — |
| `creator` | integer | yes | — | — | — |
| `creationdate` | bigint | no | `date_part('epoch', now())` | — | — |
| `lastmodified` | bigint | no | `date_part('epoch', now())` | — | — |
| `group` | integer | no | — | yes | [groups](/entities/groups.md) |
| `fork` | integer | yes | — | yes | [forks](/entities/forks.md) |
| `application` | integer | yes | — | yes | [applications](/entities/applications.md) |
| `identifier` | character varying(200) | yes | — | yes | — |
| `writable` | smallint | no | `0` | — | — |

# Foreign Keys

- `group` → [groups](/entities/groups.md) (`groups.ID`)
- `fork` → [forks](/entities/forks.md) (`forks.ID`)
- `application` → [applications](/entities/applications.md) (`applications.ID`)

# Indexes

- `fk_permissions_application` — gin, partial on `application`
- `fk_permissions_fork` — gin, partial on `fork`
- `u_permissions_group_fork_application_identifier` — btree, unique on `group, fork, application, identifier`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listPermissions`
- get: `getPermission`
- exists: `existsPermission`
<!-- okf:generated:end -->
