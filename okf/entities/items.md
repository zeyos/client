---
type: ZeyOS Entity
title: Items
description: Product and service catalog entries.
resource: zeyos://api/items
tags: [commerce, generated]
api_backed: true
list_operation: listItems
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
| `creationdate` | bigint | no | `date_part('epoch', now())` | — | — |
| `lastmodified` | bigint | no | `date_part('epoch', now())` | — | — |
| `model` | integer | yes | — | yes | [items](/entities/items.md) |
| `picbinfile` | integer | yes | — | yes | [binfiles](/entities/binfiles.md) |
| `visibility` | smallint | no | `0` | — | — |
| `name` | text | no | — | yes | — |
| `manufacturer` | text | no | `''` | yes | — |
| `itemnum` | text | no | `''` | yes | — |
| `barcode` | text | no | `''` | yes | — |
| `type` | smallint | no | `0` | — | — |
| `forcestock` | smallint | yes | — | — | — |
| `applicability` | smallint | no | `0` | — | — |
| `unit` | character varying(3) | no | `''` | — | — |
| `sellingprice` | double precision | no | `0` | — | — |
| `purchaseprice` | double precision | no | `0` | — | — |
| `taxrate` | double precision | yes | — | — | — |
| `weight` | double precision | no | `0` | — | — |
| `classcode` | text | no | `''` | — | — |
| `tariffcode` | text | no | `''` | — | — |
| `origin` | character varying(2) | no | `''` | — | — |
| `description` | text | no | `''` | — | — |
| `foreigntaxrates` | json | yes | — | — | — |

# Foreign Keys

- `fork` → [forks](/entities/forks.md) (`forks.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)
- `model` → [items](/entities/items.md) (`items.ID`)
- `picbinfile` → [binfiles](/entities/binfiles.md) (`binfiles.ID`)

# Enums

### `visibility`

`0` = REGULAR · `1` = ARCHIVED · `2` = DELETED

### `type`

`0` = SIMPLE · `1` = SERIALS · `2` = CHARGES · `3` = SERIALSANDCHARGES · `4` = SET · `5` = CONTAINER · `6` = NOSTOCK · `7` = MODEL

### `forcestock`

`0` = STORAGE · `1` = LOCATION

### `applicability`

`0` = ALWAYS · `1` = NEVER · `2` = BILLINGONLY · `3` = PROCUREMENTONLY

# Indexes

- `fk_items_fork` — gin, partial on `fork`
- `fk_items_model` — btree, partial on `model`
- `fk_items_ownergroup` — gin on `ownergroup`
- `fk_items_picbinfile` — btree, partial on `picbinfile`
- `i_items_barcode` — btree, partial on `barcode`
- `i_items_itemnum` — btree, partial on `itemnum`
- `i_items_name` — btree on `name`
- `i_items_nofork` — gin, partial on `fork`
- `i_items_noowner` — gin, partial on `ownergroup`
- `s_items_barcode` — gin, partial on `barcode`
- `s_items_itemnum` — gin, partial on `itemnum`
- `s_items_manufacturer` — gin, partial on `manufacturer`
- `s_items_name` — gin on `name`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listItems`
- get: `getItem`
- create: `createItem`
- update: `updateItem`
- delete: `deleteItem`
- exists: `existsItem`
<!-- okf:generated:end -->
