---
type: ZeyOS Entity
title: Dunning To Transactions
description: Dunning-to-transaction junction.
resource: zeyos://api/dunning2transactions
tags: [collections, generated]
api_backed: true
list_operation: listDunningToTransactions
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
| `dunning` | integer | no | — | yes | [dunning](/entities/dunning.md) |
| `transaction` | integer | no | — | yes | [transactions](/entities/transactions.md) |

# Foreign Keys

- `dunning` → [dunning](/entities/dunning.md) (`dunning.ID`)
- `transaction` → [transactions](/entities/transactions.md) (`transactions.ID`)

# Indexes

- `fk_dunning2transactions_transaction` — btree on `transaction`
- `u_dunning2transactions_dunning_transaction` — btree, unique on `dunning, transaction`

# Operations

- list: `listDunningToTransactions`
- get: `getDunningToTransaction`
- create: `createDunningToTransaction`
- update: `updateDunningToTransaction`
- delete: `deleteDunningToTransaction`
- exists: `existsDunningToTransaction`
<!-- okf:generated:end -->

# Notes

operationId: `listDunningToTransactions`.
