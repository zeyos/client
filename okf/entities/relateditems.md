---
type: ZeyOS Entity
title: Related Items
description: Related product links (cross-sell, substitute, accessory).
resource: zeyos://api/relateditems
tags: [commerce, generated]
api_backed: true
list_operation: listRelatedItems
visibility_column: false
---

<!-- okf:generated:start — rewritten by scripts/generate-okf.mjs; do not edit by hand -->
# Schema

| Column | Type | Nullable | Default | Indexed | FK |
|---|---|---|---|---|---|
| `ID` | bigint | no | — | yes | — |
| `creator` | integer | yes | — | — | — |
| `creationdate` | bigint | no | `EXTRACT(epoch FROM now())` | — | — |
| `lastmodified` | bigint | no | `EXTRACT(epoch FROM now())` | — | — |
| `item` | integer | no | — | yes | [items](/entities/items.md) |
| `relateditem` | integer | no | — | yes | [items](/entities/items.md) |
| `relation` | text | no | `''` | — | — |

# Foreign Keys

- `item` → [items](/entities/items.md) (`items.ID`)
- `relateditem` → [items](/entities/items.md) (`items.ID`)

# Indexes

- `fk_relateditems_relateditem` — btree on `relateditem`
- `u_relateditems_item_relateditem` — btree, unique on `item, relateditem`

# Operations

- list: `listRelatedItems`
- get: `getRelatedItem`
- create: `createRelatedItem`
- update: `updateRelatedItem`
- delete: `deleteRelatedItem`
- exists: `existsRelatedItem`
<!-- okf:generated:end -->
