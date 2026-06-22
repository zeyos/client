---
type: ZeyOS Entity
title: Suppliers
description: Supplier-to-item links.
resource: zeyos://api/suppliers
tags: [commerce, generated]
api_backed: true
list_operation: listSuppliers
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
| `account` | integer | no | — | yes | [accounts](/entities/accounts.md) |
| `itemnum` | text | no | `''` | yes | — |
| `price` | double precision | yes | — | — | — |
| `taxrate` | double precision | yes | — | — | — |
| `minamount` | double precision | no | `0` | — | — |
| `deliverytime` | smallint | yes | — | — | — |
| `stock` | double precision | yes | — | — | — |

# Foreign Keys

- `item` → [items](/entities/items.md) (`items.ID`)
- `account` → [accounts](/entities/accounts.md) (`accounts.ID`)

# Indexes

- `fk_suppliers_account` — gin on `account`
- `s_suppliers_itemnum` — gin, partial on `itemnum`
- `u_suppliers_item_account` — btree, unique on `item, account`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listSuppliers`
- get: `getSupplier`
- create: `createSupplier`
- update: `updateSupplier`
- delete: `deleteSupplier`
- exists: `existsSupplier`
<!-- okf:generated:end -->
