---
type: ZeyOS Entity
title: Comments
description: Record-linked comments.
resource: zeyos://api/comments
tags: [collaboration, generated]
api_backed: true
list_operation: listComments
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
| `record` | bigint | no | — | yes | [records](/entities/records.md) |
| `date` | bigint | no | `EXTRACT(epoch FROM now())` | yes | — |
| `sender` | text | no | `''` | — | — |
| `text` | text | no | `''` | — | — |
| `meta` | json | yes | — | — | — |

# Foreign Keys

- `record` → [records](/entities/records.md) (`records.ID`)

# Indexes

- `fk_comments_record` — btree on `record`
- `i_comments_date` — btree on `date`

# Operations

- list: `listComments`
- get: `getComment`
- create: `createComment`
- update: `updateComment`
- delete: `deleteComment`
- exists: `existsComment`
<!-- okf:generated:end -->
