---
type: ZeyOS Entity
title: Records
description: Generic feed and discussion records with entity/index references.
resource: zeyos://api/records
tags: [collaboration, generated]
api_backed: true
list_operation: listRecords
visibility_column: false
---

<!-- okf:generated:start — rewritten by scripts/generate-okf.mjs; do not edit by hand -->
# Schema

| Column | Type | Nullable | Default | Indexed | FK |
|---|---|---|---|---|---|
| `ID` | bigint | no | — | yes | — |
| `fork` | integer | yes | — | yes | [forks](/entities/forks.md) |
| `owneruser` | integer | yes | — | yes | [users](/entities/users.md) |
| `ownergroup` | integer | yes | — | yes | [groups](/entities/groups.md) |
| `creator` | integer | yes | — | yes | — |
| `assigneduser` | integer | yes | — | yes | [users](/entities/users.md) |
| `creationdate` | bigint | no | `date_part('epoch', now())` | — | — |
| `lastmodified` | bigint | no | `date_part('epoch', now())` | — | — |
| `entity` | t_entity | yes | — | yes | — |
| `index` | integer | yes | — | yes | — |
| `channel` | integer | yes | — | yes | [channels](/entities/channels.md) |
| `flag` | smallint | no | `0` | — | — |
| `date` | bigint | no | `date_part('epoch', now())` | yes | — |
| `stickydate` | bigint | yes | — | yes | — |
| `sender` | text | no | `''` | yes | — |
| `location` | text | no | `''` | — | — |
| `text` | text | no | `''` | yes | — |
| `meta` | json | yes | — | — | — |

# Foreign Keys

- `fork` → [forks](/entities/forks.md) (`forks.ID`)
- `owneruser` → [users](/entities/users.md) (`users.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)
- `assigneduser` → [users](/entities/users.md) (`users.ID`)
- `channel` → [channels](/entities/channels.md) (`channels.ID`)

# Enums

### `flag`

`0` = REGULAR · `1` = ASSOCONLY · `2` = MINDLOGONLY · `3` = MONITOR · `4` = FEED

# Indexes

- `fk_records_assigneduser` — gin, partial on `assigneduser`
- `fk_records_channel` — btree, partial on `channel`
- `fk_records_fork` — gin, partial on `fork`
- `fk_records_ownergroup` — gin, partial on `ownergroup`
- `fk_records_owneruser` — gin, partial on `owneruser`
- `i_records_creator` — gin, partial on `creator`
- `i_records_date` — btree on `date`
- `i_records_entity_index` — btree, partial on `entity, index`
- `i_records_noowner` — gin, partial on `ownergroup`
- `i_records_stickydate` — btree, partial on `stickydate`
- `s_records_sender` — gin, partial on `sender`
- `s_records_text` — gin, partial on `text`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listRecords`
- get: `getRecord`
- create: `createRecord`
- update: `updateRecord`
- delete: `deleteRecord`
- exists: `existsRecord`
<!-- okf:generated:end -->
