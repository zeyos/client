---
type: ZeyOS Entity
title: Mail Servers
description: Mail server definitions.
resource: zeyos://api/mailservers
tags: [messaging, generated]
api_backed: true
list_operation: listMailServers
visibility_column: false
---

<!-- okf:generated:start — rewritten by scripts/generate-okf.mjs; do not edit by hand -->
# Schema

| Column | Type | Nullable | Default | Indexed | FK |
|---|---|---|---|---|---|
| `ID` | integer | no | — | yes | — |
| `owneruser` | integer | yes | — | yes | [users](/entities/users.md) |
| `ownergroup` | integer | yes | — | yes | [groups](/entities/groups.md) |
| `creator` | integer | yes | — | — | — |
| `creationdate` | bigint | no | `date_part('epoch', now())` | — | — |
| `lastmodified` | bigint | no | `date_part('epoch', now())` | — | — |
| `recipientuser` | integer | yes | — | — | [users](/entities/users.md) |
| `recipientgroup` | integer | yes | — | — | [groups](/entities/groups.md) |
| `autoreplybinfile` | integer | yes | — | yes | [binfiles](/entities/binfiles.md) |
| `signaturebinfile` | integer | yes | — | yes | [binfiles](/entities/binfiles.md) |
| `activity` | smallint | no | `0` | — | — |
| `name` | text | no | — | yes | — |
| `sender` | text | no | `''` | yes | — |
| `serverin` | text | no | `''` | yes | — |
| `usernamein` | text | no | `''` | — | — |
| `serverout` | text | no | `''` | yes | — |
| `usernameout` | text | no | `''` | — | — |
| `description` | text | no | `''` | — | — |
| `ticketing` | json | yes | — | — | — |
| `folders` | json | yes | — | — | — |
| `passwordin` | bytea | yes | — | — | — |
| `passwordout` | bytea | yes | — | — | — |

# Foreign Keys

- `owneruser` → [users](/entities/users.md) (`users.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)
- `recipientuser` → [users](/entities/users.md) (`users.ID`)
- `recipientgroup` → [groups](/entities/groups.md) (`groups.ID`)
- `autoreplybinfile` → [binfiles](/entities/binfiles.md) (`binfiles.ID`)
- `signaturebinfile` → [binfiles](/entities/binfiles.md) (`binfiles.ID`)

# Enums

### `activity`

`0` = ACTIVE · `1` = DEACTIVATED · `2` = DELETED

# Indexes

- `fk_mailservers_autoreplybinfile` — btree, partial on `autoreplybinfile`
- `fk_mailservers_ownergroup` — gin, partial on `ownergroup`
- `fk_mailservers_owneruser` — gin, partial on `owneruser`
- `fk_mailservers_signaturebinfile` — btree, partial on `signaturebinfile`
- `i_mailservers_noowner` — gin, partial on `ownergroup`
- `s_mailservers_name` — gin on `name`
- `s_mailservers_sender` — gin, partial on `sender`
- `s_mailservers_serverin` — gin, partial on `serverin`
- `s_mailservers_serverout` — gin, partial on `serverout`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listMailServers`
- get: `getMailServer`
- create: `createMailServer`
- update: `updateMailServer`
- delete: `deleteMailServer`
- exists: `existsMailServer`
<!-- okf:generated:end -->
