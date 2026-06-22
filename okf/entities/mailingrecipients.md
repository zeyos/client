---
type: ZeyOS Entity
title: Mailing Recipients
description: Recipient records for a message.
resource: zeyos://api/mailingrecipients
tags: [outreach, generated]
api_backed: true
list_operation: listMailingRecipients
visibility_column: false
---

<!-- okf:generated:start — rewritten by scripts/generate-okf.mjs; do not edit by hand -->
# Schema

| Column | Type | Nullable | Default | Indexed | FK |
|---|---|---|---|---|---|
| `ID` | bigint | no | — | yes | — |
| `creator` | integer | yes | — | — | — |
| `creationdate` | bigint | no | `date_part('epoch', now())` | — | — |
| `lastmodified` | bigint | no | `EXTRACT(epoch FROM now())` | — | — |
| `message` | integer | no | — | yes | [messages](/entities/messages.md) |
| `participant` | bigint | yes | — | yes | [participants](/entities/participants.md) |
| `email` | text | no | — | — | — |

# Foreign Keys

- `message` → [messages](/entities/messages.md) (`messages.ID`)
- `participant` → [participants](/entities/participants.md) (`participants.ID`)

# Indexes

- `fk_mailingrecipients_message` — btree on `message`
- `u_mailingrecipients_participant_message` — btree, unique, partial on `participant, message`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listMailingRecipients`
- get: `getMailingRecipient`
- create: `createMailingRecipient`
- update: `updateMailingRecipient`
- delete: `deleteMailingRecipient`
- exists: `existsMailingRecipients`
<!-- okf:generated:end -->
