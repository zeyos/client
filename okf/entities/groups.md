---
type: ZeyOS Entity
title: Groups
description: User groups.
resource: zeyos://api/groups
tags: [platform, generated]
api_backed: true
list_operation: listGroups
visibility_column: false
---

<!-- okf:generated:start — rewritten by scripts/generate-okf.mjs; do not edit by hand -->
# Schema

| Column | Type | Nullable | Default | Indexed | FK |
|---|---|---|---|---|---|
| `ID` | integer | no | — | yes | — |
| `creator` | integer | yes | — | — | — |
| `creationdate` | bigint | no | `date_part('epoch', now())` | — | — |
| `lastmodified` | bigint | no | `date_part('epoch', now())` | — | — |
| `leader` | integer | yes | — | — | [users](/entities/users.md) |
| `activity` | smallint | no | `0` | — | — |
| `name` | text | no | — | yes | — |
| `description` | text | no | `''` | — | — |

# Foreign Keys

- `leader` → [users](/entities/users.md) (`users.ID`)

# Enums

### `activity`

`0` = ACTIVE · `1` = DEACTIVATED · `2` = DELETED

# Indexes

- `s_groups_name` — gin on `name`
- `u_groups_name` — btree, unique on `lower(name)`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listGroups`
- get: `getGroup`
- exists: `existsGroup`
<!-- okf:generated:end -->
