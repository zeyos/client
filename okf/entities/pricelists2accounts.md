---
type: ZeyOS Entity
title: Price Lists To Accounts
description: Account-to-price-list assignments.
resource: zeyos://api/pricelists2accounts
tags: [commerce, generated]
api_backed: true
list_operation: listPriceListsToAccounts
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
| `pricelist` | integer | no | — | yes | [pricelists](/entities/pricelists.md) |
| `account` | integer | no | — | yes | [accounts](/entities/accounts.md) |

# Foreign Keys

- `pricelist` → [pricelists](/entities/pricelists.md) (`pricelists.ID`)
- `account` → [accounts](/entities/accounts.md) (`accounts.ID`)

# Indexes

- `fk_pricelists2accounts_account` — btree on `account`
- `u_pricelists2accounts_pricelist_account` — btree, unique on `pricelist, account`

# Operations

- list: `listPriceListsToAccounts`
- get: `getPriceListToAccount`
- create: `createPriceListToAccount`
- update: `updatePriceListToAccount`
- delete: `deletePriceListToAccount`
- exists: `existsPriceListToAccount`
<!-- okf:generated:end -->

# Notes

operationId: `listPriceListsToAccounts`.
