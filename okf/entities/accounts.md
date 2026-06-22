---
type: ZeyOS Entity
title: Accounts
description: Customer, supplier, prospect, or employee master records.
resource: zeyos://api/accounts
tags: [crm, generated]
api_backed: true
list_operation: listAccounts
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
| `contact` | integer | yes | — | yes | [contacts](/entities/contacts.md) |
| `visibility` | smallint | no | `0` | — | — |
| `lastname` | text | no | `''` | yes | — |
| `firstname` | text | no | `''` | yes | — |
| `type` | smallint | no | `0` | — | — |
| `customernum` | text | no | `''` | yes | — |
| `suppliernum` | text | no | `''` | yes | — |
| `taxid` | text | no | `''` | — | — |
| `currency` | character varying(3) | no | — | — | — |
| `locked` | smallint | no | `0` | — | — |
| `excludetax` | smallint | no | `0` | — | — |
| `description` | text | no | `''` | — | — |

# Foreign Keys

- `fork` → [forks](/entities/forks.md) (`forks.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)
- `assigneduser` → [users](/entities/users.md) (`users.ID`)
- `contact` → [contacts](/entities/contacts.md) (`contacts.ID`)

# Enums

### `visibility`

`0` = REGULAR · `1` = ARCHIVED · `2` = DELETED

### `type`

`0` = PROSPECT · `1` = CUSTOMER · `2` = SUPPLIER · `3` = CUSTOMERANDSUPPLIER · `4` = COMPETITOR · `5` = EMPLOYEE

# Indexes

- `fk_accounts_assigneduser` — gin, partial on `assigneduser`
- `fk_accounts_contact` — btree, partial on `contact`
- `fk_accounts_fork` — gin, partial on `fork`
- `fk_accounts_ownergroup` — gin on `ownergroup`
- `i_accounts_lastname_firstname` — btree on `lastname, firstname`
- `i_accounts_nofork` — gin, partial on `fork`
- `i_accounts_noowner` — gin, partial on `ownergroup`
- `s_accounts_customernum` — gin, partial on `customernum`
- `s_accounts_firstname` — gin, partial on `firstname`
- `s_accounts_lastname` — gin, partial on `lastname`
- `s_accounts_suppliernum` — gin, partial on `suppliernum`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listAccounts`
- get: `getAccount`
- create: `createAccount`
- update: `updateAccount`
- delete: `deleteAccount`
- exists: `existsAccount`
<!-- okf:generated:end -->

# Notes

No `name` column — use `lastname` + `firstname`. `type`: 0=PROSPECT,1=CUSTOMER,2=SUPPLIER,3=CUSTOMERANDSUPPLIER,4=COMPETITOR,5=EMPLOYEE. `createAccount` REQUIRES `currency` (NOT NULL, no default) or it 500s.
