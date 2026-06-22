---
type: ZeyOS Entity
title: Documents
description: Formal file-like business documents.
resource: zeyos://api/documents
tags: [knowledge, generated]
api_backed: true
list_operation: listDocuments
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
| `creationdate` | bigint | no | `EXTRACT(epoch FROM now())` | — | — |
| `lastmodified` | bigint | no | `EXTRACT(epoch FROM now())` | — | — |
| `binfile` | integer | yes | — | yes | [binfiles](/entities/binfiles.md) |
| `visibility` | smallint | no | `0` | — | — |
| `name` | text | no | — | yes | — |
| `documentnum` | text | no | `''` | yes | — |
| `status` | smallint | no | `0` | — | — |
| `filename` | text | no | `''` | yes | — |
| `mimetype` | text | no | `'application/octet-stream'` | — | — |
| `public` | smallint | no | `0` | — | — |
| `description` | text | no | `''` | — | — |

# Foreign Keys

- `fork` → [forks](/entities/forks.md) (`forks.ID`)
- `owneruser` → [users](/entities/users.md) (`users.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)
- `assigneduser` → [users](/entities/users.md) (`users.ID`)
- `binfile` → [binfiles](/entities/binfiles.md) (`binfiles.ID`)

# Enums

### `visibility`

`0` = REGULAR · `1` = ARCHIVED · `2` = DELETED

### `status`

`0` = DRAFT · `1` = FEEDBACKREQUIRED · `2` = INREVISION · `3` = AWAITINGAPPROVAL · `4` = FINAL · `5` = OBSOLETE

# Indexes

- `fk_documents_assigneduser` — gin, partial on `assigneduser`
- `fk_documents_binfile` — btree, partial on `binfile`
- `fk_documents_fork` — gin, partial on `fork`
- `fk_documents_ownergroup` — gin, partial on `ownergroup`
- `fk_documents_owneruser` — gin, partial on `owneruser`
- `i_documents_nofork` — gin, partial on `fork`
- `i_documents_noowner` — gin, partial on `ownergroup`
- `s_documents_documentnum` — gin, partial on `documentnum`
- `s_documents_filename` — gin, partial on `filename`
- `s_documents_name` — gin on `name`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listDocuments`
- get: `getDocument`
- create: `createDocument`
- update: `updateDocument`
- delete: `deleteDocument`
- exists: `existsDocument`
<!-- okf:generated:end -->
