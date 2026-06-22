---
type: ZeyOS Entity
title: Groups To Users
description: Group membership junction.
resource: zeyos://api/groups2users
tags: [platform, generated]
api_backed: true
list_operation: listGroupsToUsers
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
| `group` | integer | no | — | yes | [groups](/entities/groups.md) |
| `user` | integer | no | — | yes | [users](/entities/users.md) |
| `writable` | smallint | no | `0` | — | — |

# Foreign Keys

- `group` → [groups](/entities/groups.md) (`groups.ID`)
- `user` → [users](/entities/users.md) (`users.ID`)

# Indexes

- `fk_groups2users_user` — btree on `user`
- `u_groups2users_group_user` — btree, unique on `group, user`

# Operations

- list: `listGroupsToUsers`
- get: `getGroupToUser`
- exists: `existsGroupToUser`
<!-- okf:generated:end -->

# Notes

Read-only; operationId `listGroupsToUsers`.
