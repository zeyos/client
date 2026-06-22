---
type: ZeyOS Entity
title: Storages
description: Inventory storage locations.
resource: zeyos://api/storages
tags: [commerce, generated]
api_backed: true
list_operation: listStorages
visibility_column: true
---

<!-- okf:generated:start — rewritten by scripts/generate-okf.mjs; do not edit by hand -->
# Schema

| Column | Type | Nullable | Default | Indexed | FK |
|---|---|---|---|---|---|
| `ID` | integer | no | — | yes | — |
| `fork` | integer | yes | — | yes | [forks](/entities/forks.md) |
| `ownergroup` | integer | yes | — | yes | [groups](/entities/groups.md) |
| `creator` | integer | yes | — | — | — |
| `creationdate` | bigint | no | `date_part('epoch', now())` | — | — |
| `lastmodified` | bigint | no | `date_part('epoch', now())` | — | — |
| `visibility` | smallint | no | `0` | — | — |
| `name` | text | no | — | yes | — |
| `description` | text | no | `''` | — | — |

# Foreign Keys

- `fork` → [forks](/entities/forks.md) (`forks.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)

# Enums

### `visibility`

`0` = REGULAR · `1` = ARCHIVED · `2` = DELETED

# Indexes

- `fk_storages_fork` — gin, partial on `fork`
- `fk_storages_ownergroup` — gin on `ownergroup`
- `i_storages_nofork` — gin, partial on `fork`
- `i_storages_noowner` — gin, partial on `ownergroup`
- `s_storages_name` — gin on `name`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listStorages`
- get: `getStorage`
- create: `createStorage`
- update: `updateStorage`
- delete: `deleteStorage`
- exists: `existsStorage`
<!-- okf:generated:end -->
