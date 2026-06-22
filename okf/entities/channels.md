---
type: ZeyOS Entity
title: Channels
description: Collaboration or distribution channels.
resource: zeyos://api/channels
tags: [collaboration, generated]
api_backed: true
list_operation: listChannels
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
| `lastmodified` | bigint | no | `EXTRACT(epoch FROM now())` | — | — |
| `activity` | smallint | no | `0` | — | — |
| `name` | text | no | — | yes | — |
| `description` | text | no | `''` | — | — |

# Foreign Keys

- `owneruser` → [users](/entities/users.md) (`users.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)

# Enums

### `activity`

`0` = ACTIVE · `1` = DEACTIVATED · `2` = DELETED

# Indexes

- `fk_channels_ownergroup` — gin, partial on `ownergroup`
- `fk_channels_owneruser` — gin, partial on `owneruser`
- `s_channels_name` — gin on `name`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listChannels`
- get: `getChannel`
- create: `createChannel`
- update: `updateChannel`
- delete: `deleteChannel`
- exists: `existsChannel`
<!-- okf:generated:end -->
