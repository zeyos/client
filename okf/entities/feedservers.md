---
type: ZeyOS Entity
title: Feed Servers
description: Feed server definitions.
resource: zeyos://api/feedservers
tags: [platform, generated]
api_backed: true
list_operation: listFeedServers
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
| `channel` | integer | yes | — | — | [channels](/entities/channels.md) |
| `activity` | smallint | no | `0` | — | — |
| `name` | text | no | — | yes | — |
| `url` | text | no | — | yes | — |
| `username` | text | no | `''` | — | — |
| `notify` | smallint | no | `0` | — | — |
| `etag` | text | no | `''` | — | — |
| `description` | text | no | `''` | — | — |
| `password` | bytea | yes | — | — | — |

# Foreign Keys

- `owneruser` → [users](/entities/users.md) (`users.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)
- `recipientuser` → [users](/entities/users.md) (`users.ID`)
- `recipientgroup` → [groups](/entities/groups.md) (`groups.ID`)
- `channel` → [channels](/entities/channels.md) (`channels.ID`)

# Enums

### `activity`

`0` = ACTIVE · `1` = DEACTIVATED · `2` = DELETED

# Indexes

- `fk_feedservers_ownergroup` — gin, partial on `ownergroup`
- `fk_feedservers_owneruser` — gin, partial on `owneruser`
- `i_feedservers_noowner` — gin, partial on `ownergroup`
- `s_feedservers_name` — gin on `name`
- `s_feedservers_url` — gin on `url`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listFeedServers`
- get: `getFeedServer`
- create: `createFeedServer`
- update: `updateFeedServer`
- delete: `deleteFeedServer`
- exists: `existsFeedServer`
<!-- okf:generated:end -->
