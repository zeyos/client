---
type: ZeyOS Entity
title: Devices
description: Inventory device records.
resource: zeyos://api/devices
tags: [platform, generated]
api_backed: true
list_operation: listDevices
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
| `item` | integer | no | — | yes | [items](/entities/items.md) |
| `contract` | integer | yes | — | yes | [contracts](/entities/contracts.md) |
| `visibility` | smallint | no | `0` | — | — |
| `serialnum` | text | no | `''` | yes | — |
| `chargenum` | text | no | `''` | yes | — |
| `expdate` | bigint | yes | — | — | — |
| `description` | text | no | `''` | — | — |

# Foreign Keys

- `fork` → [forks](/entities/forks.md) (`forks.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)
- `item` → [items](/entities/items.md) (`items.ID`)
- `contract` → [contracts](/entities/contracts.md) (`contracts.ID`)

# Enums

### `visibility`

`0` = REGULAR · `1` = ARCHIVED · `2` = DELETED

# Indexes

- `fk_devices_contract` — btree, partial on `contract`
- `fk_devices_fork` — gin, partial on `fork`
- `fk_devices_ownergroup` — gin on `ownergroup`
- `i_devices_nofork` — gin, partial on `fork`
- `i_devices_noowner` — gin, partial on `ownergroup`
- `s_devices_chargenum` — gin, partial on `chargenum`
- `s_devices_serialnum` — gin, partial on `serialnum`
- `u_devices_item_serialnum_chargenum` — btree, unique on `item, serialnum, chargenum`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listDevices`
- get: `getDevice`
- create: `createDevice`
- update: `updateDevice`
- delete: `deleteDevice`
- exists: `existsDevice`
<!-- okf:generated:end -->
