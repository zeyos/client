---
type: ZeyOS Entity
title: Application Assets
description: Assets linked to an application.
resource: zeyos://api/applicationassets
tags: [platform, generated]
api_backed: true
list_operation: listApplicationAssets
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
| `application` | integer | no | — | yes | [applications](/entities/applications.md) |
| `binfile` | integer | yes | — | yes | [binfiles](/entities/binfiles.md) |
| `filename` | text | no | — | yes | — |
| `mimetype` | text | no | `'application/octet-stream'` | — | — |

# Foreign Keys

- `application` → [applications](/entities/applications.md) (`applications.ID`)
- `binfile` → [binfiles](/entities/binfiles.md) (`binfiles.ID`)

# Indexes

- `fk_applicationassets_binfile` — btree, partial on `binfile`
- `u_applicationassets_application_filename` — btree, unique on `application, filename`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listApplicationAssets`
- get: `getApplicationAsset`
- exists: `existsApplicationAsset`
<!-- okf:generated:end -->
