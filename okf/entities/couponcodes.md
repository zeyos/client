---
type: ZeyOS Entity
title: Coupon Codes
description: Codes under a coupon definition.
resource: zeyos://api/couponcodes
tags: [commerce, generated]
api_backed: true
list_operation: listCouponCodes
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
| `coupon` | integer | no | — | yes | [coupons](/entities/coupons.md) |
| `transaction` | integer | yes | — | yes | [transactions](/entities/transactions.md) |
| `flag` | smallint | no | `0` | — | — |
| `date` | bigint | no | `date_part('epoch', now())` | — | — |
| `code` | text | no | — | yes | — |
| `value` | double precision | no | `0` | — | — |
| `datefrom` | bigint | yes | — | — | — |
| `dateto` | bigint | yes | — | — | — |

# Foreign Keys

- `coupon` → [coupons](/entities/coupons.md) (`coupons.ID`)
- `transaction` → [transactions](/entities/transactions.md) (`transactions.ID`)

# Enums

### `flag`

`0` = BOOKED · `1` = RESERVED · `2` = CANCELLED

# Indexes

- `fk_couponcodes_coupon` — gin on `coupon`
- `fk_couponcodes_transaction` — btree, partial on `transaction`
- `i_couponcodes_code` — btree on `code`
- `s_couponcodes_code` — gin on `code`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listCouponCodes`
- get: `getCouponCode`
- create: `createCouponCode`
- update: `updateCouponCode`
- delete: `deleteCouponCode`
- exists: `existsCouponCode`
<!-- okf:generated:end -->
