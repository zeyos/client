---
type: ZeyOS Entity
title: Services
description: Hook, timing, or remote-call services.
resource: zeyos://api/services
tags: [platform, generated]
api_backed: true
list_operation: listServices
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
| `type` | smallint | yes | — | — | — |
| `entity` | text | no | `''` | — | — |
| `schedule` | integer | no | `0` | — | — |
| `interval` | smallint | no | `1` | — | — |
| `mimetype` | text | no | `'text/x-zymba'` | — | — |
| `binfile` | integer | yes | — | yes | [binfiles](/entities/binfiles.md) |
| `url` | text | no | `''` | — | — |
| `accesskey` | bytea | yes | — | — | — |

# Foreign Keys

- `application` → [applications](/entities/applications.md) (`applications.ID`)
- `binfile` → [binfiles](/entities/binfiles.md) (`binfiles.ID`)

# Enums

### `activity`

`0` = ACTIVE · `1` = DEACTIVATED · `2` = DELETED

### `type`

`0` = TIMING · `1` = REMOTECALL · `2` = AFTER_CREATION · `3` = BEFORE_MODIFICATION · `4` = AFTER_MODIFICATION · `5` = AFTER_CREATION_MODIFICATION · `6` = BEFORE_DELETION · `7` = AFTER_DELETION

# Indexes

- `fk_services_application` — gin, partial on `application`
- `fk_services_binfile` — btree, partial on `binfile`
- `s_services_identifier` — gin on `identifier`
- `s_services_name` — gin on `name`
- `u_services_identifier` — btree, unique on `identifier`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listServices`
- get: `getService`
- exists: `existsService`
<!-- okf:generated:end -->
