---
type: ZeyOS Entity
title: Categorys
description: Category definitions.
resource: zeyos://api/categories
tags: [commerce, generated]
api_backed: true
list_operation: listCategorys
visibility_column: false
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
| `creationdate` | bigint | no | `date_part('epoch', now())` | — | — |
| `lastmodified` | bigint | no | `EXTRACT(epoch FROM now())` | — | — |
| `entity` | text | no | — | yes | — |
| `name` | text | no | — | yes | — |

# Foreign Keys

- `fork` → [forks](/entities/forks.md) (`forks.ID`)
- `owneruser` → [users](/entities/users.md) (`users.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)

# Indexes

- `i_categories_entity_name_root` — btree, partial on `entity, name`
- `i_categories_entity_name_sub` — btree, partial on `entity, name`
- `i_categories_fork_entity_name_root` — btree, partial on `fork, entity, name`
- `i_categories_fork_entity_name_sub` — btree, partial on `fork, entity, name`
- `u_categories_fork_entity_name_owneruser_ownergroup` — btree, unique on `fork, entity, name, owneruser, ownergroup`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listCategorys`
- get: `getCategory`
- create: `createCategory`
- update: `updateCategory`
- delete: `deleteCategory`
- exists: `existsCategory`
<!-- okf:generated:end -->

# Notes

operationId trap: list op is `listCategorys` (sic); singular ops use `Category`.
