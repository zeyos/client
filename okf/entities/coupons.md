---
type: ZeyOS Entity
title: Coupons
description: Coupon definitions.
resource: zeyos://api/coupons
tags: [commerce, generated]
api_backed: true
list_operation: listCoupons
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
| `code` | text | no | `''` | yes | — |
| `value` | double precision | no | `0` | — | — |
| `taxrate` | double precision | yes | — | — | — |
| `neutral` | smallint | no | `0` | — | — |
| `datefrom` | bigint | yes | — | — | — |
| `dateto` | bigint | yes | — | — | — |
| `description` | text | no | `''` | — | — |
| `foreigntaxrates` | json | yes | — | — | — |

# Foreign Keys

- `fork` → [forks](/entities/forks.md) (`forks.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)

# Enums

### `activity`

`0` = ACTIVE · `1` = DEACTIVATED · `2` = DELETED

### `type`

`0` = PROMOTION · `1` = INDIVIDUAL

# Indexes

- `fk_coupons_fork` — gin, partial on `fork`
- `fk_coupons_ownergroup` — gin on `ownergroup`
- `i_coupons_nofork` — gin, partial on `fork`
- `i_coupons_noowner` — gin, partial on `ownergroup`
- `s_coupons_name` — gin on `name`
- `u_coupons_code` — btree, unique, partial on `code`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listCoupons`
- get: `getCoupon`
- create: `createCoupon`
- update: `updateCoupon`
- delete: `deleteCoupon`
- exists: `existsCoupon`
<!-- okf:generated:end -->
