---
type: ZeyOS Entity
title: Projects
description: Top-level initiatives.
resource: zeyos://api/projects
tags: [work, generated]
api_backed: true
list_operation: listProjects
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
| `account` | integer | yes | — | yes | [accounts](/entities/accounts.md) |
| `visibility` | smallint | no | `0` | — | — |
| `name` | text | no | — | yes | — |
| `projectnum` | text | no | `''` | yes | — |
| `status` | smallint | no | `0` | — | — |
| `description` | text | no | `''` | — | — |

# Foreign Keys

- `fork` → [forks](/entities/forks.md) (`forks.ID`)
- `owneruser` → [users](/entities/users.md) (`users.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)
- `assigneduser` → [users](/entities/users.md) (`users.ID`)
- `account` → [accounts](/entities/accounts.md) (`accounts.ID`)

# Enums

### `visibility`

`0` = REGULAR · `1` = ARCHIVED · `2` = DELETED

### `status`

`0` = DRAFT · `1` = NOTSTARTED · `2` = AWAITINGAPPROVAL · `3` = APPROVED · `4` = DISMISSED · `5` = ACTIVE · `6` = INACTIVE · `7` = TESTING · `8` = CANCELLED · `9` = COMPLETED · `10` = FAILED · `11` = BOOKED

# Indexes

- `fk_projects_account` — btree, partial on `account`
- `fk_projects_assigneduser` — gin, partial on `assigneduser`
- `fk_projects_fork` — gin, partial on `fork`
- `fk_projects_ownergroup` — gin, partial on `ownergroup`
- `fk_projects_owneruser` — gin, partial on `owneruser`
- `i_projects_nofork` — gin, partial on `fork`
- `i_projects_noowner` — gin, partial on `ownergroup`
- `s_projects_name` — gin on `name`
- `s_projects_projectnum` — gin, partial on `projectnum`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listProjects`
- get: `getProject`
- create: `createProject`
- update: `updateProject`
- delete: `deleteProject`
- exists: `existsProject`
<!-- okf:generated:end -->
