---
type: ZeyOS Entity
title: Links
description: Link records with name and description.
resource: zeyos://api/links
tags: [platform, generated]
api_backed: true
list_operation: listLinks
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
| `visibility` | smallint | no | `0` | — | — |
| `name` | text | no | — | yes | — |
| `url` | text | no | `''` | yes | — |
| `expdate` | bigint | yes | — | — | — |
| `username` | text | no | `''` | — | — |
| `password` | text | no | `''` | — | — |
| `visits` | integer | no | `0` | — | — |
| `description` | text | no | `''` | — | — |
| `password_encrypted` | bytea | yes | — | — | — |
| `otpsecret` | bytea | yes | — | — | — |

# Foreign Keys

- `fork` → [forks](/entities/forks.md) (`forks.ID`)
- `owneruser` → [users](/entities/users.md) (`users.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)
- `assigneduser` → [users](/entities/users.md) (`users.ID`)

# Enums

### `visibility`

`0` = REGULAR · `1` = ARCHIVED · `2` = DELETED

# Indexes

- `fk_links_assigneduser` — gin, partial on `assigneduser`
- `fk_links_fork` — gin, partial on `fork`
- `fk_links_ownergroup` — gin, partial on `ownergroup`
- `fk_links_owneruser` — gin, partial on `owneruser`
- `i_links_nofork` — gin, partial on `fork`
- `i_links_noowner` — gin, partial on `ownergroup`
- `s_links_name` — gin on `name`
- `s_links_url` — gin, partial on `url`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listLinks`
- get: `getLink`
- create: `createLink`
- update: `updateLink`
- delete: `deleteLink`
- exists: `existsLink`
<!-- okf:generated:end -->
