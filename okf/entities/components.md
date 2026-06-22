---
type: ZeyOS Entity
title: Components
description: Item-to-item composition records (BOM/kit).
resource: zeyos://api/components
tags: [commerce, generated]
api_backed: true
list_operation: listComponents
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
| `component` | integer | no | — | yes | [items](/entities/items.md) |
| `amount` | double precision | no | `0` | — | — |
| `price` | double precision | yes | — | — | — |
| `fixed` | smallint | no | `0` | — | — |
| `order` | integer | yes | — | — | — |

# Foreign Keys

- `item` → [items](/entities/items.md) (`items.ID`)
- `component` → [items](/entities/items.md) (`items.ID`)

# Indexes

- `fk_components_component` — btree on `component`
- `u_components_item_component` — btree, unique on `item, component`

# Operations

- list: `listComponents`
- get: `getComponent`
- create: `createComponent`
- update: `updateComponent`
- delete: `deleteComponent`
- exists: `existsComponent`
<!-- okf:generated:end -->
