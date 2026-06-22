---
type: ZeyOS Entity
title: Applications
description: Application definitions.
resource: zeyos://api/applications
tags: [platform, generated]
api_backed: true
list_operation: listApplications
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
| `activity` | smallint | no | `0` | — | — |
| `readmebinfile` | integer | yes | — | — | [binfiles](/entities/binfiles.md) |
| `name` | text | no | — | yes | — |
| `identifier` | character varying(200) | no | — | yes | — |
| `vendor` | text | no | `''` | — | — |
| `restricted` | smallint | no | `0` | — | — |
| `callbackurls` | text[] | yes | — | — | — |
| `settingscodebinfile` | integer | yes | — | yes | [binfiles](/entities/binfiles.md) |
| `usersettingscodebinfile` | integer | yes | — | yes | [binfiles](/entities/binfiles.md) |
| `secret` | bytea | yes | — | yes | — |
| `defaultsettings` | json | yes | — | — | — |
| `settings` | json | yes | — | — | — |

# Foreign Keys

- `readmebinfile` → [binfiles](/entities/binfiles.md) (`binfiles.ID`)
- `settingscodebinfile` → [binfiles](/entities/binfiles.md) (`binfiles.ID`)
- `usersettingscodebinfile` → [binfiles](/entities/binfiles.md) (`binfiles.ID`)

# Enums

### `activity`

`0` = ACTIVE · `1` = DEACTIVATED · `2` = DELETED

# Indexes

- `fk_applications_settingscodebinfile` — btree, partial on `settingscodebinfile`
- `fk_applications_usersettingscodebinfile` — btree, partial on `usersettingscodebinfile`
- `s_applications_identifier` — gin on `identifier`
- `s_applications_name` — gin on `name`
- `u_applications_identifier` — btree, unique on `identifier`
- `u_applications_secret` — btree, unique, partial on `secret`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listApplications`
- get: `getApplication`
- exists: `existsApplication`
<!-- okf:generated:end -->
