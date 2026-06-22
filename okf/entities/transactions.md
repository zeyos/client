---
type: ZeyOS Entity
title: Transactions
description: Billing, procurement, or production business transactions.
resource: zeyos://api/transactions
tags: [billing, generated]
api_backed: true
list_operation: listTransactions
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
| `account` | integer | yes | — | yes | [accounts](/entities/accounts.md) |
| `item` | integer | yes | — | yes | [items](/entities/items.md) |
| `contract` | integer | yes | — | yes | [contracts](/entities/contracts.md) |
| `transactionnum` | text | no | — | yes | — |
| `type` | smallint | no | `0` | yes | — |
| `date` | bigint | no | `date_part('epoch', now())` | yes | — |
| `duedate` | bigint | yes | — | — | — |
| `status` | smallint | no | `0` | — | — |
| `calculation` | smallint | no | `0` | — | — |
| `productionfactor` | integer | yes | — | — | — |
| `currency` | character varying(3) | no | — | — | — |
| `exchangerate` | double precision | no | `1` | — | — |
| `taxid` | text | no | `''` | — | — |
| `shippingrecipient` | text | no | `''` | — | — |
| `shippingaddress` | text | no | `''` | — | — |
| `shippingpostalcode` | text | no | `''` | — | — |
| `shippingcity` | text | no | `''` | — | — |
| `shippingregion` | text | no | `''` | — | — |
| `shippingcountry` | character varying(2) | no | `''` | — | — |
| `billingrecipient` | text | no | `''` | — | — |
| `billingaddress` | text | no | `''` | — | — |
| `billingpostalcode` | text | no | `''` | — | — |
| `billingcity` | text | no | `''` | — | — |
| `billingregion` | text | no | `''` | — | — |
| `billingcountry` | character varying(2) | no | `''` | — | — |
| `sellertaxid` | text | no | `''` | — | — |
| `sellername` | text | no | `''` | — | — |
| `selleraddress` | text | no | `''` | — | — |
| `sellerpostalcode` | text | no | `''` | — | — |
| `sellercity` | text | no | `''` | — | — |
| `sellerregion` | text | no | `''` | — | — |
| `sellercountry` | character varying(2) | no | `''` | — | — |
| `discount` | double precision | no | `0` | — | — |
| `netamount` | double precision | no | `0` | — | — |
| `tax` | double precision | no | `0` | — | — |
| `margin` | double precision | no | `0` | — | — |
| `weight` | double precision | no | `0` | — | — |
| `items` | json | yes | — | — | — |

# Foreign Keys

- `fork` → [forks](/entities/forks.md) (`forks.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)
- `assigneduser` → [users](/entities/users.md) (`users.ID`)
- `account` → [accounts](/entities/accounts.md) (`accounts.ID`)
- `item` → [items](/entities/items.md) (`items.ID`)
- `contract` → [contracts](/entities/contracts.md) (`contracts.ID`)

# Enums

### `type`

`0` = BILLING_QUOTE · `1` = BILLING_ORDER · `2` = BILLING_DELIVERY · `3` = BILLING_INVOICE · `4` = BILLING_CREDIT · `5` = PROCUREMENT_REQUEST · `6` = PROCUREMENT_ORDER · `7` = PROCUREMENT_DELIVERY · `8` = PROCUREMENT_INVOICE · `9` = PROCUREMENT_CREDIT · `10` = PRODUCTION_FABRICATION · `11` = PRODUCTION_DISASSEMBLY

### `status`

`0` = DRAFT · `1` = BOOKED · `2` = HOLD · `3` = CANCELLED · `4` = CLOSED · `5` = PARTLYORDERED · `6` = PARTLYORDERED_CANCELLED · `7` = PARTLYORDERED_CLOSED · `8` = ORDERED · `9` = PARTLYDELIVERED · `10` = PARTLYDELIVERED_CANCELLED · `11` = PARTLYDELIVERED_CLOSED · `12` = DELIVERED · `13` = PARTLYINVOICED · `14` = PARTLYINVOICED_CANCELLED · `15` = PARTLYINVOICED_CLOSED · `16` = INVOICED · `17` = PARTLYPAID · `18` = PARTLYPAID_CANCELLED · `19` = PARTLYPAID_CLOSED · `20` = PAID · `21` = OVERPAID · `22` = PROCESSED · `23` = PROCESSED_CANCELLED

### `calculation`

`0` = NET · `1` = GROSS · `2` = EXACT · `3` = LEGACY · `4` = EXTERNAL

# Indexes

- `fk_transactions_account` — btree, partial on `account`
- `fk_transactions_assigneduser` — gin, partial on `assigneduser`
- `fk_transactions_contract` — btree, partial on `contract`
- `fk_transactions_fork` — gin, partial on `fork`
- `fk_transactions_item` — btree, partial on `item`
- `fk_transactions_ownergroup` — gin on `ownergroup`
- `i_transactions_billing_date` — btree, partial on `date`
- `i_transactions_collection_date` — btree, partial on `date`
- `i_transactions_nofork` — gin, partial on `fork`
- `i_transactions_noowner` — gin, partial on `ownergroup`
- `i_transactions_procurement_date` — btree, partial on `date`
- `i_transactions_production_date` — btree, partial on `date`
- `i_transactions_transactionnum` — btree on `transactionnum`
- `s_transactions_transactionnum` — gin on `transactionnum`
- `u_transactions_transactionnum_type` — btree, unique, partial on `transactionnum, type`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listTransactions`
- get: `getTransaction`
- create: `createTransaction`
- update: `updateTransaction`
- delete: `deleteTransaction`
- exists: `existsTransaction`
<!-- okf:generated:end -->

# Notes

NO `visibility` column — adding `"visibility":0` to a filter 400s. Use `type` 3=billing invoice, 4=billing credit. Use `netamount` for invoiced revenue; sum client-side (no server-side SUM). Use `date` for period reporting.
