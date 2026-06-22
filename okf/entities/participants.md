---
type: ZeyOS Entity
title: Participants
description: Contacts enrolled in campaigns or mailing lists.
resource: zeyos://api/participants
tags: [outreach, generated]
api_backed: true
list_operation: listParticipants
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
| `mailinglist` | integer | yes | — | yes | [mailinglists](/entities/mailinglists.md) |
| `campaign` | integer | yes | — | yes | [campaigns](/entities/campaigns.md) |
| `contact` | integer | yes | — | yes | [contacts](/entities/contacts.md) |
| `name` | text | no | — | yes | — |
| `phone` | text | no | `''` | — | — |
| `email` | text | no | `''` | yes | — |

# Foreign Keys

- `mailinglist` → [mailinglists](/entities/mailinglists.md) (`mailinglists.ID`)
- `campaign` → [campaigns](/entities/campaigns.md) (`campaigns.ID`)
- `contact` → [contacts](/entities/contacts.md) (`contacts.ID`)

# Indexes

- `fk_participants_campaign` — gin, partial on `campaign`
- `fk_participants_contact` — btree, partial on `contact`
- `fk_participants_mailinglist` — gin, partial on `mailinglist`
- `s_participants_email` — gin, partial on `email`
- `s_participants_name` — gin on `name`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listParticipants`
- get: `getParticipant`
- create: `createParticipant`
- update: `updateParticipant`
- delete: `deleteParticipant`
- exists: `existsParticipant`
<!-- okf:generated:end -->
