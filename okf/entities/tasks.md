---
type: ZeyOS Entity
title: Tasks
description: Actionable delivery work.
resource: zeyos://api/tasks
tags: [work, generated]
api_backed: true
list_operation: listTasks
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
| `davserver` | integer | yes | — | yes | [davservers](/entities/davservers.md) |
| `ticket` | integer | yes | — | yes | [tickets](/entities/tickets.md) |
| `project` | integer | yes | — | yes | [projects](/entities/projects.md) |
| `visibility` | smallint | no | `0` | — | — |
| `name` | text | no | — | yes | — |
| `tasknum` | text | no | `''` | yes | — |
| `datefrom` | bigint | yes | — | — | — |
| `duedate` | bigint | yes | — | — | — |
| `status` | smallint | no | `0` | — | — |
| `priority` | smallint | no | `2` | — | — |
| `projectedeffort` | integer | no | `0` | — | — |
| `description` | text | no | `''` | — | — |

# Foreign Keys

- `fork` → [forks](/entities/forks.md) (`forks.ID`)
- `owneruser` → [users](/entities/users.md) (`users.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)
- `assigneduser` → [users](/entities/users.md) (`users.ID`)
- `davserver` → [davservers](/entities/davservers.md) (`davservers.ID`)
- `ticket` → [tickets](/entities/tickets.md) (`tickets.ID`)
- `project` → [projects](/entities/projects.md) (`projects.ID`)

# Enums

### `visibility`

`0` = REGULAR · `1` = ARCHIVED · `2` = DELETED

### `status`

`0` = NOTSTARTED · `1` = AWAITINGACCEPTANCE · `2` = ACCEPTED · `3` = REJECTED · `4` = ACTIVE · `5` = INACTIVE · `6` = FEEDBACKREQUIRED · `7` = TESTING · `8` = CANCELLED · `9` = COMPLETED · `10` = FAILED · `11` = BOOKED

### `priority`

`0` = LOWEST · `1` = LOW · `2` = MEDIUM · `3` = HIGH · `4` = HIGHEST

# Indexes

- `fk_tasks_assigneduser` — gin, partial on `assigneduser`
- `fk_tasks_davserver` — gin, partial on `davserver`
- `fk_tasks_fork` — gin, partial on `fork`
- `fk_tasks_ownergroup` — gin, partial on `ownergroup`
- `fk_tasks_owneruser` — gin, partial on `owneruser`
- `fk_tasks_project` — gin, partial on `project`
- `fk_tasks_ticket` — btree, partial on `ticket`
- `i_tasks_nofork` — gin, partial on `fork`
- `i_tasks_noowner` — gin, partial on `ownergroup`
- `s_tasks_name` — gin on `name`
- `s_tasks_tasknum` — gin, partial on `tasknum`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listTasks`
- get: `getTask`
- create: `createTask`
- update: `updateTask`
- delete: `deleteTask`
- exists: `existsTask`
<!-- okf:generated:end -->
