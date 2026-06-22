---
type: ZeyOS Entity
title: Weblets
description: UI modules with view/type metadata.
resource: zeyos://api/weblets
tags: [platform, generated]
api_backed: true
list_operation: listWeblets
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
| `view` | text | no | `''` | — | — |
| `type` | smallint | no | `0` | — | — |
| `width` | smallint | no | `0` | — | — |
| `height` | smallint | no | `0` | — | — |
| `svgpath` | text | no | `''` | — | — |
| `color` | character varying(6) | no | `''` | — | — |
| `mimetype` | text | no | `'text/x-zymba'` | — | — |
| `langaliases` | json | yes | — | — | — |
| `binfile` | integer | yes | — | yes | [binfiles](/entities/binfiles.md) |
| `url` | text | no | `''` | — | — |

# Foreign Keys

- `application` → [applications](/entities/applications.md) (`applications.ID`)
- `binfile` → [binfiles](/entities/binfiles.md) (`binfiles.ID`)

# Enums

### `activity`

`0` = ACTIVE · `1` = DEACTIVATED · `2` = DELETED

### `type`

`0` = INTEGRATED · `1` = STANDALONE · `2` = DETACHED · `3` = POPUP_FRAMED · `4` = POPUP_PLAIN · `5` = EMBEDDED_FRAMED · `6` = EMBEDDED_COLLAPSED · `7` = EMBEDDED_PLAIN

# Indexes

- `fk_weblets_application` — gin, partial on `application`
- `fk_weblets_binfile` — btree, partial on `binfile`
- `s_weblets_identifier` — gin on `identifier`
- `s_weblets_name` — gin on `name`
- `u_weblets_identifier` — btree, unique on `identifier`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listWeblets`
- get: `getWeblet`
- exists: `existsWeblet`
<!-- okf:generated:end -->
