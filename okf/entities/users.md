---
type: ZeyOS Entity
title: Users
description: System users.
resource: zeyos://api/users
tags: [platform, generated]
api_backed: true
list_operation: listUsers
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
| `contact` | integer | yes | — | yes | [contacts](/entities/contacts.md) |
| `activity` | smallint | no | `0` | — | — |
| `name` | text | no | — | yes | — |
| `email` | text | no | — | yes | — |
| `nopublic` | smallint | no | `0` | — | — |
| `apionly` | smallint | no | `0` | — | — |
| `expdate` | bigint | yes | — | — | — |
| `password` | text | no | `''` | — | — |
| `resetlogintoken` | bytea | yes | — | — | — |
| `persistentlogintoken` | bytea | yes | — | yes | — |
| `signature` | bytea | yes | — | — | — |
| `description` | text | no | `''` | — | — |
| `otpsecret` | bytea | yes | — | — | — |
| `settings` | json | yes | — | — | — |

# Foreign Keys

- `contact` → [contacts](/entities/contacts.md) (`contacts.ID`)

# Enums

### `activity`

`0` = ACTIVE · `1` = DEACTIVATED · `2` = DELETED

# Indexes

- `fk_users_contact` — btree, partial on `contact`
- `s_users_email` — gin on `email`
- `s_users_name` — gin on `name`
- `u_users_email` — btree, unique on `lower(email)`
- `u_users_name` — btree, unique on `lower(name)`
- `u_users_persistentlogintoken` — btree, unique, partial on `persistentlogintoken`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listUsers`
- get: `getUser`
- exists: `existsUser`
<!-- okf:generated:end -->

# Notes

Resolve assignees/ownership here; user names may not match contact names.
