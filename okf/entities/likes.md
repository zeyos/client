---
type: ZeyOS Entity
title: Likes
description: Lightweight positive reactions on records.
resource: zeyos://api/likes
tags: [collaboration, generated]
api_backed: true
list_operation: listLikes
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
| `record` | bigint | no | — | yes | [records](/entities/records.md) |

# Foreign Keys

- `creator` → [users](/entities/users.md) (`users.ID`)
- `record` → [records](/entities/records.md) (`records.ID`)

# Indexes

- `u_likes_record_creator` — btree, unique on `record, creator`

# Operations

- list: `listLikes`
- get: `getLike`
- create: `createLike`
- update: `updateLike`
- delete: `deleteLike`
- exists: `existsLike`
<!-- okf:generated:end -->
