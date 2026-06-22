---
type: ZeyOS Entity
title: Contacts
description: People linked to accounts.
resource: zeyos://api/contacts
tags: [crm, generated]
api_backed: true
list_operation: listContacts
visibility_column: true
---

<!-- okf:generated:start — rewritten by scripts/generate-okf.mjs; do not edit by hand -->
# Schema

| Column | Type | Nullable | Default | Indexed | FK |
|---|---|---|---|---|---|
| `ID` | integer | no | — | yes | — |
| `fork` | integer | yes | — | yes | [forks](/entities/forks.md) |
| `owneruser` | integer | yes | — | yes | [users](/entities/users.md) |
| `ownergroup` | integer | yes | — | yes | [groups](/entities/groups.md) |
| `creator` | integer | yes | — | — | — |
| `assigneduser` | integer | yes | — | yes | [users](/entities/users.md) |
| `creationdate` | bigint | no | `date_part('epoch', now())` | — | — |
| `lastmodified` | bigint | no | `date_part('epoch', now())` | — | — |
| `davserver` | integer | yes | — | yes | [davservers](/entities/davservers.md) |
| `picbinfile` | integer | yes | — | yes | [binfiles](/entities/binfiles.md) |
| `visibility` | smallint | no | `0` | — | — |
| `lastname` | text | no | `''` | yes | — |
| `firstname` | text | no | `''` | yes | — |
| `type` | smallint | no | `0` | — | — |
| `title` | text | no | `''` | — | — |
| `company` | text | no | `''` | yes | — |
| `position` | text | no | `''` | — | — |
| `department` | text | no | `''` | — | — |
| `address` | text | no | `''` | — | — |
| `postalcode` | text | no | `''` | — | — |
| `city` | text | no | `''` | — | — |
| `region` | text | no | `''` | — | — |
| `country` | character varying(2) | no | `''` | — | — |
| `phone` | text | no | `''` | — | — |
| `phone2` | text | no | `''` | — | — |
| `cell` | text | no | `''` | — | — |
| `fax` | text | no | `''` | — | — |
| `email` | text | no | `''` | yes | — |
| `email2` | text | no | `''` | yes | — |
| `website` | text | no | `''` | — | — |
| `birthdate` | bigint | yes | — | — | — |
| `description` | text | no | `''` | — | — |

# Foreign Keys

- `fork` → [forks](/entities/forks.md) (`forks.ID`)
- `owneruser` → [users](/entities/users.md) (`users.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)
- `assigneduser` → [users](/entities/users.md) (`users.ID`)
- `davserver` → [davservers](/entities/davservers.md) (`davservers.ID`)
- `picbinfile` → [binfiles](/entities/binfiles.md) (`binfiles.ID`)

# Enums

### `visibility`

`0` = REGULAR · `1` = ARCHIVED · `2` = DELETED

### `type`

`0` = COMPANY · `1` = PERSON

# Indexes

- `fk_contacts_assigneduser` — gin, partial on `assigneduser`
- `fk_contacts_davserver` — gin, partial on `davserver`
- `fk_contacts_fork` — gin, partial on `fork`
- `fk_contacts_ownergroup` — gin, partial on `ownergroup`
- `fk_contacts_owneruser` — gin, partial on `owneruser`
- `fk_contacts_picbinfile` — btree, partial on `picbinfile`
- `i_contacts_lastname_firstname` — btree on `lastname, firstname`
- `i_contacts_nofork` — gin, partial on `fork`
- `i_contacts_noowner` — gin, partial on `ownergroup`
- `s_contacts_company` — gin, partial on `company`
- `s_contacts_email` — gin, partial on `email`
- `s_contacts_email2` — gin, partial on `email2`
- `s_contacts_firstname` — gin, partial on `firstname`
- `s_contacts_lastname` — gin, partial on `lastname`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listContacts`
- get: `getContact`
- create: `createContact`
- update: `updateContact`
- delete: `deleteContact`
- exists: `existsContact`
<!-- okf:generated:end -->
