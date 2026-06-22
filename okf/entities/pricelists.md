---
type: ZeyOS Entity
title: Price Lists
description: Price list definitions.
resource: zeyos://api/pricelists
tags: [commerce, generated]
api_backed: true
list_operation: listPriceLists
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
| `creationdate` | bigint | no | `date_part('epoch', now())` | — | — |
| `lastmodified` | bigint | no | `date_part('epoch', now())` | — | — |
| `activity` | smallint | no | `0` | — | — |
| `name` | text | no | — | yes | — |
| `type` | smallint | no | `0` | — | — |
| `currency` | character varying(3) | no | — | — | — |
| `discount` | double precision | no | `0` | — | — |
| `datefrom` | bigint | yes | — | — | — |
| `dateto` | bigint | yes | — | — | — |
| `applytoall` | smallint | no | `0` | — | — |
| `description` | text | no | `''` | — | — |

# Foreign Keys

- `fork` → [forks](/entities/forks.md) (`forks.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)

# Enums

### `activity`

`0` = ACTIVE · `1` = DEACTIVATED · `2` = DELETED

### `type`

`0` = BILLING_MIN · `1` = BILLING_MAX · `2` = PROCUREMENT_MIN · `3` = PROCUREMENT_MAX · `4` = PRODUCTION_MIN · `5` = PRODUCTION_MAX

# Indexes

- `fk_pricelists_fork` — gin, partial on `fork`
- `fk_pricelists_ownergroup` — gin on `ownergroup`
- `i_pricelists_nofork` — gin, partial on `fork`
- `i_pricelists_noowner` — gin, partial on `ownergroup`
- `s_pricelists_name` — gin on `name`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listPriceLists`
- get: `getPriceList`
- create: `createPriceList`
- update: `updatePriceList`
- delete: `deletePriceList`
- exists: `existsPriceList`
<!-- okf:generated:end -->

# Notes

operationId: `listPriceLists`.
