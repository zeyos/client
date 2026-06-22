---
type: ZeyOS Entity
title: Forks
description: Module/fork definitions with identifiers and module names.
resource: zeyos://api/forks
tags: [platform, generated]
api_backed: true
list_operation: listForks
visibility_column: false
---

<!-- okf:generated:start — rewritten by scripts/generate-okf.mjs; do not edit by hand -->
# Schema

| Column | Type | Nullable | Default | Indexed | FK |
|---|---|---|---|---|---|
| `ID` | integer | no | — | yes | — |
| `creator` | integer | yes | — | — | — |
| `creationdate` | bigint | no | `EXTRACT(epoch FROM now())` | — | — |
| `lastmodified` | bigint | no | `EXTRACT(epoch FROM now())` | — | — |
| `group` | integer | yes | — | — | [groups](/entities/groups.md) |
| `activity` | smallint | no | `0` | — | — |
| `name` | text | no | — | yes | — |
| `identifier` | character varying(200) | no | — | yes | — |
| `module` | text | no | — | — | — |
| `color` | character varying(6) | no | `''` | — | — |
| `langaliases` | json | yes | — | — | — |
| `description` | text | no | `''` | — | — |
| `settings` | json | yes | — | — | — |

# Foreign Keys

- `group` → [groups](/entities/groups.md) (`groups.ID`)

# Enums

### `activity`

`0` = ACTIVE · `1` = DEACTIVATED · `2` = DELETED

# Indexes

- `s_forks_identifier` — gin on `identifier`
- `s_forks_name` — gin on `name`
- `u_forks_identifier` — btree, unique on `identifier`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listForks`
- get: `getFork`
- exists: `existsFork`
<!-- okf:generated:end -->
