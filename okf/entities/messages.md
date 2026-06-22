---
type: ZeyOS Entity
title: Messages
description: Email and message records.
resource: zeyos://api/messages
tags: [messaging, generated]
api_backed: true
list_operation: listMessages
visibility_column: false
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
| `creationdate` | bigint | no | `date_part('epoch', now())` | — | — |
| `lastmodified` | bigint | no | `date_part('epoch', now())` | — | — |
| `mailserver` | integer | yes | — | yes | [mailservers](/entities/mailservers.md) |
| `ticket` | integer | yes | — | yes | [tickets](/entities/tickets.md) |
| `opportunity` | integer | yes | — | yes | [opportunities](/entities/opportunities.md) |
| `mailinglist` | integer | yes | — | yes | [mailinglists](/entities/mailinglists.md) |
| `reference` | integer | yes | — | yes | [messages](/entities/messages.md) |
| `binfile` | integer | yes | — | yes | [binfiles](/entities/binfiles.md) |
| `mailbox` | smallint | no | `0` | — | — |
| `verified` | smallint | no | `0` | — | — |
| `date` | bigint | no | `date_part('epoch', now())` | yes | — |
| `subject` | text | no | `''` | yes | — |
| `sender` | text | no | `''` | yes | — |
| `sender_email` | text | no | `''` | — | — |
| `sender_name` | text | no | `''` | — | — |
| `to` | text | no | `''` | yes | — |
| `to_email` | text | no | `''` | — | — |
| `to_name` | text | no | `''` | — | — |
| `to_count` | integer | no | `0` | — | — |
| `cc` | text | no | `''` | — | — |
| `bcc` | text | no | `''` | — | — |
| `contenttype` | text | no | `''` | — | — |
| `text` | text | no | `''` | — | — |
| `attachments` | text[] | yes | — | — | — |
| `senddate` | bigint | yes | — | — | — |
| `senderror` | text | no | `''` | — | — |
| `messageid` | text | no | `''` | yes | — |

# Foreign Keys

- `fork` → [forks](/entities/forks.md) (`forks.ID`)
- `owneruser` → [users](/entities/users.md) (`users.ID`)
- `ownergroup` → [groups](/entities/groups.md) (`groups.ID`)
- `mailserver` → [mailservers](/entities/mailservers.md) (`mailservers.ID`)
- `ticket` → [tickets](/entities/tickets.md) (`tickets.ID`)
- `opportunity` → [opportunities](/entities/opportunities.md) (`opportunities.ID`)
- `mailinglist` → [mailinglists](/entities/mailinglists.md) (`mailinglists.ID`)
- `reference` → [messages](/entities/messages.md) (`messages.ID`)
- `binfile` → [binfiles](/entities/binfiles.md) (`binfiles.ID`)

# Enums

### `mailbox`

`0` = INBOX · `1` = DRAFTS · `2` = SENT · `3` = TEMPLATES · `4` = MAILINGS · `5` = ARCHIVE · `6` = TRASH · `7` = JUNK

# Indexes

- `fk_messages_binfile` — btree, partial on `binfile`
- `fk_messages_fork` — gin, partial on `fork`
- `fk_messages_mailinglist` — gin, partial on `mailinglist`
- `fk_messages_mailserver` — gin, partial on `mailserver`
- `fk_messages_opportunity` — btree, partial on `opportunity`
- `fk_messages_ownergroup` — gin, partial on `ownergroup`
- `fk_messages_owneruser` — gin, partial on `owneruser`
- `fk_messages_reference` — btree, partial on `reference`
- `fk_messages_ticket` — btree, partial on `ticket`
- `i_messages_inbox_date` — btree, partial on `date`
- `i_messages_messageid` — btree, partial on `messageid`
- `i_messages_nofork` — gin, partial on `fork`
- `i_messages_noowner` — gin, partial on `ownergroup`
- `i_messages_regular_date` — btree, partial on `date`
- `i_messages_sendmail` — btree, partial on `mailserver`
- `i_messages_trash_date` — btree, partial on `date`
- `s_messages_sender` — gin, partial on `sender`
- `s_messages_subject` — gin, partial on `subject`
- `s_messages_to` — gin, partial on `to`

> Partial/GIN indexes back the `filters` (plural) query form for foreign-key fields. See [filters-vs-filter](/concepts/filters-vs-filter.md).

# Operations

- list: `listMessages`
- get: `getMessage`
- create: `createMessage`
- update: `updateMessage`
- delete: `deleteMessage`
- exists: `existsMessage`
<!-- okf:generated:end -->

# Notes

No direct `account` foreign key — link via `ticket`/`opportunity`/`mailinglist`/`reference`, or resolve customer email addresses first. Reconstruct threads via `reference`/`messageid`/`subject`.
