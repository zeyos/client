---
type: ZeyOS Entity
title: Payments
description: Cash movement records.
resource: zeyos://api/payments
tags: [billing, generated]
api_backed: true
list_operation: listPayments
visibility_column: false
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
| `ledger` | integer | yes | — | yes | [ledgers](/entities/ledgers.md) |
| `transaction` | integer | yes | — | yes | [transactions](/entities/transactions.md) |
| `account` | integer | yes | — | yes | [accounts](/entities/accounts.md) |
| `date` | bigint | no | `date_part('epoch', now())` | yes | — |
| `subject` | text | no | `''` | yes | — |
| `status` | smallint | no | `0` | — | — |
| `amount` | double precision | no | — | — | — |
| `autoadvance` | smallint | no | `0` | — | — |
| `description` | text | no | `''` | — | — |

# Foreign Keys

- `fork` → [forks](/entities/forks.md) (`forks.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)
- `assigneduser` → [users](/entities/users.md) (`users.ID`)
- `ledger` → [ledgers](/entities/ledgers.md) (`ledgers.ID`)
- `transaction` → [transactions](/entities/transactions.md) (`transactions.ID`)
- `account` → [accounts](/entities/accounts.md) (`accounts.ID`)

# Enums

### `status`

`0` = DRAFT · `1` = COMPLETED · `2` = CANCELLED · `3` = BOOKED

# Indexes

- `fk_payments_account` — btree, partial on `account`
- `fk_payments_assigneduser` — gin, partial on `assigneduser`
- `fk_payments_fork` — gin, partial on `fork`
- `fk_payments_ledger` — gin, partial on `ledger`
- `fk_payments_ownergroup` — gin on `ownergroup`
- `fk_payments_transaction` — btree, partial on `transaction`
- `i_payments_date` — btree on `date`
- `i_payments_nofork` — gin, partial on `fork`
- `i_payments_noowner` — gin, partial on `ownergroup`
- `s_payments_subject` — gin, partial on `subject`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listPayments`
- get: `getPayment`
- create: `createPayment`
- update: `updatePayment`
- delete: `deletePayment`
- exists: `existsPayment`
<!-- okf:generated:end -->

# Notes

Cash basis. Links to a `transaction` or directly to an `account`. Sum `amount` for cash received.
