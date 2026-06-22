---
type: ZeyOS Entity
title: Entities To Channels
description: Junction between records and channels.
resource: zeyos://api/entities2channels
tags: [collaboration, generated]
api_backed: true
list_operation: listEntitiesToChannels
visibility_column: false
---

<!-- okf:generated:start — rewritten by scripts/generate-okf.mjs; do not edit by hand -->
# Schema

| Column | Type | Nullable | Default | Indexed | FK |
|---|---|---|---|---|---|
| `ID` | bigint | no | — | yes | — |
| `creator` | integer | yes | — | — | — |
| `creationdate` | bigint | no | `date_part('epoch', now())` | — | — |
| `lastmodified` | bigint | no | `EXTRACT(epoch FROM now())` | — | — |
| `entity` | t_entity | no | — | yes | — |
| `index` | integer | no | — | yes | — |
| `channel` | integer | no | — | yes | [channels](/entities/channels.md) |

# Foreign Keys

- `channel` → [channels](/entities/channels.md) (`channels.ID`)

# Indexes

- `fk_entities2channels_channel` — btree on `channel`
- `u_entities2channels_entity_index` — btree, unique on `entity, index, +channel`

# Operations

- list: `listEntitiesToChannels`
- get: `getEntityToChannel`
- create: `createEntityToChannel`
- update: `updateEntityToChannel`
- delete: `deleteEntityToChannel`
- exists: `existsEntityToChannel`
<!-- okf:generated:end -->
