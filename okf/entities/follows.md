---
type: ZeyOS Entity
title: Follows
description: Follow/watch subscriptions on entities.
resource: zeyos://api/follows
tags: [collaboration, generated]
api_backed: true
list_operation: listFollows
visibility_column: false
---

<!-- okf:generated:start — rewritten by scripts/generate-okf.mjs; do not edit by hand -->
# Schema

| Column | Type | Nullable | Default | Indexed | FK |
|---|---|---|---|---|---|
| `ID` | bigint | no | — | yes | — |
| `creator` | integer | no | — | yes | [users](/entities/users.md) |
| `creationdate` | bigint | no | `date_part('epoch', now())` | — | — |
| `lastmodified` | bigint | no | `EXTRACT(epoch FROM now())` | — | — |
| `entity` | t_entity | no | — | yes | — |
| `index` | bigint | no | — | yes | — |

# Foreign Keys

- `creator` → [users](/entities/users.md) (`users.ID`)

# Indexes

- `u_follows_entity_creator_index` — btree, unique on `entity, creator, index`

# Operations

- list: `listFollows`
- get: `getFollow`
- create: `createFollow`
- update: `updateFollow`
- delete: `deleteFollow`
- exists: `existsFollow`
<!-- okf:generated:end -->
