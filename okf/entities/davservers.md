---
type: ZeyOS Entity
title: DAVServers
description: DAV (calendar/contact sync) server definitions.
resource: zeyos://api/davservers
tags: [platform, generated]
api_backed: true
list_operation: listDAVServers
visibility_column: false
---

<!-- okf:generated:start — rewritten by scripts/generate-okf.mjs; do not edit by hand -->
# Schema

| Column | Type | Nullable | Default | Indexed | FK |
|---|---|---|---|---|---|
| `ID` | integer | no | — | yes | — |
| `owneruser` | integer | yes | — | yes | [users](/entities/users.md) |
| `ownergroup` | integer | yes | — | yes | [groups](/entities/groups.md) |
| `creator` | integer | yes | — | — | — |
| `creationdate` | bigint | no | `date_part('epoch', now())` | — | — |
| `lastmodified` | bigint | no | `date_part('epoch', now())` | — | — |
| `recipientuser` | integer | yes | — | — | [users](/entities/users.md) |
| `recipientgroup` | integer | yes | — | — | [groups](/entities/groups.md) |
| `activity` | smallint | no | `0` | — | — |
| `name` | text | no | — | yes | — |
| `type` | smallint | no | `0` | — | — |
| `url` | text | no | — | yes | — |
| `username` | text | no | `''` | — | — |
| `ctag` | text | no | `''` | — | — |
| `synctoken` | text | no | `''` | — | — |
| `description` | text | no | `''` | — | — |
| `password` | bytea | yes | — | — | — |

# Foreign Keys

- `owneruser` → [users](/entities/users.md) (`users.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)
- `recipientuser` → [users](/entities/users.md) (`users.ID`)
- `recipientgroup` → [groups](/entities/groups.md) (`groups.ID`)

# Enums

### `activity`

`0` = ACTIVE · `1` = DEACTIVATED · `2` = DELETED

### `type`

`0` = CONTACTS · `1` = TASKS · `2` = APPOINTMENTS

# Indexes

- `fk_davservers_ownergroup` — gin, partial on `ownergroup`
- `fk_davservers_owneruser` — gin, partial on `owneruser`
- `i_davservers_noowner` — gin, partial on `ownergroup`
- `s_davservers_name` — gin on `name`
- `s_davservers_url` — gin on `url`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listDAVServers`
- get: `getDAVServer`
- create: `createDAVServer`
- update: `updateDAVServer`
- delete: `deleteDAVServer`
- exists: `existsDAVServer`
<!-- okf:generated:end -->

# Notes

operationId: `listDAVServers`.
