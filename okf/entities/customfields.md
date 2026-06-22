---
type: ZeyOS Entity
title: Custom Fields
description: Custom field definitions.
resource: zeyos://api/customfields
tags: [platform, generated]
api_backed: true
list_operation: listCustomFields
visibility_column: false
---

<!-- okf:generated:start — rewritten by scripts/generate-okf.mjs; do not edit by hand -->
# Schema

| Column | Type | Nullable | Default | Indexed | FK |
|---|---|---|---|---|---|
| `ID` | integer | no | — | yes | — |
| `creator` | integer | yes | — | — | — |
| `creationdate` | bigint | no | `EXTRACT(epoch FROM now())` | — | — |
| `lastmodified` | bigint | no | `EXTRACT(epoch FROM now())` | — | — |
| `activity` | smallint | no | `0` | — | — |
| `name` | text | no | — | yes | — |
| `identifier` | character varying(200) | yes | — | yes | — |
| `context` | text | no | — | yes | — |
| `source` | smallint | no | `0` | — | — |
| `reference` | text | no | — | yes | — |
| `indexed` | smallint | no | `0` | — | — |
| `type` | text | no | `''` | — | — |
| `entity` | t_entity | yes | — | — | — |
| `options` | json | yes | — | — | — |
| `langaliases` | json | yes | — | — | — |
| `pattern` | text | no | `''` | — | — |

# Enums

### `activity`

`0` = ACTIVE · `1` = DEACTIVATED · `2` = DELETED

### `source`

`0` = EXTDATA · `1` = TAGS · `2` = INTERNAL

# Indexes

- `s_customfields_context` — gin on `context`
- `s_customfields_identifier` — gin on `identifier`
- `s_customfields_name` — gin on `name`
- `s_customfields_reference` — gin on `reference`
- `u_customfields_identifier` — btree, unique on `identifier`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listCustomFields`
- get: `getCustomField`
- exists: `existsCustomField`
<!-- okf:generated:end -->
