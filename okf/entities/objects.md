---
type: ZeyOS Entity
title: Objects
description: Custom object records with arbitrary JSON payloads.
resource: zeyos://api/objects
tags: [platform, generated]
api_backed: true
list_operation: listObjects
visibility_column: true
---

<!-- okf:generated:start — rewritten by scripts/generate-okf.mjs; do not edit by hand -->
# Schema

| Column | Type | Nullable | Default | Indexed | FK |
|---|---|---|---|---|---|
| `ID` | integer | no | — | yes | — |
| `fork` | integer | yes | — | yes | [forks](/entities/forks.md) |
| `owneruser` | integer | yes | — | yes | [users](/entities/users.md) |
| `ownergroup` | integer | yes | — | yes | [groups](/entities/groups.md) |
| `creator` | integer | yes | — | — | — |
| `assigneduser` | integer | yes | — | yes | [users](/entities/users.md) |
| `creationdate` | bigint | no | `date_part('epoch', now())` | — | — |
| `lastmodified` | bigint | no | `date_part('epoch', now())` | — | — |
| `binfile` | integer | yes | — | yes | [binfiles](/entities/binfiles.md) |
| `visibility` | smallint | no | `0` | — | — |
| `name` | text | no | — | yes | — |
| `entity` | text | no | — | yes | — |
| `date` | bigint | no | `EXTRACT(epoch FROM now())` | yes | — |
| `description` | text | no | `''` | — | — |
| `data` | json | yes | — | — | — |

# Foreign Keys

- `fork` → [forks](/entities/forks.md) (`forks.ID`)
- `owneruser` → [users](/entities/users.md) (`users.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)
- `assigneduser` → [users](/entities/users.md) (`users.ID`)
- `binfile` → [binfiles](/entities/binfiles.md) (`binfiles.ID`)

# Enums

### `visibility`

`0` = REGULAR · `1` = ARCHIVED · `2` = DELETED

# Indexes

- `fk_objects_assigneduser` — gin, partial on `assigneduser`
- `fk_objects_binfile` — btree, partial on `binfile`
- `fk_objects_fork` — gin, partial on `fork`
- `fk_objects_ownergroup` — gin, partial on `ownergroup`
- `fk_objects_owneruser` — gin, partial on `owneruser`
- `i_objects_date` — btree on `date`
- `i_objects_entity` — gin on `entity`
- `i_objects_nofork` — gin, partial on `fork`
- `i_objects_noowner` — gin, partial on `ownergroup`
- `s_objects_name` — gin on `name`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listObjects`
- get: `getObject`
- create: `createObject`
- update: `updateObject`
- delete: `deleteObject`
- exists: `existsObject`
<!-- okf:generated:end -->
