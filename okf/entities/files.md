---
type: ZeyOS Entity
title: Files
description: Attachments linked to a record or comment.
resource: zeyos://api/files
tags: [knowledge, generated]
api_backed: true
list_operation: listFiles
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
| `record` | bigint | yes | — | yes | [records](/entities/records.md) |
| `comment` | bigint | yes | — | yes | [comments](/entities/comments.md) |
| `binfile` | integer | yes | — | yes | [binfiles](/entities/binfiles.md) |
| `filename` | text | no | `''` | yes | — |
| `mimetype` | text | no | `'application/octet-stream'` | — | — |

# Foreign Keys

- `record` → [records](/entities/records.md) (`records.ID`)
- `comment` → [comments](/entities/comments.md) (`comments.ID`)
- `binfile` → [binfiles](/entities/binfiles.md) (`binfiles.ID`)

# Indexes

- `fk_files_binfile` — btree, partial on `binfile`
- `fk_files_comment` — btree, partial on `comment`
- `fk_files_record` — btree, partial on `record`
- `s_files_filename` — gin, partial on `filename`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listFiles`
- get: `getFile`
- create: `createFile`
- update: `updateFile`
- delete: `deleteFile`
- exists: `existsFile`
<!-- okf:generated:end -->
