---
type: ZeyOS Entity
title: Contacts To Contacts
description: Contact-to-contact relationships.
resource: zeyos://api/contacts2contacts
tags: [crm, generated]
api_backed: true
list_operation: listContactsToContacts
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
| `contact1` | integer | no | — | yes | [contacts](/entities/contacts.md) |
| `contact2` | integer | no | — | yes | [contacts](/entities/contacts.md) |

# Foreign Keys

- `contact1` → [contacts](/entities/contacts.md) (`contacts.ID`)
- `contact2` → [contacts](/entities/contacts.md) (`contacts.ID`)

# Indexes

- `fk_contacts2contacts_contact2` — btree on `contact2`
- `u_contacts2contacts_contact1_contact2` — btree, unique on `contact1, contact2`

# Operations

- list: `listContactsToContacts`
- get: `getContactToContact`
- create: `createContactToContact`
- update: `updateContactToContact`
- delete: `deleteContactToContact`
- exists: `existsContactToContact`
<!-- okf:generated:end -->
