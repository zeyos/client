---
type: ZeyOS Entity
title: Mailing Lists
description: Mailing list definitions.
resource: zeyos://api/mailinglists
tags: [outreach, generated]
api_backed: true
list_operation: listMailingLists
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
| `campaign` | integer | yes | — | yes | [campaigns](/entities/campaigns.md) |
| `visibility` | smallint | no | `0` | — | — |
| `name` | text | no | — | yes | — |
| `sender` | text | no | `''` | yes | — |
| `description` | text | no | `''` | — | — |

# Foreign Keys

- `fork` → [forks](/entities/forks.md) (`forks.ID`)
- `owneruser` → [users](/entities/users.md) (`users.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)
- `assigneduser` → [users](/entities/users.md) (`users.ID`)
- `campaign` → [campaigns](/entities/campaigns.md) (`campaigns.ID`)

# Enums

### `visibility`

`0` = REGULAR · `1` = ARCHIVED · `2` = DELETED

# Indexes

- `fk_mailinglists_assigneduser` — gin, partial on `assigneduser`
- `fk_mailinglists_campaign` — btree, partial on `campaign`
- `fk_mailinglists_fork` — gin, partial on `fork`
- `fk_mailinglists_ownergroup` — gin, partial on `ownergroup`
- `fk_mailinglists_owneruser` — gin, partial on `owneruser`
- `i_mailinglists_nofork` — gin, partial on `fork`
- `i_mailinglists_noowner` — gin, partial on `ownergroup`
- `s_mailinglists_name` — gin on `name`
- `s_mailinglists_sender` — gin, partial on `sender`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listMailingLists`
- get: `getMailingList`
- create: `createMailingList`
- update: `updateMailingList`
- delete: `deleteMailingList`
- exists: `existsMailingList`
<!-- okf:generated:end -->
