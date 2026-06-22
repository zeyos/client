---
type: ZeyOS Entity
title: Action Steps
description: Cross-record follow-up work items with assignee, due date, status, and effort.
resource: zeyos://api/actionsteps
tags: [work, generated]
api_backed: true
list_operation: listActionSteps
visibility_column: false
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
| `task` | integer | yes | — | yes | [tasks](/entities/tasks.md) |
| `ticket` | integer | yes | — | yes | [tickets](/entities/tickets.md) |
| `account` | integer | yes | — | yes | [accounts](/entities/accounts.md) |
| `transaction` | integer | yes | — | yes | [transactions](/entities/transactions.md) |
| `name` | text | no | — | yes | — |
| `actionnum` | text | no | `''` | yes | — |
| `date` | bigint | no | `date_part('epoch', now())` | yes | — |
| `duedate` | bigint | yes | — | — | — |
| `status` | smallint | no | `0` | — | — |
| `effort` | integer | no | `0` | — | — |
| `description` | text | no | `''` | — | — |

# Foreign Keys

- `fork` → [forks](/entities/forks.md) (`forks.ID`)
- `owneruser` → [users](/entities/users.md) (`users.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)
- `assigneduser` → [users](/entities/users.md) (`users.ID`)
- `task` → [tasks](/entities/tasks.md) (`tasks.ID`)
- `ticket` → [tickets](/entities/tickets.md) (`tickets.ID`)
- `account` → [accounts](/entities/accounts.md) (`accounts.ID`)
- `transaction` → [transactions](/entities/transactions.md) (`transactions.ID`)

# Enums

### `status`

`0` = DRAFT · `1` = COMPLETED · `2` = CANCELLED · `3` = BOOKED

# Indexes

- `fk_actionsteps_account` — btree, partial on `account`
- `fk_actionsteps_assigneduser` — gin, partial on `assigneduser`
- `fk_actionsteps_fork` — gin, partial on `fork`
- `fk_actionsteps_ownergroup` — gin, partial on `ownergroup`
- `fk_actionsteps_owneruser` — gin, partial on `owneruser`
- `fk_actionsteps_task` — btree, partial on `task`
- `fk_actionsteps_ticket` — btree, partial on `ticket`
- `fk_actionsteps_transaction` — btree, partial on `transaction`
- `i_actionsteps_date` — btree on `date`
- `i_actionsteps_nofork` — gin, partial on `fork`
- `i_actionsteps_noowner` — gin, partial on `ownergroup`
- `s_actionsteps_actionnum` — gin, partial on `actionnum`
- `s_actionsteps_name` — gin on `name`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listActionSteps`
- get: `getActionStep`
- create: `createActionStep`
- update: `updateActionStep`
- delete: `deleteActionStep`
- exists: `existsActionStep`
<!-- okf:generated:end -->

# Notes

Record-bound follow-ups (linked to a task, ticket, or account, with optional transaction). Do not inflate into full project tasks.
