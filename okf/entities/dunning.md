---
type: ZeyOS Entity
title: Dunning Notices
description: Collection or dunning notices.
resource: zeyos://api/dunning
tags: [collections, generated]
api_backed: true
list_operation: listDunningNotices
visibility_column: false
---

<!-- okf:generated:start — rewritten by scripts/generate-okf.mjs; do not edit by hand -->
# Schema

| Column | Type | Nullable | Default | Indexed | FK |
|---|---|---|---|---|---|
| `ID` | integer | no | — | yes | — |
| `fork` | integer | yes | — | yes | [forks](/entities/forks.md) |
| `ownergroup` | integer | yes | — | yes | [groups](/entities/groups.md) |
| `creator` | integer | yes | — | — | — |
| `assigneduser` | integer | yes | — | yes | [users](/entities/users.md) |
| `creationdate` | bigint | no | `date_part('epoch', now())` | — | — |
| `lastmodified` | bigint | no | `date_part('epoch', now())` | — | — |
| `account` | integer | yes | — | yes | [accounts](/entities/accounts.md) |
| `dunningnum` | text | no | — | yes | — |
| `type` | smallint | no | `0` | yes | — |
| `date` | bigint | no | `date_part('epoch', now())` | yes | — |
| `duedate` | bigint | yes | — | — | — |
| `status` | smallint | no | `0` | — | — |
| `fee` | double precision | no | `0` | — | — |
| `recipient` | text | no | `''` | — | — |
| `address` | text | no | `''` | — | — |
| `postalcode` | text | no | `''` | — | — |
| `city` | text | no | `''` | — | — |
| `region` | text | no | `''` | — | — |
| `country` | character varying(2) | no | `''` | — | — |

# Foreign Keys

- `fork` → [forks](/entities/forks.md) (`forks.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)
- `assigneduser` → [users](/entities/users.md) (`users.ID`)
- `account` → [accounts](/entities/accounts.md) (`accounts.ID`)

# Enums

### `type`

`0` = LISTING · `1` = REMINDER · `2` = NOTICE

### `status`

`0` = DRAFT · `1` = BOOKED · `2` = CANCELLED · `3` = CLOSED

# Indexes

- `fk_dunning_account` — btree, partial on `account`
- `fk_dunning_assigneduser` — gin, partial on `assigneduser`
- `fk_dunning_fork` — gin, partial on `fork`
- `fk_dunning_ownergroup` — gin on `ownergroup`
- `i_dunning_date` — btree on `date`
- `i_dunning_dunningnum` — btree on `dunningnum`
- `i_dunning_nofork` — gin, partial on `fork`
- `i_dunning_noowner` — gin, partial on `ownergroup`
- `s_dunning_dunningnum` — gin on `dunningnum`
- `u_dunning_dunningnum_type` — btree, unique, partial on `dunningnum, type`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listDunningNotices`
- get: `getDunningNotice`
- create: `createDunningNotice`
- update: `updateDunningNotice`
- delete: `deleteDunningNotice`
- exists: `existsDunningNotice`
<!-- okf:generated:end -->

# Notes

operationId trap: list via `listDunningNotices` / get via `getDunningNotice` (NOT `listDunning`). A collection-stage object, not the receivable itself.
