---
type: ZeyOS Entity
title: Message Reads
description: Read-tracking records for messages.
resource: zeyos://api/messagereads
tags: [messaging, generated]
api_backed: true
list_operation: listMessageReads
visibility_column: false
---

<!-- okf:generated:start — rewritten by scripts/generate-okf.mjs; do not edit by hand -->
# Schema

| Column | Type | Nullable | Default | Indexed | FK |
|---|---|---|---|---|---|
| `ID` | bigint | no | — | yes | — |
| `creator` | integer | no | — | yes | [users](/entities/users.md) |
| `creationdate` | bigint | no | `date_part('epoch', now())` | — | — |
| `lastmodified` | bigint | no | `EXTRACT(epoch FROM now())` | — | — |
| `message` | integer | no | — | yes | [messages](/entities/messages.md) |

# Foreign Keys

- `creator` → [users](/entities/users.md) (`users.ID`)
- `message` → [messages](/entities/messages.md) (`messages.ID`)

# Indexes

- `u_messagereads_message_creator` — btree, unique on `message, creator`

# Operations

- list: `listMessageReads`
- get: `getMessageRead`
- create: `createMessageRead`
- update: `updateMessageRead`
- delete: `deleteMessageRead`
- exists: `existsMessageRead`
<!-- okf:generated:end -->
