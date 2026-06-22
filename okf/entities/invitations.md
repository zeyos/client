---
type: ZeyOS Entity
title: Invitations
description: Appointment invitations.
resource: zeyos://api/invitations
tags: [work, generated]
api_backed: true
list_operation: listInvitations
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
| `appointment` | integer | no | — | yes | [appointments](/entities/appointments.md) |
| `contact` | integer | yes | — | yes | [contacts](/entities/contacts.md) |
| `name` | text | no | — | — | — |
| `email` | text | no | `''` | — | — |
| `flag` | smallint | no | `0` | — | — |

# Foreign Keys

- `appointment` → [appointments](/entities/appointments.md) (`appointments.ID`)
- `contact` → [contacts](/entities/contacts.md) (`contacts.ID`)

# Enums

### `flag`

`0` = UNANSWERED · `1` = CONFIRMED · `2` = REJECTED

# Indexes

- `fk_invitations_appointment` — btree on `appointment`
- `fk_invitations_contact` — btree, partial on `contact`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listInvitations`
- get: `getInvitation`
- create: `createInvitation`
- update: `updateInvitation`
- delete: `deleteInvitation`
- exists: `existsInvitation`
<!-- okf:generated:end -->
