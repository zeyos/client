---
type: ZeyOS Entity
title: Tickets
description: Support or service work items.
resource: zeyos://api/tickets
tags: [work, generated]
api_backed: true
list_operation: listTickets
visibility_column: true
---

<!-- okf:generated:start — rewritten by scripts/generate-okf.mjs; do not edit by hand -->
# Schema

| Column | Type | Nullable | Default | Indexed | FK |
|---|---|---|---|---|---|
| `ID` | integer | no | — | yes | — |
| `fork` | integer | yes | — | yes | [forks](/entities/forks.md) |
| `ownergroup` | integer | yes | — | yes | [groups](/entities/groups.md) |
| `creator` | integer | yes | — | — | — |
| `assigneduser` | integer | yes | — | yes | [users](/entities/users.md) |
| `creationdate` | bigint | no | `date_part('epoch', now())` | — | — |
| `lastmodified` | bigint | no | `date_part('epoch', now())` | — | — |
| `account` | integer | yes | — | yes | [accounts](/entities/accounts.md) |
| `project` | integer | yes | — | yes | [projects](/entities/projects.md) |
| `visibility` | smallint | no | `0` | — | — |
| `name` | text | no | — | yes | — |
| `ticketnum` | text | no | `''` | yes | — |
| `date` | bigint | no | `date_part('epoch', now())` | yes | — |
| `duedate` | bigint | yes | — | — | — |
| `status` | smallint | no | `0` | — | — |
| `priority` | smallint | no | `2` | — | — |
| `description` | text | no | `''` | — | — |
| `billingitems` | json | yes | — | — | — |
| `procurementitems` | json | yes | — | — | — |

# Foreign Keys

- `fork` → [forks](/entities/forks.md) (`forks.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)
- `assigneduser` → [users](/entities/users.md) (`users.ID`)
- `account` → [accounts](/entities/accounts.md) (`accounts.ID`)
- `project` → [projects](/entities/projects.md) (`projects.ID`)

# Enums

### `visibility`

`0` = REGULAR · `1` = ARCHIVED · `2` = DELETED

### `status`

`0` = NOTSTARTED · `1` = AWAITINGACCEPTANCE · `2` = ACCEPTED · `3` = REJECTED · `4` = ACTIVE · `5` = INACTIVE · `6` = FEEDBACKREQUIRED · `7` = TESTING · `8` = CANCELLED · `9` = COMPLETED · `10` = FAILED · `11` = BOOKED

### `priority`

`0` = LOWEST · `1` = LOW · `2` = MEDIUM · `3` = HIGH · `4` = HIGHEST

# Indexes

- `fk_tickets_account` — btree, partial on `account`
- `fk_tickets_assigneduser` — gin, partial on `assigneduser`
- `fk_tickets_fork` — gin, partial on `fork`
- `fk_tickets_ownergroup` — gin on `ownergroup`
- `fk_tickets_project` — gin, partial on `project`
- `i_tickets_date` — btree on `date`
- `i_tickets_nofork` — gin, partial on `fork`
- `i_tickets_noowner` — gin, partial on `ownergroup`
- `s_tickets_name` — gin on `name`
- `s_tickets_ticketnum` — gin, partial on `ticketnum`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listTickets`
- get: `getTicket`
- create: `createTicket`
- update: `updateTicket`
- delete: `deleteTicket`
- exists: `existsTicket`
<!-- okf:generated:end -->

# Notes

Closed = `status` IN [9 (COMPLETED), 11 (BOOKED)]. Filter time windows on the indexed `date` field, not `creationdate`/`lastmodified` (unindexed → HTTP 503). Has a `visibility` column. `priority`: 0=LOWEST…4=HIGHEST.
