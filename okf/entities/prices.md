---
type: ZeyOS Entity
title: Prices
description: Item prices within a price list.
resource: zeyos://api/prices
tags: [commerce, generated]
api_backed: true
list_operation: listPrices
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
| `pricelist` | integer | no | — | yes | [pricelists](/entities/pricelists.md) |
| `price` | double precision | yes | — | — | — |
| `rebate` | double precision | no | `0` | — | — |
| `discount` | double precision | yes | — | — | — |
| `minamount` | double precision | no | `0` | — | — |
| `costprice` | double precision | yes | — | — | — |

# Foreign Keys

- `item` → [items](/entities/items.md) (`items.ID`)
- `pricelist` → [pricelists](/entities/pricelists.md) (`pricelists.ID`)

# Indexes

- `fk_prices_item` — btree on `item`
- `fk_prices_pricelist` — gin on `pricelist`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listPrices`
- get: `getPrice`
- create: `createPrice`
- update: `updatePrice`
- delete: `deletePrice`
- exists: `existsPrice`
<!-- okf:generated:end -->
