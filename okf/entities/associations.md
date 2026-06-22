---
type: ZeyOS Entity
title: Associations
description: Generic cross-entity relation records with metadata.
resource: zeyos://api/associations
tags: [platform, generated]
api_backed: true
list_operation: listAssociations
visibility_column: false
---

<!-- okf:generated:start — rewritten by scripts/generate-okf.mjs; do not edit by hand -->
# Schema

| Column | Type | Nullable | Default | Indexed | FK |
|---|---|---|---|---|---|
| `ID` | bigint | no | — | yes | — |
| `creator` | integer | yes | — | — | — |
| `creationdate` | bigint | no | `date_part('epoch', now())` | — | — |
| `lastmodified` | bigint | no | `EXTRACT(epoch FROM now())` | — | — |
| `entity1` | t_entity | no | — | yes | — |
| `entity2` | t_entity | no | — | yes | — |
| `index1` | integer | no | — | yes | — |
| `index2` | integer | no | — | yes | — |
| `relation` | text | no | `''` | — | — |
| `meta` | json | yes | — | — | — |

# Indexes

- `i_associations_entity2_index2` — btree on `entity2, index2`
- `u_associations_entity1_index1_entity2_index2` — btree, unique on `entity1, index1, entity2, index2`

# Operations

- list: `listAssociations`
- get: `getAssociation`
- create: `createAssociation`
- update: `updateAssociation`
- delete: `deleteAssociation`
- exists: `existsAssociation`
<!-- okf:generated:end -->
