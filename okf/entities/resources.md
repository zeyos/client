---
type: ZeyOS Entity
title: Resources
description: Named resources linked to an application or standalone.
resource: zeyos://api/resources
tags: [platform, generated]
api_backed: true
list_operation: listResources
visibility_column: false
---

<!-- okf:generated:start — rewritten by scripts/generate-okf.mjs; do not edit by hand -->
# Schema

| Column | Type | Nullable | Default | Indexed | FK |
|---|---|---|---|---|---|
| `ID` | integer | no | — | yes | — |
| `creator` | integer | yes | — | — | — |
| `creationdate` | bigint | no | `date_part('epoch', now())` | — | — |
| `lastmodified` | bigint | no | `date_part('epoch', now())` | — | — |
| `application` | integer | yes | — | yes | [applications](/entities/applications.md) |
| `activity` | smallint | no | `0` | — | — |
| `name` | text | no | — | yes | — |
| `identifier` | character varying(200) | no | — | yes | — |
| `mimetype` | text | no | `'text/x-zymba'` | — | — |
| `public` | smallint | no | `0` | — | — |
| `binfile` | integer | yes | — | yes | [binfiles](/entities/binfiles.md) |

# Foreign Keys

- `application` → [applications](/entities/applications.md) (`applications.ID`)
- `binfile` → [binfiles](/entities/binfiles.md) (`binfiles.ID`)

# Enums

### `activity`

`0` = ACTIVE · `1` = DEACTIVATED · `2` = DELETED

# Indexes

- `fk_resources_application` — gin, partial on `application`
- `fk_resources_binfile` — btree, partial on `binfile`
- `s_resources_identifier` — gin on `identifier`
- `s_resources_name` — gin on `name`
- `u_resources_identifier` — btree, unique on `identifier`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listResources`
- get: `getResource`
- exists: `existsResource`
<!-- okf:generated:end -->
