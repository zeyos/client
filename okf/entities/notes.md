---
type: ZeyOS Entity
title: Notes
description: Text-centric internal knowledge items.
resource: zeyos://api/notes
tags: [knowledge, generated]
api_backed: true
list_operation: listNotes
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
| `binfile` | integer | yes | — | yes | [binfiles](/entities/binfiles.md) |
| `visibility` | smallint | no | `0` | — | — |
| `name` | text | no | — | yes | — |
| `status` | smallint | no | `0` | — | — |
| `contenttype` | text | no | `''` | — | — |
| `text` | text | no | `''` | — | — |
| `attachments` | text[] | yes | — | — | — |
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

- `fk_notes_assigneduser` — gin, partial on `assigneduser`
- `fk_notes_binfile` — btree, partial on `binfile`
- `fk_notes_fork` — gin, partial on `fork`
- `fk_notes_ownergroup` — gin, partial on `ownergroup`
- `fk_notes_owneruser` — gin, partial on `owneruser`
- `i_notes_nofork` — gin, partial on `fork`
- `i_notes_noowner` — gin, partial on `ownergroup`
- `s_notes_name` — gin on `name`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listNotes`
- get: `getNote`
- create: `createNote`
- update: `updateNote`
- delete: `deleteNote`
- exists: `existsNote`
<!-- okf:generated:end -->
