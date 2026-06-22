---
type: ZeyOS Entity
title: Stock Transactions
description: Inventory movements.
resource: zeyos://api/stocktransactions
tags: [commerce, generated]
api_backed: true
list_operation: listStockTransactions
visibility_column: false
---

<!-- okf:generated:start — rewritten by scripts/generate-okf.mjs; do not edit by hand -->
# Schema

| Column | Type | Nullable | Default | Indexed | FK |
|---|---|---|---|---|---|
| `ID` | bigint | no | — | yes | — |
| `creator` | integer | yes | — | — | — |
| `creationdate` | bigint | no | `date_part('epoch', now())` | — | — |
| `lastmodified` | bigint | no | `date_part('epoch', now())` | — | — |
| `item` | integer | no | — | yes | [items](/entities/items.md) |
| `storage` | integer | yes | — | yes | [storages](/entities/storages.md) |
| `transaction` | integer | yes | — | yes | [transactions](/entities/transactions.md) |
| `transfer` | bigint | yes | — | yes | [stocktransactions](/entities/stocktransactions.md) |
| `flag` | smallint | no | `0` | — | — |
| `date` | bigint | no | `date_part('epoch', now())` | yes | — |
| `chargenum` | text | no | `''` | yes | — |
| `location` | text | no | `''` | — | — |
| `reference` | text | no | `''` | yes | — |
| `amount` | double precision | no | — | — | — |
| `sellingprice` | double precision | no | `0` | — | — |
| `purchaseprice` | double precision | no | `0` | — | — |
| `serials` | text[] | yes | — | yes | — |
| `subtransactions` | bigint[] | yes | — | — | — |

# Foreign Keys

- `item` → [items](/entities/items.md) (`items.ID`)
- `storage` → [storages](/entities/storages.md) (`storages.ID`)
- `transaction` → [transactions](/entities/transactions.md) (`transactions.ID`)
- `transfer` → [stocktransactions](/entities/stocktransactions.md) (`stocktransactions.ID`)

# Enums

### `flag`

`0` = BOOKED · `1` = RESERVED · `2` = CANCELLED

# Indexes

- `fk_stocktransactions_item` — btree on `item`
- `fk_stocktransactions_storage` — gin, partial on `storage`
- `fk_stocktransactions_transaction` — btree, partial on `transaction`
- `i_stocktransactions_date` — btree on `date`
- `i_stocktransactions_reservations` — btree, partial on `transaction`
- `i_stocktransactions_serials` — gin, partial on `serials`
- `s_stocktransactions_chargenum` — gin, partial on `chargenum`
- `s_stocktransactions_reference` — gin, partial on `reference`
- `s_stocktransactions_serials` — gin, partial on `f_safe_array_to_string(serials, ' ')`
- `u_stocktransactions_transfer` — btree, unique, partial on `transfer`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listStockTransactions`
- get: `getStockTransaction`
- create: `createStockTransaction`
- update: `updateStockTransaction`
- delete: `deleteStockTransaction`
- exists: `existsStockTransaction`
<!-- okf:generated:end -->
