---
type: ZeyOS Entity
title: Addresses
description: Additional address records linked to accounts or contacts.
resource: zeyos://api/addresses
tags: [crm, generated]
api_backed: true
list_operation: listAddresses
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
| `account` | integer | no | — | yes | [accounts](/entities/accounts.md) |
| `contact` | integer | no | — | yes | [contacts](/entities/contacts.md) |
| `type` | smallint | no | `0` | yes | — |
| `default` | smallint | no | `0` | yes | — |

# Foreign Keys

- `account` → [accounts](/entities/accounts.md) (`accounts.ID`)
- `contact` → [contacts](/entities/contacts.md) (`contacts.ID`)

# Enums

### `type`

`0` = BILLING_SHIPPING · `1` = BILLING_BILLING · `2` = PROCUREMENT_SHIPPING · `3` = PROCUREMENT_BILLING · `4` = COLLECTION · `5` = BILLING_SELLER · `6` = PROCUREMENT_SELLER

# Indexes

- `fk_addresses_contact` — btree on `contact`
- `u_addresses_account_contact_type` — btree, unique on `account, contact, type, +default`

# Operations

- list: `listAddresses`
- get: `getAddress`
- create: `createAddress`
- update: `updateAddress`
- delete: `deleteAddress`
- exists: `existsAddress`
<!-- okf:generated:end -->
