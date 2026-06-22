---
type: ZeyOS Entity
title: Contracts
description: Long-lived commercial agreements.
resource: zeyos://api/contracts
tags: [crm, generated]
api_backed: true
list_operation: listContracts
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
| `visibility` | smallint | no | `0` | — | — |
| `name` | text | no | — | yes | — |
| `contractnum` | text | no | `''` | yes | — |
| `date` | bigint | no | `EXTRACT(epoch FROM now())` | yes | — |
| `datefrom` | bigint | yes | — | — | — |
| `dateto` | bigint | yes | — | — | — |
| `datecancel` | bigint | yes | — | — | — |
| `status` | smallint | no | `0` | yes | — |
| `currency` | character varying(3) | no | — | — | — |
| `exchangerate` | double precision | no | `1` | — | — |
| `billingcycle` | smallint | yes | — | — | — |
| `lastbilling` | bigint | yes | — | — | — |
| `description` | text | no | `''` | — | — |
| `contractitems` | json | yes | — | — | — |
| `billingitems` | json | yes | — | — | — |
| `procurementitems` | json | yes | — | — | — |
| `autobilling` | json | yes | — | — | — |

# Foreign Keys

- `fork` → [forks](/entities/forks.md) (`forks.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)
- `assigneduser` → [users](/entities/users.md) (`users.ID`)
- `account` → [accounts](/entities/accounts.md) (`accounts.ID`)

# Enums

### `visibility`

`0` = REGULAR · `1` = ARCHIVED · `2` = DELETED

### `status`

`0` = DRAFT · `1` = AWAITINGAPPROVAL · `2` = APPROVED · `3` = DISMISSED · `4` = ACTIVE · `5` = INACTIVE · `6` = EXPIRED · `7` = CANCELLED · `8` = CLOSED

# Indexes

- `fk_contracts_account` — btree, partial on `account`
- `fk_contracts_assigneduser` — gin, partial on `assigneduser`
- `fk_contracts_fork` — gin, partial on `fork`
- `fk_contracts_ownergroup` — gin on `ownergroup`
- `i_contracts_autobilling` — gin, partial on `status`
- `i_contracts_date` — btree on `date`
- `i_contracts_nofork` — gin, partial on `fork`
- `i_contracts_noowner` — gin, partial on `ownergroup`
- `s_contracts_contractnum` — gin, partial on `contractnum`
- `s_contracts_name` — gin on `name`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listContracts`
- get: `getContract`
- create: `createContract`
- update: `updateContract`
- delete: `deleteContract`
- exists: `existsContract`
<!-- okf:generated:end -->
